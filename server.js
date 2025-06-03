const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Отключаем CSP для WebSocket соединений
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== ИГРОВЫЕ КОНСТАНТЫ =====
const CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_SYMBOLS = ['s', 'h', 'd', 'c'];

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ДИАПАЗОНАМИ РУК =====

// Парсинг руки из строки (например: "AKs", "QQ", "ATo")
function parseHandString(handStr) {
  if (handStr.length === 2) {
    // Пара (например: "AA", "KK")
    return {
      rank1: handStr[0],
      rank2: handStr[1],
      suited: null // Для пар suited не важен
    };
  } else if (handStr.length === 3) {
    // Две карты с suited/offsuit (например: "AKs", "ATo")
    return {
      rank1: handStr[0],
      rank2: handStr[1],
      suited: handStr[2] === 's'
    };
  }
  return null;
}

// Создание карты с правильными полями
function createCard(rank, suit) {
  const suitIndex = CARD_SUITS.indexOf(suit);
  return {
    rank,
    suit,
    symbol: SUIT_SYMBOLS[suitIndex] || 's',
    value: rank + (SUIT_SYMBOLS[suitIndex] || 's')
  };
}

// Генерация всех возможных карт для данной руки
function generateCardsForHand(handStr, deck) {
  const hand = parseHandString(handStr);
  if (!hand) return [];

  const possibleCards = [];
  
  if (hand.rank1 === hand.rank2) {
    // Пара - найти все комбинации этого ранга
    for (let i = 0; i < CARD_SUITS.length; i++) {
      for (let j = i + 1; j < CARD_SUITS.length; j++) {
        const card1 = createCard(hand.rank1, CARD_SUITS[i]);
        const card2 = createCard(hand.rank2, CARD_SUITS[j]);
        
        // Проверить что карты есть в колоде
        if (isCardInDeck(card1, deck) && isCardInDeck(card2, deck)) {
          possibleCards.push([card1, card2]);
        }
      }
    }
  } else {
    // Не пара
    for (let suit1 = 0; suit1 < CARD_SUITS.length; suit1++) {
      for (let suit2 = 0; suit2 < CARD_SUITS.length; suit2++) {
        // Проверить suited/offsuit ограничение
        const isSuited = suit1 === suit2;
        if (hand.suited !== null && hand.suited !== isSuited) {
          continue;
        }

        const card1 = createCard(hand.rank1, CARD_SUITS[suit1]);
        const card2 = createCard(hand.rank2, CARD_SUITS[suit2]);
        
        // Проверить что карты есть в колоде
        if (isCardInDeck(card1, deck) && isCardInDeck(card2, deck)) {
          possibleCards.push([card1, card2]);
        }
      }
    }
  }
  
  return possibleCards;
}

// Проверка есть ли карта в колоде
function isCardInDeck(card, deck) {
  return deck.some(deckCard => 
    deckCard.rank === card.rank && deckCard.suit === card.suit
  );
}

// Удаление карты из колоды
function removeCardFromDeck(card, deck) {
  const index = deck.findIndex(deckCard => 
    deckCard.rank === card.rank && deckCard.suit === card.suit
  );
  if (index !== -1) {
    deck.splice(index, 1);
  }
}

// Генерация карт игрока согласно диапазону рук с весами
function generatePlayerCards(handWeights, deck) {
  console.log('🎯 Генерация карт для диапазона:', handWeights);
  
  if (!handWeights || Object.keys(handWeights).length === 0) {
    // Если диапазон пустой, вернуть случайные карты
    console.log('⚠️ Пустой диапазон, выдаю случайные карты');
    const card1 = deck.pop();
    const card2 = deck.pop();
    return [card1, card2];
  }

  // Создать взвешенный список рук
  const weightedHands = [];
  Object.entries(handWeights).forEach(([handStr, weight]) => {
    // Добавить руку в список пропорционально её весу
    for (let i = 0; i < weight; i++) {
      weightedHands.push(handStr);
    }
  });

  console.log(`🎲 Создан взвешенный список из ${weightedHands.length} элементов`);

  if (weightedHands.length === 0) {
    console.log('⚠️ Взвешенный список пустой, выдаю случайные карты');
    const card1 = deck.pop();
    const card2 = deck.pop();
    return [card1, card2];
  }

  // Попытки найти подходящую руку
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    // Выбрать случайную руку из взвешенного списка
    const randomIndex = Math.floor(Math.random() * weightedHands.length);
    const selectedHand = weightedHands[randomIndex];
    
    console.log(`🎲 Попытка ${attempts + 1}: выбрана рука ${selectedHand}`);

    // Получить все возможные карты для этой руки
    const possibleCards = generateCardsForHand(selectedHand, deck);
    
    if (possibleCards.length > 0) {
      // Выбрать случайную комбинацию карт
      const randomCardIndex = Math.floor(Math.random() * possibleCards.length);
      const selectedCards = possibleCards[randomCardIndex];
      
      console.log(`✅ Выбрана рука: ${selectedCards[0].rank}${selectedCards[0].suit} ${selectedCards[1].rank}${selectedCards[1].suit} (${selectedHand})`);

      // Удалить выбранные карты из колоды
      removeCardFromDeck(selectedCards[0], deck);
      removeCardFromDeck(selectedCards[1], deck);

      return selectedCards;
    }
    
    attempts++;
  }

  // Если не удалось найти карты из диапазона, выдать случайные
  console.log('⚠️ Не удалось найти карты из диапазона, выдаю случайные');
  const card1 = deck.pop();
  const card2 = deck.pop();
  return [card1, card2];
}

// Генерация полной колоды
function createDeck() {
  const deck = [];
  CARD_RANKS.forEach(rank => {
    CARD_SUITS.forEach((suit, index) => {
      deck.push({
        rank,
        suit,
        symbol: SUIT_SYMBOLS[index],
        value: rank + SUIT_SYMBOLS[index]
      });
    });
  });
  return shuffleDeck(deck);
}

// Перемешивание колоды
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ===== СТРУКТУРЫ ДАННЫХ =====
const activeSessions = new Map();
const activeUsers = new Map();

class PokerSession {
  constructor(sessionId, creatorId, settings) {
    this.sessionId = sessionId;
    this.creatorId = creatorId;
    this.settings = settings;
    this.players = new Map();
    this.tables = [];
    this.handHistory = [];
    this.status = 'waiting'; // waiting, playing, finished
    this.currentHandNumber = 0;
    
    // Создаем столы согласно настройкам
    this.initializeTables();
  }

  initializeTables() {
    for (let i = 0; i < this.settings.tablesCount; i++) {
      this.tables.push(new PokerTable(i + 1, this.sessionId, this.settings));
    }
  }

  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
      id: playerId,
      name: playerData.name || `Player ${this.players.size + 1}`,
      socketId: playerData.socketId,
      isCreator: playerId === this.creatorId,
      ready: false,
      tableAssignment: null
    });

    // Автоматически назначить игроков на столы
    this.assignPlayerToTable(playerId);
  }

  assignPlayerToTable(playerId) {
    // Распределить игроков поровну по всем столам
    const playerIndex = this.players.size - 1; // Индекс текущего игрока (0 или 1)
    
    // Если это первый игрок (индекс 0), назначить на все столы как BTN
    // Если это второй игрок (индекс 1), назначить на все столы как BB
    this.tables.forEach((table, tableIndex) => {
      table.addPlayer(playerId, this.players.get(playerId));
      this.players.get(playerId).tableAssignment = table.tableId;
    });
    
    console.log(`Игрок ${playerId} назначен на все столы`);
  }

  startSession() {
    if (this.players.size >= 2) {
      this.status = 'playing';
      // Запустить игру на всех столах
      this.tables.forEach(table => {
        console.log(`🎮 Запуск игры на столе ${table.tableId}, игроков: ${table.players.size}`);
        table.startNewHand();
      });
      return true;
    }
    return false;
  }

  getSessionInfo(requestingPlayerId = null) {
    return {
      sessionId: this.sessionId,
      status: this.status,
      playersCount: this.players.size,
      tablesCount: this.tables.length,
      settings: this.settings,
      tables: this.tables.map(table => table.getTableInfo(requestingPlayerId))
    };
  }

  // 💾 Записать HandHistory всех столов в файлы
  writeAllHandHistories() {
    console.log(`💾 Запись HandHistory для сессии ${this.sessionId}...`);
    
    const results = [];
    
    this.tables.forEach(table => {
      const result = {
        tableId: table.tableId,
        handsCount: table.tableHandCount,
        fileName: table.getHandHistoryFileName(),
        success: false
      };
      
      if (table.tableHandCount > 0) {
        result.success = table.writeHandHistoryToFile();
        console.log(`📊 Стол ${table.tableId}: ${table.tableHandCount} раздач, файл: ${result.fileName}`);
      } else {
        console.log(`📊 Стол ${table.tableId}: 0 раздач, файл не создан`);
      }
      
      results.push(result);
    });
    
    const totalHands = results.reduce((sum, r) => sum + r.handsCount, 0);
    console.log(`💾 Всего записано ${totalHands} раздач в ${results.filter(r => r.success).length} файлов`);
    
    return results;
  }
}

