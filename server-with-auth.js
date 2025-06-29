const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './config.env' });
const Hand = require('pokersolver').Hand;

// Функция для форматирования даты в нужный формат: 2024/12/14 2:21:47 GMT+03:00
function formatGameDateTime() {
  const now = new Date();
  
  // Получаем дату в формате локального времени с часовым поясом GMT+03:00
  const moscowTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); // +3 часа от UTC
  
  const year = moscowTime.getFullYear();
  const month = String(moscowTime.getMonth() + 1).padStart(2, '0');
  const day = String(moscowTime.getDate()).padStart(2, '0');
  const hours = moscowTime.getHours();
  const minutes = String(moscowTime.getMinutes()).padStart(2, '0');
  const seconds = String(moscowTime.getSeconds()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds} GMT+03:00`;
}

// Импорт компонентов аутентификации
const database = require('./database/database');
const authRoutes = require('./routes/auth');
const { authenticateToken, requireAdmin, checkHandLimit } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001; // Используем порт 3001 по умолчанию

// ===== ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ =====
async function initializeDatabase() {
  try {
    await database.init();
    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    process.exit(1);
  }
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Отключаем CSP для WebSocket соединений
}));
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || "*",
  credentials: true // Важно для работы с cookies
}));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));
// ===== МАРШРУТЫ ДЛЯ СТАТИЧЕСКИХ СТРАНИЦ (до express.static!) =====

// Главная страница с аутентификацией
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Демонстрационная страница
app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'quick-demo.html'));
});

// ===== API для ПРЕФЛОП СПОТОВ =====
function scanDirectoryRecursive(dirPath, basePath = '') {
  const items = [];
  
  if (!fs.existsSync(dirPath)) {
    return items;
  }
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    
    if (entry.isDirectory()) {
      items.push({
        type: 'folder',
        name: entry.name,
        path: relativePath,
        children: [] // Не загружаем детей сразу - будут загружены по запросу
      });
    } else if (entry.isFile() && entry.name.endsWith('.txt')) {
      const stats = fs.statSync(fullPath);
      items.push({
        type: 'file',
        filename: entry.name,
        path: relativePath,
        name: entry.name.replace('.txt', '').replace(/_/g, ' '),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      });
    }
  }
  
  return items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1; // Папки сначала
    }
    return a.name.localeCompare(b.name);
  });
}

app.get('/api/preflopspots', (req, res) => {
  const preflopDir = path.join(__dirname, 'preflopspots');
  
  if (!fs.existsSync(preflopDir)) {
    fs.mkdirSync(preflopDir, { recursive: true });
    return res.json({ items: [] });
  }
  
  try {
    const items = scanDirectoryRecursive(preflopDir);
    res.json({ items });
  } catch (error) {
    console.error('Ошибка чтения папки preflopspots:', error);
    res.status(500).json({ error: 'Ошибка чтения префлоп спотов' });
  }
});

app.use(express.static(path.join(__dirname)));

// ===== МАРШРУТЫ АУТЕНТИФИКАЦИИ =====
app.use('/api/auth', authRoutes);

// ===== ЗАЩИЩЕННЫЕ API МАРШРУТЫ =====

// Получение данных текущего пользователя
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          user_id: req.user.user_id,
          email: req.user.email,
          hand_limit: req.user.hand_limit,
          roles: req.user.roles,
          created_at: req.user.created_at
        }
      }
    });
  } catch (error) {
    console.error('❌ Ошибка получения данных пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Получение истории раздач пользователя
app.get('/api/me/hands', authenticateToken, async (req, res) => {
  try {
    const hands = await database.all(
      'SELECT hand_id, played_at FROM Hands WHERE user_id = ? ORDER BY played_at DESC',
      [req.user.user_id]
    );

    res.json({
      success: true,
      data: {
        hands: hands,
        total: hands.length
      }
    });
  } catch (error) {
    console.error('❌ Ошибка получения истории раздач:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Скачивание конкретной раздачи
app.get('/api/me/hands/:hand_id/download', authenticateToken, async (req, res) => {
  try {
    const hand = await database.get(
      'SELECT * FROM Hands WHERE hand_id = ? AND user_id = ?',
      [req.params.hand_id, req.user.user_id]
    );

    if (!hand) {
      return res.status(404).json({
        success: false,
        message: 'Раздача не найдена'
      });
    }

    // Устанавливаем заголовки для скачивания файла
    res.setHeader('Content-Disposition', `attachment; filename="hand_${hand.hand_id}.json"`);
    res.setHeader('Content-Type', 'application/json');
    
    res.json({
      hand_id: hand.hand_id,
      played_at: hand.played_at,
      hand_data: JSON.parse(hand.hand_data)
    });

  } catch (error) {
    console.error('❌ Ошибка скачивания раздачи:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// ===== АДМИНИСТРАТИВНЫЕ МАРШРУТЫ =====

// Получение списка всех пользователей (только для админов)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await database.all(
      `SELECT u.user_id, u.email, u.hand_limit, u.created_at, 
              GROUP_CONCAT(r.role_name) as roles
       FROM Users u 
       LEFT JOIN UserRoles ur ON u.user_id = ur.user_id 
       LEFT JOIN Roles r ON ur.role_id = r.role_id 
       GROUP BY u.user_id
       ORDER BY u.created_at DESC`
    );

    // Обработка ролей для каждого пользователя
    const processedUsers = users.map(user => ({
      ...user,
      roles: user.roles ? user.roles.split(',') : []
    }));

    res.json({
      success: true,
      data: {
        users: processedUsers,
        total: processedUsers.length
      }
    });
  } catch (error) {
    console.error('❌ Ошибка получения списка пользователей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Установка лимита раздач для пользователя (только для админов)
app.post('/api/admin/users/:user_id/limit', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit } = req.body;
    const { user_id } = req.params;

    if (!Number.isInteger(limit) || limit < 0) {
      return res.status(400).json({
        success: false,
        message: 'Лимит должен быть неотрицательным целым числом'
      });
    }

    // Проверка существования пользователя
    const user = await database.get('SELECT user_id FROM Users WHERE user_id = ?', [user_id]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Обновление лимита
    await database.run(
      'UPDATE Users SET hand_limit = ? WHERE user_id = ?',
      [limit, user_id]
    );

    res.json({
      success: true,
      message: `Лимит раздач установлен: ${limit}`,
      data: {
        user_id,
        new_limit: limit
      }
    });

  } catch (error) {
    console.error('❌ Ошибка установки лимита:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Скачивание всех раздач (только для админов)
app.get('/api/admin/hands/all/download', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hands = await database.all(
      `SELECT h.*, u.email 
       FROM Hands h 
       JOIN Users u ON h.user_id = u.user_id 
       ORDER BY h.played_at DESC`
    );

    if (hands.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Раздачи не найдены'
      });
    }

    // Подготовка данных для экспорта
    const exportData = {
      exported_at: formatGameDateTime(),
      total_hands: hands.length,
      hands: hands.map(hand => ({
        hand_id: hand.hand_id,
        user_email: hand.email,
        played_at: hand.played_at,
        hand_data: JSON.parse(hand.hand_data)
      }))
    };

    // Устанавливаем заголовки для скачивания
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    res.setHeader('Content-Disposition', `attachment; filename="all_hands_${timestamp}.json"`);
    res.setHeader('Content-Type', 'application/json');
    
    res.json(exportData);

  } catch (error) {
    console.error('❌ Ошибка экспорта всех раздач:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// ===== ИГРОВОЙ API (с проверкой лимитов) =====

// Эндпоинт для игры раздачи
app.post('/api/game/play', authenticateToken, checkHandLimit, async (req, res) => {
  try {
    const { hand_data } = req.body;

    if (!hand_data) {
      return res.status(400).json({
        success: false,
        message: 'Данные раздачи обязательны'
      });
    }

    // Уменьшение лимита раздач
    await database.run(
      'UPDATE Users SET hand_limit = hand_limit - 1 WHERE user_id = ?',
      [req.user.user_id]
    );

    // Сохранение раздачи
    const handId = uuidv4();
    await database.run(
      'INSERT INTO Hands (hand_id, user_id, hand_data) VALUES (?, ?, ?)',
      [handId, req.user.user_id, JSON.stringify(hand_data)]
    );

    // Получение обновленного лимита
    const updatedUser = await database.get(
      'SELECT hand_limit FROM Users WHERE user_id = ?',
      [req.user.user_id]
    );

    res.json({
      success: true,
      message: 'Раздача сыграна и сохранена',
      data: {
        hand_id: handId,
        remaining_hands: updatedUser.hand_limit
      }
    });

  } catch (error) {
    console.error('❌ Ошибка игры раздачи:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Новый эндпоинт для уменьшения счетчика раздач при завершении раздачи
app.post('/api/game/hand-completed', authenticateToken, async (req, res) => {
  try {
    const { table_id, hand_data } = req.body;

    // Проверяем текущий лимит пользователя
    const currentUser = await database.get(
      'SELECT hand_limit FROM Users WHERE user_id = ?',
      [req.user.user_id]
    );

    if (!currentUser || currentUser.hand_limit <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Нет доступных раздач для завершения',
        data: {
          remaining_hands: currentUser?.hand_limit || 0,
          can_continue: false
        }
      });
    }

    // Уменьшение лимита раздач
    await database.run(
      'UPDATE Users SET hand_limit = hand_limit - 1 WHERE user_id = ?',
      [req.user.user_id]
    );

    // Сохранение завершенной раздачи (опционально)
    if (hand_data) {
      const handId = uuidv4();
      await database.run(
        'INSERT INTO Hands (hand_id, user_id, hand_data) VALUES (?, ?, ?)',
        [handId, req.user.user_id, JSON.stringify({
          ...hand_data,
          table_id,
          completed_at: formatGameDateTime()
        })]
      );
    }

    // Получение обновленного лимита
    const updatedUser = await database.get(
      'SELECT hand_limit FROM Users WHERE user_id = ?',
      [req.user.user_id]
    );

    console.log(`📊 Счетчик раздач пользователя ${req.user.email} уменьшен. Осталось: ${updatedUser.hand_limit}`);

    res.json({
      success: true,
      message: 'Раздача завершена, счетчик обновлен',
      data: {
        remaining_hands: updatedUser.hand_limit,
        can_continue: updatedUser.hand_limit > 0
      }
    });

  } catch (error) {
    console.error('❌ Ошибка обновления счетчика раздач:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// ===== API для ПРЕФЛОП СПОТОВ =====

app.get('/api/preflopspots', (req, res) => {
  const preflopDir = path.join(__dirname, 'preflopspots');
  
  if (!fs.existsSync(preflopDir)) {
    fs.mkdirSync(preflopDir, { recursive: true });
    return res.json({ items: [] });
  }
  
  try {
    const items = scanDirectoryRecursive(preflopDir);
    res.json({ items });
  } catch (error) {
    console.error('Ошибка чтения папки preflopspots:', error);
    res.status(500).json({ error: 'Ошибка чтения префлоп спотов' });
  }
});

app.get('/api/preflopspot/*', (req, res) => {
  const requestPath = req.params[0]; // Получаем полный путь
  
  // Проверка безопасности
  if (requestPath.includes('..')) {
    return res.status(400).json({ error: 'Недопустимый путь' });
  }
  
  const fullPath = path.join(__dirname, 'preflopspots', requestPath);
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Путь не найден' });
  }
  
  try {
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      // Если это папка, возвращаем её содержимое
      const items = [];
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryFullPath = path.join(fullPath, entry.name);
        const entryRelativePath = `${requestPath}/${entry.name}`;
        
        if (entry.isDirectory()) {
          items.push({
            type: 'folder',
            name: entry.name,
            path: entryRelativePath,
            children: []
          });
        } else if (entry.isFile() && entry.name.endsWith('.txt')) {
          const stats = fs.statSync(entryFullPath);
          items.push({
            type: 'file',
            filename: entry.name,
            path: entryRelativePath,
            name: entry.name.replace('.txt', '').replace(/_/g, ' '),
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }
      
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      res.json({ items });
    } else if (stats.isFile() && requestPath.endsWith('.txt')) {
      // Если это файл .txt, возвращаем его содержимое
      const content = fs.readFileSync(fullPath, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
    } else {
      return res.status(400).json({ error: 'Недопустимый тип файла' });
    }
  } catch (error) {
    console.error('Ошибка чтения префлоп спота:', error);
    res.status(500).json({ error: 'Ошибка чтения файла' });
  }
});

// ===== API для РЕЙНДЖЕЙ =====

app.get('/api/ranges', (req, res) => {
  const rangesDir = path.join(__dirname, 'ranges');
  
  if (!fs.existsSync(rangesDir)) {
    fs.mkdirSync(rangesDir, { recursive: true });
    return res.json({ items: [] });
  }
  
  try {
    const items = scanDirectoryRecursive(rangesDir);
    res.json({ items });
  } catch (error) {
    console.error('Ошибка чтения папки ranges:', error);
    res.status(500).json({ error: 'Ошибка чтения рейнджей' });
  }
});

app.get('/api/range/*', (req, res) => {
  const requestPath = req.params[0]; // Получаем полный путь
  
  // Проверка безопасности
  if (requestPath.includes('..')) {
    return res.status(400).json({ error: 'Недопустимый путь' });
  }
  
  const fullPath = path.join(__dirname, 'ranges', requestPath);
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Путь не найден' });
  }
  
  try {
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      // Если это папка, возвращаем её содержимое
      const items = [];
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryFullPath = path.join(fullPath, entry.name);
        const entryRelativePath = `${requestPath}/${entry.name}`;
        
        if (entry.isDirectory()) {
          items.push({
            type: 'folder',
            name: entry.name,
            path: entryRelativePath,
            children: []
          });
        } else if (entry.isFile() && entry.name.endsWith('.txt')) {
          const stats = fs.statSync(entryFullPath);
          items.push({
            type: 'file',
            filename: entry.name,
            path: entryRelativePath,
            name: entry.name.replace('.txt', '').replace(/_/g, ' '),
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }
      
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      res.json({ items });
    } else if (stats.isFile() && requestPath.endsWith('.txt')) {
      // Если это файл .txt, возвращаем его содержимое
      const content = fs.readFileSync(fullPath, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
    } else {
      return res.status(400).json({ error: 'Недопустимый тип файла' });
    }
  } catch (error) {
    console.error('Ошибка чтения рейнджа:', error);
    res.status(500).json({ error: 'Ошибка чтения файла' });
  }
});

// ===== ОРИГИНАЛЬНАЯ ЛОГИКА ПОКЕРНОГО СИМУЛЯТОРА =====

const CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_SYMBOLS = ['s', 'h', 'd', 'c'];

// Активные сессии и пользователи
const activeSessions = new Map();
const activeUsers = new Map();

// Основные функции для работы с картами
function parseHandString(handStr) {
  const normalized = handStr.toUpperCase().trim();
  let rank1, rank2, suited;
  
  if (normalized.includes('+')) {
    return normalized; // Возвращаем как есть для диапазонов
  }
  
  if (normalized.length === 3) {
    rank1 = normalized[0];
    rank2 = normalized[1];
    suited = normalized[2] === 'S';
  } else if (normalized.length === 2) {
    rank1 = normalized[0];
    rank2 = normalized[1];
    suited = rank1 === rank2; // Пары всегда "suited" (одинаковые)
  } else {
    return null;
  }
  
  if (!CARD_RANKS.includes(rank1) || !CARD_RANKS.includes(rank2)) {
    return null;
  }
  
  return { rank1, rank2, suited };
}

function createCard(rank, suit) {
  return { rank, suit };
}

function generateCardsForHand(handStr, deck) {
  const hand = parseHandString(handStr);
  if (!hand) return null;
  
  const { rank1, rank2, suited } = hand;
  const availableCards1 = deck.filter(card => card.rank === rank1);
  const availableCards2 = deck.filter(card => card.rank === rank2);
  
  console.log(`🃏 Генерация карт для ${handStr}: доступно ${availableCards1.length} карт ${rank1}, ${availableCards2.length} карт ${rank2}`);
  
  if (availableCards1.length === 0 || availableCards2.length === 0) {
    console.warn(`❌ Недостаточно карт для генерации ${handStr}`);
    return null;
  }
  
  let card1, card2;
  
  if (rank1 === rank2) {
    if (availableCards1.length < 2) {
      console.warn(`❌ Недостаточно карт для пары ${rank1} (доступно: ${availableCards1.length})`);
      return null;
    }
    const indices = [];
    while (indices.length < 2) {
      const index = Math.floor(Math.random() * availableCards1.length);
      if (!indices.includes(index)) {
        indices.push(index);
      }
    }
    card1 = availableCards1[indices[0]];
    card2 = availableCards1[indices[1]];
  } else {
    card1 = availableCards1[Math.floor(Math.random() * availableCards1.length)];
    const remainingCards2 = availableCards2.filter(card => 
      !(card.rank === card1.rank && card.suit === card1.suit)
    );
    
    if (remainingCards2.length === 0) {
      console.warn(`❌ Нет доступных карт ${rank2} после выбора ${card1.rank}${card1.suit}`);
      return null;
    }
    
    if (suited) {
      const suitedCards = remainingCards2.filter(card => card.suit === card1.suit);
      if (suitedCards.length === 0) {
        console.warn(`❌ Нет suited карт ${rank2} в масти ${card1.suit}`);
        return null;
      }
      card2 = suitedCards[Math.floor(Math.random() * suitedCards.length)];
    } else {
      const unsuitedCards = remainingCards2.filter(card => card.suit !== card1.suit);
      if (unsuitedCards.length === 0) {
        console.warn(`❌ Нет offsuit карт ${rank2} (исключая масть ${card1.suit})`);
        return null;
      }
      card2 = unsuitedCards[Math.floor(Math.random() * unsuitedCards.length)];
    }
  }
  
  // ✅ Дополнительная проверка что карты действительно есть в колоде
  const card1InDeck = deck.some(c => c.rank === card1.rank && c.suit === card1.suit);
  const card2InDeck = deck.some(c => c.rank === card2.rank && c.suit === card2.suit);
  
  if (!card1InDeck || !card2InDeck) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: Карта не найдена в колоде! ${card1.rank}${card1.suit}=${card1InDeck}, ${card2.rank}${card2.suit}=${card2InDeck}`);
    return null;
  }
  
  console.log(`✅ Сгенерированы карты: ${card1.rank}${card1.suit}, ${card2.rank}${card2.suit}`);
  return [card1, card2];
}

