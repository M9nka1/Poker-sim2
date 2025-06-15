const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const database = require('../database/database');
const { 
  generateAccessToken, 
  generateRefreshToken,
  authenticateToken 
} = require('../middleware/auth');

const router = express.Router();

// Rate limiting для аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток
  message: {
    success: false,
    message: 'Слишком много попыток входа. Повторите через 15 минут.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Валидация для регистрации
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Введите корректный email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Пароль должен содержать минимум 8 символов')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Пароль должен содержать минимум одну заглавную, одну строчную букву, цифру и специальный символ')
];

// Валидация для входа
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Введите корректный email'),
  body('password')
    .notEmpty()
    .withMessage('Пароль обязателен')
];

// POST /api/auth/register - Регистрация нового пользователя
router.post('/register', authLimiter, registerValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибки валидации',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Проверка уникальности email
    const existingUser = await database.get(
      'SELECT user_id FROM Users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Пользователь с таким email уже существует'
      });
    }

    // Хеширование пароля
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Создание нового пользователя
    await database.run(
      'INSERT INTO Users (email, password_hash, hand_limit) VALUES (?, ?, ?)',
      [email, passwordHash, 0]
    );

    // Получение данных созданного пользователя по email
    const newUser = await database.get(
      'SELECT * FROM Users WHERE email = ?',
      [email]
    );

    // Назначение роли "user"
    const userRole = await database.get('SELECT role_id FROM Roles WHERE role_name = ?', ['user']);
    await database.run(
      'INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)',
      [newUser.user_id, userRole.role_id]
    );

    // Получение данных пользователя с ролями
    const userWithRoles = await database.get(
      `SELECT u.*, GROUP_CONCAT(r.role_name) as roles 
       FROM Users u 
       LEFT JOIN UserRoles ur ON u.user_id = ur.user_id 
       LEFT JOIN Roles r ON ur.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [newUser.user_id]
    );

    const finalUser = userWithRoles || newUser;
    finalUser.roles = finalUser.roles ? finalUser.roles.split(',') : [];

    // Генерация токенов
    const accessToken = generateAccessToken(finalUser);
    const refreshToken = generateRefreshToken();

    // Сохранение refresh токена в базе данных
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 дней

    await database.run(
      'INSERT INTO RefreshTokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [finalUser.user_id, refreshTokenHash, expiresAt.toISOString()]
    );

    // Установка refresh токена в HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
    });

    res.status(201).json({
      success: true,
      message: 'Пользователь успешно зарегистрирован',
      data: {
        user: {
          user_id: finalUser.user_id,
          email: finalUser.email,
          hand_limit: finalUser.hand_limit,
          roles: finalUser.roles,
          created_at: finalUser.created_at
        },
        accessToken
      }
    });

  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// POST /api/auth/login - Вход пользователя
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибки валидации',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Поиск пользователя
    const user = await database.get(
      `SELECT u.*, GROUP_CONCAT(r.role_name) as roles 
       FROM Users u 
       LEFT JOIN UserRoles ur ON u.user_id = ur.user_id 
       LEFT JOIN Roles r ON ur.role_id = r.role_id 
       WHERE u.email = ?`,
      [email]
    );

    if (!user || !user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль'
      });
    }

    // Проверка пароля
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль'
      });
    }

    user.roles = user.roles ? user.roles.split(',') : [];

    // Генерация токенов
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Сохранение refresh токена в базе данных
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 дней

    await database.run(
      'INSERT INTO RefreshTokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.user_id, refreshTokenHash, expiresAt.toISOString()]
    );

    // Установка refresh токена в HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
    });

    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      data: {
        user: {
          user_id: user.user_id,
          email: user.email,
          hand_limit: user.hand_limit,
          roles: user.roles,
          created_at: user.created_at
        },
        accessToken
      }
    });

  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// POST /api/auth/token/refresh - Обновление access токена
router.post('/token/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh токен отсутствует'
      });
    }

    // Поиск токена в базе данных
    const storedTokens = await database.all(
      'SELECT * FROM RefreshTokens WHERE expires_at > datetime("now")'
    );

    let validToken = null;
    let tokenRecord = null;

    for (const record of storedTokens) {
      const isValid = await bcrypt.compare(refreshToken, record.token_hash);
      if (isValid) {
        validToken = refreshToken;
        tokenRecord = record;
        break;
      }
    }

    if (!validToken || !tokenRecord) {
      return res.status(401).json({
        success: false,
        message: 'Недействительный refresh токен'
      });
    }

    // Получение данных пользователя
    const user = await database.get(
      `SELECT u.*, GROUP_CONCAT(r.role_name) as roles 
       FROM Users u 
       LEFT JOIN UserRoles ur ON u.user_id = ur.user_id 
       LEFT JOIN Roles r ON ur.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [tokenRecord.user_id]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    user.roles = user.roles ? user.roles.split(',') : [];

    // Генерация нового access токена
    const accessToken = generateAccessToken(user);

    res.json({
      success: true,
      message: 'Токен обновлен',
      data: {
        accessToken
      }
    });

  } catch (error) {
    console.error('❌ Ошибка обновления токена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// POST /api/auth/logout - Выход пользователя
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Удаление refresh токена из базы данных
      const storedTokens = await database.all(
        'SELECT * FROM RefreshTokens WHERE user_id = ?',
        [req.user.user_id]
      );

      for (const record of storedTokens) {
        const isValid = await bcrypt.compare(refreshToken, record.token_hash);
        if (isValid) {
          await database.run(
            'DELETE FROM RefreshTokens WHERE token_id = ?',
            [record.token_id]
          );
          break;
        }
      }
    }

    // Очистка cookie
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Выход выполнен успешно'
    });

  } catch (error) {
    console.error('❌ Ошибка выхода:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router; 