class PokerTable {
  constructor(tableId, sessionId, settings) {
    this.tableId = tableId;
    this.sessionId = sessionId;
    this.settings = settings;
    this.players = new Map();
    this.deck = createDeck();
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.handNumber = 0;
    this.street = 'preflop'; // preflop, flop, turn, river
    this.actions = [];
    this.preflopSpot = settings.preflopSpot;
    
    // 📝 Накопительная HandHistory для всего стола
    this.completedHands = []; // Массив завершенных раздач
    this.tableHandCount = 0;  // Счетчик завершенных раздач на столе
    
    // Отслеживание ставок по улицам
    this.streetPots = {
      preflop: 0,  // Будет установлен из preflopSpot
      flop: 0,     // Ставки на флопе
      turn: 0,     // Ставки на терне  
      river: 0     // Ставки на ривере
    };
  }

  addPlayer(playerId, playerData) {
    // Определить позицию игрока из настроек
    const playerIndex = this.players.size;
    const playerNumber = playerIndex === 0 ? 'player1' : 'player2';
    
    // Попробовать получить позицию из настроек
    let position = 'BTN'; // По умолчанию
    if (this.settings.playerRanges && this.settings.playerRanges.positions) {
      position = this.settings.playerRanges.positions[playerNumber] || (playerIndex === 0 ? 'BTN' : 'BB');
    } else {
      // Если нет настроек позиций, использовать BTN/BB
      position = playerIndex === 0 ? 'BTN' : 'BB';
    }
    
    console.log(`🎯 Игрок ${playerId} (${playerNumber}) получил позицию: ${position}`);
    
    this.players.set(playerId, {
      id: playerId,
      name: playerData.name,
      stack: 10000, // $100.00 в центах
      position: position,
      cards: [],
      currentBet: 0,
      folded: false,
      acted: false
    });
  }

  startNewHand() {
    this.handNumber++;
    this.street = 'flop';
    this.actions = [];
    this.communityCards = [];
    this.deck = createDeck(); // Создать новую колоду
    
    console.log(`🎮 Начинаем новую раздачу #${this.handNumber} на столе ${this.tableId}`);
    console.log(`🔍 preflopSpot существует: ${!!this.preflopSpot}`);
    console.log(`🔍 preflopSpot длина: ${this.preflopSpot ? this.preflopSpot.length : 0}`);
    
    // Парсить информацию из preflopSpot ПЕРЕД сбросом состояния игроков
    const handHistoryInfo = this.parseHandHistoryInfo();
    
    console.log(`💰 Результат парсинга - банк: $${handHistoryInfo.initialPot}, стек: $${handHistoryInfo.effectiveStack}`);
    
    // Инициализировать банки по улицам
    this.streetPots = {
      preflop: handHistoryInfo.initialPot * 100, // Конвертировать в центы
      flop: 0,
      turn: 0,
      river: 0
    };
    
    // Установить банк только с префлопа
    this.pot = this.streetPots.preflop;
    this.currentBet = 0;
    
    console.log(`💰 Банк инициализирован только с префлопа: $${handHistoryInfo.initialPot} (${this.pot} центов)`);
    console.log(`📊 Банки по улицам:`, {
      preflop: `$${(this.streetPots.preflop / 100).toFixed(2)}`,
      flop: `$${(this.streetPots.flop / 100).toFixed(2)}`,
      turn: `$${(this.streetPots.turn / 100).toFixed(2)}`,
      river: `$${(this.streetPots.river / 100).toFixed(2)}`
    });
    
    // 🔧 ИСПРАВЛЕНИЕ: Всегда восстанавливать стеки игроков из hand history данных
    console.log(`🔄 Восстановление стеков игроков из исходного hand history...`);
    this.players.forEach((player, index) => {
      player.folded = false;
      player.currentBet = 0;
      player.acted = false; // Сбросить флаг действия
      player.cards = [];
      
      // Всегда устанавливать стек из handHistoryInfo.effectiveStack (исходных данных)
      const targetStack = handHistoryInfo.effectiveStack && handHistoryInfo.effectiveStack > 0 
        ? handHistoryInfo.effectiveStack 
        : 100.00; // Резервное значение $100
        
      const oldStack = player.stack;
      player.stack = Math.round(targetStack * 100); // Конвертировать в центы
      console.log(`💰 Стек игрока ${player.name} восстановлен с $${(oldStack / 100).toFixed(2)} на $${targetStack.toFixed(2)} (${player.stack} центов)`);
    });
    
    // Создать новую запись HandHistory
    this.createHandHistoryEntry();
    
    // Раздать карты игрокам и флоп
    this.dealPlayerCards();
    this.dealFlop();
    
    // Инициализировать торги на флопе
    this.initializeFlopBetting();
    
    console.log(`🎮 Раздача #${this.handNumber} завершена на столе ${this.tableId}`);
    console.log(`📊 Итоговое состояние: улица=${this.street}, банк=$${(this.pot / 100).toFixed(2)}, текущая ставка=$${(this.currentBet / 100).toFixed(2)}`);
  }

  // Инициализировать торги на флопе
  initializeFlopBetting() {
    console.log('🎯 Инициализация торгов на флопе');
    
    // Убедиться что все игроки готовы к торгам
    this.players.forEach(player => {
      player.acted = false;
      player.currentBet = 0;
    });
    
    this.currentBet = 0;
    
    // Отправить уведомление игрокам об обновлении стола
    this.notifyPlayersOfTableUpdate('Торги на флопе начались');
    
    console.log('✅ Торги на флопе инициализированы, ожидаются действия игроков');
  }