function createDeck() {
  const deck = [];
  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Класс для управления покерной сессией  
class PokerSession {
  constructor(sessionId, creatorId, settings) {
    this.sessionId = sessionId;
    this.creatorId = creatorId;
    this.settings = settings;
    this.players = new Map();
    this.tables = [];
    this.isStarted = false;
    this.handHistories = new Map();
    
    this.initializeTables();
  }
  
  initializeTables() {
    const tableCount = this.settings.tablesCount || 1;
    for (let i = 1; i <= tableCount; i++) {
      this.tables.push(new PokerTable(i, this.sessionId, this.settings));
    }
  }
  
  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
      ...playerData,
      tableId: null,
      isReady: false
    });
  }
  
  assignPlayerToTable(playerId, preferredTableId = null) {
    // Если указан предпочтительный стол, попробуем его сначала
    if (preferredTableId !== null) {
      const preferredTable = this.tables.find(t => t.tableId === preferredTableId);
      if (preferredTable && preferredTable.players.size < 2) {
        preferredTable.addPlayer(playerId, this.players.get(playerId));
        this.players.get(playerId).tableId = preferredTable.tableId;
        return preferredTable.tableId;
      }
    }
    
    // Иначе ищем любой свободный стол
    for (const table of this.tables) {
      if (table.players.size < 2) {
        table.addPlayer(playerId, this.players.get(playerId));
        this.players.get(playerId).tableId = table.tableId;
        return table.tableId;
      }
    }
    return null;
  }
  
  startSession() {
    if (this.players.size < 2) {
      return false;
    }
    
    this.isStarted = true;
    
    // Создаем ботов для заполнения всех столов
    const playersArray = Array.from(this.players.entries());
    const humanPlayers = playersArray.length;
    const totalTablesNeeded = this.tables.length;
    
    console.log(`🎮 Начало сессии: ${humanPlayers} реальных игроков, ${totalTablesNeeded} столов`);
    
    // Размещаем ОБА реальных игрока на КАЖДЫЙ стол
    const playerIds = Array.from(this.players.keys());
    
    if (playerIds.length !== 2) {
      console.log(`❌ Ошибка: ожидается ровно 2 игрока, получено ${playerIds.length}`);
      return false;
    }
    
    // На каждый стол добавляем обоих игроков
    for (const table of this.tables) {
      const player1Id = playerIds[0];
      const player2Id = playerIds[1];
      
      // Добавляем первого игрока
      table.addPlayer(player1Id, this.players.get(player1Id));
      
      // Добавляем второго игрока  
      table.addPlayer(player2Id, this.players.get(player2Id));
      
      console.log(`👥 На стол ${table.tableId} добавлены игроки: ${this.players.get(player1Id).name} и ${this.players.get(player2Id).name}`);
    }
    
    // Запускаем новые раздачи на всех столах
    for (const table of this.tables) {
      if (table.players.size >= 2) {
        table.startNewHand();
        console.log(`🎲 Стол ${table.tableId} готов: ${table.players.size}/2 игроков`);
      }
    }
    
    return true;
  }
  
  getSessionInfo(requestingPlayerId = null) {
    return {
      sessionId: this.sessionId,
      creatorId: this.creatorId,
      isStarted: this.isStarted,
      playerCount: this.players.size,
      tables: this.tables.map(table => table.getTableInfo(requestingPlayerId)),
      settings: this.settings
    };
  }
}

// Класс для управления покерным столом (сокращенная версия)
class PokerTable {
  constructor(tableId, sessionId, settings) {
    this.tableId = tableId;
    this.sessionId = sessionId;
    this.settings = settings;
    this.players = new Map();
    this.deck = createDeck();
    this.board = [];
    this.pot = 0; // Общий банк для внутренних расчетов
    this.streetPot = 0; // Банк улицы для отображения в интерфейсе
    this.currentBet = 0; // Текущая ставка для уравнивания
    this.currentStreet = 'waiting'; // ожидание начала раздачи
    this.handNumber = 0;
    this.handHistories = [];
    this.currentPlayerIndex = 0; // Индекс игрока, который должен действовать
    this.lastRaiseAmount = 0; // Размер последнего рейза
    this.streetBets = {}; // Ставки по улицам
    this.isHandActive = false; // Флаг активности раздачи
    
    // Добавляем Hand History трекинг
    this.handHistoryFile = null;
    this.currentHandData = null;
    this.playerNicknames = this.parsePlayerNicknames(); // Парсим маппинг из префлоп файла
    this.initializeHandHistoryFile();
  }
  
  initializeHandHistoryFile() {
    const sessionDir = path.join(__dirname, 'hand_histories');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    this.handHistoryFile = path.join(sessionDir, `table_${this.tableId}_session_${this.sessionId}.txt`);
  }
  
