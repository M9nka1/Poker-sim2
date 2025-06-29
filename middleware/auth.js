const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const database = require('../database/database');
require('dotenv').config({ path: './config.env' });

// Rate limiting для аутентификации (более мягкие лимиты для тестирования)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута (было 15 минут)
  max: 50, // 50 попыток за окно (было 5)
  message: {
    success: false,
    message: 'Слишком много попыток входа. Повторите через 1 минуту.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Исключаем определенные IP если нужно (для разработки)
  skip: (req) => {
    // В продакшене убрать эту строку
    return req.ip === '::1' || req.ip === '127.0.0.1';
  }
});

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Токен доступа отсутствует' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Получить данные пользователя из базы данных
    const user = await database.get(
      `SELECT u.*, GROUP_CONCAT(r.role_name) as roles 
       FROM Users u 
       LEFT JOIN UserRoles ur ON u.user_id = ur.user_id 
       LEFT JOIN Roles r ON ur.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    // Добавить данные пользователя в объект запроса
    req.user = {
      ...user,
      roles: user.roles ? user.roles.split(',') : []
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Токен истек' 
      });
    }
    
    return res.status(403).json({ 
      success: false, 
      message: 'Недействительный токен' 
    });
  }
};

// Middleware для проверки роли администратора
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.roles.includes('admin')) {
    return res.status(403).json({
      success: false,
      message: 'Доступ запрещен. Требуются права администратора.'
    });
  }
  next();
};

// Middleware для проверки лимита раздач
const checkHandLimit = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Пользователь не аутентифицирован'
    });
  }

  if (req.user.hand_limit <= 0) {
    return res.status(403).json({
      success: false,
      message: 'Превышен лимит доступных раздач. Обратитесь к администратору.'
    });
  }

  next();
};

// Функция для генерации access токена
const generateAccessToken = (user) => {
  const jwtSecret = process.env.JWT_SECRET;
  
  // Отладочная информация
  if (!jwtSecret) {
    console.error('❌ JWT_SECRET не загружен! Содержимое process.env:', {
      JWT_SECRET: process.env.JWT_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      PATH_TO_CONFIG: './config.env'
    });
    
    // Принудительная перезагрузка config.env
    try {
      delete require.cache[require.resolve('path').resolve('./config.env')];
      require('dotenv').config({ path: './config.env' });
      console.log('🔄 Перезагрузка config.env выполнена');
      console.log('🔑 JWT_SECRET после перезагрузки:', process.env.JWT_SECRET ? 'УСТАНОВЛЕН' : 'НЕ УСТАНОВЛЕН');
    } catch (err) {
      console.error('❌ Ошибка перезагрузки config:', err.message);
    }
  } else {
    console.log('✅ JWT_SECRET загружен успешно');
  }

  return jwt.sign(
    { 
      userId: user.user_id,
      email: user.email,
      roles: user.roles || []
    },
    process.env.JWT_SECRET || 'fallback-secret-key-for-development',
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      issuer: 'poker-simulator'
    }
  );
};

// Функция для генерации refresh токена
const generateRefreshToken = () => {
  return jwt.sign(
    { type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: 'poker-simulator'
    }
  );
};

module.exports = {
  authenticateToken,
  requireAdmin,
  checkHandLimit,
  generateAccessToken,
  generateRefreshToken
}; 