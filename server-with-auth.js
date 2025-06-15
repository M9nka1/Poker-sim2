const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Импорт компонентов аутентификации
const database = require('./database/database');
const authRoutes = require('./routes/auth');
const { authenticateToken, requireAdmin, checkHandLimit } = require('./middleware/auth');

const app = express();
const server = createServer(app);
const io = new Server(server, {
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
      exported_at: new Date().toISOString(),
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
  
  if (availableCards1.length === 0 || availableCards2.length === 0) {
    return null;
  }
  
  let card1, card2;
  
  if (rank1 === rank2) {
    if (availableCards1.length < 2) return null;
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
    
    if (remainingCards2.length === 0) return null;
    
    if (suited) {
      const suitedCards = remainingCards2.filter(card => card.suit === card1.suit);
      if (suitedCards.length === 0) return null;
      card2 = suitedCards[Math.floor(Math.random() * suitedCards.length)];
    } else {
      const unsuitedCards = remainingCards2.filter(card => card.suit !== card1.suit);
      if (unsuitedCards.length === 0) return null;
      card2 = unsuitedCards[Math.floor(Math.random() * unsuitedCards.length)];
    }
  }
  
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
    this.pot = 0;
    this.currentBet = 0; // Текущая ставка для уравнивания
    this.currentStreet = 'waiting'; // ожидание начала раздачи
    this.handNumber = 0;
    this.handHistories = [];
    this.currentPlayerIndex = 0; // Индекс игрока, который должен действовать
    this.lastRaiseAmount = 0; // Размер последнего рейза
    this.streetBets = {}; // Ставки по улицам
  }
  
  addPlayer(playerId, playerData) {
    // Определить позицию на основе количества игроков за столом
    const playerCount = this.players.size;
    let position = 'BTN'; // по умолчанию
    
    if (playerCount === 0) {
      // Первый игрок - SB (для хедс-ап)
      position = 'SB';
    } else if (playerCount === 1) {
      // Второй игрок - BTN (для хедс-ап)
      position = 'BTN';
    }
    
    this.players.set(playerId, {
      ...playerData,
      position: position,
      cards: [],
      stack: 100000, // 1000 долларов в центах
      bet: 0,
      hasActed: false,
      isAllIn: false,
      isFolded: false
    });
    
    console.log(`👤 Игрок ${playerData.name} добавлен на стол ${this.tableId} с позицией ${position}`);
  }
  
  startNewHand() {
    this.handNumber++;
    this.deck = shuffleDeck(createDeck());
    
    // Парсинг hand history для инициализации банка и стеков
    const handHistoryInfo = this.parseHandHistory();
    this.pot = handHistoryInfo.initialPot * 100; // конвертируем в центы
    
    console.log(`💰 Стол ${this.tableId}: начальный банк $${handHistoryInfo.initialPot} (${this.pot} центов)`);
    
    // Генерируем флоп карты на основе настроек и сразу показываем их
    this.board = this.generateBoard();
    this.currentStreet = 'flop'; // начинаем с флопа (симулятор пропускает префлоп)
    
    // Сброс состояния игроков и раздача карт
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
      
      console.log(`🃏 Игрок ${player.name}: префлоп инвестиция $${preflopInvestment}, итоговый стек $${correctedStack}, карты: ${player.cards ? player.cards.map(c => c.rank + c.suit).join('') : 'не определены'}`);
    });
    
    // Инициализируем торги на флопе
    this.currentBet = 0; // Нет активных ставок на флопе
    this.currentPlayerIndex = 0; // Первый игрок начинает
    this.lastRaiseAmount = 0;
    
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
    const preflopSpot = this.settings.preflopSpot || '';
    
    // Ищем блайнды в заголовке
    const blindsMatch = preflopSpot.match(/\(\$([0-9.]+)\/\$([0-9.]+)\)/);
    const smallBlind = blindsMatch ? parseFloat(blindsMatch[1]) : 0.5;
    const bigBlind = blindsMatch ? parseFloat(blindsMatch[2]) : 1.0;
    
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
    
    return {
      bigBlind,
      smallBlind,
      initialPot,
      effectiveStack: 1000,
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
            return cards;
          }
        } catch (error) {
          console.log(`❌ Ошибка генерации карт для ${randomHand}:`, error.message);
        }
      }
    }
    
    const card1 = this.deck.pop();
    const card2 = this.deck.pop();
    return [card1, card2];
  }
  
  generateBoard() {
    const boardSettings = this.settings.boardSettings?.flop;
    
    if (boardSettings?.specificCards && boardSettings.specificCards.some(card => card)) {
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
      return board.slice(0, 3);
    }
    
    const flop = [
      this.deck.pop(),
      this.deck.pop(),
      this.deck.pop()
    ];
    
    return flop;
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
            bet: p.bet,
            hasActed: p.hasActed,
            folded: p.folded
          })),
          communityCards: tableInfo.communityCards,
          pot: tableInfo.pot,
          street: this.currentStreet,
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
        
        // Сброс флагов действий других игроков (только для полных рейзов)
        // Неполные рейзы не открывают торги заново
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
    
    if (activePlayers.length <= 1) return;
    
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % activePlayers.length;
    console.log(`🔄 Ход переходит к игроку: ${this.players.get(activePlayers[this.currentPlayerIndex]).name}`);
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
      this.players.forEach(player => {
        if (player.bet > 0) {
          this.pot += player.bet;
          console.log(`💰 Ставка игрока ${player.name} $${(player.bet / 100).toFixed(2)} добавлена в банк`);
          player.bet = 0;
        }
      });
      console.log(`🏦 Общий банк: $${(this.pot / 100).toFixed(2)}`);
      
      // Завершаем раздачу немедленно
      this.completeHand();
      return;
    }
    
    // Добавляем ставки игроков в банк
    this.players.forEach(player => {
      if (player.bet > 0) {
        this.pot += player.bet;
        console.log(`💰 Ставка игрока ${player.name} $${(player.bet / 100).toFixed(2)} добавлена в банк`);
        player.bet = 0; // Сбрасываем ставку игрока
      }
    });
    
    console.log(`🏦 Общий банк: $${(this.pot / 100).toFixed(2)}`);
    
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
    this.currentPlayerIndex = 0;
    
    // Сброс флагов действий для новой улицы
    this.players.forEach(player => {
      if (!player.isFolded && !player.isAllIn) {
        player.hasActed = false;
      }
    });
    
    console.log(`🌟 Тёрн: ${this.board[3].rank}${this.board[3].suit}`);
    console.log('🎯 Торги на тёрне начались');
  }
  
  // Раздача ривера
  dealRiver() {
    this.board.push(this.deck.pop());
    this.currentStreet = 'river';
    this.currentBet = 0;
    this.currentPlayerIndex = 0;
    
    // Сброс флагов действий для новой улицы
    this.players.forEach(player => {
      if (!player.isFolded && !player.isAllIn) {
        player.hasActed = false;
      }
    });
    
    console.log(`🌟 Ривер: ${this.board[4].rank}${this.board[4].suit}`);
    console.log('🎯 Торги на ривере начались');
  }
  
  // Завершение раздачи
  completeHand() {
    console.log('🏆 Раздача завершена');
    
    const activePlayers = Array.from(this.players.values()).filter(p => !p.isFolded);
    
    if (activePlayers.length === 1) {
      // Победа фолдом
      const winner = activePlayers[0];
      winner.stack += this.pot;
      console.log(`🏆 ${winner.name} выиграл $${(this.pot / 100).toFixed(2)} (фолд)`);
    } else {
      // Упрощенное определение победителя (в реальной игре нужно сравнивать руки)
      const winner = activePlayers[0];
      winner.stack += this.pot;
      console.log(`🏆 ${winner.name} выиграл $${(this.pot / 100).toFixed(2)} (шоудаун)`);
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
          message: 'Раздача завершена'
        });
      }
    });
    
    // Автоматически начать новую раздачу через небольшую задержку
    setTimeout(() => {
      this.startNewHand();
      console.log(`🔄 Автоматически начата новая раздача на столе ${this.tableId}`);
    }, 2000); // 2 секунды задержки для отображения результатов
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
    
    // Показываем флоп сразу (симулятор начинает с флопа)
    const visibleBoard = this.board;
    
    return {
      tableId: this.tableId,
      handNumber: this.handNumber,
      pot: this.pot,
      board: visibleBoard,
      communityCards: visibleBoard,
      currentStreet: this.currentStreet,
      currentBet: this.currentBet,
      isHandActive: true,
      currentPlayer: currentPlayerId,
      actionRequired: activePlayers.length > 1,
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
}