  parsePlayerNicknames() {
    const nicknames = {};
    
    try {
      if (this.settings?.preflopFile) {
        const preflopPath = path.join(__dirname, 'preflopspots', this.settings.preflopFile);
        
        if (fs.existsSync(preflopPath)) {
          const content = fs.readFileSync(preflopPath, 'utf8');
          
          // Ищем маппинг в скобках в первой строке (Pio_IP_c3bBU IP, Pio_OOP_3bet_SB OOP)
          const nicknameMatch = content.match(/\(([^)]+)\)/);
          
          if (nicknameMatch) {
            const pairs = nicknameMatch[1].split(',').map(p => p.trim());
            
            pairs.forEach(pair => {
              const parts = pair.split(' ');
              if (parts.length >= 2) {
                const nickname = parts[0].trim();
                const position = parts[parts.length - 1].trim(); // Позиция всегда последняя (IP или OOP)
                nicknames[position] = nickname;
                
                console.log(`🏷️ Найден ник: ${nickname} для позиции ${position}`);
              }
            });
          }
          
          console.log('🏷️ Парсинг ников из префлопа завершен:', nicknames);
        } else {
          console.warn(`❌ Префлоп файл не найден: ${preflopPath}`);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка парсинга ников игроков:', error);
    }
    return nicknames;
  }
  
  // Автоматическое определение IP/OOP на основе иерархии позиций
  determineIPOOP(position1, position2) {
    // Иерархия позиций от OOP к IP: SB -> BB -> EP -> MP -> CO -> BTN
    const positionHierarchy = {
      'SB': 0,
      'BB': 1, 
      'EP': 2,
      'MP': 3,
      'CO': 4,
      'BTN': 5
    };
    
    const pos1Level = positionHierarchy[position1] || 0;
    const pos2Level = positionHierarchy[position2] || 0;
    
    if (pos1Level > pos2Level) {
      return { position1: 'IP', position2: 'OOP' };
    } else {
      return { position1: 'OOP', position2: 'IP' };
    }
  }

  addPlayer(playerId, playerData) {
    // Определить позицию игрока из настроек
    const playerIndex = this.players.size;
    const playerNumber = playerIndex === 0 ? 'player1' : 'player2';
    
    console.log(`🔍 Добавление игрока: ${playerId}, индекс: ${playerIndex}, номер: ${playerNumber}`);
    console.log(`🔍 Настройки позиций:`, this.settings.playerRanges?.positions);
    
    // ✅ ИСПРАВЛЕНИЕ: Получаем позицию точно из пользовательских настроек
    let originalPosition;
    if (this.settings.playerRanges && this.settings.playerRanges.positions) {
      originalPosition = this.settings.playerRanges.positions[playerNumber];
      
      if (!originalPosition) {
        // Если позиция не указана в настройках, используем значения по умолчанию
        originalPosition = playerIndex === 0 ? 'BTN' : 'BB';
        console.log(`⚠️ Позиция ${playerNumber} не найдена в настройках, используем по умолчанию: ${originalPosition}`);
      }
    } else {
      // Если нет настроек позиций вообще, используем BTN/BB
      originalPosition = playerIndex === 0 ? 'BTN' : 'BB';
      console.log(`⚠️ Настройки позиций отсутствуют, используем по умолчанию: ${originalPosition}`);
    }
    
    // Преобразуем исходную позицию в IP/OOP статус
    let finalPosition;
    
    // Простое правило: BTN = IP, все остальные = OOP
    if (originalPosition === 'BTN') {
      finalPosition = 'IP';
    } else {
      finalPosition = 'OOP';
    }
    
    // Если это второй игрок, проверяем и корректируем позиции при необходимости
    if (playerIndex === 1) {
      const firstPlayer = Array.from(this.players.values())[0];
      const firstPlayerOriginalPos = firstPlayer.originalPosition;
      const secondPlayerOriginalPos = originalPosition;
      
      console.log(`🎯 Проверка позиций двух игроков:`);
      console.log(`🎯 Игрок 1: ${firstPlayerOriginalPos} -> ${firstPlayer.position}`);
      console.log(`🎯 Игрок 2: ${secondPlayerOriginalPos} -> ${finalPosition}`);
      
      // Если оба игрока имеют одинаковые IP/OOP статусы, это ошибка конфигурации
      if (firstPlayer.position === finalPosition) {
        console.warn(`⚠️ Предупреждение: оба игрока имеют позицию ${finalPosition}. Это может быть неправильной конфигурацией.`);
        console.warn(`⚠️ Игрок 1: ${firstPlayerOriginalPos}, Игрок 2: ${secondPlayerOriginalPos}`);
      }
    }
    
    console.log(`🎯 Игрок ${playerId} (${playerNumber}) получил позицию: ${originalPosition} -> ${finalPosition}`);
    
    this.players.set(playerId, {
      ...playerData,
      position: finalPosition,
      originalPosition: originalPosition, // Сохраняем исходную позицию (SB/BB/EP/MP/CO/BTN)
      userDefinedPosition: originalPosition, // Сохраняем позицию из настроек пользователя
      cards: [],
      stack: 100000, // 1000 долларов в центах
      bet: 0,
      hasActed: false,
      isAllIn: false,
      isFolded: false
    });
    
    console.log(`👤 Игрок ${playerData.name} добавлен на стол ${this.tableId} с позицией ${finalPosition} (исходная: ${originalPosition})`);
  }
  
  startNewHand() {
    console.log(`🎯 Начинаем новую раздачу на столе ${this.tableId}`);
    
    this.handNumber++;
    this.deck = shuffleDeck(createDeck());
    this.isHandActive = true; // Раздача начата
    
    // Парсинг никнеймов из префлоп файла
    this.playerNicknames = this.parsePlayerNicknames();
    
    // Парсинг hand history для инициализации банка и стеков
    const handHistoryInfo = this.parseHandHistory();
    this.pot = handHistoryInfo.initialPot * 100; // конвертируем в центы
    this.streetPot = handHistoryInfo.initialPot * 100; // банк улицы для отображения
    
    // Сохраняем префлоп инвестиции для использования в completeHand()
    this.preflopInvestments = {};
    Object.entries(handHistoryInfo.playerInvestments).forEach(([playerName, investment]) => {
      this.preflopInvestments[playerName] = investment * 100; // конвертируем в центы
    });
    
    console.log(`💰 Стол ${this.tableId}: начальный банк $${handHistoryInfo.initialPot} (${this.pot} центов, streetPot: ${this.streetPot} центов)`);
    
    // Инициализируем данные для Hand History
    this.currentHandData = {
      handId: `${Date.now()}${this.tableId}${this.handNumber}`,
      blinds: { sb: 1, bb: 2 }, // Данные блайндов
      positions: {},
      actions: [],
      board: {},
      winners: [],
      pot: 0
    };
    
    // ✅ ИСПРАВЛЕНИЕ: Сначала раздаем карты игрокам и удаляем их из колоды
    this.players.forEach((player, playerId) => {
      // Корректируем стеки на основе префлоп действий
      const preflopInvestment = this.calculatePreflopInvestment(player.name);
      const correctedStack = handHistoryInfo.effectiveStack - preflopInvestment;
      player.stack = correctedStack * 100; // в центах
      
      // Раздаем карты игрокам из hand history
      player.cards = this.dealCardsToPlayer(player.name);
      player.bet = 0;
      player.hasActed = false; // Никто еще не действовал на флопе
      player.isAllIn = false;
      player.isFolded = false;
      
      // Определяем правильный seat номер на основе позиции игрока
      let seat = Array.from(this.players.keys()).indexOf(playerId) + 1; // по умолчанию
      
      // Пытаемся извлечь seat номер из префлоп файла по nickname игрока
      const playerNickname = this.playerNicknames[player.position] || player.name;
      if (this.settings?.preflopFile) {
        try {
          const preflopPath = path.join(__dirname, 'preflopspots', this.settings.preflopFile);
          if (fs.existsSync(preflopPath)) {
            const preflopContent = fs.readFileSync(preflopPath, 'utf8');
            const seatMatch = preflopContent.match(new RegExp(`Seat (\\d+): ${playerNickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
            if (seatMatch) {
              seat = parseInt(seatMatch[1]);
              console.log(`🎯 Игрок ${playerNickname} получил seat ${seat} из префлоп файла`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Ошибка определения seat для ${playerNickname}:`, error);
        }
      }
      
      this.currentHandData.positions[seat] = {
        id: playerId,
        position: player.position,
        stack: player.stack / 100 // Конвертируем в доллары
      };
      
      
      console.log(`🃏 Игрок ${player.name}: префлоп инвестиция $${preflopInvestment}, итоговый стек $${correctedStack}, карты: ${player.cards ? player.cards.map(c => c.rank + c.suit).join('') : 'не определены'}`);
    });
    
    // ✅ ИСПРАВЛЕНИЕ: Теперь генерируем флоп из оставшихся карт (после удаления карт игроков)
    this.board = this.generateBoard();
    this.currentStreet = 'flop'; // начинаем с флопа (симулятор пропускает префлоп)
    this.currentBet = 0;
    this.currentPlayerIndex = 0;
    this.lastRaiseAmount = 0;
    this.streetBets = {};
    
    // Инициализируем торги на флопе
    this.currentBet = 0; // Нет активных ставок на флопе
    
    // Определяем кто начинает на постфлопе (OOP всегда ходит первым)
    const playersArray = Array.from(this.players.values());
    let oopPlayerIndex = 0;
    
    // Ищем игрока с позицией OOP
    for (let i = 0; i < playersArray.length; i++) {
      if (playersArray[i].position === 'OOP') {
        oopPlayerIndex = i;
        break;
      }
    }
    
    this.currentPlayerIndex = oopPlayerIndex; // OOP начинает на постфлопе
    this.lastRaiseAmount = 0;
    
    console.log(`🎯 Постфлоп начинает игрок ${playersArray[oopPlayerIndex].name} (позиция: ${playersArray[oopPlayerIndex].position}, индекс: ${oopPlayerIndex})`);
    
    console.log('🎯 Торги на флопе инициализированы, ожидаются действия игроков');
    
    console.log(`🃏 Флоп роздан: ${this.board.map(c => c.rank + c.suit).join(', ')}`);
    
    // Уведомить всех игроков о начале новой раздачи
    this.notifyPlayersOfTableUpdate('Новая раздача началась');
    
    // Отправить специальное событие начала новой раздачи
    this.players.forEach((player, playerId) => {
      if (player.isBot || !player.socketId) {
        return;
      }
      
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('new-hand-started', {
          tableId: this.tableId,
          tableInfo: this.getTableInfo(playerId),
          message: 'Новая раздача началась'
        });
      }
    });
    
    return true; // Возвращаем успех
  }
  
  parseHandHistory() {
    let preflopSpot = '';
    
    // Читаем содержимое файла, если указан
    if (this.settings?.preflopFile) {
      try {
        const preflopPath = path.join(__dirname, 'preflopspots', this.settings.preflopFile);
        if (fs.existsSync(preflopPath)) {
          preflopSpot = fs.readFileSync(preflopPath, 'utf8');
          console.log(`✅ Загружен префлоп файл: ${this.settings.preflopFile}`);
        } else {
          console.warn(`❌ Префлоп файл не найден: ${preflopPath}`);
        }
      } catch (error) {
        console.error('❌ Ошибка чтения префлоп файла:', error);
      }
    }
    
    // Если нет файла, используем preflopSpot как строку (для обратной совместимости)
    if (!preflopSpot && this.settings?.preflopSpot) {
      preflopSpot = this.settings.preflopSpot;
    }
    
    if (!preflopSpot) {
      console.warn('⚠️ Префлоп спот не найден, используем значения по умолчанию');
      return {
        bigBlind: 1.0,
        smallBlind: 0.5,
        initialPot: 1.5,
        effectiveStack: 100.0,
        flopBets: { player1: 0, player2: 0 },
        turnBets: { player1: 0, player2: 0 },
        riverBets: { player1: 0, player2: 0 },
        playerInvestments: {}
      };
    }
    
    // Ищем блайнды в заголовке
    const blindsMatch = preflopSpot.match(/\(\$([0-9.]+)\/\$([0-9.]+)\)/);
    const smallBlind = blindsMatch ? parseFloat(blindsMatch[1]) : 0.5;
    const bigBlind = blindsMatch ? parseFloat(blindsMatch[2]) : 1.0;
    
    // Парсим начальные стеки из preflopSpot
    let effectiveStack = 100.0; // значение по умолчанию
    const seatMatches = preflopSpot.matchAll(/Seat \d+: .+ \(\$([0-9.]+)\.?\d* in chips\)/g);
    const stacks = [];
    for (const match of seatMatches) {
      stacks.push(parseFloat(match[1]));
    }
    if (stacks.length > 0) {
      effectiveStack = Math.min(...stacks);
      console.log(`🎯 Найдено ${stacks.length} игроков со стеками: ${stacks.join(', ')}`);
      console.log(`🎯 Эффективный стек: $${effectiveStack}`);
    } else {
      console.log(`⚠️ Стеки не найдены в префлоп споте, используем значение по умолчанию: $${effectiveStack}`);
    }
    
    // Подсчет банка по всем действиям префлопа
    const playerInvestments = {};
    
    // Парсим префлоп действия после HOLE CARDS
    const preflopSection = preflopSpot.split('*** HOLE CARDS ***')[1];
    if (preflopSection) {
      // Блайнды - ищем в правильном формате
      const sbMatch = preflopSection.match(/([^:\r\n]+): posts small blind \$([0-9.]+)/);
      const bbMatch = preflopSection.match(/([^:\r\n]+): posts big blind \$([0-9.]+)/);
      
      if (sbMatch) {
        playerInvestments[sbMatch[1]] = parseFloat(sbMatch[2]);
      }
      if (bbMatch) {
        playerInvestments[bbMatch[1]] = parseFloat(bbMatch[2]);
      }
    }
    
    // Также ищем блайнды ДО секции HOLE CARDS (в некоторых форматах)
    const preHoleSection = preflopSpot.split('*** HOLE CARDS ***')[0];
    if (preHoleSection) {
      const sbMatch2 = preHoleSection.match(/([^:\r\n]+): posts small blind \$([0-9.]+)/);
      const bbMatch2 = preHoleSection.match(/([^:\r\n]+): posts big blind \$([0-9.]+)/);
      
      if (sbMatch2 && !playerInvestments[sbMatch2[1]]) {
        playerInvestments[sbMatch2[1]] = parseFloat(sbMatch2[2]);
      }
      if (bbMatch2 && !playerInvestments[bbMatch2[1]]) {
        playerInvestments[bbMatch2[1]] = parseFloat(bbMatch2[2]);
      }
    }
    
    if (preflopSection) {
      
      // Рейзы - точное извлечение итоговой суммы ставки
      const raiseMatches = preflopSection.match(/([^:\r\n]+): raises \$([0-9.]+) to \$([0-9.]+)/g);
      if (raiseMatches) {
        raiseMatches.forEach(match => {
          const raiseMatch = match.match(/([^:]+): raises \$([0-9.]+) to \$([0-9.]+)/);
          if (raiseMatch) {
            const playerName = raiseMatch[1];
            const totalBet = parseFloat(raiseMatch[3]);
            playerInvestments[playerName] = totalBet;
          }
        });
      }
      
      // Коллы - добавляем к существующим ставкам
      const callMatches = preflopSection.match(/([^:\r\n]+): calls \$([0-9.]+)/g);
      if (callMatches) {
        callMatches.forEach(match => {
          const callMatch = match.match(/([^:]+): calls \$([0-9.]+)/);
          if (callMatch) {
            const playerName = callMatch[1];
            const callAmount = parseFloat(callMatch[2]);
            playerInvestments[playerName] = (playerInvestments[playerName] || 0) + callAmount;
          }
        });
      }
      
      // Фолды - остаются в банке
      const foldMatches = preflopSection.match(/([^:\r\n]+): folds/g);
      if (foldMatches) {
        foldMatches.forEach(match => {
          const foldMatch = match.match(/([^:]+): folds/);
          if (foldMatch) {
            const playerName = foldMatch[1];
            if (!playerInvestments[playerName]) playerInvestments[playerName] = 0;
          }
        });
      }
    }
    
    // Считаем общий банк
    const initialPot = Object.values(playerInvestments).reduce((sum, investment) => sum + investment, 0);
    
    console.log(`💰 Префлоп инвестиции игроков:`, playerInvestments);
    console.log(`💰 Общий банк на флопе: $${initialPot}`);
    console.log(`📊 Эффективный стек (до вычета инвестиций): $${effectiveStack}`);
    
    return {
      bigBlind,
      smallBlind,
      initialPot,
      effectiveStack, // используем распарсенное значение вместо hardcode 1000
      flopBets: { player1: 0, player2: 0 },
      turnBets: { player1: 0, player2: 0 },
      riverBets: { player1: 0, player2: 0 },
      playerInvestments // добавляем информацию об инвестициях
    };
  }
  
  calculatePreflopInvestment(playerName) {
    const handHistoryInfo = this.parseHandHistory();
    
    if (playerName.startsWith('Bot ')) {
      const investments = Object.values(handHistoryInfo.playerInvestments || {});
      return Math.max(...investments.filter(inv => inv > 0), 0);
    }
    
    const investments = handHistoryInfo.playerInvestments || {};
    
    if (investments[playerName]) {
      return investments[playerName];
    }
    
    const playerKeys = Object.keys(investments);
    const maxInvestment = Math.max(...Object.values(investments).filter(inv => inv > 0), 0);
    
    if (playerKeys.length >= 2) {
      const sortedInvestments = playerKeys
        .map(key => ({ name: key, amount: investments[key] }))
        .filter(inv => inv.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      
      if (sortedInvestments.length >= 2) {
        return sortedInvestments[0].amount;
      }
    }
    
    return maxInvestment;
  }
  
  dealCardsToPlayer(playerName) {
    // Сначала пытаемся получить карты из префлоп файла
    if (this.settings?.preflopFile) {
      try {
        const preflopPath = path.join(__dirname, 'preflopspots', this.settings.preflopFile);
        if (fs.existsSync(preflopPath)) {
          const content = fs.readFileSync(preflopPath, 'utf8');
          
          // Ищем карты для конкретного игрока в секции HOLE CARDS
          const holeCardsSection = content.split('*** HOLE CARDS ***')[1];
          if (holeCardsSection) {
            const dealtToMatch = holeCardsSection.match(new RegExp(`Dealt to ${playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\[([A-Za-z0-9\\s]+)\\]`));
            if (dealtToMatch) {
              const cardsStr = dealtToMatch[1];
              const cards = this.parseCardsFromString(cardsStr);
              if (cards && cards.length === 2) {
                console.log(`✅ Карты для ${playerName} из префлоп файла: ${cardsStr}`);
                return cards;
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Ошибка чтения карт из префлоп файла:`, error);
      }
    }
    
    // Если не удалось получить карты из файла, используем диапазоны
    const playerRanges = this.settings.playerRanges || {};
    
    let playerKey = 'player1';
    if (playerName.includes('IP') || this.players.get(Array.from(this.players.keys())[1])?.name === playerName) {
      playerKey = 'player2';
    }
    
    const playerRange = playerRanges[playerKey];
    if (playerRange && playerRange.handWeights) {
      const availableHands = Object.keys(playerRange.handWeights);
      if (availableHands.length > 0) {
        const randomHand = availableHands[Math.floor(Math.random() * availableHands.length)];
        
        try {
          const cards = generateCardsForHand(randomHand, this.deck);
          if (cards && cards.length === 2) {
            // Удаляем карты из колоды
            this.deck = this.deck.filter(c => !(c.rank === cards[0].rank && c.suit === cards[0].suit));
            this.deck = this.deck.filter(c => !(c.rank === cards[1].rank && c.suit === cards[1].suit));
            console.log(`🎲 Карты для ${playerName} из диапазона: ${randomHand}`);
            return cards;
          }
        } catch (error) {
          console.log(`❌ Ошибка генерации карт для ${randomHand}:`, error.message);
        }
      }
    }
    
    // В крайнем случае даем случайные карты
    const card1 = this.deck.pop();
    const card2 = this.deck.pop();
    console.log(`🎲 Случайные карты для ${playerName}: ${card1?.rank}${card1?.suit} ${card2?.rank}${card2?.suit}`);
    return [card1, card2];
  }
  
  parseCardsFromString(cardsStr) {
    try {
      // Ожидаем формат "Kh Qs" или "As Kc"
      const cardStrings = cardsStr.trim().split(/\s+/);
      if (cardStrings.length !== 2) return null;
      
      const cards = [];
      for (const cardStr of cardStrings) {
        if (cardStr.length !== 2) continue;
        const rank = cardStr[0];
        const suitChar = cardStr[1];
        
        // Конвертируем символ масти
        let suit;
        switch (suitChar.toLowerCase()) {
          case 'h': suit = '♥'; break;
          case 'd': suit = '♦'; break;
          case 'c': suit = '♣'; break;
          case 's': suit = '♠'; break;
          default: continue;
        }
        
        cards.push({ rank, suit });
      }
      
      return cards.length === 2 ? cards : null;
    } catch (error) {
      console.error('Error parsing cards from string:', error);
      return null;
    }
  }
  
  generateBoard() {
    console.log('🎴 Начинаю генерацию флопа...');
    const boardSettings = this.settings.boardSettings?.flop;
    console.log('🎴 Настройки флопа:', JSON.stringify(boardSettings, null, 2));
    
    // Если указаны конкретные карты флопа
    if (boardSettings?.specificCards && boardSettings.specificCards.some(card => card !== null)) {
      console.log('🎯 Используются конкретные карты флопа');
      const board = [];
      boardSettings.specificCards.forEach(card => {
        if (card) {
          board.push(card);
          // Удаляем карту из колоды
          this.deck = this.deck.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        } else {
          board.push(this.deck.pop());
        }
      });
      console.log('🎴 Сданные карты флопа:', board);
      return board.slice(0, 3);
    } else {
      console.log('🎲 Генерирую случайный флоп согласно ограничениям');
      // Генерировать флоп согласно ограничениям
      const flop = this.generateRestrictedFlop();
      console.log('🎴 Сгенерированный флоп:', flop);
      return flop;
    }
  }

  generateRestrictedFlop() {
    const restrictions = this.settings.boardSettings?.flop;
    if (!restrictions || (restrictions.suits === 'any' && restrictions.pairing === 'any' && 
                         (!restrictions.ranks || restrictions.ranks.high?.[0] === 'any'))) {
      // Нет ограничений, генерируем случайно
      console.log('🎲 Нет ограничений флопа, генерирую случайно');
      console.log(`🎲 Размер колоды перед генерацией флопа: ${this.deck.length} карт`);
      const flop = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      console.log(`🎲 Сгенерированный флоп: ${flop.map(c => c.rank + c.suit).join(', ')}`);
      return flop;
    }

    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      const cards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      
      if (this.validateFlopRestrictions(cards, restrictions)) {
        return cards;
      }
      
      // Вернуть карты в колоду и перемешать
      this.deck.push(...cards);
      this.deck = shuffleDeck(this.deck);
      attempts++;
    }

    // Если не удалось найти подходящий флоп, вернуть любой
    console.log('⚠️ Не удалось найти флоп с ограничениями за', maxAttempts, 'попыток');
    return [this.deck.pop(), this.deck.pop(), this.deck.pop()];
  }

  validateFlopRestrictions(cards, restrictions) {
    // Определение констант рангов (если их нет)
    const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    
    console.log('🔍 Проверка ограничений флопа:', {
      cards: cards.map(c => c.rank + c.suit),
      restrictions: restrictions
    });

    // Проверка мастей
    if (restrictions.suits !== 'any') {
      const suits = cards.map(card => card.suit);
      const uniqueSuits = [...new Set(suits)];
      
      switch (restrictions.suits) {
        case 'monotone':
          if (uniqueSuits.length !== 1) {
            console.log('❌ Не монотон:', uniqueSuits.length, 'мастей');
            return false;
          }
          break;
        case 'rainbow':
          if (uniqueSuits.length !== 3) {
            console.log('❌ Не радуга:', uniqueSuits.length, 'мастей');
            return false;
          }
          break;
        case 'flush-draw':
          if (uniqueSuits.length !== 2) {
            console.log('❌ Не флеш-дро:', uniqueSuits.length, 'мастей');
            return false;
          }
          break;
      }
    }

    // Проверка спаренности
    if (restrictions.pairing !== 'any') {
      const ranks = cards.map(card => card.rank);
      const uniqueRanks = [...new Set(ranks)];
      
      switch (restrictions.pairing) {
        case 'unpaired':
          if (uniqueRanks.length !== 3) {
            console.log('❌ Не unpaired:', uniqueRanks.length, 'уникальных рангов');
            return false;
          }
          break;
        case 'paired':
          if (uniqueRanks.length !== 2) {
            console.log('❌ Не paired:', uniqueRanks.length, 'уникальных рангов');
            return false;
          }
          break;
        case 'trips':
          if (uniqueRanks.length !== 1) {
            console.log('❌ Не trips:', uniqueRanks.length, 'уникальных рангов');
            return false;
          }
          break;
      }
    }

    // Проверка старшинства карт - ИСПРАВЛЕНО
    const rankIndices = cards.map(card => CARD_RANKS.indexOf(card.rank));
    const sortedRanks = [...rankIndices].sort((a, b) => b - a); // Сортировка по убыванию
    const [high, middle, low] = [sortedRanks[0], sortedRanks[1], sortedRanks[2]];
    
    console.log('🃏 Ранги карт:', {
      cards: cards.map(c => c.rank),
      indices: rankIndices,
      sorted: sortedRanks,
      high: CARD_RANKS[high],
      middle: CARD_RANKS[middle], 
      low: CARD_RANKS[low]
    });
    
    // Проверка высокой карты
    if (restrictions.ranks?.high && restrictions.ranks.high[0] !== 'any') {
      const allowedHighRanks = restrictions.ranks.high.map(rank => CARD_RANKS.indexOf(rank));
      console.log('🎯 Проверка высокой карты:', {
        actual: CARD_RANKS[high],
        allowed: restrictions.ranks.high
      });
      if (!allowedHighRanks.includes(high)) {
        console.log('❌ Высокая карта не подходит');
        return false;
      }
    }
    
    // Проверка средней карты
    if (restrictions.ranks?.middle && restrictions.ranks.middle[0] !== 'any') {
      const allowedMiddleRanks = restrictions.ranks.middle.map(rank => CARD_RANKS.indexOf(rank));
      console.log('🎯 Проверка средней карты:', {
        actual: CARD_RANKS[middle],
        allowed: restrictions.ranks.middle
      });
      if (!allowedMiddleRanks.includes(middle)) {
        console.log('❌ Средняя карта не подходит');
        return false;
      }
    }
    
    // Проверка низкой карты
    if (restrictions.ranks?.low && restrictions.ranks.low[0] !== 'any') {
      const allowedLowRanks = restrictions.ranks.low.map(rank => CARD_RANKS.indexOf(rank));
      console.log('🎯 Проверка низкой карты:', {
        actual: CARD_RANKS[low],
        allowed: restrictions.ranks.low
      });
      if (!allowedLowRanks.includes(low)) {
        console.log('❌ Низкая карта не подходит');
        return false;
      }
    }

    console.log('✅ Флоп прошел все проверки');
    return true;
  }
  
  notifyPlayersOfTableUpdate(message = '') {
    console.log(`📤 Отправка обновлений стола ${this.tableId} всем игрокам`);
    
    this.players.forEach((player, playerId) => {
      if (player.isBot || !player.socketId) {
        return;
      }
      
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        const tableInfo = this.getTableInfo(playerId);
        
        // Отправляем в новом формате table-updated
        const updateData = {
          tableId: this.tableId,
          currentPlayer: tableInfo.currentPlayer,
          currentBet: tableInfo.currentBet,
          players: tableInfo.players.map(p => ({
            id: p.id,
            name: p.name,
            position: p.position,
            stack: p.stack,
            bet: p.bet,
            cards: p.cards,
            hasActed: p.hasActed,
            isAllIn: p.isAllIn,
            isFolded: p.isFolded
          })),
          communityCards: tableInfo.communityCards,
          board: tableInfo.board,
          pot: tableInfo.pot,
          street: this.currentStreet,
          handNumber: this.handNumber,
          isHandActive: tableInfo.isHandActive,
          actionRequired: tableInfo.actionRequired,
          message: message
        };
        
        console.log(`📤 Отправка table-updated игроку ${playerId} (${player.name}):`, updateData);
        socket.emit('table-updated', updateData);
        
        // Также отправляем старый формат для совместимости
        socket.emit('table-update', {
          tableId: this.tableId,
          tableInfo: tableInfo,
          message
        });
      }
    });
  }
  
  processPlayerAction(playerId, action, amount = 0) {
    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, error: 'Игрок не найден' };
    }
    
    // Проверяем, что раздача активна
    if (!this.isHandActive) {
      return { success: false, error: 'Раздача не активна' };
    }
    
    // Проверяем, что это ход игрока
    if (!this.isPlayerTurn(playerId)) {
      return { success: false, error: 'Не ваша очередь действовать' };
    }
    
    // Валидация действия
    const validation = this.validateAction(playerId, action, amount);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // Обработка действия
    const result = this.executeAction(playerId, action, validation.amount || amount);
    
    if (result.success) {
      // Проверка завершения торгов ПЕРЕД переходом к следующему игроку
      if (this.isBettingRoundComplete()) {
        this.completeBettingRound();
      } else {
        // Переход к следующему игроку только если торги не завершены
        this.moveToNextPlayer();
      }
    }
    
    return result;
  }
  
  // Проверка очереди игрока
  isPlayerTurn(playerId) {
    const playerIds = Array.from(this.players.keys());
    const activePlayers = playerIds.filter(id => {
      const p = this.players.get(id);
      return !p.isFolded && !p.isAllIn;
    });
    
    if (activePlayers.length === 0) return false;
    
    const currentPlayerId = activePlayers[this.currentPlayerIndex % activePlayers.length];
    
    console.log(`🎯 Проверка хода: запрашивает ${playerId}, текущий игрок ${currentPlayerId}, индекс ${this.currentPlayerIndex}, активные игроки: [${activePlayers.join(', ')}]`);
    
    return currentPlayerId === playerId;
  }
  
  // Валидация действия
  validateAction(playerId, action, amount) {
    const player = this.players.get(playerId);
    
    switch (action) {
      case 'fold':
        return { valid: true };
        
      case 'check':
        if (this.currentBet === 0 || player.bet === this.currentBet) {
          return { valid: true };
        }
        return { valid: false, error: 'Нельзя чекнуть при активной ставке' };
        
      case 'call':
        const callAmount = this.currentBet - player.bet;
        if (callAmount <= 0) {
          return { valid: false, error: 'Нет ставки для колла' };
        }
        if (callAmount > player.stack) {
          // All-in call
          return { valid: true, amount: player.stack };
        }
        return { valid: true, amount: callAmount };
        
      case 'bet':
        if (this.currentBet > 0) {
          return { valid: false, error: 'Нельзя делать бет при активной ставке' };
        }
        const minBet = 200; // 1 BB = $2.00
        if (amount < minBet) {
          return { valid: false, error: `Минимальный бет: $${(minBet / 100).toFixed(2)}` };
        }
        if (amount > player.stack) {
          return { valid: true, amount: player.stack };
        }
        return { valid: true };
        
      case 'raise':
        if (this.currentBet === 0) {
          return { valid: false, error: 'Нет ставки для рейза' };
        }
        
        const minRaise = this.calculateMinRaise();
        const minRaiseTotal = this.currentBet + minRaise;
        const allInAmount = player.stack + player.bet;
        
        // Проверка на All-in
        if (amount > allInAmount) {
          return { valid: false, error: 'Недостаточно фишек' };
        }
        
        // Если игрок хочет пойти в олл-ин
        if (amount === allInAmount) {
          // Олл-ин всегда разрешен, если он больше текущей ставки
          if (allInAmount > this.currentBet) {
            // Проверяем, является ли All-in полным рейзом
            if (allInAmount >= minRaiseTotal) {
              // Полный рейз All-in
              return { valid: true, amount: allInAmount, isFullRaise: true };
            } else {
              // Неполный рейз All-in (не открывает торги заново)
              return { valid: true, amount: allInAmount, isFullRaise: false };
            }
          } else {
            return { valid: false, error: 'Недостаточно фишек для рейза' };
          }
        }
        
        // Обычная проверка минимального рейза (не олл-ин)
        if (amount < minRaiseTotal) {
          return { valid: false, error: `Минимальный рейз: $${(minRaiseTotal / 100).toFixed(2)}` };
        }
        
        return { valid: true, isFullRaise: true };
        
      default:
        return { valid: false, error: 'Неизвестное действие' };
    }
  }
  
  // Выполнение действия
  executeAction(playerId, action, amount) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, error: 'Игрок не найден' };
    
    console.log(`🎯 ${player.name} выполняет действие: ${action}${amount > 0 ? ` $${(amount / 100).toFixed(2)}` : ''}`);
    
    // Записываем действие в Hand History
    this.recordAction(playerId, action, amount);
    
    switch (action) {
      case 'fold':
        player.isFolded = true;
        player.hasActed = true;
        console.log(`📁 ${player.name} сфолдил`);
        return { success: true, action: 'fold' };
        
      case 'check':
        player.hasActed = true;
        console.log(`✅ ${player.name} чекнул`);
        return { success: true, action: 'check' };
        
      case 'call':
        const callAmount = Math.min(amount, this.currentBet - player.bet);
        player.stack -= callAmount;
        player.bet += callAmount;
        player.hasActed = true;
        this.pot += callAmount;
        
        if (player.stack === 0) {
          player.isAllIn = true;
        }
        
        console.log(`📞 ${player.name} заколлировал $${(callAmount / 100).toFixed(2)}, ставка игрока: $${(player.bet / 100).toFixed(2)}`);
        return { 
          success: true, 
          action: 'call',
          amount: callAmount,
          playerBet: player.bet,
          newStack: player.stack
        };
        
      case 'bet':
        player.stack -= amount;
        player.bet = amount;
        player.hasActed = true;
        this.currentBet = amount;
        this.lastRaiseAmount = amount;
        this.pot += amount;
        
        // Сброс флагов действий других игроков
        this.resetOtherPlayersActions(playerId);
        
        if (player.stack === 0) {
          player.isAllIn = true;
        }
        
        console.log(`💰 ${player.name} поставил $${(amount / 100).toFixed(2)}, ставка игрока: $${(player.bet / 100).toFixed(2)}`);
        return { 
          success: true, 
          action: 'bet',
          amount: amount,
          playerBet: player.bet,
          newStack: player.stack,
          newCurrentBet: this.currentBet
        };
        
      case 'raise':
        const additionalAmount = amount - player.bet;
        player.stack -= additionalAmount;
        player.bet = amount;
        player.hasActed = true;
        this.lastRaiseAmount = amount - this.currentBet;
        this.currentBet = amount;
        this.pot += additionalAmount;
        
        // Сброс флагов действий других игроков (только для полных рейзов)
        const validation = this.validateAction(playerId, 'raise', amount);
        if (validation.isFullRaise !== false) {
          this.resetOtherPlayersActions(playerId);
        }
        
        if (player.stack === 0) {
          player.isAllIn = true;
        }
        
        console.log(`🚀 ${player.name} рейзнул до $${(amount / 100).toFixed(2)}, ставка игрока: $${(player.bet / 100).toFixed(2)}`);
        return { 
          success: true, 
          action: 'raise',
          amount: amount,
          playerBet: player.bet,
          newStack: player.stack,
          newCurrentBet: this.currentBet
        };
        
      default:
        return { success: false, error: 'Неизвестное действие' };
    }
  }
  
  // Сброс флагов действий других игроков при рейзе/бете
  resetOtherPlayersActions(raisingPlayerId) {
    this.players.forEach((player, playerId) => {
      if (playerId !== raisingPlayerId && !player.isFolded && !player.isAllIn) {
        player.hasActed = false;
      }
    });
  }
  
  // Переход к следующему игроку
  moveToNextPlayer() {
    const playerIds = Array.from(this.players.keys());
    const activePlayers = playerIds.filter(id => {
      const p = this.players.get(id);
      return !p.isFolded && !p.isAllIn;
    });
    
    if (activePlayers.length <= 1) {
      console.log('🔄 Не осталось игроков для хода (все сфолдили или all-in)');
      return;
    }
    
    // ✅ ИСПРАВЛЕНИЕ: Корректная обработка индекса после фолда
    // Находим текущего игрока и переходим к следующему
    const currentPlayerId = activePlayers[this.currentPlayerIndex % activePlayers.length];
    let nextIndex = (this.currentPlayerIndex + 1) % activePlayers.length;
    
    // Дополнительная проверка: убеждаемся что следующий игрок не сфолдил и не all-in
    let attempts = 0;
    while (attempts < activePlayers.length) {
      const nextPlayerId = activePlayers[nextIndex];
      const nextPlayer = this.players.get(nextPlayerId);
      
      if (nextPlayer && !nextPlayer.isFolded && !nextPlayer.isAllIn) {
        this.currentPlayerIndex = nextIndex;
        console.log(`🔄 Ход переходит к игроку: ${nextPlayer.name} (индекс: ${nextIndex})`);
        return;
      }
      
      nextIndex = (nextIndex + 1) % activePlayers.length;
      attempts++;
    }
    
    console.log('⚠️ Не удалось найти следующего активного игрока');
  }
  
  // Проверка завершения торгов согласно правилам покера
  isBettingRoundComplete() {
    const allPlayers = Array.from(this.players.values()).filter(p => !p.isFolded);
    const activePlayers = allPlayers.filter(p => !p.isAllIn);
    
    console.log(`🔍 Проверка завершения торгов: всего игроков ${allPlayers.length}, активных ${activePlayers.length}`);
    console.log(`🔍 Состояние игроков:`, allPlayers.map(p => `${p.name}: bet=${p.bet}, hasActed=${p.hasActed}, isAllIn=${p.isAllIn}, isFolded=${p.isFolded}`));
    console.log(`🔍 Текущая ставка: ${this.currentBet}`);
    
    // КРИТИЧЕСКИ ВАЖНО: Если остался только один игрок в игре (не сфолдил), раздача завершена
    if (allPlayers.length <= 1) {
      console.log('🏁 Раздача завершена: остался один игрок в игре (остальные сфолдили)');
      return true;
    }
    
    // Если нет активных игроков (все All-in), торги завершены
    if (activePlayers.length === 0) {
      console.log('🏁 Торги завершены: все игроки All-in');
      return true;
    }
    
    // Проверяем различные сценарии завершения торгов:
    
    // 1. Все игроки сделали CHECK (currentBet = 0, все действовали)
    if (this.currentBet === 0) {
      const allChecked = activePlayers.every(p => p.hasActed && p.bet === 0);
      if (allChecked) {
        console.log('🏁 Торги завершены: все игроки сделали CHECK');
        return true;
      }
    }
    
    // 2. Ставка и CALL (все активные игроки действовали и имеют равные ставки)
    if (this.currentBet > 0) {
      const allActed = activePlayers.every(p => p.hasActed);
      const allBetsEqual = activePlayers.every(p => p.bet === this.currentBet);
      
      console.log(`🔍 Все действовали: ${allActed}, все ставки равны: ${allBetsEqual}`);
      
      if (allActed && allBetsEqual) {
        console.log('🏁 Торги завершены: ставка и CALL');
        return true;
      }
    }
    
    console.log('⏳ Торги продолжаются');
    return false; // Торги продолжаются
  }
  
  // Завершение торгов на улице
  completeBettingRound() {
    console.log(`🏁 Торги на ${this.currentStreet} завершены`);
    
    // Проверяем, остался ли только один игрок в игре
    const remainingPlayers = Array.from(this.players.values()).filter(p => !p.isFolded);
    
    if (remainingPlayers.length <= 1) {
      console.log('🏆 Раздача завершена - остался только один игрок');
      // Добавляем ставки в банк
      let streetTotal = 0;
      this.players.forEach(player => {
        if (player.bet > 0) {
          this.pot += player.bet;
          streetTotal += player.bet;
          console.log(`💰 Ставка игрока ${player.name} $${(player.bet / 100).toFixed(2)} добавлена в банк`);
          player.bet = 0;
        }
      });
      
      // Обновляем streetPot для отображения - НЕ общий банк, а только ставки текущей улицы + префлоп
      this.streetPot += streetTotal; // Добавляем только ставки этой улицы
      console.log(`🏦 Общий банк: $${(this.pot / 100).toFixed(2)}, отображаемый банк улицы: $${(this.streetPot / 100).toFixed(2)}`);
      
      // Завершаем раздачу немедленно
      this.completeHand();
      return;
    }
    
    // Добавляем ставки игроков в банк
    const streetBets = [];
    let streetTotal = 0;
    this.players.forEach(player => {
      if (player.bet > 0) {
        this.pot += player.bet;
        streetBets.push(`${player.name}: $${(player.bet / 100).toFixed(2)}`);
        streetTotal += player.bet;
        console.log(`💰 Ставка игрока ${player.name} $${(player.bet / 100).toFixed(2)} добавлена в банк`);
        player.bet = 0; // Сбрасываем ставку игрока
      }
    });
    
    // Обновляем streetPot для отображения - добавляем только ставки текущей улицы
    this.streetPot += streetTotal; // Добавляем только ставки этой улицы, не весь банк
    
    if (streetBets.length > 0) {
      console.log(`💰 Ставки на улице ${this.currentStreet}: [${streetBets.join(', ')}] = $${(streetTotal / 100).toFixed(2)}`);
    }
    console.log(`🏦 Общий банк: $${(this.pot / 100).toFixed(2)}, отображаемый банк улицы: $${(this.streetPot / 100).toFixed(2)}`);
    
    // Проверить на all-in ситуацию
    const allInDetected = this.checkForAllIn();
    
    if (allInDetected) {
      console.log('🎯 Обнаружен All-in! Автоматическая раздача оставшихся карт...');
      this.handleAllInSituation();
      return;
    }
    
    // Переход к следующей улице или завершение раздачи
    this.moveToNextStreet();
  }
  
  // Переход к следующей улице
  moveToNextStreet() {
    switch (this.currentStreet) {
      case 'preflop':
        console.log('⚠️ Предупреждение: симулятор не должен начинать с префлопа');
        this.dealFlop();
        break;
      case 'flop':
        this.dealTurn();
        break;
      case 'turn':
        this.dealRiver();
        break;
      case 'river':
        this.completeHand();
        break;
      default:
        console.log('Неизвестная улица:', this.currentStreet);
    }
  }

  // Раздача флопа
  dealFlop() {
    // Флоп уже сгенерирован в startNewHand, просто переходим к нему
    this.currentStreet = 'flop';
    this.currentBet = 0;
    this.currentPlayerIndex = 0;
    
    // Сброс флагов действий для новой улицы
    this.players.forEach(player => {
      if (!player.isFolded && !player.isAllIn) {
        player.hasActed = false;
      }
    });
    
    console.log(`🌟 Флоп: ${this.board.map(c => c.rank + c.suit).join(', ')}`);
    console.log('🎯 Торги на флопе начались');
  }
  
  // Раздача тёрна
  dealTurn() {
    this.board.push(this.deck.pop());
    this.currentStreet = 'turn';
    this.currentBet = 0;
    
    // Определяем кто начинает на постфлопе (OOP всегда ходит первым)
    const playersArray = Array.from(this.players.values());
    let oopPlayerIndex = 0;
    
    // Ищем игрока с позицией OOP
    for (let i = 0; i < playersArray.length; i++) {
      if (playersArray[i].position === 'OOP' && !playersArray[i].isFolded && !playersArray[i].isAllIn) {
        oopPlayerIndex = i;
        break;
      }
    }
    
    this.currentPlayerIndex = oopPlayerIndex; // OOP начинает на тёрне
    
    // Сброс флагов действий для новой улицы
    this.players.forEach(player => {
      if (!player.isFolded && !player.isAllIn) {
        player.hasActed = false;
      }
    });
    
    console.log(`🌟 Тёрн: ${this.board[3].rank}${this.board[3].suit}`);
    console.log(`🎯 Тёрн начинает игрок ${playersArray[oopPlayerIndex].name} (позиция: ${playersArray[oopPlayerIndex].position}, индекс: ${oopPlayerIndex})`);
    console.log('🎯 Торги на тёрне начались');
    
    // Уведомляем игроков о тёрне
    this.notifyPlayersOfTableUpdate('Тёрн роздан');
  }
  
  // Раздача ривера
  dealRiver() {
    this.board.push(this.deck.pop());
    this.currentStreet = 'river';
    this.currentBet = 0;
    
    // Определяем кто начинает на постфлопе (OOP всегда ходит первым)
    const playersArray = Array.from(this.players.values());
    let oopPlayerIndex = 0;
    
    // Ищем игрока с позицией OOP
    for (let i = 0; i < playersArray.length; i++) {
      if (playersArray[i].position === 'OOP' && !playersArray[i].isFolded && !playersArray[i].isAllIn) {
        oopPlayerIndex = i;
        break;
      }
    }
    
    this.currentPlayerIndex = oopPlayerIndex; // OOP начинает на ривере
    
    // Сброс флагов действий для новой улицы
    this.players.forEach(player => {
      if (!player.isFolded && !player.isAllIn) {
        player.hasActed = false;
      }
    });
    
    console.log(`🌟 Ривер: ${this.board[4].rank}${this.board[4].suit}`);
    console.log(`🎯 Ривер начинает игрок ${playersArray[oopPlayerIndex].name} (позиция: ${playersArray[oopPlayerIndex].position}, индекс: ${oopPlayerIndex})`);
    console.log('🎯 Торги на ривере начались');
    
    // Уведомляем игроков о ривере
    this.notifyPlayersOfTableUpdate('Ривер роздан');
  }
  
  // Завершение раздачи
  completeHand() {
    console.log('🏆 Раздача завершена');
    
    const activePlayers = Array.from(this.players.values()).filter(p => !p.isFolded);
    let winner;
    let isShowdown = activePlayers.length > 1;
    let uncalledBet = 0;
    let uncalledBetPlayer = null;
    
    // Правильный подсчет банка на основе всех действий
    let totalPot = 0;
    
    // ✅ ИСПРАВЛЕНИЕ: Сначала используем текущий this.pot как начальную точку
    // (в нем уже учтены префлоп инвестиции из parseHandHistory)
    if (this.pot > 0) {
      totalPot = this.pot;
      console.log(`💰 Начальный банк (включая префлоп): $${(this.pot / 100).toFixed(2)}`);
    } else {
      // Резервный вариант - пытаемся добавить префлоп инвестиции
      if (this.preflopInvestments) {
        const preflopTotal = Object.values(this.preflopInvestments).reduce((a, b) => a + b, 0);
        totalPot += preflopTotal;
        console.log(`💰 Префлоп инвестиции (резервный расчет): $${(preflopTotal / 100).toFixed(2)}`);
      }
    }
    
    // Подсчитываем все ставки по действиям из Hand History
    if (this.currentHandData && this.currentHandData.actions) {
      // Подсчитываем инвестиции игроков по улицам
      const streetTotals = { flop: {}, turn: {}, river: {} };
      
      this.currentHandData.actions.forEach(action => {
        if (action.action === 'bet' || action.action === 'raise' || action.action === 'call') {
          const street = action.street || 'flop';
          
          if (!streetTotals[street]) {
            streetTotals[street] = {};
          }
          if (!streetTotals[street][action.playerId]) {
            streetTotals[street][action.playerId] = 0;
          }
          
          if (action.action === 'bet') {
            streetTotals[street][action.playerId] = action.amount; // Устанавливаем ставку
          } else if (action.action === 'raise') {
            // Для рейза устанавливаем полную сумму ставки игрока на улице
            streetTotals[street][action.playerId] = action.totalBet || action.amount;
          } else if (action.action === 'call') {
            // Для колла добавляем к текущей ставке игрока на улице
            streetTotals[street][action.playerId] += action.amount;
          }
        }
      });
      
      // ✅ ИСПРАВЛЕНИЕ: Вычисляем uncalled bet при фолде
      if (!isShowdown) {
        // Находим максимальную ставку на последней улице и игрока, который её сделал
        let lastStreet = this.currentStreet;
        let maxBetOnStreet = 0;
        let maxBetPlayerId = null;
        
        Object.entries(streetTotals[lastStreet] || {}).forEach(([playerId, amount]) => {
          if (amount > maxBetOnStreet) {
            maxBetOnStreet = amount;
            maxBetPlayerId = playerId;
          }
        });
        
        // Если есть неуравненная ставка (другие игроки поставили меньше или фолднули)
        if (maxBetOnStreet > 0 && maxBetPlayerId) {
          const otherPlayerAmounts = Object.entries(streetTotals[lastStreet] || {})
            .filter(([playerId, amount]) => playerId !== maxBetPlayerId)
            .map(([playerId, amount]) => amount);
          
          const maxOtherAmount = Math.max(0, ...otherPlayerAmounts);
          uncalledBet = maxBetOnStreet - maxOtherAmount;
          
          if (uncalledBet > 0) {
            uncalledBetPlayer = Array.from(this.players.values()).find(p => p.id === maxBetPlayerId);
            
            // ✅ ИСПРАВЛЕНИЕ: Если игрок не найден в this.players (например, был удален), 
            // попробуем найти его в currentHandData.positions
            if (!uncalledBetPlayer && this.currentHandData?.positions) {
              for (const [seat, playerData] of Object.entries(this.currentHandData.positions)) {
                if (playerData.id === maxBetPlayerId) {
                  uncalledBetPlayer = {
                    id: playerData.id,
                    name: playerData.nickname || playerData.name || 'Player',
                    position: playerData.position || 'Unknown'
                  };
                  break;
                }
              }
            }
            
            console.log(`💰 Uncalled bet: $${(uncalledBet / 100).toFixed(2)} возвращено игроку ${uncalledBetPlayer?.name || 'Unknown'}`);
            
            // Уменьшаем банк на размер неуравненной ставки
            streetTotals[lastStreet][maxBetPlayerId] -= uncalledBet;
          }
        }
      }
      
      // Суммируем все ставки по улицам
      let postflopTotal = 0;
      Object.keys(streetTotals).forEach(street => {
        const streetTotal = Object.values(streetTotals[street]).reduce((a, b) => a + b, 0);
        if (streetTotal > 0) {
          postflopTotal += streetTotal;
          console.log(`💰 ${street.toUpperCase()}: $${(streetTotal / 100).toFixed(2)}`);
        }
      });
      
      // ✅ ИСПРАВЛЕНИЕ: Добавляем постфлоп ставки к банку (а не заменяем банк)
      if (postflopTotal > 0) {
        totalPot += postflopTotal;
        console.log(`💰 Всего постфлоп ставок: $${(postflopTotal / 100).toFixed(2)}`);
      } else {
        console.log(`💰 Постфлоп ставок нет (только чеки)`);
      }
      
    }
    
    // Обновляем this.pot правильным значением
    this.pot = totalPot;
    
    // Рассчитать rake
    const rakeAmount = this.calculateRake();
    const winAmount = this.pot - rakeAmount;
    
    console.log(`💰 Итоговый банк: $${(this.pot / 100).toFixed(2)}, Rake: $${(rakeAmount / 100).toFixed(2)}, Выигрыш: $${(winAmount / 100).toFixed(2)}`);
    
    if (activePlayers.length === 1) {
      // Победа фолдом
      winner = activePlayers[0];
      winner.stack += winAmount; // Добавляем выигрыш после вычета rake
      
      // Возвращаем неуравненную ставку
      if (uncalledBet > 0 && uncalledBetPlayer) {
        // ✅ ИСПРАВЛЕНИЕ: Обновляем стек только если игрок найден в this.players
        const actualPlayer = this.players.get(uncalledBetPlayer.id);
        if (actualPlayer) {
          actualPlayer.stack += uncalledBet;
          console.log(`💰 Uncalled bet $${(uncalledBet / 100).toFixed(2)} возвращен игроку ${actualPlayer.name}`);
        }
      }
      
      console.log(`🏆 ${winner.name} выиграл $${(winAmount / 100).toFixed(2)} (фолд)`);
    } else {
      // ✅ ИСПРАВЛЕНИЕ: Правильное определение победителя через сравнение покерных комбинаций
      winner = this.determineWinnerByShowdown(activePlayers);
      winner.stack += winAmount; // Добавляем выигрыш после вычета rake
      console.log(`🏆 ${winner.name} выиграл $${(winAmount / 100).toFixed(2)} (шоудаун)`);
    }
    
    // Генерируем и сохраняем Hand History
    if (this.currentHandData) {
      // Найти правильный сит из существующих позиций в currentHandData
      let winnerSeat = 0;
      Object.entries(this.currentHandData.positions).forEach(([seat, playerData]) => {
        if (playerData.id === winner.id) {
          winnerSeat = parseInt(seat);
        }
      });
      
      // Если не найден в позициях, вычислить заново
      if (winnerSeat === 0) {
        winnerSeat = Array.from(this.players.keys()).indexOf(winner.id) + 1;
      }
      
      this.currentHandData.winners = [{
        id: winner.id,
        position: winner.position,
        seat: winnerSeat,
        amount: winAmount / 100 // Используем сумму после вычета rake
      }];
      this.currentHandData.pot = this.pot / 100; // Используем правильно подсчитанный банк
      this.currentHandData.isShowdown = isShowdown;
      this.currentHandData.uncalledBet = uncalledBet > 0 ? {
        amount: uncalledBet / 100,
        player: uncalledBetPlayer ? {
          id: uncalledBetPlayer.id,
          nickname: this.playerNicknames[uncalledBetPlayer.position] || uncalledBetPlayer.name
        } : null
      } : null;
      this.currentHandData.board = {
        flop: this.board.slice(0, 3).map(card => this.convertCardToPokerStarsFormat(card)),
        turn: this.board[3] ? [this.convertCardToPokerStarsFormat(this.board[3])] : [],
        river: this.board[4] ? [this.convertCardToPokerStarsFormat(this.board[4])] : []
      };
      
      // ✅ ИСПРАВЛЕНИЕ: Добавляем обработку ошибок при генерации Hand History
      try {
        const handText = this.generateHandText();
        this.saveHandToFile(handText);
      } catch (error) {
        console.error('❌ Ошибка при генерации Hand History:', error);
        console.error('Stack trace:', error.stack);
        // Продолжаем выполнение, чтобы не блокировать завершение раздачи
      }
    }
    
    // Отправить обновление с результатами раздачи
    this.notifyPlayersOfTableUpdate('Раздача завершена');
    
    // Отправить специальное событие завершения раздачи
    this.players.forEach((player, playerId) => {
      if (player.isBot || !player.socketId) {
        return;
      }
      
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('hand-completed', {
          tableId: this.tableId,
          tableInfo: this.getTableInfo(playerId),
          message: 'Раздача завершена',
          handData: {
            handNumber: this.handNumber,
            pot: this.pot,
            board: this.board,
            street: this.currentStreet,
            winner: winner.name
          }
        });
      }
    });
    
    // Сброс данных для следующей раздачи
    this.currentHandData = null;
    this.pot = 0; // Сброс общего банка
    this.streetPot = 0; // Сброс банка улицы для отображения
    this.isHandActive = false; // Раздача завершена
    
    // Автоматически начать новую раздачу через небольшую задержку
    setTimeout(() => {
      this.startNewHand();
      console.log(`🔄 Автоматически начата новая раздача на столе ${this.tableId}`);
    }, 2000); // 2 секунды задержки для отображения результатов
  }
  
  // ✅ НОВЫЙ МЕТОД: Определение победителя через сравнение покерных комбинаций
  determineWinnerByShowdown(activePlayers) {
    console.log('🎯 Определение победителя через showdown...');
    
    const playerHands = [];
    
    for (const player of activePlayers) {
      // Собираем карты игрока + карты на столе для оценки комбинации
      const playerCards = player.cards.map(card => 
        `${card.rank}${this.getSuitLetter(card.suit)}`
      );
      const boardCards = this.board.map(card => 
        `${card.rank}${this.getSuitLetter(card.suit)}`
      );
      
      const allCards = [...playerCards, ...boardCards];
      console.log(`  🃏 ${player.name}: карты ${playerCards.join('')}, доска ${boardCards.join('')}`);
      
      try {
        // Используем pokersolver для оценки лучшей 5-карточной комбинации
        const hand = Hand.solve(allCards);
        playerHands.push({
          player: player,
          hand: hand,
          cards: playerCards
        });
        
        console.log(`  🎯 ${player.name}: ${hand.descr} (${hand.rank})`);
      } catch (error) {
        console.error(`❌ Ошибка оценки руки для ${player.name}:`, error);
        // В случае ошибки присваиваем минимальную руку
        playerHands.push({
          player: player,
          hand: { rank: 0, descr: 'High Card' },
          cards: playerCards
        });
      }
    }
    
    // Сортируем руки по силе (лучшая рука первая)
    playerHands.sort((a, b) => {
      // Сравниваем ранги рук (чем больше ранг, тем лучше рука)
      if (a.hand.rank !== b.hand.rank) {
        return b.hand.rank - a.hand.rank;
      }
      // Если ранги равны, сравниваем по качеству карт
      return Hand.winners([a.hand, b.hand])[0] === a.hand ? -1 : 1;
    });
    
    console.log(`🏆 Найден победитель после сортировки`);
    
    // Первая рука в отсортированном списке - победитель
    const winner = playerHands[0].player;
    const winnerHand = playerHands[0].hand;
    
    console.log(`🏆 ПОБЕДИТЕЛЬ: ${winner.name} с комбинацией ${winnerHand.descr}`);
    
    return winner;
  }

  // Рассчитать рейк
  calculateRake() {
    const rakePercent = this.settings?.rakePercent || 5; // 5% по умолчанию
    const rakeCap = (this.settings?.rakeDollar || 1) * 100; // $1.00 в центах по умолчанию
    
    const rakeAmount = this.pot * rakePercent / 100;
    return Math.min(rakeAmount, rakeCap);
  }

  // Расчет минимального рейза
  calculateMinRaise() {
    // Если это первая ставка на улице, минимальный рейз = размер ставки
    if (this.currentBet === 0) {
      return 200; // 1 BB
    }
    
    // Найти размер последнего увеличения ставки на этой улице
    let lastRaiseSize = 200; // По умолчанию 1 BB
    
    // Если есть текущая ставка, минимальный рейз = удвоить эту ставку
    // Правило: новая ставка должна быть минимум на размер предыдущей ставки больше
    if (this.currentBet > 0) {
      lastRaiseSize = this.currentBet;
    }
    
    // Если есть информация о последнем рейзе, используем её
    if (this.lastRaiseAmount > 0) {
      lastRaiseSize = this.lastRaiseAmount;
    }
    
    return Math.max(lastRaiseSize, 200); // Минимум 1 BB
  }

  // Проверить на all-in ситуацию
  checkForAllIn() {
    const activePlayers = Array.from(this.players.values()).filter(p => !p.isFolded);
    
    if (activePlayers.length <= 1) {
      return false; // Раздача уже завершена фолдами
    }
    
    // Проверить есть ли игроки с нулевым стеком (all-in)
    const allInPlayers = activePlayers.filter(p => p.isAllIn || p.stack === 0);
    const playersWithChips = activePlayers.filter(p => !p.isAllIn && p.stack > 0);
    
    console.log(`🎯 All-in проверка: ${allInPlayers.length} игроков all-in, ${playersWithChips.length} игроков с фишками`);
    
    // Если есть хотя бы один all-in игрок и все ставки равны
    if (allInPlayers.length > 0) {
      // Проверить что все ставки равны (или все игроки all-in)
      const bets = activePlayers.map(p => p.bet);
      const allBetsEqual = bets.every(bet => bet === bets[0]);
      
      if (allBetsEqual || playersWithChips.length === 0) {
        console.log('✅ All-in ситуация подтверждена: есть all-in игроки и все ставки равны');
        return true;
      } else {
        console.log('⏳ All-in игроки есть, но ставки не равны, торги продолжаются');
        return false;
      }
    }
    
    // Если все игроки all-in
    if (allInPlayers.length === activePlayers.length) {
      console.log('✅ Все активные игроки all-in');
      return true;
    }
    
    return false;
  }

  // Обработать all-in ситуацию
  handleAllInSituation() {
    console.log('🎯 Обработка all-in ситуации - автоматическая раздача карт...');
    
    // Сбросить флаги действий - больше торгов не будет
    this.players.forEach(player => {
      if (!player.isFolded) {
        player.hasActed = true; // Все считаются действовавшими
      }
    });
    this.currentBet = 0;
    
    // Автоматически раздать оставшиеся карты
    this.dealRemainingCards();
    
    // Завершить раздачу
    this.completeHand();
  }
  
  // Раздать оставшиеся карты до ривера
  dealRemainingCards() {
    console.log(`🃏 Автоматическая раздача карт с улицы: ${this.currentStreet}`);
    
    // Раздать карты в зависимости от текущей улицы
    if (this.currentStreet === 'flop') {
      // Раздать терн
      this.board.push(this.deck.pop());
      console.log(`🃏 Автоматически раздан терн: ${this.board[3].rank}${this.board[3].suit}`);
      
      // Раздать ривер
      this.board.push(this.deck.pop());
      console.log(`🃏 Автоматически раздан ривер: ${this.board[4].rank}${this.board[4].suit}`);
      
      this.currentStreet = 'river';
    } else if (this.currentStreet === 'turn') {
      // Раздать только ривер
      this.board.push(this.deck.pop());
      console.log(`🃏 Автоматически раздан ривер: ${this.board[4].rank}${this.board[4].suit}`);
      
      this.currentStreet = 'river';
    }
    
    // Уведомить игроков об обновлении стола
    this.notifyPlayersOfTableUpdate('All-in - карты розданы автоматически');
  }

  getTableInfo(requestingPlayerId = null) {
    // Определяем активного игрока (кто должен действовать)
    const playerIds = Array.from(this.players.keys());
    const activePlayers = playerIds.filter(id => {
      const p = this.players.get(id);
      return !p.isFolded && !p.isAllIn;
    });
    
    const currentPlayerId = activePlayers.length > 0 ? 
      activePlayers[this.currentPlayerIndex % activePlayers.length] : null;
    
    // Определяем какие карты показывать в зависимости от улицы
    let visibleBoard = [];
    switch (this.currentStreet) {
      case 'flop':
        visibleBoard = this.board.slice(0, 3); // Флоп: 3 карты
        break;
      case 'turn':
        visibleBoard = this.board.slice(0, 4); // Тёрн: 4 карты
        break;
      case 'river':
        visibleBoard = this.board.slice(0, 5); // Ривер: 5 карт
        break;
      default:
        visibleBoard = this.board.slice(0, 3); // По умолчанию флоп
    }
    
    return {
      tableId: this.tableId,
      handNumber: this.handNumber,
      pot: this.streetPot, // Отправляем банк улицы для отображения
      board: visibleBoard,
      communityCards: visibleBoard, // Добавляем для совместимости
      currentStreet: this.currentStreet,
      currentBet: this.currentBet,
      isHandActive: this.isHandActive,
      currentPlayer: currentPlayerId,
      actionRequired: this.isHandActive && activePlayers.length > 1,
      handHistoryInfo: this.parseHandHistory(),
      players: Array.from(this.players.entries()).map(([id, player]) => ({
        id,
        name: player.name,
        position: player.position,
        stack: player.stack,
        bet: player.bet, // Ставка игрока (отображается в его боксе)
        cards: id === requestingPlayerId ? player.cards : [],
        hasActed: player.hasActed,
        isAllIn: player.isAllIn,
        isFolded: player.isFolded
      }))
    };
  }

  recordAction(playerId, action, amount = 0, street = this.currentStreet) {
    if (!this.currentHandData) return;
    
    const player = this.players.get(playerId);
    if (!player) return;

    // Получаем ник из префлоп пресета по позиции
    let nickname = player.name; // По умолчанию используем имя игрока
    
    // Если есть никнеймы из префлоп файла, используем их
    if (this.playerNicknames && Object.keys(this.playerNicknames).length > 0) {
      if (player.position === 'IP' && this.playerNicknames['IP']) {
        nickname = this.playerNicknames['IP'];
      } else if (player.position === 'OOP' && this.playerNicknames['OOP']) {
        nickname = this.playerNicknames['OOP'];
      }
    }
    
    // Для рейзов сохраняем дополнительную информацию
    let actionData = {
      street,
      playerId,
      nickname,
      action,
      amount,
      timestamp: formatGameDateTime(),
      allIn: player.stack === 0 // проверяем all-in после действия
    };

    // Для рейзов добавляем информацию о размере повышения
    if (action === 'raise') {
      // Находим предыдущую максимальную ставку на улице (без учета текущего игрока)
      const otherPlayers = Array.from(this.players.values()).filter(p => p.id !== playerId);
      const maxOtherBet = Math.max(0, ...otherPlayers.map(p => p.bet || 0));
      
      actionData.previousBet = maxOtherBet;
      actionData.raiseAmount = amount - maxOtherBet; // Размер повышения
      actionData.totalBet = amount; // Общая сумма ставки игрока
      
      console.log(`📝 Рейз: предыдущая ставка $${(maxOtherBet / 100).toFixed(2)}, повышение на $${((amount - maxOtherBet) / 100).toFixed(2)}, общая ставка $${(amount / 100).toFixed(2)}`);
    }
    
    // Логирование для отслеживания банка
    console.log(`📝 Записано действие: ${nickname} ${action} $${(amount / 100).toFixed(2)} на улице ${street}`);
    console.log(`💰 Текущий банк: $${(this.pot / 100).toFixed(2)}, Банк улицы: $${(this.streetPot / 100).toFixed(2)}`);
    
    this.currentHandData.actions.push(actionData);
  }

  // Конвертирует символы карт в PokerStars формат
  convertCardToPokerStarsFormat(card) {
    const suitMapping = {
      '♠': 's',
      '♥': 'h', 
      '♦': 'd',
      '♣': 'c'
    };
    const rank = card.rank === '10' ? 'T' : card.rank;
    return `${rank}${suitMapping[card.suit] || card.suit}`;
  }

  // Форматирование карты в правильный вид (например: As, Kh, 7c)
  formatCard(card) {
    const rank = card.rank === '10' ? 'T' : card.rank;
    const suit = this.getSuitLetter(card.suit);
    return `${rank}${suit}`;
  }

  // Получить букву масти для PokerStars формата
  getSuitLetter(suit) {
    const suitMap = {
      'spades': 's',
      'hearts': 'h', 
      'diamonds': 'd',
      'clubs': 'c',
      '♠': 's',
      '♥': 'h',
      '♦': 'd', 
      '♣': 'c'
    };
    return suitMap[suit] || 's';
  }

  // Получить карты игрока для отображения в summary
  getPlayerCardsForSummary(player) {
    if (!player.cards || player.cards.length < 2) {
      return '-- --';
    }
    return player.cards.map(c => this.formatCard(c)).join(' ');
  }

  // Форматирование действия для history
  formatAction(action) {
    const playerName = action.nickname;
    const amount = action.amount;
    
    switch (action.action) {
      case 'check':
        return `${playerName}: checks\n`;
        
      case 'bet':
        const allInText = action.allIn ? ' and is all-in' : '';
        return `${playerName}: bets $${(amount / 100).toFixed(2)}${allInText}\n`;
        
      case 'call':
        const callAllInText = action.allIn ? ' and is all-in' : '';
        return `${playerName}: calls $${(amount / 100).toFixed(2)}${callAllInText}\n`;
        
      case 'raise':
        const raiseAllInText = action.allIn ? ' and is all-in' : '';
        
        // Используем сохраненные данные о рейзе
        if (action.raiseAmount !== undefined && action.totalBet !== undefined) {
          return `${playerName}: raises $${(action.raiseAmount / 100).toFixed(2)} to $${(action.totalBet / 100).toFixed(2)}${raiseAllInText}\n`;
        } else {
          // Fallback для случаев без сохраненных данных
          const previousBet = action.previousBet || 0;
          const raiseSize = amount - previousBet;
          return `${playerName}: raises $${(raiseSize / 100).toFixed(2)} to $${(amount / 100).toFixed(2)}${raiseAllInText}\n`;
        }
        
      case 'fold':
        return `${playerName}: folds\n`;
        
      default:
        return `${playerName}: ${action.action}\n`;
    }
  }

  generateHandText() {
    if (!this.currentHandData) return '';

    const { handId, blinds, positions, actions, board, winners, pot } = this.currentHandData;
    
    // Helper function to get nickname for player - define at method level
    const getPlayerNickname = (playerId, position) => {
      const player = this.players.get(playerId);
      let nickname = player ? player.name : `Player${playerId}`;
      
      // Используем ник из префлопа по позиции (IP/OOP)
      if (this.playerNicknames && this.playerNicknames[position]) {
        nickname = this.playerNicknames[position];
      }
      
      return nickname;
    };
    
    // Извлекаем префлоп часть из исходного файла
    const originalPreflopText = this.extractPreflopFromSource();
    
    let handText = '';
    
    if (originalPreflopText) {
      // Используем префлоп из исходного файла, обновляя только номер руки
      const newHandId = `${Date.now()}${this.tableId}${this.handNumber}`;
      handText = originalPreflopText.replace(/PokerStars Hand #\d+:/, `PokerStars Hand #${newHandId}:`);
      
      // Обновляем timestamp
      handText = handText.replace(/- \d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2}/, `- ${formatGameDateTime()}`);
      handText = handText.replace(/- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, `- ${formatGameDateTime()}`);
      
      // Убираем лишние переносы строк в конце префлопа
      handText = handText.trimEnd() + '\n';
    } else {
      // Fallback к старому формату если префлоп не найден
      handText += `PokerStars Hand #${handId}: Hold'em No Limit ($${blinds.sb}/$${blinds.bb}) - ${formatGameDateTime()}\n`;
      
      // Определяем правильный номер кнопки на основе позиций игроков
      let buttonSeat = 1; // по умолчанию
      Object.entries(positions).forEach(([seat, playerData]) => {
        // Ищем игрока с оригинальной позицией BTN
        const player = Array.from(this.players.values()).find(p => p.id === playerData.id);
        if (player && player.originalPosition === 'BTN') {
          buttonSeat = parseInt(seat);
        }
      });
      
      handText += `Table '${this.tableId}' ${Object.keys(positions).length}-max Seat #${buttonSeat} is the button\n`;
      
      // Seat info
      Object.entries(positions).forEach(([seat, playerData]) => {
        const nickname = getPlayerNickname(playerData.id, playerData.position);
        handText += `Seat ${seat}: ${nickname} ($${playerData.stack.toFixed(2)} in chips)\n`;
      });
    }
    
    // Группируем действия по улицам и форматируем правильно
    const actionsByStreet = {
      flop: actions.filter(a => a.street === 'flop'),
      turn: actions.filter(a => a.street === 'turn'),
      river: actions.filter(a => a.street === 'river')
    };

    // *** FLOP ***
    if (board.flop && board.flop.length >= 3) {
      handText += `*** FLOP *** [${board.flop.join(' ')}]\n`;
      actionsByStreet.flop.forEach(action => {
        handText += this.formatAction(action);
      });
    }

    // *** TURN ***
    if (board.turn && board.turn.length > 0) {
      const flopCards = board.flop.join(' ');
      const turnCard = board.turn[0];
      handText += `*** TURN *** [${flopCards}] [${turnCard}]\n`;
      actionsByStreet.turn.forEach(action => {
        handText += this.formatAction(action);
      });
    }

    // *** RIVER ***
    if (board.river && board.river.length > 0) {
      const flopCards = board.flop.join(' ');
      const turnCard = board.turn[0];
      const riverCard = board.river[0];
      handText += `*** RIVER *** [${flopCards} ${turnCard}] [${riverCard}]\n`;
      actionsByStreet.river.forEach(action => {
        handText += this.formatAction(action);
      });
    }
    
    // ✅ ИСПРАВЛЕНИЕ: Добавляем "Uncalled bet returned" если есть неуравненная ставка
    if (this.currentHandData.uncalledBet && this.currentHandData.uncalledBet.amount > 0 && this.currentHandData.uncalledBet.player) {
      handText += `Uncalled bet ($${this.currentHandData.uncalledBet.amount.toFixed(2)}) returned to ${this.currentHandData.uncalledBet.player.nickname}\n`;
    }
    
    // ✅ ИСПРАВЛЕНИЕ: Добавляем показ карт и собранный банк только при фолде
    if (!this.currentHandData.isShowdown && winners && winners.length > 0) {
      const winner = winners[0];
      const winnerNickname = this.playerNicknames[winner.position] || winner.name || 'Player';
      handText += `${winnerNickname} collected $${winner.amount.toFixed(2)} from pot\n`;
    }
    
    // ✅ ИСПРАВЛЕНИЕ: Показ карт только при шоудауне
    if (this.currentHandData.isShowdown) {
      handText += `*** SHOW DOWN ***\n`;
      
      // Добавляем показ карт для всех активных игроков
      Array.from(this.players.values()).filter(p => !p.isFolded).forEach(player => {
        const playerNickname = this.playerNicknames[player.position] || player.name;
        if (player.cards && player.cards.length >= 2) {
          const card1 = this.convertCardToPokerStarsFormat(player.cards[0]);
          const card2 = this.convertCardToPokerStarsFormat(player.cards[1]);
          handText += `${playerNickname}: shows [${card1} ${card2}]\n`;
        }
      });
    }
    
    // Summary
    const rakeAmount = this.calculateRake();
    handText += `*** SUMMARY ***\n`;
    handText += `Total pot $${pot.toFixed(2)} | Rake $${(rakeAmount / 100).toFixed(2)}\n`;
    if (board.flop) {
      const allBoardCards = [...board.flop, ...(board.turn || []), ...(board.river || [])];
      handText += `Board [${allBoardCards.join(' ')}]\n`;
    }
    
    // Генерируем полную информацию о всех игроках из префлопа
    handText += this.generateSummarySeats(winners);
    
    return handText + '\n\n';
  }

  generateSummarySeats(winners) {
    let summaryText = '';
    
    // ОТЛАДКА: Логируем входные данные
    console.log('🔍 DEBUG generateSummarySeats:');
    console.log('  Winners:', winners);
    console.log('  Players:', Array.from(this.players.values()).map(p => ({id: p.id, name: p.name, position: p.position})));
    console.log('  PlayerNicknames:', this.playerNicknames);
    
    // Получаем префлоп спот для извлечения информации о местах
    let preflopSpot = '';
    if (this.settings?.preflopFile) {
      try {
        const preflopPath = path.join(__dirname, 'preflopspots', this.settings.preflopFile);
        if (fs.existsSync(preflopPath)) {
          preflopSpot = fs.readFileSync(preflopPath, 'utf8');
        }
      } catch (error) {
        console.error('❌ Ошибка чтения префлоп файла:', error);
      }
    }
    
    if (!preflopSpot && this.settings?.preflopSpot) {
      preflopSpot = this.settings.preflopSpot;
    }
    
    if (!preflopSpot) {
      // Если нет префлоп спота, генерируем простую информацию о победителях
      console.log('⚠️ DEBUG: Нет префлоп спота, используем простую генерацию');
      winners.forEach(winner => {
        summaryText += `Seat ${winner.seat}: ${winner.name || 'Player'} won ($${winner.amount.toFixed(2)})\n`;
      });
      return summaryText;
    }
    
    // Извлекаем информацию о местах из префлоп спота
    const seatMatches = Array.from(preflopSpot.matchAll(/Seat (\d+): ([^(]+) \([^)]+\)/g));
    console.log('  Найденные места в префлопе:', seatMatches.map(m => `Seat ${m[1]}: ${m[2].trim()}`));
    
    let winnerCount = 0;
    const processedPlayerIds = new Set(); // ✅ ДЕДУПЛИКАЦИЯ: отслеживаем уже обработанных игроков
    
    seatMatches.forEach(match => {
      const seatNumber = match[1];
      const playerName = match[2].trim();
      
      console.log(`\n  🎯 Обрабатываем Seat ${seatNumber}: ${playerName}`);
      
      // Определяем позицию
      let position = '';
      if (preflopSpot.includes(`${playerName}: posts small blind`)) {
        position = ' (small blind)';
      } else if (preflopSpot.includes(`${playerName}: posts big blind`)) {
        position = ' (big blind)';
      } else if (preflopSpot.includes('is the button') && preflopSpot.includes(`Seat #${seatNumber} is the button`)) {
        position = ' (button)';
      }
      
      // Проверяем, участвует ли игрок в текущей раздаче
      console.log(`    🔍 Ищем игрока "${playerName}" среди активных:`);
      console.log(`    📋 Активные игроки:`, Array.from(this.players.values()).map(p => ({
        id: p.id, 
        name: p.name, 
        position: p.position,
        nickname: this.playerNicknames[p.position] || p.name
      })));
      
      const currentPlayer = Array.from(this.players.values()).find(p => {
        const playerNickname = this.playerNicknames[p.position] || p.name;
        console.log(`    🔍 Сравниваем: "${playerNickname}" === "${playerName}" (позиция: ${p.position})`);
        return playerNickname === playerName;
      });
      
      console.log(`    🎯 Результат поиска игрока "${playerName}":`, currentPlayer ? 'НАЙДЕН' : 'НЕ НАЙДЕН');
      
      if (currentPlayer) {
        console.log(`    ✅ Найден активный игрок: ${currentPlayer.name} (ID: ${currentPlayer.id})`);
        
        // ✅ ИСПРАВЛЕНИЕ ДЕДУПЛИКАЦИИ: используем позицию вместо ID (т.к. ID может быть undefined)
        const playerId = currentPlayer.id || currentPlayer.position || playerName;
        if (processedPlayerIds.has(playerId)) {
          console.log(`    ⚠️ ДЕДУПЛИКАЦИЯ: Игрок ${playerId} (${currentPlayer.position}) уже обработан, пропускаем`);
          return; // Пропускаем дублированного игрока
        }
        
        // Добавляем игрока в обработанные
        processedPlayerIds.add(playerId);
        
        // Это один из реальных игроков, участвующих в раздаче
        // ✅ ИСПРАВЛЕНИЕ: Ищем победителя по позиции, а не по ID (т.к. ID может быть undefined или не совпадать)
        const winner = winners.find(w => w.position === currentPlayer.position);
        console.log(`    Поиск победителя для позиции "${currentPlayer.position}":`, winner ? 'НАЙДЕН' : 'НЕ НАЙДЕН');
        
        if (winner) {
          winnerCount++;
          console.log(`    🏆 ПОБЕДИТЕЛЬ #${winnerCount}! Добавляем в SUMMARY`);
          
          // ✅ ИСПРАВЛЕНИЕ: Показываем карты только при шоудауне
          if (this.currentHandData.isShowdown && currentPlayer.cards && currentPlayer.cards.length > 0) {
            const cardsDisplay = currentPlayer.cards.map(c => this.formatCard(c)).join(' ');
            summaryText += `Seat ${seatNumber}: ${playerName}${position} showed [${cardsDisplay}] and won ($${winner.amount.toFixed(2)})\n`;
          } else {
            // При фолде не показываем карты, просто "won"
            summaryText += `Seat ${seatNumber}: ${playerName}${position} won ($${winner.amount.toFixed(2)})\n`;
          }
        } else if (currentPlayer.isFolded) {
          console.log(`    ❌ Игрок сфолдил`);
          // Игрок сфолдил во время постфлоп игры
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded\n`;
        } else {
          console.log(`    📤 Игрок дошел до конца но проиграл`);
          // ✅ ИСПРАВЛЕНИЕ: Показываем карты проигравших только при шоудауне
          if (this.currentHandData.isShowdown && currentPlayer.cards && currentPlayer.cards.length > 0) {
            const cardsDisplay = currentPlayer.cards.map(c => this.formatCard(c)).join(' ');
            summaryText += `Seat ${seatNumber}: ${playerName}${position} showed [${cardsDisplay}]\n`;
          } else {
            // При отсутствии шоудауна не показываем карты
            summaryText += `Seat ${seatNumber}: ${playerName}${position} mucked hand\n`;
          }
        }
      } else {
        console.log(`    ❌ Игрок не найден в активных игроках`);
        
        // ✅ ИСПРАВЛЕНИЕ: Проверяем действия в Hand History для этого игрока
        console.log(`    🔍 РЕЗЕРВНАЯ ЛОГИКА: Ищем действия для "${playerName}"`);
        console.log(`    📊 currentHandData:`, this.currentHandData ? 'есть' : 'нет');
        console.log(`    📊 actions:`, this.currentHandData?.actions?.length || 0);
        
        const playerActions = this.currentHandData?.actions?.filter(a => {
          // Ищем действия по имени игрока из префлопа
          const actionPlayerName = Object.keys(this.playerNicknames).find(pos => 
            this.playerNicknames[pos] === playerName
          );
          console.log(`    🔍 Проверяем действие:`, a, `ищем позицию для "${playerName}":`, actionPlayerName);
          return a.playerId && this.players.get(a.playerId)?.position === actionPlayerName;
        }) || [];
        
        console.log(`    ✅ Найдено действий в Hand History для ${playerName}:`, playerActions.length, playerActions);
        
        // Проверяем есть ли постфлоп действия
        const postflopActions = playerActions.filter(a => ['flop', 'turn', 'river'].includes(a.street));
        
        if (postflopActions.length > 0) {
          console.log(`    ✅ Игрок участвовал в постфлопе - добавляем в SUMMARY`);
          
          // Игрок участвовал в постфлопе, но не найден в this.players
          // Проверяем последнее действие
          const lastAction = postflopActions[postflopActions.length - 1];
          if (lastAction && lastAction.action === 'fold') {
            const foldStreet = lastAction.street.charAt(0).toUpperCase() + lastAction.street.slice(1);
            summaryText += `Seat ${seatNumber}: ${playerName}${position} folded on the ${foldStreet}\n`;
          } else {
            // Игрок дошел до конца - показать как проигравшего
            summaryText += `Seat ${seatNumber}: ${playerName}${position} mucked hand\n`;
          }
        } else {
          // Это игрок из префлоп спота, который не участвует в постфлоп игре
          if (preflopSpot.includes(`${playerName}: folds`) && !preflopSpot.includes(`${playerName}: posts`)) {
            summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop (didn't bet)\n`;
          } else if (preflopSpot.includes(`${playerName}: folds`)) {
            summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop\n`;
          } else {
            // Игрок не фолдил в префлопе, но не участвует в раздаче (возможно ошибка)
            summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop\n`;
          }
        }
      }
    });
    
    console.log(`  📊 ИТОГО: Найдено ${winnerCount} победителей в SUMMARY`);
    console.log(`  🔄 Обработано уникальных игроков: ${processedPlayerIds.size}`);
    if (winnerCount > 1) {
      console.log('  ❌ ПРОБЛЕМА: Несколько победителей обнаружено!');
    }
    
    return summaryText;
  }

  extractPreflopFromSource() {
    let preflopSpot = '';
    
    // Читаем содержимое файла, если указан
    if (this.settings?.preflopFile) {
      try {
        const preflopPath = path.join(__dirname, 'preflopspots', this.settings.preflopFile);
        if (fs.existsSync(preflopPath)) {
          preflopSpot = fs.readFileSync(preflopPath, 'utf8');
        }
      } catch (error) {
        console.error('❌ Ошибка чтения префлоп файла:', error);
      }
    }
    
    // Если нет файла, используем preflopSpot как строку
    if (!preflopSpot && this.settings?.preflopSpot) {
      preflopSpot = this.settings.preflopSpot;
    }
    
    if (!preflopSpot) {
      return null;
    }
    
    // Удаляем заголовок с описанием пресета (строки типа "BB vs BTN Call (RFI_IP_BTN IP, CC_BB_OOP_vs_BTN OOP)")
    let lines = preflopSpot.split('\n');
    let startIndex = 0;
    
    // Ищем первую строку начинающуюся с "PokerStars Hand"
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('PokerStars Hand')) {
        startIndex = i;
        break;
      }
    }
    
    // Извлекаем префлоп часть без заголовка
    const preflopLines = lines.slice(startIndex);
    let endIndex = preflopLines.length;
    
    // Найдем где заканчивается префлоп (до флопа, терна, ривера или summary)
    const postflopMarkers = ['*** FLOP ***', '*** TURN ***', '*** RIVER ***', '*** SHOW DOWN ***', '*** SUMMARY ***'];
    for (let i = 0; i < preflopLines.length; i++) {
      const line = preflopLines[i].trim();
      if (postflopMarkers.some(marker => line.startsWith(marker))) {
        endIndex = i;
        break;
      }
    }
    
    const extractedPreflop = preflopLines.slice(0, endIndex).join('\n');
    console.log(`📝 Извлечен префлоп (${endIndex} строк из ${preflopLines.length})`);
    
    return extractedPreflop;
  }

  saveHandToFile(handText) {
    if (this.handHistoryFile && handText) {
      fs.appendFileSync(this.handHistoryFile, handText);
    }
  }
}

// Socket.IO middleware для аутентификации
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.log(`🔓 Неаутентифицированное подключение: ${socket.id}`);
      socket.userId = null;
      socket.userEmail = null;
      socket.isAuthenticated = false;
      return next();
    }

    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await database.get('SELECT * FROM Users WHERE user_id = ?', [decoded.userId]);
    
    if (!user) {
      console.log(`❌ Пользователь не найден для токена: ${socket.id}`);
      socket.userId = null;
      socket.userEmail = null;
      socket.isAuthenticated = false;
      return next();
    }

    // Получаем роли пользователя
    const userRoles = await database.all(`
      SELECT r.role_name 
      FROM UserRoles ur 
      JOIN Roles r ON ur.role_id = r.role_id 
      WHERE ur.user_id = ?
    `, [user.user_id]);

    socket.userId = user.user_id;
    socket.userEmail = user.email;
    socket.userRoles = userRoles.map(r => r.role_name);
    socket.isAuthenticated = true;
    
    console.log(`🔐 Аутентифицированное подключение: ${socket.id} (${user.email})`);
    next();
  } catch (error) {
    console.error('❌ Ошибка аутентификации WebSocket:', error);
    socket.userId = null;
    socket.userEmail = null;
    socket.isAuthenticated = false;
    next();
  }
});