  // Уведомить игроков об обновлении стола
  notifyPlayersOfTableUpdate(message = '') {
    if (!this.sessionId) return;
    
    const session = activeSessions.get(this.sessionId);
    if (!session) return;

    console.log(`📡 Уведомление игроков о обновлении стола ${this.tableId}: ${message}`);

    session.players.forEach((player, playerId) => {
      if (this.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('table-updated', {
            tableId: this.tableId,
            message: message,
            tableInfo: this.getTableInfo(playerId)
          });
        }
      }
    });
  }

  dealPlayerCards() {
    console.log('🎴 Начинаю раздачу карт игрокам...');
    console.log('🎯 Настройки диапазонов рук:', this.settings.playerRanges);
    
    const playersArray = Array.from(this.players.values());
    
    playersArray.forEach((player, index) => {
      // Определить какой диапазон использовать для этого игрока
      let playerHandWeights;
      if (index === 0) {
        // Первый игрок (создатель) - player1
        playerHandWeights = this.settings.playerRanges?.player1?.handWeights || {};
      } else {
        // Второй игрок - player2
        playerHandWeights = this.settings.playerRanges?.player2?.handWeights || {};
      }
      
      console.log(`🎯 Игрок ${player.name} (позиция ${index + 1}): диапазон ${Object.keys(playerHandWeights).length} рук`);
      console.log(`🎲 Веса рук:`, playerHandWeights);
      
      // Сгенерировать карты согласно диапазону
      player.cards = generatePlayerCards(playerHandWeights, this.deck);
      player.folded = false;
      player.acted = false;
      player.currentBet = 0;
      
      console.log(`✅ ${player.name} получил карты: ${player.cards[0].rank}${player.cards[0].suit} ${player.cards[1].rank}${player.cards[1].suit}`);
    });
  }

  dealFlop() {
    console.log('🎴 Начинаю раздачу флопа...');
    console.log('🎴 Настройки флопа:', JSON.stringify(this.settings.boardSettings.flop, null, 2));
    
    // Если указаны конкретные карты флопа
    if (this.settings.boardSettings.flop.specificCards.some(card => card !== null)) {
      console.log('🎯 Используются конкретные карты флопа');
      this.communityCards = this.settings.boardSettings.flop.specificCards
        .filter(card => card !== null)
        .map(card => ({
          rank: card.rank,
          suit: card.suit,
          symbol: this.getSuitSymbol(card.suit),
          value: card.rank + this.getSuitSymbol(card.suit)
        }));
      console.log('🎴 Сданные карты флопа:', this.communityCards);
    } else {
      console.log('🎲 Генерирую случайный флоп согласно ограничениям');
      // Генерировать флоп согласно ограничениям
      this.communityCards = this.generateRestrictedFlop();
      console.log('🎴 Сгенерированный флоп:', this.communityCards);
    }
  }

  generateRestrictedFlop() {
    const restrictions = this.settings.boardSettings.flop;
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
    return [this.deck.pop(), this.deck.pop(), this.deck.pop()];
  }

  validateFlopRestrictions(cards, restrictions) {
    // Проверка мастей
    if (restrictions.suits !== 'any') {
      const suits = cards.map(card => card.symbol);
      const uniqueSuits = [...new Set(suits)];
      
      switch (restrictions.suits) {
        case 'monotone':
          if (uniqueSuits.length !== 1) return false;
          break;
        case 'rainbow':
          if (uniqueSuits.length !== 3) return false;
          break;
        case 'flush-draw':
          if (uniqueSuits.length !== 2) return false;
          break;
      }
    }

    // Проверка спаренности
    if (restrictions.pairing !== 'any') {
      const ranks = cards.map(card => card.rank);
      const uniqueRanks = [...new Set(ranks)];
      
      switch (restrictions.pairing) {
        case 'unpaired':
          if (uniqueRanks.length !== 3) return false;
          break;
        case 'paired':
          if (uniqueRanks.length !== 2) return false;
          break;
        case 'trips':
          if (uniqueRanks.length !== 1) return false;
          break;
      }
    }

    // Проверка старшинства карт
    const sortedRanks = cards.map(card => CARD_RANKS.indexOf(card.rank)).sort((a, b) => a - b);
    const [high, middle, low] = [sortedRanks[0], sortedRanks[1], sortedRanks[2]];
    
    if (restrictions.ranks.high[0] !== 'any') {
      const allowedHighRanks = restrictions.ranks.high.map(rank => CARD_RANKS.indexOf(rank));
      if (!allowedHighRanks.includes(high)) return false;
    }

    return true;
  }

  getSuitSymbol(suit) {
    const index = CARD_SUITS.indexOf(suit);
    return SUIT_SYMBOLS[index] || 's';
  }

  dealTurn() {
    if (this.street !== 'flop') return;
    
    this.street = 'turn';
    this.currentBet = 0; // Сбросить текущую ставку для новой улицы
    
    // Сбросить флаги действий и ставки для новой улицы
    this.players.forEach(player => {
      player.currentBet = 0;
      player.acted = false;
    });
    
    // Взять следующую карту из колоды
    const turnCard = this.deck.pop();
    this.communityCards.push(turnCard);
  }

  dealRiver() {
    if (this.street !== 'turn') return;
    
    this.street = 'river';
    this.currentBet = 0; // Сбросить текущую ставку для новой улицы
    
    // Сбросить флаги действий и ставки для новой улицы
    this.players.forEach(player => {
      player.currentBet = 0;
      player.acted = false;
    });
    
    // Взять следующую карту из колоды
    const riverCard = this.deck.pop();
    this.communityCards.push(riverCard);
  }

  createHandHistoryEntry() {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const players = Array.from(this.players.values());
    
    this.currentHandHistory = {
      handId: `${this.sessionId}-${this.tableId}-${this.handNumber}`,
      timestamp,
      tableId: this.tableId,
      handNumber: this.handNumber,
      players: players.map(p => ({
        name: p.name,
        position: p.position,
        stack: p.stack,
        cards: p.cards
      })),
      preflopSpot: this.preflopSpot,
      communityCards: this.communityCards,
      pot: this.pot,
      rake: {
        percent: this.settings.rakePercent,
        cap: this.settings.rakeDollar * 100 // в центах
      },
      actions: []
    };
  }

  // Парсинг информации о блайндах и банке из preflopSpot
  parseHandHistoryInfo() {
    const defaultInfo = {
      bigBlind: 1.00,     // $1.00 по умолчанию
      smallBlind: 0.50,   // $0.50 по умолчанию
      initialPot: 0,      // Начальный банк на флопе
      effectiveStack: 100.00, // Эффективный стек
      flopBets: {         // Ставки на флопе
        player1: 0,
        player2: 0
      },
      turnBets: {         // Ставки на терне
        player1: 0,
        player2: 0
      },
      riverBets: {        // Ставки на ривере
        player1: 0,
        player2: 0
      }
    };

    if (!this.preflopSpot) {
      console.log('❌ preflopSpot пустой или не определен');
      return defaultInfo;
    }

    const text = this.preflopSpot;
    let parsedInfo = { ...defaultInfo };

    console.log('🔍 Парсинг hand history:');
    console.log('📄 Первые 500 символов:', text.substring(0, 500));
    console.log('📄 Длина текста:', text.length);

    // Парсинг блайндов из заголовка (формат: "Hold'em No Limit ($5.00/$10.00)")
    const blindsHeaderMatch = text.match(/Hold'em No Limit \(\$(\d+\.?\d*)\/\$(\d+\.?\d*)\)/);
    if (blindsHeaderMatch) {
      parsedInfo.smallBlind = parseFloat(blindsHeaderMatch[1]);
      parsedInfo.bigBlind = parseFloat(blindsHeaderMatch[2]);
      console.log(`💰 Блайнды из заголовка: SB $${parsedInfo.smallBlind}, BB $${parsedInfo.bigBlind}`);
    } else {
      console.log('❌ Не удалось найти блайнды в заголовке');
    }

    // Парсинг стеков игроков
    const seatMatches = text.matchAll(/Seat \d+: .+ \(\$(\d+\.?\d*) in chips\)/g);
    const stacks = [];
    for (const match of seatMatches) {
      stacks.push(parseFloat(match[1]));
    }
    
    if (stacks.length > 0) {
      parsedInfo.effectiveStack = Math.min(...stacks);
      console.log(`🎯 Найдено ${stacks.length} игроков со стеками: ${stacks.join(', ')}`);
      console.log(`🎯 Эффективный стек: $${parsedInfo.effectiveStack}`);
    } else {
      console.log('❌ Не удалось найти стеки игроков');
    }

    // Найти секцию с префлоп действиями  
    const { actions, potSize: extractedPotSize, playerInvestments } = this.extractPreflopActions(text);
    if (actions.length > 0) {
      console.log(`📝 Найдено ${actions.length} префлоп действий:`);
      actions.forEach(a => console.log(`  - ${a.player}: ${a.action} $${a.amount}`));
      
      // Использовать спарсенный банк
      parsedInfo.initialPot = extractedPotSize;
      console.log(`💰 Итоговый банк на флопе: $${parsedInfo.initialPot}`);
      
      // Вычислить эффективные стеки после префлоп инвестиций
      const investments = Object.values(playerInvestments);
      if (investments.length > 0) {
        const maxInvestment = Math.max(...investments);
        if (maxInvestment > 0) {
          parsedInfo.effectiveStack = Math.max(0, parsedInfo.effectiveStack - maxInvestment);
          console.log(`📊 Максимальная инвестиция: $${maxInvestment}`);
          console.log(`📊 Эффективный стек после префлопа: $${parsedInfo.effectiveStack}`);
        }
      }
    } else {
      console.log('⚠️  Префлоп действия не найдены, используем блайннды');
      parsedInfo.initialPot = parsedInfo.smallBlind + parsedInfo.bigBlind;
      console.log(`💰 Банк из блайндов: $${parsedInfo.initialPot}`);
    }

    console.log('✅ Итоговый результат парсинга:', parsedInfo);
    return parsedInfo;
  }

  // Извлечение префлоп действий из hand history
  extractPreflopActions(text) {
    const actions = [];
    let potSize = 0;
    const playerInvestments = {};

    try {
      // Найти секцию с hole cards
      const holeCardsIndex = text.indexOf('*** HOLE CARDS ***');
      if (holeCardsIndex === -1) {
        console.log('❌ Секция HOLE CARDS не найдена');
        return { actions, potSize, playerInvestments };
      }

      // Найти секцию флопа или конец префлопа
      const flopIndex = text.indexOf('*** FLOP ***');
      const endIndex = flopIndex !== -1 ? flopIndex : text.length;
      
      // Извлечь текст с действиями префлопа, включая блайнды
      const blindsStart = text.indexOf('posts small blind');
      const startIndex = blindsStart !== -1 ? blindsStart : holeCardsIndex;
      const preflopText = text.substring(startIndex, endIndex);
      console.log('🎯 Текст префлопа для парсинга:', preflopText);

      // Инициализация инвестиций игроков
      const playerNames = [];
      
      // Парсинг блайндов
      const blindActions = [
        { pattern: /(\w+): posts small blind \$(\d+\.?\d*)/, type: 'small_blind' },
        { pattern: /(\w+): posts big blind \$(\d+\.?\d*)/, type: 'big_blind' }
      ];

      for (const blindAction of blindActions) {
        const match = preflopText.match(blindAction.pattern);
        if (match) {
          const playerName = match[1];
          const amount = parseFloat(match[2]);
          
          if (!playerInvestments[playerName]) {
            playerInvestments[playerName] = 0;
            playerNames.push(playerName);
          }
          
          playerInvestments[playerName] += amount;
          potSize += amount;
          actions.push({ player: playerName, action: blindAction.type, amount });
          console.log(`💰 ${blindAction.type}: ${playerName} вложил $${amount}, итого у игрока: $${playerInvestments[playerName]}`);
        }
      }

      // Парсинг остальных действий (raises, calls, folds)
      const actionPatterns = [
        { pattern: /(\w+): raises \$(\d+\.?\d*) to \$(\d+\.?\d*)/, type: 'raise' },
        { pattern: /(\w+): calls \$(\d+\.?\d*)/, type: 'call' },
        { pattern: /(\w+): folds/, type: 'fold' },
        { pattern: /(\w+): checks/, type: 'check' }
      ];

      for (const actionPattern of actionPatterns) {
        const matches = preflopText.matchAll(new RegExp(actionPattern.pattern.source, 'g'));
        
        for (const match of matches) {
          const playerName = match[1];
          
          if (!playerInvestments[playerName]) {
            playerInvestments[playerName] = 0;
            playerNames.push(playerName);
          }

          if (actionPattern.type === 'raise') {
            const raiseAmount = parseFloat(match[2]);
            const totalBet = parseFloat(match[3]);
            
            // Для рейза учитываем разницу между новой ставкой и уже вложенным
            const additionalInvestment = totalBet - playerInvestments[playerName];
            playerInvestments[playerName] = totalBet;
            potSize += additionalInvestment;
            
            actions.push({ player: playerName, action: actionPattern.type, amount: additionalInvestment, totalBet });
            console.log(`🔥 Raise: ${playerName} доставил $${additionalInvestment} до $${totalBet}, итого у игрока: $${playerInvestments[playerName]}`);
            
          } else if (actionPattern.type === 'call') {
            const callAmount = parseFloat(match[2]);
            playerInvestments[playerName] += callAmount;
            potSize += callAmount;
            
            actions.push({ player: playerName, action: actionPattern.type, amount: callAmount });
            console.log(`📞 Call: ${playerName} доставил $${callAmount}, итого у игрока: $${playerInvestments[playerName]}`);
            
          } else if (actionPattern.type === 'fold') {
            // При фолде игрок не доставляет деньги, но его предыдущие инвестиции остаются в банке
            actions.push({ player: playerName, action: actionPattern.type, amount: 0 });
            console.log(`🗂️ Fold: ${playerName} сфолдил, его инвестиции $${playerInvestments[playerName] || 0} остаются в банке`);
            
          } else if (actionPattern.type === 'check') {
            actions.push({ player: playerName, action: actionPattern.type, amount: 0 });
            console.log(`✅ Check: ${playerName} чекнул`);
          }
        }
      }

      console.log('💰 Итоговые инвестиции игроков:', playerInvestments);
      console.log('🏦 Общий размер банка на флопе:', potSize);

    } catch (error) {
      console.error('❌ Ошибка парсинга префлоп действий:', error);
    }

    return { actions, potSize, playerInvestments };
  }

  addAction(playerId, actionType, amount = 0) {
    const player = this.players.get(playerId);
    if (!player || player.folded) {
      console.log('🚫 Действие отклонено: игрок не найден или сфолдил');
      return false;
    }

    // Убедиться что HandHistory инициализирован
    if (!this.currentHandHistory) {
      this.createHandHistoryEntry();
    }

    console.log(`🎲 Обработка действия: ${player.name} ${actionType} ${amount} на улице ${this.street}`);
    console.log(`📊 Текущее состояние: pot=${this.pot}, currentBet=${this.currentBet}, playerBet=${player.currentBet}`);

    // Валидация действия
    const validation = this.validateAction(playerId, actionType, amount);
    if (!validation.valid) {
      console.log(`❌ Действие невалидно: ${validation.reason}`);
      return false;
    }

    // Если это рейз, используем скорректированную сумму из валидации
    const finalAmount = validation.correctedAmount || amount;

    // Сохраняем данные ДО обработки для правильного вычисления рейза
    const previousBet = this.currentBet;
    const previousPlayerBet = player.currentBet;

    // Обработка действия СНАЧАЛА
    const result = this.processAction(player, actionType, finalAmount);
    if (!result) {
      console.log('❌ Ошибка при обработке действия');
      return false;
    }

    // Создаем action объект ПОСЛЕ обработки с правильными данными
    const action = {
      playerId,
      playerName: player.name,
      action: actionType,
      amount: finalAmount,
      street: this.street,
      timestamp: moment().format('HH:mm:ss')
    };

    // Для рейзов сохраняем дополнительную информацию с правильными значениями
    if (actionType === 'raise') {
      action.raiseAmount = finalAmount - previousBet; // Размер рейза (правильный)
      action.totalBet = finalAmount; // Общая ставка до которой рейзим
      action.previousBet = previousBet; // Предыдущая ставка на столе
      console.log(`🔢 Рейз: previous=${previousBet}, final=${finalAmount}, raise=${action.raiseAmount}`);
    }
    
    // Для колла тоже сохраняем необходимую информацию
    if (actionType === 'call') {
      action.callAmount = finalAmount; // Размер колла
    }

    // Проверить на all-in
    if (player.stack === 0) {
      action.allIn = true;
    }

    this.actions.push(action);
    this.currentHandHistory.actions.push(action);

    player.acted = true;

    console.log(`✅ Действие обработано: pot=${this.pot}, currentBet=${this.currentBet}, playerBet=${player.currentBet}`);

    // Проверить завершение раунда торгов
    const roundComplete = this.isBettingRoundComplete();
    console.log(`🔄 Раунд торгов завершен: ${roundComplete}`);

    if (roundComplete) {
      this.completeBettingRound();
    }

    return true;
  }

  // Валидация действия игрока
  validateAction(playerId, actionType, amount) {
    const player = this.players.get(playerId);
    const opponent = Array.from(this.players.values()).find(p => p.id !== playerId);
    
    console.log(`🔍 Валидация действия: ${actionType} на сумму ${amount}`);
    console.log(`📊 Player bet: ${player.currentBet}, Opponent bet: ${opponent?.currentBet || 0}, Current bet: ${this.currentBet}`);

    switch (actionType) {
      case 'fold':
        return { valid: true };

      case 'check':
        // Чек возможен только если нет активной ставки или игрок уже уравнял ставку
        if (this.currentBet === 0 || player.currentBet === this.currentBet) {
          return { valid: true };
        }
        return { valid: false, reason: 'Невозможно чекнуть при активной ставке' };

      case 'call':
        // Колл возможен только если есть активная ставка и игрок ее еще не уравнял
        if (this.currentBet > 0 && player.currentBet < this.currentBet) {
          const callAmount = this.currentBet - player.currentBet;
          // Проверить что у игрока достаточно фишек
          if (player.stack >= callAmount) {
            return { valid: true, correctedAmount: callAmount };
          } else {
            // All-in колл
            return { valid: true, correctedAmount: player.stack };
          }
        }
        return { valid: false, reason: 'Нет активной ставки для колла' };

      case 'bet':
        // Бет возможен только если нет активной ставки на улице
        if (this.currentBet > 0) {
          return { valid: false, reason: 'Нельзя делать бет при активной ставке' };
        }
        // Минимальный бет = 1 BB
        const minBet = 200; // 1 BB = $2.00 в центах
        if (amount < minBet) {
          return { valid: false, reason: `Минимальный бет: $${(minBet / 100).toFixed(2)}` };
        }
        if (player.stack < amount) {
          // All-in бет
          return { valid: true, correctedAmount: player.stack };
        }
        return { valid: true };

      case 'raise':
        // Рейз возможен только при активной ставке
        if (this.currentBet === 0) {
          return { valid: false, reason: 'Нет ставки для рейза' };
        }
        
        // Вычислить минимальный рейз
        const minRaise = this.calculateMinRaise();
        const currentRaiseSize = amount - this.currentBet;
        
        console.log(`🔢 Минимальный рейз: ${minRaise}, текущий рейз: ${currentRaiseSize}, всего: ${amount}`);
        
        if (amount < this.currentBet) {
          return { valid: false, reason: 'Рейз не может быть меньше текущей ставки' };
        }
        
        // Проверить минимальный размер рейза (за исключением all-in)
        if (currentRaiseSize < minRaise && player.stack >= amount) {
          return { valid: false, reason: `Минимальный рейз: $${((this.currentBet + minRaise) / 100).toFixed(2)}` };
        }
        
        if (player.stack < amount) {
          // All-in рейз
          const allInAmount = player.currentBet + player.stack;
          return { valid: true, correctedAmount: allInAmount };
        }
        
        return { valid: true };

      default:
        return { valid: false, reason: 'Неизвестное действие' };
    }
  }

  // Вычислить минимальный размер рейза
  calculateMinRaise() {
    // Найти размер последнего рейза на этой улице
    const streetActions = this.actions.filter(a => a.street === this.street);
    
    // Если это первая ставка на улице, минимальный рейз = размер ставки
    if (streetActions.length === 0 || this.currentBet === 0) {
      return 200; // 1 BB
    }

    // Найти последний бет или рейз
    let lastBetAmount = 0;
    let currentBetLevel = 0;

    for (const action of streetActions) {
      if (action.action === 'bet') {
        lastBetAmount = action.amount;
        currentBetLevel = action.amount;
      } else if (action.action === 'raise') {
        const raiseSize = action.amount - currentBetLevel;
        lastBetAmount = raiseSize;
        currentBetLevel = action.amount;
      }
    }

    // Минимальный рейз = размер последней ставки/рейза
    return Math.max(lastBetAmount, 200); // Минимум 1 BB
  }

  // Обработать действие игрока
  processAction(player, actionType, amount) {
    console.log(`⚙️ Обработка действия: ${actionType} на сумму ${amount}`);

    switch (actionType) {
      case 'fold':
        player.folded = true;
        console.log(`📁 ${player.name} сфолдил`);
        break;

      case 'check':
        console.log(`✅ ${player.name} чекнул`);
        break;

      case 'call':
        const callAmount = Math.min(amount, this.currentBet - player.currentBet);
        player.stack -= callAmount;
        player.currentBet += callAmount;
        // НЕ добавляем к банку сразу - только при завершении улицы
        console.log(`📞 ${player.name} заколлировал $${(callAmount / 100).toFixed(2)} (банк остается $${(this.pot / 100).toFixed(2)})`);
        break;

      case 'bet':
        player.stack -= amount;
        player.currentBet = amount;
        this.currentBet = amount;
        // НЕ добавляем к банку сразу - только при завершении улицы
        console.log(`💰 ${player.name} поставил $${(amount / 100).toFixed(2)} (банк остается $${(this.pot / 100).toFixed(2)})`);
        break;

      case 'raise':
        const raiseAmount = amount - player.currentBet;
        player.stack -= raiseAmount;
        player.currentBet = amount;
        this.currentBet = amount;
        // НЕ добавляем к банку сразу - только при завершении улицы
        console.log(`🚀 ${player.name} рейзнул до $${(amount / 100).toFixed(2)} (банк остается $${(this.pot / 100).toFixed(2)})`);
        break;

      default:
        console.log(`❓ Неизвестное действие: ${actionType}`);
        return false;
    }

    return true;
  }

  // Проверить завершение раунда торгов
  isBettingRoundComplete() {
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    
    // Если остался только один игрок, раунд завершен
    if (activePlayers.length <= 1) {
      console.log('🏁 Раунд завершен: остался один игрок');
      return true;
    }

    // Проверить что все активные игроки действовали
    const allActed = activePlayers.every(p => p.acted);
    if (!allActed) {
      console.log('⏳ Не все игроки действовали');
      return false;
    }

    // Проверить что все ставки равны
    const bets = activePlayers.map(p => p.currentBet);
    const allBetsEqual = bets.every(bet => bet === bets[0]);
    
    console.log('📊 Ставки игроков:', bets, 'равны:', allBetsEqual);
    
    return allBetsEqual;
  }

  // Завершить раунд торгов и перейти к следующей улице
  completeBettingRound() {
    console.log(`🏁 Завершение раунда торгов на улице: ${this.street}`);

    // Проверить есть ли игроки которые сфолдили
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    
    if (activePlayers.length <= 1) {
      console.log('🏆 Раздача завершена (остался один игрок)');
      this.completeHand();
      return;
    }

    // Сохранить ставки текущей улицы перед переходом к следующей
    const currentStreetBets = Array.from(this.players.values()).reduce((sum, player) => {
      return sum + (player.currentBet || 0);
    }, 0);
    
    this.streetPots[this.street] = currentStreetBets;
    console.log(`💰 Сохранены ставки улицы ${this.street}: $${(currentStreetBets / 100).toFixed(2)}`);

    // Проверить на all-in ситуацию
    const allInDetected = this.checkForAllIn();
    
    if (allInDetected) {
      console.log('🎯 Обнаружен All-in! Автоматическая раздача оставшихся карт...');
      this.handleAllInSituation();
      return;
    }

    // Сбросить флаги действий и ставки для следующей улицы
    this.players.forEach(player => {
      player.acted = false;
      player.currentBet = 0;
    });
    this.currentBet = 0;

    // Перейти к следующей улице
    const previousStreet = this.street;
    switch (this.street) {
      case 'flop':
        this.dealTurn();
        console.log('🃏 Переход на терн');
        break;
      case 'turn':
        this.dealRiver();
        console.log('🃏 Переход на ривер');
        break;
      case 'river':
        console.log('🏆 Переход к вскрытию');
        this.completeHand();
        return; // Не уведомляем о смене улицы при завершении
      default:
        console.log('❓ Неизвестная улица');
        return;
    }

    // Обновить общий банк для новой улицы
    this.updatePotForStreet();

    // Уведомить игроков о смене улицы
    this.notifyStreetChange(previousStreet);
  }

  // Обновить банк для текущей улицы
  updatePotForStreet() {
    let totalPot = this.streetPots.preflop;
    
    if (this.street === 'turn' || this.street === 'river') {
      totalPot += this.streetPots.flop;
    }
    
    if (this.street === 'river') {
      totalPot += this.streetPots.turn;
    }
    
    const oldPot = this.pot;
    this.pot = totalPot;
    
    console.log(`💰 Банк обновлен для улицы ${this.street}: с $${(oldPot / 100).toFixed(2)} на $${(this.pot / 100).toFixed(2)}`);
    console.log(`📊 Банки по улицам:`, {
      preflop: `$${(this.streetPots.preflop / 100).toFixed(2)}`,
      flop: `$${(this.streetPots.flop / 100).toFixed(2)}`,
      turn: `$${(this.streetPots.turn / 100).toFixed(2)}`,
      river: `$${(this.streetPots.river / 100).toFixed(2)}`,
      total: `$${(this.pot / 100).toFixed(2)}`
    });
  }

  // Завершить раздачу
  completeHand() {
    console.log('🏆 Завершение раздачи');
    
    // Сохранить ставки финальной улицы (если есть)
    const finalStreetBets = Array.from(this.players.values()).reduce((sum, player) => {
      return sum + (player.currentBet || 0);
    }, 0);
    
    this.streetPots[this.street] = finalStreetBets;
    console.log(`💰 Сохранены ставки финальной улицы ${this.street}: $${(finalStreetBets / 100).toFixed(2)}`);
    
    // Рассчитать итоговый банк
    const finalPot = this.streetPots.preflop + this.streetPots.flop + this.streetPots.turn + this.streetPots.river;
    this.pot = finalPot;
    
    console.log(`💰 Итоговый банк:`, {
      preflop: `$${(this.streetPots.preflop / 100).toFixed(2)}`,
      flop: `$${(this.streetPots.flop / 100).toFixed(2)}`,
      turn: `$${(this.streetPots.turn / 100).toFixed(2)}`,
      river: `$${(this.streetPots.river / 100).toFixed(2)}`,
      total: `$${(this.pot / 100).toFixed(2)}`
    });
    
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    
    if (activePlayers.length === 1) {
      // Выигрыш без вскрытия
      const winner = activePlayers[0];
      winner.stack += this.pot;
      console.log(`🎉 ${winner.name} выигрывает $${(this.pot / 100).toFixed(2)} без вскрытия`);
    } else {
      // Здесь будет логика определения победителя по силе рук
      // Пока просто отдаем банк первому игроку
      const winner = activePlayers[0];
      winner.stack += this.pot;
      console.log(`🎉 ${winner.name} выигрывает $${(this.pot / 100).toFixed(2)} на вскрытии`);
    }

    // 💾 Сохранить завершенную раздачу в накопительную историю
    this.saveCompletedHand();
    
    // Уведомить игроков о завершении раздачи
    this.notifyHandComplete();
    
    console.log('✨ Раздача завершена, готов к новой раздаче');
    
    // 🔧 АВТОМАТИЧЕСКИЙ ЗАПУСК НОВОЙ РАЗДАЧИ
    console.log('🔄 Автоматический запуск новой раздачи через 3 секунды...');
    setTimeout(() => {
      console.log('🎮 Запуск новой раздачи...');
      
      try {
        this.startNewHand();
        console.log(`🎮 Новая раздача #${this.handNumber} автоматически запущена`);
        
        // Уведомить игроков о начале новой раздачи
        this.notifyPlayersOfNewHand();
      } catch (error) {
        console.error('❌ Ошибка при автоматическом запуске новой раздачи:', error);
      }
    }, 3000); // Задержка 3 секунды для демонстрации результатов
  }

  // 💾 Сохранить завершенную раздачу в накопительную историю
  saveCompletedHand() {
    // Проверить что в раздаче были какие-то действия игроков
    const hasPlayerActions = this.currentHandHistory && 
                             this.currentHandHistory.actions && 
                             this.currentHandHistory.actions.length > 0;

    if (!hasPlayerActions) {
      console.log('📝 Раздача не сохранена - нет действий игроков');
      return;
    }

    // Генерировать HandHistory текст для этой раздачи
    const handHistoryText = this.generateHandHistoryText();
    
    if (handHistoryText && !handHistoryText.includes('Ошибка:')) {
      // Увеличить счетчик завершенных раздач
      this.tableHandCount++;
      
      // Добавить в массив завершенных раздач
      this.completedHands.push({
        handNumber: this.handNumber,
        tableHandNumber: this.tableHandCount,
        text: handHistoryText,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        tableId: this.tableId
      });
      
      console.log(`💾 Раздача #${this.handNumber} сохранена в накопительную историю стола ${this.tableId} (всего раздач: ${this.tableHandCount})`);
    } else {
      console.log('❌ Не удалось сохранить HandHistory - ошибка генерации');
    }
  }

  // Уведомить игроков о смене улицы
  notifyStreetChange(previousStreet) {
    if (!this.sessionId) return;
    
    const session = activeSessions.get(this.sessionId);
    if (!session) return;

    console.log(`📡 Уведомление о смене улицы: ${previousStreet} → ${this.street}`);

    session.players.forEach((player, playerId) => {
      if (this.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('street-changed', {
            tableId: this.tableId,
            previousStreet: previousStreet,
            street: this.street,
            tableInfo: this.getTableInfo(playerId)
          });
        }
      }
    });
  }

  // Уведомить игроков о завершении раздачи
  notifyHandComplete() {
    if (!this.sessionId) return;
    
    const session = activeSessions.get(this.sessionId);
    if (!session) return;

    console.log(`📡 Уведомление о завершении раздачи на столе ${this.tableId}`);

    session.players.forEach((player, playerId) => {
      if (this.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('hand-completed', {
            tableId: this.tableId,
            tableInfo: this.getTableInfo(playerId),
            handHistory: this.exportHandHistory()
          });
        }
      }
    });
  }

  // Уведомить игроков о начале новой раздачи
  notifyPlayersOfNewHand() {
    if (!this.sessionId) return;
    
    const session = activeSessions.get(this.sessionId);
    if (!session) return;

    console.log(`📡 Уведомление о начале новой раздачи на столе ${this.tableId}`);

    session.players.forEach((player, playerId) => {
      if (this.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('new-hand-auto-started', {
            tableId: this.tableId,
            handNumber: this.handNumber,
            tableInfo: this.getTableInfo(playerId),
            message: 'Новая раздача началась автоматически'
          });
        }
      }
    });
  }

  getTableInfo(requestingPlayerId = null) {
    // Создать объект streetBets с учетом кто уже действовал
    const streetBets = {};
    streetBets[this.street] = {};
    
    // Для каждого игрока записать его ставку или отметить что он действовал (для чека)
    Array.from(this.players.values()).forEach(p => {
      if (p.acted) {
        // Если игрок уже действовал, записываем его ставку (может быть 0 для чека)
        streetBets[this.street][p.id] = p.currentBet;
      }
      // Если не действовал, не записываем вообще (undefined означает "не ходил")
    });
    
    return {
      tableId: this.tableId,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        position: p.position,
        folded: p.folded,
        currentBet: p.currentBet,
        acted: p.acted,
        // Показать карты только запрашивающему игроку для его собственных карт
        cards: p.id === requestingPlayerId ? p.cards : [
          { rank: '?', suit: '?', hidden: true },
          { rank: '?', suit: '?', hidden: true }
        ]
      })),
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      street: this.street,
      handNumber: this.handNumber,
      currentStreet: this.street,
      streetBets: streetBets,
      preflopSpot: this.preflopSpot,
      handHistory: this.currentHandHistory,
      handHistoryInfo: this.parseHandHistoryInfo()
    };
  }

  exportHandHistory() {
    // Если нет завершенных раздач, вернуть пустой результат
    if (this.completedHands.length === 0) {
      return {
        tableId: this.tableId,
        sessionId: this.sessionId,
        totalHands: 0,
        fileName: this.getHandHistoryFileName(),
        formatted: '',
        format: 'pokerstars',
        message: 'Нет завершенных раздач для экспорта'
      };
    }

    // Объединить все завершенные раздачи в один текст
    const allHandsText = this.completedHands.map(hand => hand.text).join('\n\n');
    
    return {
      tableId: this.tableId,
      sessionId: this.sessionId,
      totalHands: this.completedHands.length,
      fileName: this.getHandHistoryFileName(),
      formatted: allHandsText,
      format: 'pokerstars',
      hands: this.completedHands
    };
  }

  // Получить имя файла для HandHistory в соответствии с требованиями
  getHandHistoryFileName() {
    // Формат: hand_{sessionId}-{tableId}-{handCount}_table_{tableId}
    return `hand_${this.sessionId}-${this.tableId}-${this.tableHandCount}_table_${this.tableId}.txt`;
  }

  // 💾 Записать HandHistory в файл
  writeHandHistoryToFile() {
    if (this.completedHands.length === 0) {
      console.log(`📝 Стол ${this.tableId}: нет раздач для записи в файл`);
      return false;
    }

    const fileName = this.getHandHistoryFileName();
    const filePath = path.join(__dirname, 'handhistory', fileName);
    
    // Создать папку handhistory если её нет
    const handhistoryDir = path.join(__dirname, 'handhistory');
    if (!fs.existsSync(handhistoryDir)) {
      fs.mkdirSync(handhistoryDir, { recursive: true });
    }
    
    // Объединить все раздачи в один текст
    const allHandsText = this.completedHands.map(hand => hand.text).join('\n\n');
    
    try {
      fs.writeFileSync(filePath, allHandsText, 'utf8');
      console.log(`💾 HandHistory записана в файл: ${fileName} (${this.completedHands.length} раздач)`);
      return true;
    } catch (error) {
      console.error(`❌ Ошибка записи HandHistory в файл ${fileName}:`, error);
      return false;
    }
  }

  generateHandHistoryText() {
    const hand = this.currentHandHistory;
    
    // Если нет префлоп спота, не можем сгенерировать корректную историю
    if (!hand.preflopSpot) {
      return 'Ошибка: Префлоп спот не найден';
    }

    // 1. Извлекаем префлоп часть и генерируем новый номер раздачи
    const originalText = hand.preflopSpot;
    const handIdMatch = originalText.match(/PokerStars Hand #(\d+):/);
    const originalHandId = handIdMatch ? handIdMatch[1] : '4400520541168030866';
    
    // Генерируем новый номер раздачи на основе tableId и handNumber
    const newHandId = `${originalHandId.slice(0, -4)}${String(this.tableId).padStart(2, '0')}${String(this.handNumber).padStart(2, '0')}`;
    
    // Заменяем номер раздачи в заголовке
    let handText = originalText.replace(/PokerStars Hand #\d+:/, `PokerStars Hand #${newHandId}:`);
    
    // 2. Обрезаем префлоп часть (убираем любые постфлоп секции)
    const postflopMarkers = ['*** FLOP ***', '*** TURN ***', '*** RIVER ***', '*** SHOW DOWN ***', '*** SUMMARY ***'];
    let cutIndex = handText.length;
    
    // Найти самый ранний постфлоп маркер
    for (const marker of postflopMarkers) {
      const markerIndex = handText.indexOf(marker);
      if (markerIndex !== -1 && markerIndex < cutIndex) {
        cutIndex = markerIndex;
      }
    }
    
    // Обрезаем до найденного маркера
    handText = handText.substring(0, cutIndex);
    
    // Убираем лишние пробелы в конце и убеждаемся что префлоп заканчивается переносом строки
    handText = handText.trimEnd();
    if (!handText.endsWith('\n')) {
      handText += '\n';
    }
    
    // 3. Добавляем постфлоп секции
    
    // *** FLOP ***
    if (this.communityCards.length >= 3) {
      const flopCards = this.communityCards.slice(0, 3);
      handText += `*** FLOP *** [${flopCards.map(c => this.formatCard(c)).join(' ')}]\n`;
      
      // Добавляем действия на флопе
      const flopActions = hand.actions.filter(a => a.street === 'flop');
      flopActions.forEach(action => {
        handText += this.formatAction(action);
      });
    }
    
    // *** TURN ***
    if (this.communityCards.length >= 4) {
      const flopCards = this.communityCards.slice(0, 3);
      const turnCard = this.communityCards[3];
      handText += `*** TURN *** [${flopCards.map(c => this.formatCard(c)).join(' ')}] [${this.formatCard(turnCard)}]\n`;
      
      // Добавляем действия на терне
      const turnActions = hand.actions.filter(a => a.street === 'turn');
      turnActions.forEach(action => {
        handText += this.formatAction(action);
      });
    }
    
    // *** RIVER ***
    if (this.communityCards.length >= 5) {
      const allButRiver = this.communityCards.slice(0, 4);
      const riverCard = this.communityCards[4];
      handText += `*** RIVER *** [${allButRiver.map(c => this.formatCard(c)).join(' ')}] [${this.formatCard(riverCard)}]\n`;
      
      // Добавляем действия на ривере
      const riverActions = hand.actions.filter(a => a.street === 'river');
      riverActions.forEach(action => {
        handText += this.formatAction(action);
      });
    }
    
    // 4. *** SHOW DOWN *** (если раздача дошла до вскрытия)
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    const winner = this.determineWinner();
    
    if (activePlayers.length > 1) {
      handText += `*** SHOW DOWN ***\n`;
      
      activePlayers.forEach(player => {
        if (player.id === winner.id) {
          // Показываем карты победителя
          const handDescription = this.getHandDescription(player.cards);
          handText += `${player.name}: shows [${player.cards.map(c => this.formatCard(c)).join(' ')}] (${handDescription})\n`;
        } else {
          // Проигравший сбрасывает карты
          handText += `${player.name}: mucks hand\n`;
        }
      });
      
      // Сбор банка
      const rakeAmount = this.calculateRake();
      const winAmount = this.pot - rakeAmount;
      handText += `${winner.name} collected $${(winAmount / 100).toFixed(2)} from pot\n`;
    }
    
    // 5. *** SUMMARY ***
    handText += `*** SUMMARY ***\n`;
    
    // Информация о банке и рейке
    const rakeAmount = this.calculateRake();
    handText += `Total pot $${(this.pot / 100).toFixed(2)} | Rake $${(rakeAmount / 100).toFixed(2)}\n`;
    
    // Доска (если есть карты)
    if (this.communityCards.length > 0) {
      handText += `Board [${this.communityCards.map(c => this.formatCard(c)).join(' ')}]\n`;
    }
    
    // Информация по каждому игроку (из исходного префлоп спота)
    handText += this.generateSummarySeats(winner, activePlayers);
    
    return handText;
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

  // Форматирование действия для history
  formatAction(action) {
    const playerName = action.playerName;
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
        
        // Если есть данные о рейзе, используем их
        if (action.raiseAmount !== undefined && action.totalBet !== undefined) {
          return `${playerName}: raises $${(action.raiseAmount / 100).toFixed(2)} to $${(action.totalBet / 100).toFixed(2)}${raiseAllInText}\n`;
        } else {
          // Fallback для старых данных или если raiseAmount отсутствует
          // Вычисляем размер рейза из общей ставки
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

  // Определить победителя (упрощенная версия)
  determineWinner() {
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    // Пока просто возвращаем первого активного игрока
    // В будущем здесь будет полноценная оценка рук
    return activePlayers[0] || Array.from(this.players.values())[0];
  }

  // Получить описание руки (упрощенная версия)
  getHandDescription(cards) {
    // Простая проверка пар
    if (cards[0].rank === cards[1].rank) {
      const rank = cards[0].rank;
      const rankName = rank === 'A' ? 'Aces' : 
                     rank === 'K' ? 'Kings' :
                     rank === 'Q' ? 'Queens' :
                     rank === 'J' ? 'Jacks' :
                     `${rank}s`;
      return `a pair of ${rankName}`;
    }
    
    // Если нет пары, возвращаем high card
    const highCard = this.getHighCardName(cards);
    return `${highCard} high`;
  }

  // Получить название старшей карты
  getHighCardName(cards) {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const cardRanks = cards.map(c => c.rank);
    
    for (let i = ranks.length - 1; i >= 0; i--) {
      if (cardRanks.includes(ranks[i])) {
        const rank = ranks[i];
        return rank === 'A' ? 'Ace' :
               rank === 'K' ? 'King' :
               rank === 'Q' ? 'Queen' :
               rank === 'J' ? 'Jack' :
               rank;
      }
    }
    return 'high card';
  }

  // Рассчитать рейк
  calculateRake() {
    const rakePercent = this.settings?.rakePercent || 2.5; // 2.5% по умолчанию
    const rakeCap = this.settings?.rakeDollar * 100 || 300; // $3.00 в центах по умолчанию
    
    const rakeAmount = this.pot * rakePercent / 100;
    return Math.min(rakeAmount, rakeCap);
  }

  generateSummarySeats(winner, activePlayers) {
    let summaryText = '';
    
    // Извлекаем информацию о местах из префлоп спота
    const seatMatches = Array.from(this.preflopSpot.matchAll(/Seat (\d+): ([^(]+) \([^)]+\)/g));
    
    // Определяем кто участвовал в раздаче (дошел до флопа)
    const playersWhoReachedFlop = [];
    
    // Проверяем кто из реальных игроков участвовал
    Array.from(this.players.values()).forEach(player => {
      playersWhoReachedFlop.push(player.name);
    });
    
    seatMatches.forEach(match => {
      const seatNumber = match[1];
      const playerName = match[2].trim();
      
      // Определяем позицию
      let position = '';
      if (this.preflopSpot.includes(`${playerName}: posts small blind`)) {
        position = ' (small blind)';
      } else if (this.preflopSpot.includes(`${playerName}: posts big blind`)) {
        position = ' (big blind)';
      } else if (this.preflopSpot.includes('is the button') && this.preflopSpot.includes(`Seat #${seatNumber} is the button`)) {
        position = ' (button)';
      }
      
      // Определяем что случилось с игроком
      const player = Array.from(this.players.values()).find(p => p.name === playerName);
      
      if (player) {
        // Это один из реальных игроков, участвующих в раздаче
        if (player.folded) {
          // Игрок сфолдил во время постфлоп игры
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded on the Flop\n`;
        } else if (activePlayers.includes(player)) {
          // Игрок дошел до конца
          if (player.id === winner.id) {
            const rakeAmount = this.calculateRake();
            const winAmount = this.pot - rakeAmount;
            const handDescription = this.getHandDescription(player.cards);
            summaryText += `Seat ${seatNumber}: ${playerName}${position} showed [${player.cards.map(c => this.formatCard(c)).join(' ')}] and won ($${(winAmount / 100).toFixed(2)}) with ${handDescription}\n`;
          } else {
            const handDescription = this.getHandDescription(player.cards);
            summaryText += `Seat ${seatNumber}: ${playerName}${position} showed [${player.cards.map(c => this.formatCard(c)).join(' ')}] and lost with ${handDescription}\n`;
          }
        }
      } else {
        // Это игрок из префлоп спота, который не участвует в постфлоп игре
        if (this.preflopSpot.includes(`${playerName}: folds`) && !this.preflopSpot.includes(`${playerName}: posts`)) {
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop (didn't bet)\n`;
        } else {
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop\n`;
        }
      }
    });
    
    return summaryText;
  }

  // Начать новую раздачу (вызывается по запросу игрока)
  requestNewHand() {
    console.log(`🔄 Запрос новой раздачи на столе ${this.tableId}`);
    
    // Проверить что текущая раздача завершена
    if (this.pot > 0 || this.communityCards.length === 0) {
      console.log('❌ Нельзя начать новую раздачу: текущая не завершена');
      return false;
    }
    
    // Начать новую раздачу
    this.startNewHand();
    
    console.log(`✅ Новая раздача #${this.handNumber} начата`);
    return true;
  }

  // Проверить на all-in ситуацию
  checkForAllIn() {
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    
    if (activePlayers.length <= 1) {
      return false; // Раздача уже завершена фолдами
    }
    
    // Проверить есть ли игроки с нулевым стеком (all-in)
    const allInPlayers = activePlayers.filter(p => p.stack === 0);
    const playersWithChips = activePlayers.filter(p => p.stack > 0);
    
    console.log(`🎯 All-in проверка: ${allInPlayers.length} игроков all-in, ${playersWithChips.length} игроков с фишками`);
    
    // Если есть хотя бы один all-in игрок и все ставки равны
    if (allInPlayers.length > 0) {
      // Проверить что все ставки равны
      const bets = activePlayers.map(p => p.currentBet);
      const allBetsEqual = bets.every(bet => bet === bets[0]);
      
      if (allBetsEqual) {
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
    
    // Сбросить флаги действий и ставки - больше торгов не будет
    this.players.forEach(player => {
      player.acted = true; // Все считаются действовавшими
    });
    this.currentBet = 0;
    
    // Автоматически раздать оставшиеся карты
    this.dealRemainingCards();
    
    // Завершить раздачу
    this.completeHand();
  }
  
  // Раздать оставшиеся карты до ривера
  dealRemainingCards() {
    console.log(`🃏 Автоматическая раздача карт с улицы: ${this.street}`);
    
    // Раздать карты в зависимости от текущей улицы
    if (this.street === 'flop') {
      // Раздать терн
      this.dealTurn();
      console.log('🃏 Автоматически раздан терн');
      
      // Раздать ривер
      this.dealRiver();
      console.log('🃏 Автоматически раздан ривер');
    } else if (this.street === 'turn') {
      // Раздать только ривер
      this.dealRiver();
      console.log('🃏 Автоматически раздан ривер');
    }
    
    // Установить улицу в "river" для корректного завершения раздачи
    this.street = 'river';
    
    // Уведомить игроков об обновлении стола
    this.notifyPlayersOfTableUpdate('All-in - карты розданы автоматически');
  }
}

// ===== WEBSOCKET ОБРАБОТЧИКИ =====
io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  // Создание сессии
  socket.on('create-session', (data) => {
    const sessionId = uuidv4().substring(0, 8).toUpperCase();
    const userId = data.userId || uuidv4();
    
    // Логирование полученных настроек
    console.log('📋 Получены настройки:', JSON.stringify(data.settings, null, 2));
    console.log('🃏 Настройки флопа:', JSON.stringify(data.settings.boardSettings?.flop, null, 2));
    console.log('🎯 Настройки диапазонов рук:', JSON.stringify(data.settings.playerRanges, null, 2));
    
    // Если preflopSpot пустой, загружаем пример
    if (!data.settings.preflopSpot || data.settings.preflopSpot.trim() === '') {
      try {
        const fs = require('fs');
        const path = require('path');
        const exampleFile = path.join(__dirname, 'example_handhistory_pokerstars.txt');
        if (fs.existsSync(exampleFile)) {
          data.settings.preflopSpot = fs.readFileSync(exampleFile, 'utf8');
          console.log('📄 Загружен пример hand history из файла');
        }
      } catch (error) {
        console.log('⚠️ Не удалось загрузить пример hand history:', error.message);
      }
    }
    
    // Проверить что диапазоны не пустые
    if (data.settings.playerRanges) {
      const p1Weights = data.settings.playerRanges.player1?.handWeights || {};
      const p2Weights = data.settings.playerRanges.player2?.handWeights || {};
      console.log(`📊 Player 1: ${Object.keys(p1Weights).length} рук выбрано`);
      console.log(`📊 Player 2: ${Object.keys(p2Weights).length} рук выбрано`);
      
      if (Object.keys(p1Weights).length > 0) {
        const hands = Object.keys(p1Weights);
        const weights = Object.values(p1Weights);
        console.log(`🎯 Примеры рук Player 1: ${hands.slice(0, 3).map((hand, i) => `${hand}(${weights[i]}%)`).join(', ')}`);
      }
      if (Object.keys(p2Weights).length > 0) {
        const hands = Object.keys(p2Weights);
        const weights = Object.values(p2Weights);
        console.log(`🎯 Примеры рук Player 2: ${hands.slice(0, 3).map((hand, i) => `${hand}(${weights[i]}%)`).join(', ')}`);
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
    
    console.log(`Сессия создана: ${sessionId}`);
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
    
    // Уведомить всех в сессии - отправить персональную информацию каждому игроку
    session.players.forEach((player, playerId) => {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.emit('player-joined', {
          userId,
          playerName,
          sessionInfo: session.getSessionInfo(playerId)
        });
      }
    });
    
    socket.emit('session-joined', {
      sessionId,
      userId,
      sessionInfo: session.getSessionInfo(userId)
    });
    
    console.log(`Игрок присоединился к сессии ${sessionId}`);
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
      // Отправить персональную информацию каждому игроку
      session.players.forEach((player, playerId) => {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('game-started', {
            sessionInfo: session.getSessionInfo(playerId)
          });
        }
      });
      console.log(`Игра начата в сессии ${userData.sessionId}`);
    } else {
      socket.emit('error', { message: 'Недостаточно игроков для начала игры' });
    }
  });

  // Игровое действие
  socket.on('player-action', (data) => {
    console.log('🎲 Получено действие игрока:', data);
    console.log('🎯 Ищем стол с tableId:', data.tableId, 'тип:', typeof data.tableId);
    
    const userData = activeUsers.get(socket.id);
    if (!userData) {
      console.error('❌ Пользователь не найден');
      return;
    }
    
    const session = activeSessions.get(userData.sessionId);
    if (!session) {
      console.error('❌ Сессия не найдена');
      return;
    }
    
    console.log('📊 Доступные столы в сессии:', session.tables.map(t => ({ tableId: t.tableId, type: typeof t.tableId })));
    
    // Найти конкретный стол по tableId из запроса
    // Приведение типов для корректного сравнения
    const targetTableId = parseInt(data.tableId) || data.tableId;
    const table = session.tables.find(t => t.tableId == targetTableId);
    
    if (!table) {
      console.error('❌ Стол не найден:', data.tableId);
      console.error('💡 Попытка найти любой стол с игроком...');
      
      // Резервный поиск - найти любой стол, где есть этот игрок
      const fallbackTable = session.tables.find(t => t.players.has(userData.userId));
      if (fallbackTable) {
        console.log('✅ Найден резервный стол:', fallbackTable.tableId);
        console.log('✅ Обработка действия для резервного стола', fallbackTable.tableId, ':', data.action);
        
        // Запомнить текущую улицу перед действием для детектирования изменений
        const previousStreet = fallbackTable.street;
        const previousPot = fallbackTable.pot;
        
        const success = fallbackTable.addAction(userData.userId, data.action, data.amount);
        
        if (success) {
          console.log('✅ Действие успешно обработано');
          
          // Проверить изменилась ли улица или завершилась ли раздача
          const streetChanged = fallbackTable.street !== previousStreet;
          const handCompleted = fallbackTable.pot === 0 && previousPot > 0;
          
          if (streetChanged) {
            console.log(`🔄 Улица изменилась: ${previousStreet} → ${fallbackTable.street}`);
          }
          
          if (handCompleted) {
            console.log('🏁 Раздача завершена');
          }
          
          // Отправить обновление столов каждому игроку с его персональной информацией
          session.players.forEach((player, playerId) => {
            if (fallbackTable.players.has(playerId)) {
              const playerSocket = io.sockets.sockets.get(player.socketId);
              if (playerSocket) {
                playerSocket.emit('action-processed', {
                  tableId: fallbackTable.tableId,
                  action: data,
                  tableInfo: fallbackTable.getTableInfo(playerId),
                  streetChanged: streetChanged,
                  previousStreet: streetChanged ? previousStreet : undefined,
                  handCompleted: handCompleted
                });
              }
            }
          });
        } else {
          console.error('❌ Не удалось обработать действие');
          socket.emit('error', { message: 'Не удалось выполнить действие' });
        }
        return;
      }
      
      socket.emit('error', { message: `Стол ${data.tableId} не найден` });
      return;
    }
    
    // Проверить что игрок действительно за этим столом
    if (!table.players.has(userData.userId)) {
      console.error('❌ Игрок не за данным столом:', userData.userId, data.tableId);
      socket.emit('error', { message: 'Вы не играете за данным столом' });
      return;
    }
    
    console.log('✅ Обработка действия для стола', data.tableId, ':', data.action);
    
    // Запомнить текущую улицу перед действием для детектирования изменений
    const previousStreet = table.street;
    const previousPot = table.pot;
    
    const success = table.addAction(userData.userId, data.action, data.amount);
    
    if (success) {
      console.log('✅ Действие успешно обработано');
      
      // Проверить изменилась ли улица или завершилась ли раздача
      const streetChanged = table.street !== previousStreet;
      const handCompleted = table.pot === 0 && previousPot > 0;
      
      if (streetChanged) {
        console.log(`🔄 Улица изменилась: ${previousStreet} → ${table.street}`);
      }
      
      if (handCompleted) {
        console.log('🏁 Раздача завершена');
      }
      
      // Отправить обновление столов каждому игроку с его персональной информацией
      session.players.forEach((player, playerId) => {
        if (table.players.has(playerId)) {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            playerSocket.emit('action-processed', {
              tableId: table.tableId,
              action: data,
              tableInfo: table.getTableInfo(playerId),
              streetChanged: streetChanged,
              previousStreet: streetChanged ? previousStreet : undefined,
              handCompleted: handCompleted
            });
          }
        }
      });
    } else {
      console.error('❌ Не удалось обработать действие');
      socket.emit('error', { message: 'Не удалось выполнить действие' });
    }
  });

  // Следующая улица
  socket.on('next-street', (data) => {
    const userData = activeUsers.get(socket.id);
    if (!userData) return;
    
    const session = activeSessions.get(userData.sessionId);
    if (!session) return;
    
    const table = session.tables.find(t => t.tableId === data.tableId);
    if (!table) return;
    
    if (data.street === 'turn') {
      table.dealTurn();
    } else if (data.street === 'river') {
      table.dealRiver();
    }
    
    // Отправить обновление улицы каждому игроку с его персональной информацией
    session.players.forEach((player, playerId) => {
      if (table.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('street-changed', {
            tableId: table.tableId,
            street: table.street,
            tableInfo: table.getTableInfo(playerId)
          });
        }
      }
    });
  });

  // Экспорт HandHistory
  socket.on('export-hand-history', (data) => {
    const userData = activeUsers.get(socket.id);
    if (!userData) return;
    
    const session = activeSessions.get(userData.sessionId);
    if (!session) return;
    
    const table = session.tables.find(t => t.tableId === data.tableId);
    if (!table) return;
    
    const handHistory = table.exportHandHistory();
    if (handHistory) {
      // Записать HandHistory в файл
      const fileWritten = table.writeHandHistoryToFile();
      
      socket.emit('hand-history-exported', {
        tableId: table.tableId,
        handHistory: handHistory,
        fileWritten: fileWritten,
        fileName: handHistory.fileName
      });
      
      console.log(`📊 HandHistory экспортирована для стола ${table.tableId}: ${handHistory.totalHands} раздач`);
    } else {
      socket.emit('hand-history-exported', {
        tableId: table.tableId,
        handHistory: null,
        fileWritten: false,
        error: 'Нет HandHistory для экспорта'
      });
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
    const success = table.requestNewHand();
    
    if (success) {
      console.log(`✅ Новая раздача начата на столе ${table.tableId}`);
      
      // Отправить обновление всем игрокам
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

  // Отключение
  socket.on('disconnect', () => {
    const userData = activeUsers.get(socket.id);
    if (userData) {
      const session = activeSessions.get(userData.sessionId);
      if (session) {
        session.players.delete(userData.userId);
        
        // Уведомить остальных игроков
        session.players.forEach((player, playerId) => {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket && playerId !== userData.userId) {
            playerSocket.emit('player-disconnected', {
              userId: userData.userId,
              sessionInfo: session.getSessionInfo(playerId)
            });
          }
        });
        
        // 💾 Записать HandHistory перед удалением сессии
        if (session.players.size === 0) {
          console.log(`💾 Записываем HandHistory перед удалением сессии ${userData.sessionId}...`);
          const results = session.writeAllHandHistories();
          
          activeSessions.delete(userData.sessionId);
          console.log(`Сессия ${userData.sessionId} удалена`);
          
          // Вывести итоговую статистику
          const totalFiles = results.filter(r => r.success).length;
          const totalHands = results.reduce((sum, r) => sum + r.handsCount, 0);
          console.log(`📊 Итоговая статистика сессии ${userData.sessionId}: ${totalHands} раздач в ${totalFiles} файлах`);
        }
      }
      activeUsers.delete(socket.id);
    }
    console.log('Отключение:', socket.id);
  });
});

// ===== HTTP МАРШРУТЫ =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/handhistory-manager.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'handhistory-manager.html'));
});

// Health check endpoint для Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    activeSessions: activeSessions.size,
    activeUsers: activeUsers.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    activeSessions: activeSessions.size,
    activeUsers: activeUsers.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.values()).map(session => ({
    sessionId: session.sessionId,
    playersCount: session.players.size,
    status: session.status,
    tablesCount: session.tables.length
  }));
  
  res.json({ sessions });
});

// 📁 Новые роуты для HandHistory
app.get('/api/handhistory', (req, res) => {
  const handhistoryDir = path.join(__dirname, 'handhistory');
  
  if (!fs.existsSync(handhistoryDir)) {
    return res.json({ files: [] });
  }
  
  try {
    const files = fs.readdirSync(handhistoryDir)
      .filter(file => file.endsWith('.txt'))
      .map(file => {
        const filePath = path.join(handhistoryDir, file);
        const stats = fs.statSync(filePath);
        
        // Парсинг информации из имени файла
        const fileInfo = file.match(/hand_(.+)-(\d+)-(\d+)_table_(\d+)\.txt/);
        
        return {
          filename: file,
          sessionId: fileInfo ? fileInfo[1] : 'Unknown',
          tableId: fileInfo ? parseInt(fileInfo[4]) : 0,
          handsCount: fileInfo ? parseInt(fileInfo[3]) : 0,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          downloadUrl: `/api/handhistory/download/${file}`
        };
      })
      .sort((a, b) => b.modified - a.modified); // Сортировка по дате
    
    res.json({ files });
  } catch (error) {
    console.error('Ошибка чтения папки handhistory:', error);
    res.status(500).json({ error: 'Ошибка чтения файлов HandHistory' });
  }
});

app.get('/api/handhistory/download/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Проверка безопасности - только .txt файлы
  if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Недопустимое имя файла' });
  }
  
  const filePath = path.join(__dirname, 'handhistory', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл не найден' });
  }
  
  try {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Ошибка отправки файла:', error);
    res.status(500).json({ error: 'Ошибка скачивания файла' });
  }
});

app.get('/api/handhistory/view/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Проверка безопасности - только .txt файлы
  if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Недопустимое имя файла' });
  }
  
  const filePath = path.join(__dirname, 'handhistory', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл не найден' });
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (error) {
    console.error('Ошибка чтения файла:', error);
    res.status(500).json({ error: 'Ошибка чтения файла' });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Доступен по адресу: http://localhost:${PORT}`);
  console.log(`📊 Railway deployment ready!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM получен, завершение работы...');
  server.close(() => {
    console.log('Сервер остановлен');
  });
});

module.exports = app; 