// Socket.IO логика
io.on('connection', (socket) => {
  console.log(`Новое подключение: ${socket.id}`);

  // Создание сессии
  socket.on('create-session', (data) => {
    const sessionId = uuidv4().substring(0, 8).toUpperCase();
    const userId = data.userId || uuidv4();
    
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
      name: data.playerName || 'Player 1',
      socketId: socket.id
    });

    activeSessions.set(sessionId, session);
    activeUsers.set(socket.id, { userId, sessionId });
    
    socket.join(sessionId);
    
    socket.emit('session-created', {
      sessionId,
      userId,
      sessionInfo: session.getSessionInfo(userId)
    });
    
    console.log(`Сессия ${sessionId} создана, ожидание второго игрока...`);
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

  socket.on('disconnect', () => {
    console.log(`Отключение: ${socket.id}`);
    
    const userData = activeUsers.get(socket.id);
    if (userData) {
      const session = activeSessions.get(userData.sessionId);
      if (session) {
        session.players.delete(userData.userId);
        
        // Если создатель отключился или сессия пуста, удаляем сессию
        if (userData.userId === session.creatorId || session.players.size === 0) {
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
    
    server.listen(PORT, () => {
      console.log('🚀 Сервер с аутентификацией запущен на порту', PORT);
      console.log('🌐 Доступен по адресу: http://localhost:' + PORT);
      console.log('🔐 API аутентификации: http://localhost:' + PORT + '/api/auth');
      console.log('🎨 Интегрированный интерфейс: http://localhost:' + PORT);
      console.log('📊 Для тестирования запустите: node test-auth-api.js');
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

startServer();