// Socket.IO логика
io.on('connection', (socket) => {
  console.log(`Новое подключение: ${socket.id} ${socket.isAuthenticated ? `(${socket.userEmail})` : '(неаутентифицирован)'}`);

  // Создание сессии
  socket.on('create-session', async (data) => {
    const sessionId = uuidv4().substring(0, 8).toUpperCase();
    const userId = socket.isAuthenticated ? socket.userId : (data.userId || uuidv4());
    
    // Если preflopSpot пустой, загружаем пример
    if (!data.settings.preflopSpot || data.settings.preflopSpot.trim() === '') {
      try {
        const exampleFile = path.join(__dirname, 'example_handhistory_pokerstars.txt');
        if (fs.existsSync(exampleFile)) {
          data.settings.preflopSpot = fs.readFileSync(exampleFile, 'utf8');
        }
      } catch (error) {
        // ignore
      }
    }
    
    const session = new PokerSession(sessionId, userId, data.settings);
    session.addPlayer(userId, {
      name: data.playerName || (socket.isAuthenticated ? socket.userEmail.split('@')[0] : 'Player 1'),
      socketId: socket.id
    });

    // Создаем запись в базе данных для аутентифицированных пользователей
    if (socket.isAuthenticated) {
      try {
        await database.createUserSession(socket.userId, sessionId);
        console.log(`📝 Сессия ${sessionId} записана в БД для пользователя ${socket.userEmail}`);
      } catch (error) {
        console.error('❌ Ошибка записи сессии в БД:', error);
      }
    }

    activeSessions.set(sessionId, session);
    activeUsers.set(socket.id, { userId, sessionId });
    
    socket.join(sessionId);
    
    socket.emit('session-created', {
      sessionId,
      userId,
      sessionInfo: session.getSessionInfo(userId)
    });
    
    console.log(`Сессия ${sessionId} создана ${socket.isAuthenticated ? `пользователем ${socket.userEmail}` : 'анонимно'}, ожидание второго игрока...`);
  });

  // Присоединение к сессии
  socket.on('join-session', (data) => {
    const { sessionId, playerName } = data;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      socket.emit('error', { message: 'Сессия не найдена' });
      return;
    }
    
    if (session.players.size >= 2) {
      socket.emit('error', { message: 'Сессия полная' });
      return;
    }
    
    const userId = uuidv4();
    session.addPlayer(userId, {
      name: playerName || 'Player 2',
      socketId: socket.id
    });
    
    activeUsers.set(socket.id, { userId, sessionId });
    socket.join(sessionId);
    
    io.to(sessionId).emit('player-joined', {
      userId,
      playerName,
      sessionInfo: session.getSessionInfo()
    });
    
    socket.emit('session-joined', {
      sessionId,
      userId,
      sessionInfo: session.getSessionInfo(userId)
    });

    // Автоматически начать игру если есть 2 игрока
    if (session.players.size >= 2) {
      console.log(`Автоматический старт игры в сессии ${sessionId} - достаточно игроков`);
      if (session.startSession()) {
        session.players.forEach((player, playerId) => {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            playerSocket.emit('game-started', {
              sessionInfo: session.getSessionInfo(playerId)
            });
          }
        });
        console.log(`Игра автоматически началась в сессии ${sessionId}`);
      }
    }
  });

  // Начать игру
  socket.on('start-game', () => {
    const userData = activeUsers.get(socket.id);
    if (!userData) return;
    
    const session = activeSessions.get(userData.sessionId);
    if (!session || session.creatorId !== userData.userId) {
      socket.emit('error', { message: 'Недостаточно прав для начала игры' });
      return;
    }
    
    if (session.startSession()) {
      session.players.forEach((player, playerId) => {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('game-started', {
            sessionInfo: session.getSessionInfo(playerId)
          });
        }
      });
      console.log(`Игра началась в сессии ${userData.sessionId}`);
    } else {
      socket.emit('error', { message: 'Недостаточно игроков для начала игры' });
    }
  });

  // Обработка действий игрока
  socket.on('player-action', (data) => {
    const userData = activeUsers.get(socket.id);
    if (!userData) return;
    
    const session = activeSessions.get(userData.sessionId);
    if (!session) return;
    
    const { tableId, action, amount } = data;
    const table = session.tables.find(t => t.tableId === tableId);
    if (!table) {
      socket.emit('action-error', { message: `Стол ${tableId} не найден` });
      return;
    }
    
    if (!table.players.has(userData.userId)) {
      socket.emit('action-error', { message: 'Вы не находитесь за этим столом' });
      return;
    }
    
    try {
      const result = table.processPlayerAction(userData.userId, action, amount);
      
      if (result.success) {
        console.log(`📤 Отправка обновлений стола ${tableId} всем игрокам`);
        session.players.forEach((player, playerId) => {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            const tableInfo = table.getTableInfo(playerId);
            console.log(`📤 Отправка table-updated игроку ${playerId} (${player.name}):`, {
              tableId,
              currentPlayer: tableInfo.currentPlayer,
              currentBet: `$${((tableInfo.currentBet || 0) / 100).toFixed(2)}`,
              players: tableInfo.players.map(p => ({ 
                id: p.id, 
                name: p.name, 
                bet: `$${((p.bet || 0) / 100).toFixed(2)}`, 
                hasActed: p.hasActed 
              }))
            });
            
            // Отправляем action-processed для записи действий
            const actionData = {
              playerId: userData.userId,
              playerName: userData.name,
              action: action,
              amount: amount,
              timestamp: formatGameDateTime()
            };
            
            console.log(`📤 Отправка action-processed игроку ${playerId} (${player.name}):`, {
              tableId: tableId,
              action: actionData
            });
            
            playerSocket.emit('action-processed', {
              tableId: tableId,
              action: actionData,
              tableInfo: tableInfo
            });
            
            // Отправляем table-updated для обновления интерфейса
            playerSocket.emit('table-updated', {
              tableId: tableId,
              tableInfo: tableInfo
            });
          }
        });
      } else {
        socket.emit('action-error', { message: result.error });
      }
    } catch (error) {
      console.error(`❌ Ошибка при обработке действия:`, error);
      socket.emit('action-error', { message: 'Ошибка сервера при обработке действия' });
    }
  });

  // Обновление настроек сессии
  socket.on('update-settings', (data) => {
    console.log('🔧 Обновление настроек сессии:', data);
    
    const userData = activeUsers.get(socket.id);
    if (!userData) {
      console.error('❌ Пользователь не найден для update-settings');
      return;
    }
    
    const session = activeSessions.get(userData.sessionId);
    if (!session) {
      console.error('❌ Сессия не найдена для update-settings');
      return;
    }
    
    // Обновляем настройки сессии
    session.settings = { ...session.settings, ...data.settings };
    
    // Обновляем настройки всех столов
    session.tables.forEach(table => {
      table.settings = { ...table.settings, ...data.settings };
      // Перепарсим ники игроков если изменился префлоп файл
      if (data.settings.preflopSpot || data.settings.preflopFile) {
        table.playerNicknames = table.parsePlayerNicknames();
      }
    });
    
    console.log('✅ Настройки сессии обновлены');
    console.log('🎯 Новые позиции:', session.settings.playerRanges?.positions);
  });

  // Новая раздача
  socket.on('new-hand', (data) => {
    console.log('🔄 Запрос новой раздачи:', data);
    
    const userData = activeUsers.get(socket.id);
    if (!userData) {
      console.error('❌ Пользователь не найден для new-hand');
      return;
    }
    
    const session = activeSessions.get(userData.sessionId);
    if (!session) {
      console.error('❌ Сессия не найдена для new-hand');
      return;
    }
    
    const table = session.tables.find(t => t.tableId === data.tableId);
    if (!table) {
      console.error('❌ Стол не найден для new-hand:', data.tableId);
      socket.emit('error', { message: `Стол ${data.tableId} не найден` });
      return;
    }
    
    // Начать новую раздачу
    const success = table.startNewHand();
    
    if (success) {
      console.log(`✅ Новая раздача начата на столе ${table.tableId}`);
      
      // Отправить обновление всем игрокам за столом
      session.players.forEach((player, playerId) => {
        if (table.players.has(playerId)) {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            playerSocket.emit('new-hand-started', {
              tableId: table.tableId,
              handNumber: table.handNumber,
              tableInfo: table.getTableInfo(playerId)
            });
          }
        }
      });
    } else {
      console.log(`❌ Не удалось начать новую раздачу на столе ${table.tableId}`);
      socket.emit('error', { message: 'Не удалось начать новую раздачу' });
    }
  });

  socket.on('disconnect', async () => {
    console.log(`Отключение: ${socket.id} ${socket.isAuthenticated ? `(${socket.userEmail})` : '(неаутентифицирован)'}`);
    
    const userData = activeUsers.get(socket.id);
    if (userData) {
      const session = activeSessions.get(userData.sessionId);
      if (session) {
        session.players.delete(userData.userId);
        
        // Если создатель отключился или сессия пуста, удаляем сессию
        if (userData.userId === session.creatorId || session.players.size === 0) {
          // Завершаем сессию в базе данных для аутентифицированных пользователей
          if (socket.isAuthenticated) {
            try {
              const handsPlayed = session.handHistories.get(1)?.hands.length || 0;
              await database.endUserSession(userData.sessionId, handsPlayed);
              console.log(`📝 Сессия ${userData.sessionId} завершена в БД для пользователя ${socket.userEmail}`);
            } catch (error) {
              console.error('❌ Ошибка завершения сессии в БД:', error);
            }
          }
          
          activeSessions.delete(userData.sessionId);
          console.log(`Сессия ${userData.sessionId} удалена`);
        } else {
          // Уведомляем оставшихся игроков
          io.to(userData.sessionId).emit('player-left', {
            userId: userData.userId,
            sessionInfo: session.getSessionInfo()
          });
        }
      }
      
      activeUsers.delete(socket.id);
    }
  });
});

// Запуск сервера
async function startServer() {
  try {
    await initializeDatabase();
    
      server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Сервер с аутентификацией запущен на порту', PORT);
    
    if (process.env.RAILWAY_STATIC_URL) {
      console.log('🌐 Railway URL:', process.env.RAILWAY_STATIC_URL);
      console.log('🔐 API аутентификации:', process.env.RAILWAY_STATIC_URL + '/api/auth');
      console.log('🎨 Интегрированный интерфейс:', process.env.RAILWAY_STATIC_URL);
    } else {
      console.log('🌐 Локальный адрес: http://localhost:' + PORT);
      console.log('🔐 API аутентификации: http://localhost:' + PORT + '/api/auth');
      console.log('🎨 Интегрированный интерфейс: http://localhost:' + PORT);
      console.log('📊 Для тестирования запустите: node test-auth-api.js');
    }
  });
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  try {
    await database.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при завершении:', error);
    process.exit(1);
  }
});

// API endpoint для скачивания Hand History
app.get('/api/download-hand-history/:sessionId', authenticateToken, (req, res) => {
  try {
    const { sessionId } = req.params;
    const handHistoryDir = path.join(__dirname, 'hand_histories');
    
    // Ищем файл по sessionId
    const files = fs.readdirSync(handHistoryDir).filter(file => 
      file.includes(`session_${sessionId}`) && file.endsWith('.txt')
    );
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'Hand History не найден' });
    }
    
    const filePath = path.join(handHistoryDir, files[0]);
    const fileName = `hand_history_session_${sessionId}.txt`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/plain');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading hand history:', error);
    res.status(500).json({ error: 'Ошибка скачивания файла' });
  }
});

// Endpoint для получения списка доступных Hand History файлов
app.get('/api/hand-histories', authenticateToken, (req, res) => {
  try {
    const handHistoryDir = path.join(__dirname, 'hand_histories');
    
    if (!fs.existsSync(handHistoryDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(handHistoryDir)
      .filter(file => file.endsWith('.txt'))
      .map(file => {
        const stats = fs.statSync(path.join(handHistoryDir, file));
        const sessionMatch = file.match(/session_(\d+)/);
        return {
          filename: file,
          sessionId: sessionMatch ? sessionMatch[1] : null,
          size: stats.size,
          modified: stats.mtime
        };
      });
    
    res.json(files);
  } catch (error) {
    console.error('Error listing hand histories:', error);
    res.status(500).json({ error: 'Ошибка получения списка файлов' });
  }
});

// 📁 Новые API роуты для управления HandHistory файлами с аутентификацией

// Получить список HandHistory файлов (пользователи видят только свои, админы - все)
app.get('/api/handhistory', authenticateToken, async (req, res) => {
  try {
    const handHistoryDir = path.join(__dirname, 'hand_histories');
    
    if (!fs.existsSync(handHistoryDir)) {
      return res.json({ files: [] });
    }
    
    const isAdmin = req.user.roles.includes('admin');
    
    // Получаем список всех файлов
    let files = fs.readdirSync(handHistoryDir)
      .filter(file => file.endsWith('.txt'))
      .map(file => {
        const filePath = path.join(handHistoryDir, file);
        const stats = fs.statSync(filePath);
        
        // Парсинг информации из имени файла
        const fileInfo = file.match(/table_(\d+)_session_([A-F0-9]+)\.txt/);
        
        return {
          filename: file,
          sessionId: fileInfo ? fileInfo[2] : 'Unknown',
          tableId: fileInfo ? parseInt(fileInfo[1]) : 0,
          handsCount: 0, // Подсчитаем позже если нужно
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          downloadUrl: `/api/handhistory/download/${file}`,
          userId: null // Будем определять по сессии из базы данных
        };
      })
      .sort((a, b) => b.modified - a.modified);

    // Если пользователь не админ, фильтруем только его файлы
    if (!isAdmin) {
      // Получаем все сессии пользователя из базы данных
      const userSessions = await database.getUserSessions(req.user.user_id);
      const userSessionIds = userSessions.map(session => session.session_id);
      
      // Если у пользователя есть записанные сессии, фильтруем по ним
      if (userSessionIds.length > 0) {
        files = files.filter(file => userSessionIds.includes(file.sessionId));
        console.log(`👤 Пользователь ${req.user.email} запросил свои HandHistory файлы: найдено ${files.length} файлов из ${userSessionIds.length} сессий`);
      } else {
        // Если у пользователя нет записанных сессий (старые файлы), показываем пустой список
        // но предлагаем сыграть новые раздачи
        files = [];
        console.log(`👤 Пользователь ${req.user.email} не имеет записанных сессий. Нужно сыграть новые раздачи.`);
      }
    } else {
      console.log(`👑 Администратор ${req.user.email} запросил все HandHistory файлы: найдено ${files.length} файлов`);
    }
    
    // Подсчитываем количество рук в каждом файле (для первых 10 файлов для производительности)
    const filesToCount = files.slice(0, 10);
    for (const file of filesToCount) {
      try {
        const content = fs.readFileSync(path.join(handHistoryDir, file.filename), 'utf8');
        const handCount = (content.match(/PokerStars Hand #/g) || []).length;
        file.handsCount = handCount;
      } catch (error) {
        file.handsCount = 0;
      }
    }
    
    res.json({ 
      files,
      isAdmin,
      totalFiles: files.length,
      userEmail: req.user.email
    });
    
  } catch (error) {
    console.error('❌ Ошибка получения списка HandHistory файлов:', error);
    res.status(500).json({ error: 'Ошибка получения списка файлов HandHistory' });
  }
});

// Скачать конкретный HandHistory файл
app.get('/api/handhistory/download/:filename', authenticateToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const isAdmin = req.user.roles.includes('admin');
    
    // Проверка безопасности - только .txt файлы
    if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Недопустимое имя файла' });
    }
    
    const filePath = path.join(__dirname, 'hand_histories', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    // Если пользователь не админ, можно добавить проверку доступа к файлу
    if (!isAdmin) {
      // Здесь можно добавить логику проверки принадлежности файла пользователю
      console.log(`👤 Пользователь ${req.user.email} скачивает файл: ${filename}`);
    } else {
      console.log(`👑 Администратор ${req.user.email} скачивает файл: ${filename}`);
    }
    
    const stats = fs.statSync(filePath);
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', stats.size);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log(`📥 Файл ${filename} скачан пользователем ${req.user.email}`);
    
  } catch (error) {
    console.error('❌ Ошибка скачивания HandHistory файла:', error);
    res.status(500).json({ error: 'Ошибка скачивания файла' });
  }
});

// Просмотр содержимого HandHistory файла
app.get('/api/handhistory/view/:filename', authenticateToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const isAdmin = req.user.roles.includes('admin');
    
    // Проверка безопасности - только .txt файлы
    if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Недопустимое имя файла' });
    }
    
    const filePath = path.join(__dirname, 'hand_histories', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    // Если пользователь не админ, можно добавить проверку доступа к файлу
    if (!isAdmin) {
      console.log(`👤 Пользователь ${req.user.email} просматривает файл: ${filename}`);
    } else {
      console.log(`👑 Администратор ${req.user.email} просматривает файл: ${filename}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
    
  } catch (error) {
    console.error('❌ Ошибка просмотра HandHistory файла:', error);
    res.status(500).json({ error: 'Ошибка чтения файла' });
  }
});

// Удаление HandHistory файла (только для администраторов)
app.delete('/api/handhistory/:filename', authenticateToken, requireAdmin, (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Проверка безопасности - только .txt файлы
    if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Недопустимое имя файла' });
    }
    
    const filePath = path.join(__dirname, 'hand_histories', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    fs.unlinkSync(filePath);
    
    console.log(`🗑️ Администратор ${req.user.email} удалил файл: ${filename}`);
    
    res.json({ 
      success: true, 
      message: 'Файл успешно удален',
      filename 
    });
    
  } catch (error) {
    console.error('❌ Ошибка удаления HandHistory файла:', error);
    res.status(500).json({ error: 'Ошибка удаления файла' });
  }
});

// Получить статистику HandHistory файлов
app.get('/api/handhistory/stats', authenticateToken, (req, res) => {
  try {
    const handHistoryDir = path.join(__dirname, 'hand_histories');
    const isAdmin = req.user.roles.includes('admin');
    
    if (!fs.existsSync(handHistoryDir)) {
      return res.json({
        totalFiles: 0,
        totalSize: 0,
        totalHands: 0,
        uniqueSessions: 0,
        isAdmin
      });
    }
    
    const files = fs.readdirSync(handHistoryDir)
      .filter(file => file.endsWith('.txt'));
    
    let totalSize = 0;
    let totalHands = 0;
    const sessions = new Set();
    
    files.forEach(file => {
      const filePath = path.join(handHistoryDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
      
      // Извлекаем session ID из имени файла
      const sessionMatch = file.match(/session_([A-F0-9]+)/);
      if (sessionMatch) {
        sessions.add(sessionMatch[1]);
      }
      
      // Подсчитываем руки (только для первых 20 файлов для производительности)
      if (files.indexOf(file) < 20) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const handCount = (content.match(/PokerStars Hand #/g) || []).length;
          totalHands += handCount;
        } catch (error) {
          // Игнорируем ошибки чтения отдельных файлов
        }
      }
    });
    
    res.json({
      totalFiles: files.length,
      totalSize,
      totalHands,
      uniqueSessions: sessions.size,
      isAdmin,
      userEmail: req.user.email
    });
    
  } catch (error) {
    console.error('❌ Ошибка получения статистики HandHistory:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Роут для страницы управления HandHistory (с аутентификацией)
app.get('/handhistory-manager.html', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'handhistory-manager-auth.html'));
});

startServer();