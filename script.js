// ===== ОСНОВНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ =====

// Глобальный трекер обработчиков событий для предотвращения дублирования
window.eventHandlersTracker = window.eventHandlersTracker || {
  globalClickHandlers: new Set(),
  renderTracker: new Set(),
  addGlobalClickHandler: function(handlerId, handler) {
    if (!this.globalClickHandlers.has(handlerId)) {
      this.globalClickHandlers.add(handlerId);
      document.addEventListener('click', handler);
      console.log(`✅ Добавлен глобальный обработчик клика: ${handlerId}`);
    } else {
      console.log(`⚠️ Глобальный обработчик клика уже существует: ${handlerId}`);
    }
  },
  checkRenderStatus: function(containerId, itemsCount) {
    const renderKey = `${containerId}-${itemsCount}`;
    if (this.renderTracker.has(renderKey)) {
      console.log(`⚠️ Рендеринг уже выполнен для ${containerId} с ${itemsCount} элементами, пропускаем`);
      return false; // Уже рендерился
    }
    this.renderTracker.add(renderKey);
    return true; // Можно рендерить
  },
  clearRenderTracker: function() {
    this.renderTracker.clear();
    console.log('🧹 Очищен трекер рендеринга');
  }
};

const state = {
  settings: {
    tablesCount: 1,
    rakePercent: 5,
    rakeDollar: 1.00,
    preflopSpot: '',
    boardSettings: {
      flop: {
        specificCards: [null, null, null],
        suits: 'any',
        pairing: 'any',
        ranks: {
          high: ['any'],
          middle: ['any'],
          low: ['any']
        }
      },
      turn: {
        suits: 'any',
        pairing: 'any',
        ranks: ['any']
      },
      river: {
        suits: 'any',
        pairing: 'any',
        ranks: ['any']
      }
    },
    playerRanges: {
      player1: {
        currentWeight: 0, // Текущий вес для новых рук (0-100%)
        handWeights: {} // Объект где ключ - рука, значение - вес в процентах
      },
      player2: {
        currentWeight: 0, // Текущий вес для новых рук (0-100%)
        handWeights: {} // Объект где ключ - рука, значение - вес в процентах
      },
      positions: {
        player1: 'BTN',
        player2: 'BB'
      }
    }
  },
  ui: {
    settingsPanelOpen: false,
    currentStreet: 'flop',
    isSessionActive: false,
    dragSelection: false,
    dragStartCell: null
  }
};

// Глобальные переменные для совместимости с мультиплеером
let currentGameSettings = {
  tablesCount: 1,
  rakePercent: 5,
  rakeDollar: 1,
  preflopSpot: '',
  boardSettings: {
    flop: {
      specificCards: [null, null, null],
      suits: 'any',
      pairing: 'any',
      ranks: {
        high: ['any'],
        middle: ['any'],
        low: ['any']
      }
    },
    turn: {
      suits: 'any',
      pairing: 'any',
      ranks: ['any']
    },
    river: {
      suits: 'any',
      pairing: 'any',
      ranks: ['any']
    }
  },
  playerRanges: {
    player1: {
      currentWeight: 0,
      handWeights: {}
    },
    player2: {
      currentWeight: 0,
      handWeights: {}
    },
            positions: {
          player1: 'BTN',
          player2: 'BB'
        }
  }
};

// ===== ОСНОВНЫЕ КОНСТАНТЫ =====
const CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

// Генерация всех возможных рук
const ALL_HANDS = [];
for (let i = 0; i < CARD_RANKS.length; i++) {
  for (let j = i; j < CARD_RANKS.length; j++) {
    if (i === j) {
      // Пары
      ALL_HANDS.push(CARD_RANKS[i] + CARD_RANKS[j]);
    } else {
      // Suited и offsuit
      ALL_HANDS.push(CARD_RANKS[i] + CARD_RANKS[j] + 's');
      ALL_HANDS.push(CARD_RANKS[i] + CARD_RANKS[j] + 'o');
    }
  }
}

// Ранжирование рук для процентов
const HAND_RANKINGS = [
  'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
  'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
  'AKo', 'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
  'AQo', 'KQo', 'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
  'AJo', 'KJo', 'QJo', 'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s', 'J3s', 'J2s',
  'ATo', 'KTo', 'QTo', 'JTo', 'T9s', 'T8s', 'T7s', 'T6s', 'T5s', 'T4s', 'T3s', 'T2s',
  'A9o', 'K9o', 'Q9o', 'J9o', 'T9o', '98s', '97s', '96s', '95s', '94s', '93s', '92s',
  'A8o', 'K8o', 'Q8o', 'J8o', 'T8o', '98o', '87s', '86s', '85s', '84s', '83s', '82s',
  'A7o', 'K7o', 'Q7o', 'J7o', 'T7o', '97o', '87o', '76s', '75s', '74s', '73s', '72s',
  'A6o', 'K6o', 'Q6o', 'J6o', 'T6o', '96o', '86o', '76o', '65s', '64s', '63s', '62s',
  'A5o', 'K5o', 'Q5o', 'J5o', 'T5o', '95o', '85o', '75o', '65o', '54s', '53s', '52s',
  'A4o', 'K4o', 'Q4o', 'J4o', 'T4o', '94o', '84o', '74o', '64o', '54o', '43s', '42s',
  'A3o', 'K3o', 'Q3o', 'J3o', 'T3o', '93o', '83o', '73o', '63o', '53o', '43o', '32s',
  'A2o', 'K2o', 'Q2o', 'J2o', 'T2o', '92o', '82o', '72o', '62o', '52o', '42o', '32o'
];

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
  console.log('🎮 Poker Simulator загружен');
  
  // Инициализация матриц рук
  generateHandMatrix('player1-matrix');
  generateHandMatrix('player2-matrix');
  
  // Инициализация ползунков
  updateRangeSliders();
  
  // Инициализация обработчиков событий
  initializeEventListeners();
  
  // Инициализация кнопок позиций
  initializePositionButtons();
  
  // Добавление стилей столов
  addTableStyles();
  
  // Инициализация preflop selector
  initializePreflopSelector();
  
  // Инициализация range селекторов
  initializeRangeSelector('range-select-player1');
  initializeRangeSelector('range-select-player2');
  
  // Инициализация системы анимаций очереди хода
  initializePlayerTurnAnimations();
  
  // Инициализация системы отслеживания раздач в одиночном режиме
  // Задержка для корректной инициализации
  setTimeout(() => {
    initializeSinglePlayerHandTracking();
  }, 1000);
  
  // Загрузка списков файлов
  loadPreflopSpotsList();
});

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function initializeEventListeners() {
  // Кнопка закрытия панели настроек
  const closeSettingsBtn = document.getElementById('close-settings');
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', closeSettingsPanel);
  }

  // Кнопки сессии
  const startSessionBtn = document.getElementById('start-session');
  const joinSessionBtn = document.getElementById('join-session');
  
  if (startSessionBtn) {
    startSessionBtn.addEventListener('click', startSession);
  }
  if (joinSessionBtn) {
    joinSessionBtn.addEventListener('click', joinSession);
  }



  // Настройки столов
  document.querySelectorAll('.table-btn').forEach(btn => {
    btn.addEventListener('click', (e) => selectTablesCount(e.target.dataset.tables));
  });

  // Настройки рейка
  const rakePercent = document.getElementById('rake-percent');
  const rakeDollar = document.getElementById('rake-dollar');
  
  if (rakePercent) {
    rakePercent.addEventListener('input', updateRakePercent);
  }
  if (rakeDollar) {
    rakeDollar.addEventListener('input', updateRakeDollar);
  }

  // Вкладки улиц
  document.querySelectorAll('.street-tab').forEach(tab => {
    tab.addEventListener('click', (e) => switchStreet(e.target.dataset.street));
  });

  // Настройки мастей
  document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => selectSuit(e.target.dataset.suit));
  });

  // Настройки спаренности
  document.querySelectorAll('.pair-btn').forEach(btn => {
    btn.addEventListener('click', (e) => selectPairing(e.target.dataset.pair));
  });

  // Настройки рангов
  document.querySelectorAll('.rank-btn').forEach(btn => {
    btn.addEventListener('click', handleRankSelection);
    btn.addEventListener('mousedown', startRankDrag);
    btn.addEventListener('mouseenter', handleRankDrag);
    btn.addEventListener('mouseup', endRankDrag);
  });

  // Слайдеры диапазонов
  const player1Range = document.getElementById('player1-range');
  const player2Range = document.getElementById('player2-range');
  
  if (player1Range) {
    player1Range.addEventListener('input', (e) => updatePlayerRange(1, e.target.value));
  }
  if (player2Range) {
    player2Range.addEventListener('input', (e) => updatePlayerRange(2, e.target.value));
  }

  // Обработчики для кнопок вставки из буфера
  document.querySelectorAll('.paste-btn').forEach((btn, index) => {
    btn.addEventListener('click', async function() {
      const playerNum = index + 1; // Первая кнопка для игрока 1, вторая для игрока 2
      await pasteHandRangeFromClipboard(playerNum);
    });
  });

  // Селекторы карт
  document.querySelectorAll('.card-placeholder').forEach(placeholder => {
    placeholder.addEventListener('click', openCardModal);
  });

  // Модальные окна
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  // Закрытие модального окна по клику вне его
  const cardModal = document.getElementById('card-modal');
  if (cardModal) {
    cardModal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeModal();
      }
    });
  }

  // Глобальные события для drag selection
  document.addEventListener('mouseup', () => {
    state.ui.dragSelection = false;
    state.ui.dragStartCell = null;
  });
}

// ===== УПРАВЛЕНИЕ ПАНЕЛЬЮ НАСТРОЕК =====
function closeSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const tablesArea = document.getElementById('tables-area');
  
  state.ui.settingsPanelOpen = false;
  panel.classList.remove('active');
  tablesArea.classList.remove('with-sidebar');
}

// ===== УПРАВЛЕНИЕ СЕССИЕЙ =====
function startSession() {
  if (!validateSettings()) {
    alert('Пожалуйста, проверьте настройки перед запуском сессии');
    return;
  }

  // Создать мультиплеерную сессию
  const playerName = prompt('Введите ваше имя:') || 'Player 1';
  if (playerName && multiplayerClient) {
    multiplayerClient.createSession(playerName);
  } else {
    // Фоллбек для локальной сессии если мультиплеер недоступен
    state.ui.isSessionActive = true;
    closeSettingsPanel();
    generateTables();
    showNotification('Локальная сессия создана!', 'success');
  }
}

function joinSession() {
  // Показать диалог присоединения к мультиплеерной сессии
  const sessionCode = prompt('Введите код сессии для подключения:');
  if (sessionCode) {
    const playerName = prompt('Введите ваше имя:') || 'Player 2';
    if (multiplayerClient) {
      multiplayerClient.joinSession(sessionCode, playerName);
    } else {
      showNotification('Мультиплеер недоступен', 'error');
    }
  }
}

function generateSessionCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function validateSettings() {
  // Проверка основных настроек
  return state.settings.tablesCount > 0 && 
         state.settings.rakePercent >= 0 && 
         state.settings.rakeDollar >= 0;
}

// ===== РАБОТА С ПРЕФЛОП СПОТАМИ =====

async function loadPreflopSpot(filePath) {
  try {
    const response = await fetch(`/api/preflopspot/${filePath}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const content = await response.text();
    state.settings.preflopSpot = content;
    state.settings.preflopFile = filePath; // Добавляем путь к файлу для сервера
      
    const preview = document.getElementById('preflop-content');
    preview.textContent = content.substring(0, 200) + (content.length > 200 ? '...' : '');
    preview.classList.add('show');
    
    const displayName = filePath.split('/').pop().replace('.txt', '').replace(/_/g, ' ');
    showNotification(`Префлоп спот "${displayName}" загружен`, 'success');
    syncGameSettings();
  } catch (error) {
    console.error('Ошибка загрузки префлоп спота:', error);
    showNotification('Ошибка загрузки префлоп спота', 'error');
  }
}

// ===== РАБОТА СО СТАНДАРТНЫМИ РЕЙНДЖАМИ =====

async function loadRangePreset(filePath, playerNum = 1) {
  // Используем переданный номер игрока (по умолчанию 1)
  const targetPlayer = playerNum;
  
  console.log(`🎯 Загрузка рейнджа для игрока ${targetPlayer} из файла: ${filePath}`);
  console.log(`🎯 State.settings существует:`, !!state.settings);
  console.log(`🎯 PlayerRanges существует:`, !!state.settings?.playerRanges);

  try {
    const response = await fetch(`/api/range/${filePath}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const content = await response.text();
    const player = targetPlayer === 1 ? 'player1' : 'player2';
    
    console.log(`📋 Загрузка рейнджа для ${player}:`);
    console.log(`📋 Содержимое файла:`, content);
    console.log(`📋 Текущие настройки игрока:`, state.settings.playerRanges[player]);
    
    // Парсить рейндж и применить к игроку
    const hands = parseHandRange(content);
    
    if (hands.size > 0) {
      console.log(`🎯 Успешно распарсено ${hands.size} рук из preset`);
      
      // Очистить текущий выбор
      state.settings.playerRanges[player].handWeights = {};
      
      // Добавить новые руки с их частотами
      hands.forEach((frequency, hand) => {
        // Конвертируем частоту в проценты (0.25 → 25)
        const percentage = Math.round(frequency * 100);
        state.settings.playerRanges[player].handWeights[hand] = percentage;
        console.log(`  ➕ ${hand}: ${frequency} → ${percentage}%`);
      });
      
      // Обновить отображение
      updateHandMatrixDisplay(player);
      updateRangeStatistics(player);
      
      console.log(`✅ Рейндж для ${player} обновлен из preset "${filePath}"`);
      
      // Показать уведомление
      const displayName = filePath.split('/').pop().replace('.txt', '').replace(/_/g, ' ');
      showNotification(
        `Рейндж для игрока ${targetPlayer} загружен из "${displayName}". Загружено ${hands.size} рук.`,
        'success'
      );
    } else {
      showNotification('Не удалось распарсить рейндж', 'error');
    }
    
    // Закрыть модальное окно (только если вызвано через старый способ)
    if (!playerNum && typeof closeRangePresetsDialog === 'function') {
      closeRangePresetsDialog();
    }
    
  } catch (error) {
    console.error('Ошибка загрузки рейнджа:', error);
    showNotification('Ошибка загрузки рейнджа', 'error');
  }
}

// ===== НАСТРОЙКИ СТОЛОВ =====
function selectTablesCount(count) {
  state.settings.tablesCount = parseInt(count);
  
  // Обновить активную кнопку
  document.querySelectorAll('.table-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tables="${count}"]`).classList.add('active');
  
  // Синхронизировать настройки
  syncGameSettings();
}

function updateRakePercent(event) {
  state.settings.rakePercent = parseFloat(event.target.value);
  syncGameSettings();
}

function updateRakeDollar(event) {
  state.settings.rakeDollar = parseFloat(event.target.value);
  syncGameSettings();
}

// ===== УПРАВЛЕНИЕ УЛИЦАМИ =====
function switchStreet(street) {
  state.ui.currentStreet = street;
  
  // Обновить активную вкладку
  document.querySelectorAll('.street-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-street="${street}"]`).classList.add('active');
  
  // Показать соответствующие настройки
  document.querySelectorAll('.street-settings').forEach(settings => {
    settings.classList.remove('active');
  });
  document.getElementById(`${street}-settings`).classList.add('active');
}

// ===== НАСТРОЙКИ КАРТ =====
function selectSuit(suit) {
  state.settings.boardSettings[state.ui.currentStreet].suits = suit;
  
  // Обновить активную кнопку
  document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-suit="${suit}"]`).classList.add('active');
}

function selectPairing(pairing) {
  state.settings.boardSettings[state.ui.currentStreet].pairing = pairing;
  
  // Обновить активную кнопку
  document.querySelectorAll('.pair-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-pair="${pairing}"]`).classList.add('active');
}

// ===== НАСТРОЙКИ РАНГОВ =====
function handleRankSelection(event) {
  const btn = event.target;
  const rank = btn.dataset.rank;
  const rankType = btn.closest('.rank-buttons').dataset.rankType;
  
  console.log(`🃏 Выбор ранга: ${rank} для типа ${rankType} на улице ${state.ui.currentStreet}`);
  
  if (rank === 'any') {
    // Сбросить все выборы и выбрать "любой"
    resetRankButtons(btn.closest('.rank-buttons'));
    btn.classList.add('active');
    state.settings.boardSettings[state.ui.currentStreet].ranks[rankType] = ['any'];
    console.log(`✅ Установлен "любой" ранг для ${rankType}`);
  } else {
    // Убрать "любой" если он был активен
    const anyBtn = btn.closest('.rank-buttons').querySelector('[data-rank="any"]');
    anyBtn.classList.remove('active');
    
    // Переключить выбранный ранг
    btn.classList.toggle('active');
    
    // Обновить состояние
    const currentRanks = state.settings.boardSettings[state.ui.currentStreet].ranks[rankType];
    const anyIndex = currentRanks.indexOf('any');
    if (anyIndex > -1) {
      currentRanks.splice(anyIndex, 1);
    }
    
    if (btn.classList.contains('active')) {
      if (!currentRanks.includes(rank)) {
        currentRanks.push(rank);
      }
      console.log(`✅ Добавлен ранг ${rank} для ${rankType}`);
    } else {
      const index = currentRanks.indexOf(rank);
      if (index > -1) {
        currentRanks.splice(index, 1);
      }
      console.log(`❌ Удален ранг ${rank} для ${rankType}`);
    }
    
    // Если ничего не выбрано, вернуть "любой"
    if (currentRanks.length === 0) {
      anyBtn.classList.add('active');
      state.settings.boardSettings[state.ui.currentStreet].ranks[rankType] = ['any'];
      console.log(`🔄 Возвращен "любой" ранг для ${rankType} (ничего не выбрано)`);
    }
  }
  
  console.log(`🎯 Текущие ранги для ${rankType}:`, state.settings.boardSettings[state.ui.currentStreet].ranks[rankType]);
  
  // Синхронизировать настройки после изменения
  syncGameSettings();
}

function startRankDrag(event) {
  if (event.which === 1) { // Левая кнопка мыши
    state.ui.dragSelection = true;
    state.ui.dragStartCell = event.target;
  }
}

function handleRankDrag(event) {
  if (state.ui.dragSelection && event.target.classList.contains('rank-btn')) {
    // Эмулировать клик для drag selection
    event.target.click();
  }
}

function endRankDrag() {
  state.ui.dragSelection = false;
  state.ui.dragStartCell = null;
}

function resetRankButtons(container) {
  container.querySelectorAll('.rank-btn').forEach(btn => {
    btn.classList.remove('active');
  });
}

// ===== ДИАПАЗОНЫ РУК =====
function generateHandMatrices() {
  generateHandMatrix('player1-matrix');
  generateHandMatrix('player2-matrix');
}

function generateHandMatrix(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  
  // Создать сетку 13x13 для всех рук
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const cell = document.createElement('div');
      cell.className = 'hand-cell';
      
      let hand;
      if (i === j) {
        // Пары
        hand = CARD_RANKS[i] + CARD_RANKS[j];
        cell.classList.add('pair');
      } else if (i < j) {
        // Suited
        hand = CARD_RANKS[i] + CARD_RANKS[j] + 's';
        cell.classList.add('suited');
      } else {
        // Offsuit
        hand = CARD_RANKS[j] + CARD_RANKS[i] + 'o';
      }
      
      cell.textContent = hand;
      cell.dataset.hand = hand;
      
      // Добавить обработчики событий
      cell.addEventListener('click', () => toggleHandSelection(cell, containerId));
      cell.addEventListener('mousedown', startHandDrag);
      cell.addEventListener('mouseenter', (e) => handleHandDrag(e, containerId));
      cell.addEventListener('mouseup', endHandDrag);
      
      container.appendChild(cell);
    }
  }
}

function toggleHandSelection(cell, containerId) {
  const hand = cell.dataset.hand;
  const player = containerId.includes('player1') ? 'player1' : 'player2';
  const currentWeight = state.settings.playerRanges[player].currentWeight;
  
  // Если рука уже выбрана, убрать её
  if (state.settings.playerRanges[player].handWeights[hand]) {
    delete state.settings.playerRanges[player].handWeights[hand];
  } else {
    // Добавить руку с текущим весом или 100% если вес не установлен
    const weight = currentWeight > 0 ? currentWeight : 100;
    state.settings.playerRanges[player].handWeights[hand] = weight;
  }
  
  // Обновить отображение матрицы (без анимации увеличения)
  updateHandMatrixDisplay(player);
  updateRangeStatistics(player);
}

function updatePlayerRange(playerNum, percentage) {
  const player = `player${playerNum}`;
  state.settings.playerRanges[player].currentWeight = parseInt(percentage);
  
  // Обновить отображение процента в слайдере
  const valueSpan = document.querySelector(`#player${playerNum}-range`).nextElementSibling;
  valueSpan.textContent = percentage + '%';
}

function updateHandMatrixDisplay(player) {
  const playerRange = state.settings.playerRanges[player];
  if (!playerRange) {
    console.warn(`⚠️ Данные игрока ${player} не найдены`);
    return;
  }
  
  const containerId = player === 'player1' ? 'player1-matrix' : 'player2-matrix';
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`⚠️ Контейнер ${containerId} не найден`);
    return;
  }
  
  console.log(`🎨 Обновление отображения матрицы для ${player}:`);
  console.log(`🎨 Веса рук:`, playerRange.handWeights);
  console.log(`🎨 Количество рук с весами: ${Object.keys(playerRange.handWeights).length}`);
  
  // Очистить все выборы
  const cells = container.querySelectorAll('.hand-cell');
  cells.forEach(cell => {
    cell.classList.remove('selected');
    cell.style.backgroundColor = '';
    cell.style.opacity = '';
    
    // Удалить существующий элемент частоты
    const existingFreq = cell.querySelector('.hand-frequency');
    if (existingFreq) {
      existingFreq.remove();
    }
    
    // Восстановить оригинальный текст руки
    const hand = cell.dataset.hand;
    if (hand) {
      cell.textContent = hand;
    }
  });
  
  let appliedCount = 0;
  let notFoundCount = 0;
  const notFoundHands = [];
  
  // Создаем карту всех доступных ячеек для лучшего поиска
  const cellsMap = new Map();
  cells.forEach(cell => {
    const hand = cell.dataset.hand;
    if (hand) {
      // Добавляем различные варианты написания для поиска
      cellsMap.set(hand.toLowerCase(), cell);
      cellsMap.set(hand.toUpperCase(), cell);
      cellsMap.set(hand, cell);
    }
  });
  
  console.log(`🔍 Доступно ячеек в матрице: ${cellsMap.size / 3} уникальных рук`);
  console.log(`🔍 Примеры доступных рук:`, Array.from(new Set(Array.from(cellsMap.keys()).map(k => k.toLowerCase()))).slice(0, 10));
  
  // Применить выборы с частотами
  Object.entries(playerRange.handWeights).forEach(([hand, weight]) => {
    console.log(`  🎯 Ищем ячейку для руки: "${hand}" с весом ${weight}`);
    
    // Попробуем найти ячейку с различными вариантами написания
    let cell = cellsMap.get(hand) || 
               cellsMap.get(hand.toLowerCase()) || 
               cellsMap.get(hand.toUpperCase());
    
    // Если все еще не найдена, попробуем другие варианты
    if (!cell) {
      // Попробуем поиск по всем ячейкам напрямую
      for (const c of cells) {
        const cellHand = c.dataset.hand;
        if (cellHand && (
          cellHand === hand ||
          cellHand.toLowerCase() === hand.toLowerCase() ||
          cellHand.toUpperCase() === hand.toUpperCase()
        )) {
          cell = c;
          break;
        }
      }
    }
    
    if (cell) {
      // Вес может быть от 0 до 100 (проценты) или от 0 до 1 (доли)
      let normalizedWeight = weight;
      
      // Если вес больше 1, считаем что это проценты
      if (normalizedWeight > 1) {
        normalizedWeight = Math.max(0, Math.min(100, normalizedWeight));
      } else {
        // Если вес от 0 до 1, конвертируем в проценты
        normalizedWeight = Math.round(normalizedWeight * 100);
      }
      
      if (normalizedWeight > 0) {
        cell.classList.add('selected');
        appliedCount++;
        
        // Установить прозрачность в зависимости от веса
        const opacity = normalizedWeight / 100;
        cell.style.backgroundColor = `rgba(255, 193, 7, ${opacity})`;
        
        console.log(`    ✅ Найдена ячейка для "${hand}" → "${cell.dataset.hand}", вес: ${normalizedWeight}%, прозрачность: ${opacity}`);
        
        if (normalizedWeight < 100) {
          // Добавить отображение частоты только если вес не 100%
          const freqElement = document.createElement('div');
          freqElement.className = 'hand-frequency';
          freqElement.style.cssText = `
            position: absolute;
            bottom: 2px;
            right: 2px;
            font-size: 8px;
            color: #333;
            background: rgba(255,255,255,0.8);
            padding: 1px 2px;
            border-radius: 2px;
            line-height: 1;
            pointer-events: none;
            z-index: 10;
          `;
          freqElement.textContent = `${normalizedWeight}%`;
          
          // Убедимся, что ячейка имеет position: relative
          cell.style.position = 'relative';
          cell.appendChild(freqElement);
        }
      }
    } else {
      notFoundCount++;
      notFoundHands.push(hand);
      console.warn(`    ❌ Не найдена ячейка для руки: "${hand}"`);
    }
  });
  
  console.log(`🎨 Матрица ${player} обновлена:`);
  console.log(`  ✅ Рук применено: ${appliedCount}`);
  console.log(`  ❌ Рук не найдено: ${notFoundCount}`);
  if (notFoundHands.length > 0) {
    console.log(`  🔍 Не найденные руки:`, notFoundHands);
  }
  
  // Обновляем статистику
  updateRangeStatistics(player);
}

function updateRangeStatistics(player) {
  const handWeights = state.settings.playerRanges[player].handWeights;
  const selectedCount = Object.keys(handWeights).length;
  
  const playerId = player === 'player1' ? '1' : '2';
  const valueSpan = document.querySelector(`#player${playerId}-range`).nextElementSibling;
  
  // Показать количество выбранных рук и их общий вес
  const totalWeight = Object.values(handWeights).reduce((sum, weight) => sum + weight, 0);
  const averageWeight = selectedCount > 0 ? Math.round(totalWeight / selectedCount) : 0;
  
  valueSpan.textContent = selectedCount > 0 
    ? `${selectedCount} рук (среднее: ${averageWeight}%)`
    : '0%';
}

function startHandDrag(event) {
  if (event.which === 1) {
    state.ui.dragSelection = true;
    state.ui.dragStartCell = event.target;
  }
}

function handleHandDrag(event, containerId) {
  if (state.ui.dragSelection) {
    toggleHandSelection(event.target, containerId);
  }
}

function endHandDrag() {
  state.ui.dragSelection = false;
  state.ui.dragStartCell = null;
}

function updateRangeSliders() {
  // Инициализация слайдеров с 0% по умолчанию
  updatePlayerRange(1, 0);
  updatePlayerRange(2, 0);
  updateRangeStatistics('player1');
  updateRangeStatistics('player2');
}

// ===== ВСТАВКА ИЗ БУФЕРА =====
async function pasteHandRangeFromClipboard(playerNum) {
  try {
    const text = await navigator.clipboard.readText();
    const player = playerNum === 1 ? 'player1' : 'player2';
    
    console.log(`📋 Вставка из буфера для ${player}:`);
    console.log(`📝 Текст из буфера: "${text}"`);
    
    // Парсинг текста и извлечение рук
    const hands = parseHandRange(text);
    
    if (hands.size > 0) {
      console.log(`🎯 Успешно распарсено ${hands.size} рук`);
      
      // Очистить текущий выбор
      state.settings.playerRanges[player].handWeights = {};
      
      // Добавить новые руки с их частотами
      hands.forEach((frequency, hand) => {
        // Конвертируем частоту в проценты (0.25 → 25)
        const percentage = Math.round(frequency * 100);
        state.settings.playerRanges[player].handWeights[hand] = percentage;
        console.log(`  ➕ ${hand}: ${frequency} → ${percentage}%`);
      });
      
      // Обновить отображение
      updateHandMatrixDisplay(player);
      updateRangeStatistics(player);
      
      console.log(`✅ Диапазон рук для ${player} обновлен из буфера`);
      console.log(`📊 Итоговые веса:`, state.settings.playerRanges[player].handWeights);
      
      // Показать уведомление
      showNotification(
        `Диапазон рук для игрока ${playerNum} обновлен из буфера. Загружено ${hands.size} рук.`,
        'success'
      );
    } else {
      console.warn('⚠️ Не удалось распарсить руки из буфера');
      showNotification(
        'Не удалось распарсить руки из буфера. Проверьте формат.',
        'warning'
      );
    }
  } catch (error) {
    console.error('❌ Ошибка при вставке из буфера:', error);
    showNotification(
      'Ошибка при вставке из буфера. Убедитесь, что браузер поддерживает чтение буфера обмена.',
      'error'
    );
  }
}

// Парсинг диапазона рук
function parseHandRange(text) {
  const hands = new Map(); // Используем Map для хранения рук с частотами
  
  try {
    // Убираем лишние пробелы и разбиваем по запятым
    const parts = text.trim().split(',');
    
    console.log('🎯 Парсинг строки:', text);
    console.log('🎯 Разделенные части:', parts);
    console.log(`🎯 Количество частей: ${parts.length}`);
    
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim();
      if (!part) continue;
      
      console.log(`🔍 Обработка части ${i + 1}: "${part}"`);
      
      // Проверяем есть ли частота (формат: AK:0.75)
      let frequency = 1.0; // По умолчанию 100%
      let handPart = part;
      
      if (part.includes(':')) {
        const splitResult = part.split(':');
        handPart = splitResult[0].trim();
        const freqStr = splitResult[1].trim();
        frequency = parseFloat(freqStr);
        
        console.log(`  📊 Найдена частота: рука="${handPart}", частота="${freqStr}" → ${frequency}`);
        
        if (isNaN(frequency) || frequency < 0 || frequency > 1) {
          console.warn(`  ⚠️ Некорректная частота "${freqStr}", использую 1.0`);
          frequency = 1.0;
        }
      } else {
        console.log(`  📊 Частота не указана, использую 1.0 (100%)`);
      }
      
      // Обрабатываем руку
      if (handPart.length >= 2) {
        const processedHands = processHandString(handPart, frequency);
        let addedCount = 0;
        
        // Добавляем все обработанные руки в Map
        processedHands.forEach((freq, hand) => {
          hands.set(hand, freq);
          addedCount++;
          console.log(`  ✅ Добавлена рука: ${hand} с частотой ${freq}`);
        });
        
        console.log(`  📈 Из "${handPart}" получено ${addedCount} рук`);
      } else {
        console.warn(`  ❌ Слишком короткая рука: "${handPart}"`);
      }
    }
    
    console.log('🎯 Распарсенные руки:', hands);
    console.log(`📊 Всего обработано рук: ${hands.size}`);
    console.log(`📊 Примеры рук:`, Array.from(hands.keys()).slice(0, 10));
    
    return hands;
  } catch (error) {
    console.error('❌ Ошибка парсинга диапазона рук:', error);
    return new Map();
  }
}

// Вспомогательная функция для обработки строки руки
function processHandString(handPart, frequency) {
  const result = new Map();
  
  console.log(`  🃏 Анализ руки: "${handPart}" с частотой ${frequency}`);
  
  // Нормализуем руку - убираем лишние пробелы и приводим к верхнему регистру
  const normalizedHand = handPart.trim().toUpperCase();
  
  if (!normalizedHand) {
    console.log(`    ❌ Пустая рука после нормализации`);
    return result;
  }
  
  console.log(`  🔄 Нормализованная рука: "${normalizedHand}"`);
  
  // Проверяем различные форматы рук
  if (normalizedHand.length === 2) {
    // Формат: AK, KQ, etc. (без указания s/o)
    const firstChar = normalizedHand[0];
    const secondChar = normalizedHand[1];
    
    // Проверяем что это валидные ранги карт
    if (CARD_RANKS.includes(firstChar) && CARD_RANKS.includes(secondChar)) {
      if (firstChar === secondChar) {
        // Пара (AA, KK, etc.) - сохраняем как есть в верхнем регистре
        result.set(normalizedHand, frequency);
        console.log(`    ✅ Пара: ${normalizedHand} → ${frequency}`);
      } else {
        // Рука без указания s/o - добавляем обе версии в правильном формате матрицы
        // В матрице: старшая карта первая + s/o в нижнем регистре
        const rank1Index = CARD_RANKS.indexOf(firstChar);
        const rank2Index = CARD_RANKS.indexOf(secondChar);
        
        let hand;
        if (rank1Index <= rank2Index) {
          // firstChar старше или равен secondChar
          hand = firstChar + secondChar;
        } else {
          // secondChar старше firstChar, меняем местами
          hand = secondChar + firstChar;
        }
        
        const suitedHand = hand + 's';
        const offsuitHand = hand + 'o';
        result.set(suitedHand, frequency);
        result.set(offsuitHand, frequency);
        console.log(`    ✅ Обе версии: ${suitedHand} и ${offsuitHand} → ${frequency}`);
      }
    } else {
      console.warn(`    ❌ Некорректные ранги карт: "${normalizedHand}"`);
    }
  } else if (normalizedHand.length === 3) {
    // Формат: AKs, AKo, etc.
    const firstChar = normalizedHand[0];
    const secondChar = normalizedHand[1];
    const suitChar = normalizedHand[2];
    
    // Проверяем что это валидные ранги карт и корректный суффикс
    if (CARD_RANKS.includes(firstChar) && CARD_RANKS.includes(secondChar) && (suitChar === 'S' || suitChar === 'O')) {
      if (firstChar === secondChar) {
        console.warn(`    ❌ Пара не может иметь суффикс s/o: "${normalizedHand}"`);
      } else {
        // Приводим к правильному формату матрицы: старшая карта первая + s/o в нижнем регистре
        const rank1Index = CARD_RANKS.indexOf(firstChar);
        const rank2Index = CARD_RANKS.indexOf(secondChar);
        
        let hand;
        if (rank1Index <= rank2Index) {
          // firstChar старше или равен secondChar
          hand = firstChar + secondChar;
        } else {
          // secondChar старше firstChar, меняем местами
          hand = secondChar + firstChar;
        }
        
        const correctedHand = hand + suitChar.toLowerCase();
        result.set(correctedHand, frequency);
        console.log(`    ✅ Специфичная рука: ${correctedHand} → ${frequency}`);
      }
    } else {
      console.warn(`    ❌ Некорректный формат руки: "${normalizedHand}"`);
    }
  } else {
    console.warn(`    ❌ Неподдерживаемая длина руки: "${normalizedHand}" (длина: ${normalizedHand.length})`);
  }
  
  console.log(`  📊 Результат обработки: ${result.size} рук`);
  if (result.size > 0) {
    result.forEach((freq, hand) => {
      console.log(`    → ${hand}: ${freq}`);
    });
  }
  
  return result;
}

// ===== МОДАЛЬНЫЕ ОКНА =====
function openCardModal(event) {
  const cardIndex = event.target.dataset.card;
  const modal = document.getElementById('card-modal');
  
  // Сохранить информацию о выбираемой карте
  modal.dataset.cardIndex = cardIndex;
  
  // Создать выбор карт
  generateCardPicker();
  
  // Показать модальное окно
  modal.classList.add('active');
}

function generateCardPicker() {
  const picker = document.querySelector('.card-picker');
  picker.innerHTML = '';
  
  CARD_RANKS.forEach(rank => {
    CARD_SUITS.forEach((suit, suitIndex) => {
      const card = document.createElement('div');
      card.className = `card-option ${SUIT_NAMES[suitIndex]}`;
      card.innerHTML = `<div>${rank}</div><div>${suit}</div>`;
      card.dataset.rank = rank;
      card.dataset.suit = suit;
      
      card.addEventListener('click', selectCard);
      
      picker.appendChild(card);
    });
  });
}

function selectCard(event) {
  const rank = event.currentTarget.dataset.rank;
  const suit = event.currentTarget.dataset.suit;
  const modal = document.getElementById('card-modal');
  const cardIndex = modal.dataset.cardIndex;
  
  // Обновить отображение выбранной карты
  const placeholder = document.querySelector(`[data-card="${cardIndex}"]`);
  placeholder.innerHTML = `<span>${rank}${suit}</span>`;
  placeholder.classList.add('selected');
  
  // Сохранить в состоянии
  const currentStreet = state.ui.currentStreet;
  state.settings.boardSettings[currentStreet].specificCards[cardIndex - 1] = { rank, suit };
  
  closeModal();
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('active');
  });
}

// ===== ГЕНЕРАЦИЯ СТОЛОВ =====
function generateTables() {
  const tablesArea = document.getElementById('tables-area');
  const welcomeScreen = tablesArea.querySelector('.welcome-screen');
  
  if (welcomeScreen) {
    welcomeScreen.remove();
  }
  
  const tablesGrid = document.createElement('div');
  tablesGrid.className = `tables-grid ${getTableGridClass()}`;
  
  for (let i = 1; i <= state.settings.tablesCount; i++) {
    const table = createPokerTable(i);
    tablesGrid.appendChild(table);
  }
  
  tablesArea.appendChild(tablesGrid);
}

function getTableGridClass() {
  const count = state.settings.tablesCount;
  switch (count) {
    case 1: return 'one-table';
    case 2: return 'two-tables';
    case 3: return 'three-tables';
    case 4: return 'four-tables';
    default: return 'one-table';
  }
}

function createPokerTable(tableNumber) {
  const table = document.createElement('div');
  table.className = 'poker-table';
  table.innerHTML = `
    <div class="table-header">
      <h3><i class="fas fa-table"></i> Стол ${tableNumber}</h3>
      <div class="table-info">
        <span class="rake-info"><i class="fas fa-percentage"></i> ${state.settings.rakePercent}%</span>
        <span class="rake-info"><i class="fas fa-dollar-sign"></i> ${state.settings.rakeDollar}</span>
      </div>
    </div>
    
    <!-- Основная игровая область с фиксированными пропорциями -->
    <div class="table-felt">
      <!-- Верхний ряд игроков -->
      <div class="players-top table-row">
        <div class="player-seat seat-1 position-${getDisplayPosition(state.settings.playerRanges.positions?.player1)?.toLowerCase() || 'btn'} center-aligned">
          <div class="player-avatar">
            <i class="fas fa-user"></i>
          </div>
          <div class="player-info-horizontal">
            <div class="player-name">Игрок 1</div>
            <div class="player-position">${getDisplayPosition(state.settings.playerRanges.positions?.player1) || 'BTN'}</div>
            <div class="player-stack">$1000</div>
          </div>
          <div class="player-cards center-aligned">
            <div class="card-slot hole-card">?</div>
            <div class="card-slot hole-card">?</div>
          </div>
          <div class="player-action center-aligned">
            <span class="action-text">Ожидание...</span>
            <span class="bet-amount">$0</span>
          </div>
        </div>
      </div>
      
      <!-- Центр стола -->
      <div class="table-center table-row">
        <div class="pot-area center-aligned">
          <div class="pot-total">
            <span class="pot-label">Банк</span>
            <span class="pot-amount">$0</span>
          </div>
        </div>
        
        <div class="community-cards center-aligned">
          <div class="card-slot community flop">?</div>
          <div class="card-slot community flop">?</div>
          <div class="card-slot community flop">?</div>
          <div class="card-slot community turn">?</div>
          <div class="card-slot community river">?</div>
        </div>
        
        <div class="table-dealer">
          <div class="dealer-button">D</div>
        </div>
      </div>
      
      <!-- Нижний ряд игроков -->
      <div class="players-bottom table-row">
        <div class="player-seat seat-2 position-${getDisplayPosition(state.settings.playerRanges.positions?.player2)?.toLowerCase() || 'bb'} center-aligned">
          <div class="player-action center-aligned">
            <span class="action-text">Ожидание...</span>
            <span class="bet-amount">$0</span>
          </div>
          <div class="player-cards center-aligned">
            <div class="card-slot hole-card">?</div>
            <div class="card-slot hole-card">?</div>
          </div>
          <div class="player-info-horizontal">
            <div class="player-name">Игрок 2</div>
            <div class="player-position">${getDisplayPosition(state.settings.playerRanges.positions?.player2) || 'BB'}</div>
            <div class="player-stack">$1000</div>
          </div>
          <div class="player-avatar">
            <i class="fas fa-user"></i>
          </div>
        </div>
      </div>
      
      <!-- Ряд 4: Позиция и стек -->
      <div class="position-stack-row table-row">
        <div class="position-stack-element center-aligned">
          <div class="position-stack-box-bottom">
            <div class="hero-info-horizontal">
              <div class="player-name-bottom">Герой</div>
              <div class="player-position-bottom">${getDisplayPosition(state.settings.playerRanges.positions?.player2) || 'BB'}</div>
              <div class="player-stack-bottom">$1000</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Ряд 5: Карты игрока -->
      <div class="player-cards-row table-row">
        <div class="player-cards-element center-aligned">
          <div class="player-cards-bottom">
            <div class="card-slot hole-card-bottom">?</div>
            <div class="card-slot hole-card-bottom">?</div>
          </div>
        </div>
      </div>
      
      <!-- Ряд 6: Кнопки управления -->
      <div class="action-controls-row table-row">
        <div class="action-control-element center-aligned">
          <!-- Кнопки действий -->
          <div class="action-buttons-row">
            <button class="action-btn fold-btn" disabled>
              <i class="fas fa-times"></i>
              <span>Fold</span>
            </button>
            <button class="action-btn check-btn" disabled>
              <i class="fas fa-check"></i>
              <span>Check</span>
            </button>
            <button class="action-btn call-btn" disabled>
              <i class="fas fa-phone"></i>
              <span>Call $0</span>
            </button>
            <button class="action-btn raise-btn" disabled>
              <i class="fas fa-arrow-up"></i>
              <span>Raise</span>
            </button>
          </div>
          
          <!-- Размер ставки -->
          <div class="bet-sizing-row">
            <div class="bet-slider-container">
              <input type="range" class="bet-slider" min="0" max="1000" value="0" step="5">
              <div class="bet-amount-display">$0</div>
            </div>
            <div class="bet-presets">
              <button class="bet-preset" data-size="0.5">1/2</button>
              <button class="bet-preset" data-size="0.75">3/4</button>
              <button class="bet-preset" data-size="1">Pot</button>
              <button class="bet-preset" data-size="1000">All-in</button>
            </div>
          </div>
          
          <!-- Управление столом -->
          <div class="table-controls-row">
            <button class="table-btn deal-btn">
              <i class="fas fa-play"></i>
              <span>Начать</span>
            </button>
            <button class="table-btn reset-btn">
              <i class="fas fa-redo"></i>
              <span>Сброс</span>
            </button>
            <button class="table-btn auto-btn">
              <i class="fas fa-robot"></i>
              <span>Авто</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  return table;
}

// ===== ПОЗИЦИИ =====
function getDisplayPosition(position) {
  // Преобразует позиции IP/OOP в BTN/BB для отображения
  if (position === 'IP') return 'BTN';
  if (position === 'OOP') return 'BB';
  return position; // Возвращает исходную позицию если нет преобразования
}

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(message, type = 'info') {
  // Защита от передачи DOM элементов или объектов
  if (typeof message !== 'string') {
    if (message && typeof message === 'object') {
      // Если это DOM элемент или объект, преобразуем в строку
      if (message.nodeType) {
        message = `DOM Element: ${message.tagName || 'Unknown'}`;
      } else {
        message = JSON.stringify(message, null, 2);
      }
    } else {
      message = String(message);
    }
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas fa-${getNotificationIcon(type)}"></i>
      <span>${message}</span>
    </div>
    <button class="notification-close">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  // Добавить стили для уведомлений если их нет
  if (!document.querySelector('.notification-styles')) {
    addNotificationStyles();
  }
  
  document.body.appendChild(notification);
  
  // Автоматически скрыть через 5 секунд
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
  
  // Обработчик закрытия
  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.remove();
  });
}

function getNotificationIcon(type) {
  switch (type) {
    case 'success': return 'check-circle';
    case 'error': return 'exclamation-circle';
    case 'warning': return 'exclamation-triangle';
    default: return 'info-circle';
  }
}

function addNotificationStyles() {
  const style = document.createElement('style');
  style.className = 'notification-styles';
  style.textContent = `
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: var(--border-radius);
      padding: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 3000;
      box-shadow: var(--shadow-lg);
      min-width: 300px;
      animation: slideInRight 0.3s ease;
    }
    
    .notification-success { border-left: 4px solid var(--accent-primary); }
    .notification-error { border-left: 4px solid var(--accent-danger); }
    .notification-warning { border-left: 4px solid var(--accent-warning); }
    .notification-info { border-left: 4px solid var(--accent-blue); }
    
    .notification-content {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .notification-close {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 5px;
      border-radius: var(--border-radius);
      transition: all var(--transition-fast);
    }
    
    .notification-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  
  document.head.appendChild(style);
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

// ===== ДОПОЛНИТЕЛЬНЫЕ CSS СТИЛИ ДЛЯ СТОЛОВ =====
function addTableStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ===== ОСНОВНЫЕ СТИЛИ СТОЛА ===== */
    .poker-table {
      background: linear-gradient(135deg, #1a2c3f 0%, #2d4f6b 100%);
      border-radius: 12px;
      border: 2px solid var(--border-primary);
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      margin-bottom: 20px;
      /* Устанавливаем центральную ось стола */
      --table-center-axis: 50%;
    }
    
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border-primary);
    }
    
    .table-header h3 {
      margin: 0;
      color: var(--accent-primary);
      font-size: 1.1rem;
    }
    
    .table-info {
      display: flex;
      gap: 15px;
    }
    
    .rake-info {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    /* ===== ИГРОВОЕ ПОЛЕ С ФИКСИРОВАННЫМИ ПРОПОРЦИЯМИ ===== */
    .table-felt {
      background: radial-gradient(ellipse at center, #0f5f3f 0%, #0a4a30 100%);
      position: relative;
      height: 600px; /* Фиксированная высота */
      padding: 20px;
      display: grid;
      grid-template-rows: 1fr 2fr 1fr 60px 60px 60px; /* Пропорции: верх 1, центр 2, низ 1, позиция/стек 60px, карты 60px, кнопки 60px */
      gap: 8px;
      overflow: hidden;
    }
    
    .table-row {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }
    
    /* Направляющая линия по центру стола (для отладки) */
    .table-row::before {
      content: '';
      position: absolute;
      left: var(--table-center-axis);
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(255, 255, 255, 0.05);
      z-index: 0;
      pointer-events: none;
    }
    
    /* Класс для элементов, которые должны быть на центральной оси */
    .center-aligned {
      position: relative;
      left: 50%;
      transform: translateX(-50%);
      /* Гарантируем точное позиционирование */
      display: flex;
      justify-content: center;
      align-items: center;
    }
    
    /* ===== ИГРОКИ ===== */
    .players-top, .players-bottom {
      /* Стили уже определены в .table-row */
      width: 100%;
    }
    
    .player-seat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border-radius: 10px;
      border: 2px solid transparent;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(5px);
      transition: all 0.3s ease;
      position: relative;
      min-width: 180px;
    }
    
    .player-seat.center-aligned {
      /* Особые стили для центрированных игроков */
      margin: 0;
      width: fit-content;
    }
    
    .players-bottom .player-seat {
      flex-direction: column-reverse;
    }
    
    /* Цветовые линии для позиций */
    .player-seat.position-btn { border-color: #ff6b35; }  /* Оранжевый для BTN */
    .player-seat.position-bb { border-color: #4ecdc4; }   /* Бирюзовый для BB */
    .player-seat.position-sb { border-color: #45b7d1; }   /* Синий для SB */
    .player-seat.position-ep { border-color: #f7d794; }   /* Желтый для EP */
    .player-seat.position-mp { border-color: #c44569; }   /* Розовый для MP */
    .player-seat.position-co { border-color: #6c5ce7; }   /* Фиолетовый для CO */
    
    .player-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--accent-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.2rem;
    }
    
    .player-info {
      text-align: center;
      color: white;
    }
    
    .player-info-horizontal {
      display: flex !important;
      flex-direction: row !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      color: white;
      flex-wrap: wrap;
    }
    
    .hero-info-horizontal {
      display: flex !important;
      flex-direction: row !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      flex-wrap: wrap;
    }
    
    /* Специфичные стили для горизонтального отображения элементов */
    .player-info-horizontal .player-name,
    .player-info-horizontal .player-position, 
    .player-info-horizontal .player-stack {
      margin: 0 !important;
      margin-bottom: 0 !important;
      display: inline-block !important;
    }
    
    .hero-info-horizontal .player-name-bottom,
    .hero-info-horizontal .player-position-bottom,
    .hero-info-horizontal .player-stack-bottom {
      margin: 0 !important;
      margin-bottom: 0 !important;
      display: inline-block !important;
    }
    
    /* Разделители между элементами */
    .player-info-horizontal .player-name::after,
    .player-info-horizontal .player-position::after {
      content: " | ";
      color: rgba(255, 255, 255, 0.6);
      margin: 0 4px;
    }
    
    .hero-info-horizontal .player-name-bottom::after,
    .hero-info-horizontal .player-position-bottom::after {
      content: " | ";
      color: rgba(255, 255, 255, 0.6);
      margin: 0 4px;
    }

    /* Область героя */
    .hero-area {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin: 15px auto 0 auto;
      width: 100%;
      max-width: 800px;
      position: relative;
    }

    /* Блок игрока-героя с зеленым фоном */
    .player-section.hero-green {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border-radius: 10px;
      border: 2px solid rgba(74, 222, 128, 0.5);
      background: rgba(74, 222, 128, 0.1);
      backdrop-filter: blur(5px);
      transition: all 0.3s ease;
      position: relative;
      min-width: 180px;
      width: 220px;
    }

    .player-info-horizontal-green {
      display: flex !important;
      flex-direction: row !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      color: white;
      flex-wrap: wrap;
      font-weight: bold;
      width: fit-content;
      margin: 0 auto;
    }

    /* Специфичные стили для зеленого блока */
    .player-info-horizontal-green .player-name,
    .player-info-horizontal-green .player-position, 
    .player-info-horizontal-green .player-stack {
      margin: 0 !important;
      margin-bottom: 0 !important;
      display: inline-block !important;
      color: white;
      font-size: 0.9rem;
      font-weight: bold;
    }

    /* Разделители для зеленого блока героя */
    .player-info-horizontal-green .player-name::after,
    .player-info-horizontal-green .player-position::after {
      content: " | ";
      color: rgba(255, 255, 255, 0.8);
      font-weight: normal;
    }

    .hero-area .actions-right {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      justify-content: center;
      align-items: center;
      width: 220px;
    }

    .hero-area .actions-right .table-actions {
      width: auto;
      min-width: 300px;
      max-width: 400px;
      display: flex !important;
      flex-direction: column !important;
      flex-wrap: nowrap;
      gap: 6px;
      justify-content: center;
      align-items: center;
      padding: 8px;
      background: rgba(74, 222, 128, 0.05);
      border-radius: 6px;
      border: 1px solid rgba(74, 222, 128, 0.2);
    }
    
    .player-name {
      font-weight: bold;
      font-size: 0.9rem;
      margin-bottom: 2px;
    }
    
    .player-name-bottom {
      font-weight: bold;
      font-size: 0.85rem;
      color: white;
      margin-right: 4px;
    }
    
    /* ===== ЗЕЛЕНЫЙ БОКС ПОЗИЦИИ И СТЕКА ===== */
    .position-stack-box {
      background: rgba(46, 204, 113, 0.15);
      border: 2px solid #2ecc71;
      border-radius: 8px;
      padding: 6px 8px;
      margin: 6px auto;
      width: 100px;
      max-width: 100%;
      text-align: center;
      box-shadow: 0 2px 8px rgba(46, 204, 113, 0.3);
      backdrop-filter: blur(3px);
      position: relative;
      box-sizing: border-box;
    }
    
    .position-stack-box::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      right: -1px;
      bottom: -1px;
      background: linear-gradient(45deg, #2ecc71, #27ae60, #2ecc71);
      border-radius: 8px;
      z-index: -1;
      opacity: 0.7;
    }
    
    .player-position {
      background: linear-gradient(135deg, #2ecc71, #27ae60);
      color: white;
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-bottom: 4px;
      display: inline-block;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .player-stack {
      font-size: 0.85rem;
      color: #f1c40f;
      font-weight: bold;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      display: block;
    }
    
    .player-cards {
      display: flex;
      gap: 4px;
      justify-content: center;
    }
    
    .player-cards.center-aligned {
      margin: 0;
      width: fit-content;
    }
    
    .card-slot.hole-card {
      width: 35px;
      height: 50px;
      background: linear-gradient(145deg, #ffffff, #f0f0f0);
      border: 1px solid #ddd;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      color: #666;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .player-action {
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 8px;
      border-radius: 6px;
      text-align: center;
      min-width: 80px;
    }
    
    /* Специальные стили для центрированных элементов */
    .player-action.center-aligned {
      margin: 0;
      width: fit-content;
    }
    
    .action-text {
      display: block;
      font-size: 0.7rem;
      color: #ccc;
    }
    
    .bet-amount {
      display: block;
      font-weight: bold;
      color: #ffd700;
      font-size: 0.8rem;
    }
    
    /* ===== ЦЕНТР СТОЛА ===== */
    .table-center {
      flex-direction: column;
      gap: 15px;
    }
    
    .pot-area {
      text-align: center;
    }
    
    .pot-area.center-aligned {
      margin: 0 auto;
      width: fit-content;
    }
    
    .pot-total {
      background: rgba(0, 0, 0, 0.4);
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 215, 0, 0.3);
    }
    
    .pot-label {
      display: block;
      font-size: 0.7rem;
      color: #ccc;
      margin-bottom: 2px;
    }
    
    .pot-amount {
      font-size: 1.2rem;
      font-weight: bold;
      color: #ffd700;
    }
    
    .community-cards {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    
    .community-cards.center-aligned {
      margin: 0;
      width: fit-content;
    }
    
    .card-slot.community {
      width: 50px;
      height: 70px;
      background: linear-gradient(145deg, #ffffff, #f0f0f0);
      border: 2px solid #ddd;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      color: #666;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    
    .card-slot.community.turn, .card-slot.community.river {
      opacity: 0.6;
      transform: scale(0.95);
    }
    
    .table-dealer {
      position: absolute;
      top: -10px;
      right: -10px;
    }
    
    .dealer-button {
      width: 30px;
      height: 30px;
      background: #ff6b35;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 0.8rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    /* ===== НОВЫЕ ОТДЕЛЬНЫЕ РЯДЫ УПРАВЛЕНИЯ ===== */
    .position-stack-row,
    .player-cards-row,
    .action-controls-row {
      background: rgba(44, 62, 80, 0.3);
      border-radius: 8px;
      margin: 0 -20px; /* Расширяем до краев */
      padding: 8px 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .position-stack-row {
      background: rgba(46, 204, 113, 0.1);
      border: 1px solid rgba(46, 204, 113, 0.3);
    }
    
    .player-cards-row {
      background: rgba(52, 152, 219, 0.1);
      border: 1px solid rgba(52, 152, 219, 0.3);
    }
    
    .action-controls-row {
      background: rgba(155, 89, 182, 0.1);
      border: 1px solid rgba(155, 89, 182, 0.3);
    }
    
    /* ===== ЭЛЕМЕНТ 1: ПОЗИЦИЯ И СТЕК ===== */
    .position-stack-element {
      width: fit-content;
    }
    
    .position-stack-box-bottom {
      background: rgba(46, 204, 113, 0.15);
      border: 2px solid #2ecc71;
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(46, 204, 113, 0.3);
      backdrop-filter: blur(3px);
      position: relative;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box; /* Включаем границы в общую ширину */
    }
    
    .position-stack-box-bottom::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      right: -1px;
      bottom: -1px;
      background: linear-gradient(45deg, #2ecc71, #27ae60, #2ecc71);
      border-radius: 8px;
      z-index: -1;
      opacity: 0.7;
    }
    
    .player-position-bottom {
      background: linear-gradient(135deg, #2ecc71, #27ae60);
      color: white;
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-bottom: 4px;
      display: inline-block;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .player-stack-bottom {
      font-size: 0.85rem;
      color: #f1c40f;
      font-weight: bold;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      display: block;
    }
    
    /* ===== ЭЛЕМЕНТ 2: КАРТЫ ИГРОКА ===== */
    .player-cards-element {
      max-width: 120px;
    }
    
    .player-cards-bottom {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    
    .card-slot.hole-card-bottom {
      width: 40px;
      height: 56px;
      background: linear-gradient(145deg, #ffffff, #f0f0f0);
      border: 2px solid #ddd;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      color: #666;
      box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    
    .card-slot.hole-card-bottom:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 10px rgba(0, 0, 0, 0.3);
    }
    
    /* ===== ЭЛЕМЕНТ 3: КНОПКИ УПРАВЛЕНИЯ ===== */
    .action-control-element {
      width: 100%;
      max-width: 800px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .action-buttons-row,
    .bet-sizing-row,
    .table-controls-row {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    
    .action-btn {
      background: linear-gradient(145deg, #3498db, #2980b9);
      border: none;
      border-radius: 6px;
      padding: 6px 8px;
      color: white;
      font-size: 0.7rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      min-width: 50px;
      flex: 1;
    }
    
    .action-btn:disabled {
      background: linear-gradient(145deg, #7f8c8d, #95a5a6);
      cursor: not-allowed;
      opacity: 0.6;
    }
    
    .action-btn:not(:disabled):hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    .fold-btn:not(:disabled) { background: linear-gradient(145deg, #e74c3c, #c0392b); }
    .check-btn:not(:disabled) { background: linear-gradient(145deg, #27ae60, #229954); }
    .call-btn:not(:disabled) { background: linear-gradient(145deg, #f39c12, #e67e22); }
    .raise-btn:not(:disabled) { background: linear-gradient(145deg, #9b59b6, #8e44ad); }
    
    .action-btn i {
      font-size: 0.9rem;
    }
    
    .action-btn span {
      font-size: 0.6rem;
    }
    
    .bet-slider-container {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
    }
    
    .bet-slider {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: #34495e;
      outline: none;
      -webkit-appearance: none;
      min-width: 80px;
    }
    
    .bet-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent-primary);
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    
    .bet-amount-display {
      background: rgba(0, 0, 0, 0.3);
      padding: 3px 6px;
      border-radius: 3px;
      color: #ffd700;
      font-weight: bold;
      font-size: 0.75rem;
      min-width: 45px;
      text-align: center;
    }
    
    .bet-presets {
      display: flex;
      gap: 3px;
    }
    
    .bet-preset {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      padding: 2px 4px;
      color: white;
      font-size: 0.6rem;
      cursor: pointer;
      transition: all 0.3s ease;
      flex: 1;
      min-width: 30px;
    }
    
    .bet-preset:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: var(--accent-primary);
    }
    
    .table-btn {
      background: linear-gradient(145deg, #2c3e50, #34495e);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 4px 6px;
      color: white;
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      min-width: 50px;
      flex: 1;
    }
    
    .table-btn:hover {
      background: linear-gradient(145deg, #34495e, #2c3e50);
      transform: translateY(-1px);
    }
    
    .deal-btn { border-color: #27ae60; }
    .reset-btn { border-color: #e74c3c; }
    .auto-btn { border-color: #f39c12; }
    
    .table-btn i {
      font-size: 0.8rem;
    }
    
    .table-btn span {
      font-size: 0.6rem;
    }
    
    /* ===== АДАПТИВНОСТЬ С ПРОПОРЦИОНАЛЬНЫМ МАСШТАБИРОВАНИЕМ ===== */
    @media (max-width: 1200px) {
      .table-felt {
        height: 500px; /* Уменьшенная высота для средних экранов */
        padding: 15px;
        grid-template-rows: 1fr 2fr 1fr 50px 50px 50px; /* Уменьшенные ряды управления */
        gap: 6px;
      }
      
      /* Сохраняем центрирование на средних экранах */
      .center-aligned {
        left: 50%;
        transform: translateX(-50%);
      }
      
      .position-stack-row,
      .player-cards-row,
      .action-controls-row {
        margin: 0 -15px;
        padding: 6px 15px;
      }
      
      .action-btn,
      .table-btn {
        min-width: 45px;
        padding: 5px 4px;
        font-size: 0.65rem;
      }
      
      .bet-preset {
        font-size: 0.55rem;
        padding: 2px 3px;
      }
      
      .card-slot.community {
        width: 45px;
        height: 63px;
      }
      
      .card-slot.hole-card {
        width: 32px;
        height: 45px;
      }
      
      .position-stack-element {
        width: 100%;
        overflow: hidden;
      }
      
      .position-stack-box-bottom {
        padding: 5px 7px;
        font-size: 0.85rem;
      }
      
      .player-position-bottom {
        font-size: 0.7rem;
        padding: 2px 7px;
      }
      
      .player-stack-bottom {
        font-size: 0.8rem;
      }
    }
    
    @media (max-width: 768px) {
      .table-felt {
        height: 450px; /* Компактная высота для планшетов */
        padding: 12px;
        grid-template-rows: 0.8fr 1.8fr 0.8fr 45px 45px 45px; /* Более компактные пропорции */
        gap: 6px;
      }
      
      .position-stack-row,
      .player-cards-row,
      .action-controls-row {
        margin: 0 -12px;
        padding: 6px 12px;
      }
      
      .action-buttons-row,
      .bet-sizing-row,
      .table-controls-row {
        flex-wrap: wrap;
        gap: 4px;
      }
      
      .action-btn,
      .table-btn {
        min-width: 40px;
        font-size: 0.6rem;
      }
      
      .card-slot.hole-card-bottom {
        width: 35px;
        height: 50px;
      }
      
      .card-slot.community {
        width: 40px;
        height: 56px;
      }
      
      .card-slot.hole-card {
        width: 28px;
        height: 40px;
      }
      
      /* Сохраняем центрирование на планшетах */
      .center-aligned {
        left: 50%;
        transform: translateX(-50%);
      }
    }
    
    @media (max-width: 480px) {
      .table-felt {
        height: 380px; /* Минимальная высота для мобильных */
        padding: 10px;
        grid-template-rows: 0.7fr 1.6fr 0.7fr 40px 40px 40px; /* Еще более компактные пропорции */
        gap: 4px;
      }
      
      .position-stack-row,
      .player-cards-row,
      .action-controls-row {
        margin: 0 -10px;
        padding: 4px 10px;
      }
      
      .action-btn,
      .table-btn {
        min-width: 35px;
        padding: 3px 2px;
        font-size: 0.55rem;
      }
      
      .action-btn i,
      .table-btn i {
        font-size: 0.7rem;
      }
      
      .action-btn span,
      .table-btn span {
        font-size: 0.5rem;
      }
      
      .bet-slider {
        min-width: 60px;
      }
      
      .bet-amount-display {
        font-size: 0.7rem;
        min-width: 40px;
      }
      
      .bet-preset {
        font-size: 0.5rem;
        min-width: 25px;
      }
      
      .card-slot.community {
        width: 35px;
        height: 49px;
      }
      
      .card-slot.hole-card {
        width: 25px;
        height: 35px;
      }
      
      .position-stack-element {
        width: 100%;
        overflow: hidden;
      }
      
      .position-stack-box-bottom {
        padding: 4px 6px;
        font-size: 0.8rem;
      }
      
      .player-position-bottom {
        font-size: 0.65rem;
        padding: 2px 6px;
      }
      
      .player-stack-bottom {
        font-size: 0.75rem;
      }
      
      /* Сохраняем центрирование на мобильных */
      .center-aligned {
        left: 50%;
        transform: translateX(-50%);
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Инициализация кнопок позиций
function initializePositionButtons() {
  const positionBtns = document.querySelectorAll('.position-btn');
  const oopIpBtns = document.querySelectorAll('.oop-ip-btn');
  
  // Убедиться что структура positions существует
  if (!state.settings.playerRanges.positions) {
    state.settings.playerRanges.positions = {
      player1: 'BTN',
      player2: 'BB'
    };
  }
  
  // ✅ ИСПРАВЛЕНИЕ: Инициализировать активные кнопки на основе реальных настроек
  const player1Position = state.settings.playerRanges.positions.player1 || 'BTN';
  const player2Position = state.settings.playerRanges.positions.player2 || 'BB';
  
  // Активируем кнопки для конкретных позиций (BTN, BB, EP, MP, CO, SB)
  document.querySelectorAll(`[data-player="1"][data-position="${player1Position}"]`).forEach(btn => btn.classList.add('active'));
  document.querySelectorAll(`[data-player="2"][data-position="${player2Position}"]`).forEach(btn => btn.classList.add('active'));
  
  console.log(`🎯 Инициализация позиций: Player1=${player1Position}, Player2=${player2Position}`);
  
  // Обработчики для детальных позиций (EP/MP/CO/BTN/SB/BB)
  positionBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const player = this.dataset.player;
      const position = this.dataset.position;
      
      // Убираем активность у других кнопок этого игрока  
      document.querySelectorAll(`[data-player="${player}"]`).forEach(b => {
        if (b.classList.contains('position-btn')) {
          b.classList.remove('active');
        }
      });
      
      // Активируем выбранную кнопку
      this.classList.add('active');
      
      // Убедиться что структура positions существует
      if (!state.settings.playerRanges.positions) {
        state.settings.playerRanges.positions = {};
      }
      
      // Обновляем настройки
      state.settings.playerRanges.positions[`player${player}`] = position;
      
      console.log('🎯 Позиция обновлена:', `player${player}`, '=', position);
      console.log('🎯 Все позиции:', state.settings.playerRanges.positions);
      
      // Сохранить настройки
      syncGameSettings();
    });
  });
  
  // Обработчики для переключателя IP/OOP
  oopIpBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const player = this.dataset.player;
      const position = this.dataset.position;
      
      // Убираем активность у всех кнопок этого игрока
      document.querySelectorAll(`[data-player="${player}"]`).forEach(b => b.classList.remove('active'));
      
      // Активируем выбранную кнопку IP/OOP
      this.classList.add('active');
      
      // Убедиться что структура positions существует
      if (!state.settings.playerRanges.positions) {
        state.settings.playerRanges.positions = {};
      }
      
      // Обновляем настройки - сохраняем исходные позиции IP/OOP
      state.settings.playerRanges.positions[`player${player}`] = position;
      
      console.log('🎯 IP/OOP позиция обновлена:', `player${player}`, '=', position);
      console.log('🎯 Все позиции:', state.settings.playerRanges.positions);
      
      // Сохранить настройки
      syncGameSettings();
    });
  });
}

// Функция синхронизации настроек
function syncGameSettings() {
  currentGameSettings = {
    tablesCount: state.settings.tablesCount,
    rakePercent: state.settings.rakePercent,
    rakeDollar: state.settings.rakeDollar,
    preflopSpot: state.settings.preflopSpot,
    boardSettings: state.settings.boardSettings,
    playerRanges: {
      player1: state.settings.playerRanges.player1,
      player2: state.settings.playerRanges.player2,
      positions: state.settings.playerRanges.positions
    }
  };
  
  console.log('🔄 Настройки синхронизированы:', currentGameSettings);
  console.log('🃏 Настройки карт флопа:', currentGameSettings.boardSettings?.flop);
  console.log('🎯 Позиции игроков:', currentGameSettings.playerRanges?.positions);
}

// Тестовая функция для демонстрации парсинга
function testHandRangeParsing() {
  console.log('🧪 Тестирование парсинга диапазонов рук');
  
  // Пример от пользователя с частичными весами
  const testString = 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AK,AQ,AJ,AT,A9,A8,A7s:0.75,A7o,A6s:0.75,A6o,A5s:0.75,A5o,A4s:0.75,A4o,A3,A2,KQ,KJ,KTs,KTo:0.25,K9s,K9o:0.25,K8,K7s,K6s,K5s,K4s,K3s,K2s,QJ,QTs,QTo:0.25,Q9s,Q9o:0.25,Q8,Q7s,Q6s,Q5s,Q4s,Q3s,Q2s,JT,J9,J8,J7s,J6s,J5s,J4s,T9,T8,T7s,T6s,98,97,96s,95s,87,86s,85s,84s,76,75s,74s,65s,64s,63s,54s,53s,43s';
  console.log('🎯 Тестовая строка:', testString);
  
  const result = parseHandRange(testString);
  
  console.log('📊 Результат парсинга:');
  console.log('📊 Руки с частичными весами:');
  
  // Показать руки с частичными весами
  const partialWeightHands = [];
  result.forEach((frequency, hand) => {
    if (frequency !== 1.0) {
      partialWeightHands.push(`${hand}: ${frequency} (${frequency * 100}%)`);
    }
  });
  
  if (partialWeightHands.length > 0) {
    console.log('  ✅ Найденные руки с частичными весами:');
    partialWeightHands.forEach(hand => console.log(`    ${hand}`));
  } else {
    console.log('  ❌ Руки с частичными весами не найдены');
  }
  
  console.log(`📊 Всего рук: ${result.size}`);
  console.log(`📊 Рук с полным весом (100%): ${Array.from(result.values()).filter(f => f === 1.0).length}`);
  console.log(`📊 Рук с частичным весом: ${Array.from(result.values()).filter(f => f !== 1.0).length}`);
  
  return result;
}

// Новая функция для тестирования примера пользователя
function testUserExample() {
  console.log('🧪 Тестирование примера пользователя');
  
  // Пример от пользователя
  const userString = 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AK,AQ,AJ,AT,A9,A8,A7,A6,A5,A4,A3,A2s,KQ,KJ,KT,K9,K8s,K7s,K6s,K5s,K4s,K3s,K2s,QJ,QT,Q9,Q8s,Q7s,Q6s,Q5s,Q4s,Q3s,Q2s,JT,J9,J8s,J7s,J6s,J5s,J4s,T9,T8,T7s,T6s,98,97s,96s,95s,87,86s,85s,84s,76s,75s,74s,65s,64s,63s,54s,53s,43s';
  
  console.log('🎯 Строка пользователя:', userString);
  console.log('🎯 Количество символов:', userString.length);
  
  const result = parseHandRange(userString);
  
  console.log('\n📊 Анализ результата:');
  console.log(`📊 Всего распарсено рук: ${result.size}`);
  
  // Группируем руки по типам
  const pairs = [];
  const suited = [];
  const offsuit = [];
  
  result.forEach((frequency, hand) => {
    if (hand.length === 2) {
      pairs.push(hand);
    } else if (hand.endsWith('s')) {
      suited.push(hand);
    } else if (hand.endsWith('o')) {
      offsuit.push(hand);
    }
  });
  
  console.log(`📊 Пары: ${pairs.length} (${pairs.slice(0, 5).join(', ')}${pairs.length > 5 ? '...' : ''})`);
  console.log(`📊 Suited руки: ${suited.length} (${suited.slice(0, 5).join(', ')}${suited.length > 5 ? '...' : ''})`);
  console.log(`📊 Offsuit руки: ${offsuit.length} (${offsuit.slice(0, 5).join(', ')}${offsuit.length > 5 ? '...' : ''})`);
  
  // Проверяем конкретные руки
  const testHands = ['AA', 'AKs', 'AKo', 'A2s', 'KQs', 'KQo', '43s'];
  console.log('\n🔍 Проверка конкретных рук:');
  testHands.forEach(hand => {
    const found = result.has(hand);
    const frequency = result.get(hand) || 0;
    console.log(`  ${found ? '✅' : '❌'} ${hand}: ${found ? `найдена (${frequency})` : 'не найдена'}`);
  });
  
  return result;
}

// Новая функция для тестирования примера пользователя
function testUserSpecificExample() {
  console.log('🧪 Тестирование конкретного примера пользователя');
  
  // Пример от пользователя
  const userString = 'AA,KK:0.5,AKs,AKo:0.5,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs:0.5,KJs:0.5,KTs:0.5,K9s:0.5,K8s:0.5,K7s:0.5,K6s:0.5,K5s:0.5,K4s:0.5,K3s:0.5,K2s:0.5';
  
  console.log('🎯 Строка пользователя:', userString);
  
  const result = parseHandRange(userString);
  
  console.log('\\n📊 Анализ результата:');
  console.log(`📊 Всего распарсено рук: ${result.size}`);
  
  // Группируем руки по ожидаемым категориям
  const expectedFullWeight = ['AA', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s'];
  const expectedHalfWeight = ['KK', 'AKo', 'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s'];
  
  console.log('\\n✅ Ожидаемые руки с весом 100%:');
  expectedFullWeight.forEach(hand => {
    const found = result.has(hand) || result.has(hand.toLowerCase()) || result.has(hand.toUpperCase());
    const frequency = result.get(hand) || result.get(hand.toLowerCase()) || result.get(hand.toUpperCase()) || 0;
    const isCorrect = found && Math.abs(frequency - 1.0) < 0.001;
    console.log(`  ${isCorrect ? '✅' : '❌'} ${hand}: ${found ? `найдена (${frequency})` : 'не найдена'}`);
  });
  
  console.log('\\n🔄 Ожидаемые руки с весом 50%:');
  expectedHalfWeight.forEach(hand => {
    const found = result.has(hand) || result.has(hand.toLowerCase()) || result.has(hand.toUpperCase());
    const frequency = result.get(hand) || result.get(hand.toLowerCase()) || result.get(hand.toUpperCase()) || 0;
    const isCorrect = found && Math.abs(frequency - 0.5) < 0.001;
    console.log(`  ${isCorrect ? '✅' : '❌'} ${hand}: ${found ? `найдена (${frequency})` : 'не найдена'}`);
  });
  
  console.log('\\n🔍 Все найденные руки:');
  const sortedHands = Array.from(result.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sortedHands.forEach(([hand, freq]) => {
    console.log(`  ${hand}: ${freq} (${freq * 100}%)`);
  });
  
  return result;
}

// ===== ЗАГРУЗКА СПИСКОВ ФАЙЛОВ =====
function renderPreflopSpotItems(items, container, level = 0, selectContainer = null) {
    // Находим корневой контейнер селектора, если не передан
    if (!selectContainer) {
        selectContainer = document.querySelector('.preflop-selector .custom-select-container');
    }
    
    // Проверяем дублирование рендеринга на корневом уровне
    if (level === 0) {
        const containerId = container.id || container.className || 'preflop-container';
        if (!window.eventHandlersTracker.checkRenderStatus(containerId, items.length)) {
            return; // Уже рендерился, пропускаем
        }
        container.innerHTML = '';
    }
    
    console.log(`📝 Рендеринг ${items.length} элементов на уровне ${level}`);
    
    // Дополнительная защита от дублирования рендеринга
    if (level === 0 && container.children.length > 0) {
        console.log('⚠️ Контейнер уже содержит элементы, очищаем для избежания дублирования');
        container.innerHTML = '';
    }
    
    // Группируем элементы по типу
    const folders = items.filter(item => item.type === 'folder');
    const files = items.filter(item => item.type === 'file');
    
    // Сначала папки
    folders.forEach(folder => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'preflop-folder-header';
        folderDiv.style.paddingLeft = `${level * 20 + 10}px`;
        folderDiv.setAttribute('data-folder-path', folder.path);
        
        folderDiv.innerHTML = `
            <span class="preflop-folder-toggle">▶</span>
            <span class="preflop-folder-name">${folder.name}</span>
        `;
        
        const folderContent = document.createElement('div');
        folderContent.className = 'preflop-folder-content';
        folderContent.style.maxHeight = '0px';
        folderContent.style.overflow = 'hidden';
        folderContent.style.transition = 'max-height 0.3s ease';
        folderContent.setAttribute('data-folder-content', folder.path);
        
        folderDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const toggle = folderDiv.querySelector('.preflop-folder-toggle');
            const isExpanded = toggle.textContent === '▼';
            
            if (isExpanded) {
                // Сворачиваем папку
                folderContent.style.maxHeight = '0px';
                toggle.textContent = '▶';
            } else {
                // Разворачиваем папку
                toggle.textContent = '▼';
                
                // Если содержимое уже загружено, просто показываем его
                if (folderContent.children.length > 0) {
                    folderContent.style.maxHeight = folderContent.scrollHeight + 'px';
                } else {
                    // Загружаем содержимое папки
                    fetch(`/api/preflopspot/${encodeURIComponent(folder.path)}`)
                        .then(response => response.json())
                        .then(data => {
                            console.log(`Загружено содержимое папки ${folder.name}:`, data);
                            const selectContainer = document.querySelector('.preflop-selector .custom-select-container');
                            renderPreflopSpotItems(data.items, folderContent, level + 1, selectContainer);
                            // Устанавливаем высоту после рендеринга
                            setTimeout(() => {
                                folderContent.style.maxHeight = folderContent.scrollHeight + 'px';
                            }, 10);
                        })
                        .catch(error => {
                            console.error('Ошибка загрузки папки:', error);
                            folderContent.innerHTML = `<div style="padding: 10px; color: #ef4444;">Ошибка загрузки</div>`;
                            folderContent.style.maxHeight = '40px';
                        });
                }
            }
        });
        
        container.appendChild(folderDiv);
        container.appendChild(folderContent);
    });
    
    // Затем файлы
    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'preflop-file-item';
        fileDiv.style.paddingLeft = `${level * 20 + 30}px`;
        fileDiv.innerHTML = `
            <span class="preflop-file-icon">📄</span>
            <span class="preflop-file-name">${file.name}</span>
        `;
        
        fileDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            loadPreflopSpot(file.path);
            // Скрыть dropdown и обновить trigger
            const selectContainer = document.querySelector('.preflop-selector .custom-select-container');
            
            if (selectContainer) {
                const dropdown = selectContainer.querySelector('.select-dropdown');
                const trigger = selectContainer.querySelector('.select-trigger');
                const triggerText = selectContainer.querySelector('.select-text');
                
                if (dropdown) dropdown.classList.remove('active');
                if (trigger) trigger.classList.remove('active');
                if (triggerText) triggerText.textContent = file.name;
                
                // Возвращаем dropdown в исходный контейнер
                if (dropdown && dropdown.parentElement === document.body) {
                    document.body.removeChild(dropdown);
                    selectContainer.appendChild(dropdown);
                }
            }
        });
        
        container.appendChild(fileDiv);
    });
}

// ===== RANGE SELECTOR FUNCTIONS =====
function renderRangeSelectItems(items, container, level = 0, selectContainer = null) {
    // Находим корневой контейнер селектора для определения игрока
    if (!selectContainer) {
        selectContainer = container.closest('.custom-select-container');
    }
    
    if (!selectContainer) {
        console.error('❌ Не найден корневой контейнер селектора');
        return;
    }
    
    const playerNum = selectContainer.id.includes('player1') ? 1 : 2;
    
    // Проверяем дублирование рендеринга на корневом уровне
    if (level === 0) {
        const containerId = `range-player${playerNum}-${container.className}`;
        if (!window.eventHandlersTracker.checkRenderStatus(containerId, items.length)) {
            return; // Уже рендерился, пропускаем
        }
        container.innerHTML = '';
    }
    
    console.log(`🎯 Рендеринг элементов рейнджей для игрока ${playerNum} (${items.length} элементов на уровне ${level})`);
    
    // Дополнительная защита от дублирования рендеринга
    if (level === 0 && container.children.length > 0) {
        console.log('⚠️ Контейнер рейнджей уже содержит элементы, очищаем для избежания дублирования');
        container.innerHTML = '';
    }
    
    // Группируем элементы по типу
    const folders = items.filter(item => item.type === 'folder');
    const files = items.filter(item => item.type === 'file');
    
    // Сначала папки
    folders.forEach(folder => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'range-folder-header';
        folderDiv.style.paddingLeft = `${level * 20 + 10}px`;
        folderDiv.setAttribute('data-folder-path', folder.path);
        
        folderDiv.innerHTML = `
            <span class="folder-toggle">▶</span>
            <span class="folder-name">${folder.name}</span>
        `;
        
        const folderContent = document.createElement('div');
        folderContent.className = 'folder-content';
        folderContent.style.maxHeight = '0px';
        folderContent.style.overflow = 'hidden';
        folderContent.style.transition = 'max-height 0.3s ease';
        folderContent.setAttribute('data-folder-content', folder.path);
        
        folderDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const toggle = folderDiv.querySelector('.folder-toggle');
            const isExpanded = toggle.textContent === '▼';
            
            if (isExpanded) {
                // Сворачиваем папку
                folderContent.style.maxHeight = '0px';
                toggle.textContent = '▶';
            } else {
                // Разворачиваем папку
                toggle.textContent = '▼';
                
                // Если содержимое уже загружено, просто показываем его
                if (folderContent.children.length > 0) {
                    folderContent.style.maxHeight = folderContent.scrollHeight + 'px';
                } else {
                    // Загружаем содержимое папки
                    fetch(`/api/range/${encodeURIComponent(folder.path)}`)
                        .then(response => response.json())
                        .then(data => {
                            console.log(`Загружено содержимое папки рейнджей ${folder.name}:`, data);
                            renderRangeSelectItems(data.items, folderContent, level + 1, selectContainer);
                            // Устанавливаем высоту после рендеринга
                            setTimeout(() => {
                                folderContent.style.maxHeight = folderContent.scrollHeight + 'px';
                            }, 10);
                        })
                        .catch(error => {
                            console.error('Ошибка загрузки папки рейнджей:', error);
                            folderContent.innerHTML = `<div style="padding: 10px; color: #ef4444;">Ошибка загрузки</div>`;
                            folderContent.style.maxHeight = '40px';
                        });
                }
            }
        });
        
        container.appendChild(folderDiv);
        container.appendChild(folderContent);
    });
    
    // Затем файлы
    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'range-preset-item';
        fileDiv.style.paddingLeft = `${level * 20 + 30}px`;
        fileDiv.innerHTML = `
            <span class="file-icon">📄</span>
            <span class="file-name">${file.name}</span>
        `;
        
        fileDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            console.log(`🎯 Обработка клика по файлу рейнджа для игрока ${playerNum}:`, file.path);
            
            loadRangePreset(file.path, playerNum);
            
            // Скрыть dropdown и обновить trigger
            const dropdown = selectContainer.querySelector('.select-dropdown');
            const trigger = selectContainer.querySelector('.select-trigger');
            const triggerText = selectContainer.querySelector('.select-text');
            
            if (dropdown) dropdown.classList.remove('active');
            if (trigger) trigger.classList.remove('active');
            if (triggerText) triggerText.textContent = file.name;
            
            // Возвращаем dropdown в исходный контейнер
            if (dropdown.parentElement === document.body) {
                document.body.removeChild(dropdown);
                selectContainer.appendChild(dropdown);
            }
        });
        
        container.appendChild(fileDiv);
    });
}

function initializeRangeSelector(selectId) {
    const selectContainer = document.getElementById(selectId);
    if (!selectContainer) return;
    
    // Проверяем, не инициализирован ли уже селектор
    if (selectContainer.dataset.initialized === 'true') {
        console.log(`✅ Range селектор ${selectId} уже инициализирован, пропускаем`);
        return;
    }
    
    const trigger = selectContainer.querySelector('.select-trigger');
    const dropdown = selectContainer.querySelector('.select-dropdown');
    const optionsContainer = dropdown.querySelector('.select-options');
    
    if (!trigger || !dropdown || !optionsContainer) {
        console.error(`❌ Элементы range селектора ${selectId} не найдены`);
        return;
    }
    
    // Отмечаем как инициализированный
    selectContainer.dataset.initialized = 'true';
    console.log(`🎯 Инициализация range селектора ${selectId}...`);
    
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (dropdown.classList.contains('active')) {
            // Закрываем dropdown
            dropdown.classList.remove('active');
            trigger.classList.remove('active');
            
            // Удаляем из body если он там
            if (dropdown.parentElement === document.body) {
                document.body.removeChild(dropdown);
                selectContainer.appendChild(dropdown);
            }
        } else {
            // Открываем dropdown
            trigger.classList.add('active');
            
            // Перемещаем dropdown в body для правильного позиционирования
            document.body.appendChild(dropdown);
            
            // Позиционируем dropdown относительно trigger
            const triggerRect = trigger.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.top = `${triggerRect.bottom + window.scrollY}px`;
            dropdown.style.left = `${triggerRect.left + window.scrollX}px`;
            dropdown.style.width = `${triggerRect.width}px`;
            dropdown.style.zIndex = '10000';
            
            dropdown.classList.add('active');
            
            // Очищаем трекер рендеринга и загружаем список рейнджей
            window.eventHandlersTracker.clearRenderTracker();
            fetch('/api/ranges')
                .then(response => response.json())
                .then(data => {
                    renderRangeSelectItems(data.items, optionsContainer, 0, selectContainer);
                })
                .catch(error => {
                    console.error('Ошибка загрузки рейнджей:', error);
                    optionsContainer.innerHTML = '<div style="padding: 10px; color: #ef4444;">Ошибка загрузки списка</div>';
                });
        }
    });
    
    // Закрытие dropdown при клике вне его
    document.addEventListener('click', (e) => {
        if (dropdown && trigger && !dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.classList.remove('active');
            trigger.classList.remove('active');
            
            // Возвращаем dropdown обратно в исходный контейнер
            if (dropdown.parentElement === document.body) {
                document.body.removeChild(dropdown);
                selectContainer.appendChild(dropdown);
            }
        }
    });
}

// Инициализация preflop selector с переносом dropdown в body
function initializePreflopSelector() {
    const selectContainer = document.querySelector('.preflop-selector .custom-select-container');
    if (!selectContainer) {
        console.error('❌ Префлоп селектор не найден');
        return;
    }
    
    // Проверяем, не инициализирован ли уже селектор
    if (selectContainer.dataset.initialized === 'true') {
        console.log('✅ Префлоп селектор уже инициализирован, пропускаем');
        return;
    }
    
    const trigger = selectContainer.querySelector('.select-trigger');
    const dropdown = selectContainer.querySelector('.select-dropdown');
    const optionsContainer = dropdown.querySelector('.select-options');
    
    if (!trigger || !dropdown || !optionsContainer) {
        console.error('❌ Элементы префлоп селектора не найдены', { trigger: !!trigger, dropdown: !!dropdown, optionsContainer: !!optionsContainer });
        return;
    }
    
    // Отмечаем как инициализированный
    selectContainer.dataset.initialized = 'true';
    console.log('🎯 Инициализация префлоп селектора...');
    
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (dropdown.classList.contains('active')) {
            // Закрываем dropdown
            dropdown.classList.remove('active');
            trigger.classList.remove('active');
            
            // Удаляем из body если он там
            if (dropdown.parentElement === document.body) {
                document.body.removeChild(dropdown);
                selectContainer.appendChild(dropdown);
            }
        } else {
            // Открываем dropdown
            trigger.classList.add('active');
            
            // Перемещаем dropdown в body для правильного позиционирования
            document.body.appendChild(dropdown);
            
            // Позиционируем dropdown относительно trigger
            const triggerRect = trigger.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.top = `${triggerRect.bottom + window.scrollY}px`;
            dropdown.style.left = `${triggerRect.left + window.scrollX}px`;
            dropdown.style.width = `${triggerRect.width}px`;
            dropdown.style.zIndex = '10000';
            
            dropdown.classList.add('active');
            
            // Очищаем трекер рендеринга и загружаем список spot'ов
            window.eventHandlersTracker.clearRenderTracker();
            fetch('/api/preflopspots')
                .then(response => response.json())
                .then(data => {
                    renderPreflopSpotItems(data.items, optionsContainer, 0, selectContainer);
                })
                .catch(error => {
                    console.error('Ошибка загрузки preflop spots:', error);
                    optionsContainer.innerHTML = '<div style="padding: 10px; color: #ef4444;">Ошибка загрузки списка</div>';
                });
        }
    });
    
    // Закрытие dropdown при клике вне его
    document.addEventListener('click', (e) => {
        if (dropdown && trigger && !dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.classList.remove('active');
            trigger.classList.remove('active');
            
            // Возвращаем dropdown обратно в исходный контейнер
            if (dropdown.parentElement === document.body) {
                document.body.removeChild(dropdown);
                selectContainer.appendChild(dropdown);
            }
        }
    });
}



async function loadPreflopSpotsList() {
  try {
    console.log('🔄 Загружаю список префлоп спотов...');
    const response = await fetch('/api/preflopspots');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📊 Данные префлоп спотов:', data);
    
    const container = document.querySelector('#preflop-spot-select .select-options');
    console.log('📋 Контейнер опций найден:', !!container);
    
    if (container) {
      // Очистить существующие элементы
      container.innerHTML = '';
      
      // Добавить элементы из структуры папок
      if (data.items && data.items.length > 0) {
        renderPreflopSpotItems(data.items, container);
        console.log(`✅ Загружено ${data.items.length} элементов префлоп спотов`);
      } else {
        console.log('⚠️ Нет элементов префлоп спотов для загрузки');
      }
    } else {
      console.error('❌ Контейнер .select-options не найден');
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки списка префлоп спотов:', error);
  }
}

function renderRangeItems(items, container, level = 0) {
  items.forEach(item => {
    if (item.type === 'folder') {
      // Создаем заголовок папки
      const folderHeader = document.createElement('div');
      folderHeader.className = 'range-folder-header';
      folderHeader.style.paddingLeft = `${level * 20}px`;
      folderHeader.setAttribute('data-folder-path', item.path);
      folderHeader.innerHTML = `
        <span class="folder-toggle">▶</span>
        <span class="folder-name">${item.name}</span>
      `;
      
      // Создаем контейнер для содержимого папки
      const folderContent = document.createElement('div');
      folderContent.className = 'folder-content';
      folderContent.style.display = 'none'; // Изначально скрыто
      folderContent.setAttribute('data-folder-content', item.path);
      
      // Добавляем обработчик клика для сворачивания/разворачивания
      folderHeader.onclick = () => toggleFolder(item.path);
      
      container.appendChild(folderHeader);
      container.appendChild(folderContent);
      
      // Рекурсивно добавляем содержимое папки в ее контейнер
      renderRangeItems(item.children, folderContent, level + 1);
    } else if (item.type === 'file') {
      // Создаем элемент файла
      const fileItem = document.createElement('div');
      fileItem.className = 'range-preset-item';
      fileItem.style.paddingLeft = `${level * 20 + 20}px`;
      fileItem.onclick = () => loadRangePreset(item.path);
      fileItem.innerHTML = `
        <span class="file-icon">📄</span>
        <span class="file-name">${item.name}</span>
      `;
      container.appendChild(fileItem);
    }
  });
}

function toggleFolder(folderPath) {
  const folderContent = document.querySelector(`[data-folder-content="${folderPath}"]`);
  const folderHeader = document.querySelector(`[data-folder-path="${folderPath}"]`);
  const toggle = folderHeader.querySelector('.folder-toggle');
  
  if (folderContent) {
    const isVisible = folderContent.style.display !== 'none';
    folderContent.style.display = isVisible ? 'none' : 'block';
    toggle.textContent = isVisible ? '▶' : '▼';
  }
}

async function loadRangesList() {
  try {
    console.log('🔄 Загружаю список рейнджей...');
    const response = await fetch('/api/ranges');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📊 Данные рейнджей:', data);
    
    const container = document.querySelector('.range-presets-list');
    console.log('📋 Контейнер рейнджей найден:', !!container);
    
    if (container) {
      // Очистить существующие элементы
      container.innerHTML = '';
      
      // Добавить элементы из структуры папок
      if (data.items && data.items.length > 0) {
        renderRangeItems(data.items, container);
        console.log(`✅ Загружено ${data.items.length} элементов рейнджей`);
      } else {
        console.log('⚠️ Нет элементов рейнджей для загрузки');
      }
    } else {
      console.error('❌ Контейнер .range-presets-list не найден');
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки списка рейнджей:', error);
  }
}

// Автоматический тест при загрузке (только для разработки)
if (typeof window !== 'undefined') {
  window.testHandRangeParsing = testHandRangeParsing;
  window.testUserExample = testUserExample;
  window.testUserSpecificExample = testUserSpecificExample;
} 

// ===== АНИМАЦИИ ОЧЕРЕДИ ХОДА =====

function setActivePlayerTurn(playerNumber) {
  // Убираем анимацию у всех игроков
  clearAllPlayerTurnAnimations();
  
  console.log(`🎬 Установка анимации очереди хода для игрока ${playerNumber}`);
  
  if (playerNumber === 1) {
    // Верхний игрок (Игрок 1)
    const playerSeat = document.querySelector('.player-seat.seat-1');
    if (playerSeat) {
      playerSeat.classList.add('active-turn');
      console.log('🎬 Анимация активирована для верхнего игрока');
    }
  } else if (playerNumber === 2) {
    // Нижний игрок (Игрок 2 / Герой)
    const heroSection = document.querySelector('.player-section.hero-green');
    const playerSeat = document.querySelector('.player-seat.seat-2');
    
    if (heroSection) {
      heroSection.classList.add('active-turn');
      console.log('🎬 Анимация активирована для героя (зеленый блок)');
    } else if (playerSeat) {
      playerSeat.classList.add('active-turn');
      console.log('🎬 Анимация активирована для нижнего игрока');
    }
  }
}

function clearAllPlayerTurnAnimations() {
  // Убираем анимацию у всех возможных контейнеров игроков
  const containers = document.querySelectorAll(
    '.player-seat.active-turn, .opponent-area-compact.active-turn, .player-section.hero-green.active-turn'
  );
  
  containers.forEach(container => {
    container.classList.remove('active-turn');
  });
  
  console.log(`🎬 Очищены анимации очереди хода (${containers.length} контейнеров)`);
}

function updatePlayerTurnAnimations() {
  console.log('🎬 Обновление анимаций очереди хода для всех столов');
  
  // Очищаем все анимации
  clearAllPlayerTurnAnimations();
  
  // Проверяем все столы
  const tables = document.querySelectorAll('.poker-table');
  
  tables.forEach((table, index) => {
    const tableNumber = index + 1;
    console.log(`🎬 Проверка стола ${tableNumber}`);
    
    // Ищем активные кнопки действий на этом столе
    const activeButtons = table.querySelectorAll('.action-btn:not([disabled])');
    const hasActiveButtons = activeButtons.length > 0;
    
    console.log(`🎬 Стол ${tableNumber}: найдено ${activeButtons.length} активных кнопок`, 
      Array.from(activeButtons).map(btn => btn.textContent.trim()));
    
    if (hasActiveButtons) {
      // Если есть активные кнопки - ход игрока (героя)
      setActivePlayerTurnForTable(table, 2); // 2 = герой/нижний игрок
    }
  });
}

function setActivePlayerTurnForTable(tableElement, playerNumber) {
  const tableIndex = Array.from(document.querySelectorAll('.poker-table')).indexOf(tableElement) + 1;
  console.log(`🎬 Установка анимации очереди хода для игрока ${playerNumber} на столе ${tableIndex}`);
  
  if (playerNumber === 1) {
    // Верхний игрок (Игрок 1)
    const playerSeat = tableElement.querySelector('.player-seat.seat-1');
    if (playerSeat) {
      playerSeat.classList.add('active-turn');
      console.log(`🎬 Анимация активирована для верхнего игрока на столе ${tableIndex}`);
    }
  } else if (playerNumber === 2) {
    // Нижний игрок (Игрок 2 / Герой)
    let animationAdded = false;
    
    // Пытаемся найти зеленый блок героя
    const heroSection = tableElement.querySelector('.player-section.hero-green');
    if (heroSection) {
      heroSection.classList.add('active-turn');
      console.log(`🎬 Анимация активирована для героя (зеленый блок) на столе ${tableIndex}`);
      animationAdded = true;
    }
    
    // Если зеленого блока нет, ищем обычное место игрока
    if (!animationAdded) {
      const playerSeat = tableElement.querySelector('.player-seat.seat-2');
      if (playerSeat) {
        playerSeat.classList.add('active-turn');
        console.log(`🎬 Анимация активирована для нижнего игрока на столе ${tableIndex}`);
        animationAdded = true;
      }
    }
    
    // Если ничего не найдено, пробуем другие варианты
    if (!animationAdded) {
      const heroBox = tableElement.querySelector('.position-stack-box-bottom');
      if (heroBox) {
        heroBox.classList.add('active-turn');
        console.log(`🎬 Анимация активирована для бокса героя на столе ${tableIndex}`);
        animationAdded = true;
      }
    }
    
    if (!animationAdded) {
      console.log(`⚠️ Не удалось найти контейнер для героя на столе ${tableIndex}`);
    }
  }
}

function checkIfPlayer1Turn() {
  // В текущей реализации игрок 1 (верхний) не имеет кнопок управления
  // Это ИИ или оппонент в мультиплеере
  return false;
}

function checkIfPlayer2Turn() {
  // Проверяем есть ли активные кнопки действий на любом столе
  const activeButtons = document.querySelectorAll('.action-btn:not([disabled])');
  const hasActiveButtons = activeButtons.length > 0;
  
  console.log(`🎬 Проверка хода игрока 2: найдено ${activeButtons.length} активных кнопок`);
  return hasActiveButtons;
}

// Демонстрационная функция для тестирования анимаций
function testPlayerTurnAnimations() {
  console.log('🎬 Тестирование анимаций очереди хода...');
  
  // Проверяем сколько столов есть в DOM
  const tables = document.querySelectorAll('.poker-table');
  console.log(`🎬 Найдено столов: ${tables.length}`);
  
  if (tables.length === 0) {
    console.log('⚠️ Столы не найдены. Создайте столы сначала.');
    return;
  }
  
  // Тест 1: Проверка текущего состояния
  console.log('🎬 Тест 1: Проверка текущего состояния кнопок');
  updatePlayerTurnAnimations();
  
  // Тест 2: Ручная активация анимации для первого стола
  setTimeout(() => {
    console.log('🎬 Тест 2: Ручная активация анимации для первого стола');
    if (tables[0]) {
      setActivePlayerTurnForTable(tables[0], 2);
    }
  }, 2000);
  
  // Тест 3: Проверка всех столов
  setTimeout(() => {
    console.log('🎬 Тест 3: Проверка всех столов');
    tables.forEach((table, index) => {
      const activeButtons = table.querySelectorAll('.action-btn:not([disabled])');
      console.log(`Стол ${index + 1}: ${activeButtons.length} активных кнопок`);
      if (activeButtons.length > 0) {
        setActivePlayerTurnForTable(table, 2);
      }
    });
  }, 4000);
  
  // Тест 4: Очистка анимаций
  setTimeout(() => {
    console.log('🎬 Тест 4: Очистка анимаций');
    clearAllPlayerTurnAnimations();
  }, 7000);
  
  // Тест 5: Финальная проверка автоматической системы
  setTimeout(() => {
    console.log('🎬 Тест 5: Финальная проверка автоматической системы');
    updatePlayerTurnAnimations();
  }, 8000);
}

// Автоматическое обновление анимаций при изменении DOM
const playerTurnObserver = new MutationObserver((mutations) => {
  let shouldUpdate = false;
  
  mutations.forEach((mutation) => {
    // Проверяем изменения в кнопках действий
    if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
      const target = mutation.target;
      if (target.matches('.action-btn')) {
        console.log(`🎬 Изменение состояния кнопки: ${target.textContent.trim()}, disabled: ${target.disabled}`);
        shouldUpdate = true;
      }
    }
    
    // Проверяем добавление/удаление элементов (новые столы, кнопки)
    if (mutation.type === 'childList') {
      const addedNodes = Array.from(mutation.addedNodes);
      const removedNodes = Array.from(mutation.removedNodes);
      
      const hasRelevantChanges = [...addedNodes, ...removedNodes].some(node => {
        if (node.nodeType === 1) { // Element node
          return node.matches('.poker-table') || 
                 node.matches('.action-btn') || 
                 node.querySelector && node.querySelector('.action-btn');
        }
        return false;
      });
      
      if (hasRelevantChanges) {
        console.log('🎬 Изменения в DOM: добавлены/удалены столы или кнопки');
        shouldUpdate = true;
      }
    }
  });
  
  if (shouldUpdate) {
    // Обновляем анимации с небольшой задержкой
    setTimeout(updatePlayerTurnAnimations, 150);
  }
});

// Инициализация наблюдателя
function initializePlayerTurnAnimations() {
  console.log('🎬 Инициализация системы анимаций очереди хода');
  
  // Начинаем наблюдение за изменениями в DOM
  const targetNode = document.body;
  const config = { 
    attributes: true, 
    childList: true, 
    subtree: true, 
    attributeFilter: ['disabled', 'class'] 
  };
  
  playerTurnObserver.observe(targetNode, config);
  
  // Добавляем обработчики для кнопок действий
  document.addEventListener('click', (event) => {
    if (event.target.matches('.action-btn')) {
      console.log(`🎬 Клик по кнопке действия: ${event.target.textContent.trim()}`);
      // После действия обновляем анимации
      setTimeout(updatePlayerTurnAnimations, 200);
    }
  });
  
  // Дополнительное отслеживание изменений кнопок
  document.addEventListener('DOMNodeInserted', (event) => {
    if (event.target.matches && event.target.matches('.poker-table')) {
      console.log('🎬 Новый стол добавлен в DOM');
      setTimeout(updatePlayerTurnAnimations, 300);
    }
  });
  
  // Периодическое обновление анимаций (резервный механизм)
  setInterval(() => {
    const hasActiveTables = document.querySelectorAll('.poker-table').length > 0;
    if (hasActiveTables) {
      updatePlayerTurnAnimations();
    }
  }, 5000); // Каждые 5 секунд
  
  console.log('🎬 Система анимаций очереди хода инициализирована');
}

// Для тестирования в консоли разработчика
if (typeof window !== 'undefined') {
  window.testPlayerTurnAnimations = testPlayerTurnAnimations;
  window.setActivePlayerTurn = setActivePlayerTurn;
  window.clearAllPlayerTurnAnimations = clearAllPlayerTurnAnimations;
  window.simulatePlayerTurn = simulatePlayerTurn;
  window.simulatePlayerActionComplete = simulatePlayerActionComplete;
  window.fullAnimationDemo = fullAnimationDemo;
  window.updatePlayerTurnAnimations = updatePlayerTurnAnimations;
} 

// Функция для тестирования активации кнопок (имитация начала хода)
function simulatePlayerTurn(tableIndex = 1) {
  console.log(`🎮 Имитация начала хода игрока на столе ${tableIndex}`);
  
  const tables = document.querySelectorAll('.poker-table');
  const table = tables[tableIndex - 1];
  
  if (!table) {
    console.log(`⚠️ Стол ${tableIndex} не найден`);
    return;
  }
  
  // Активируем кнопки действий на этом столе
  const actionButtons = table.querySelectorAll('.action-btn');
  actionButtons.forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  });
  
  console.log(`✅ Активированы кнопки на столе ${tableIndex}:`, 
    Array.from(actionButtons).map(btn => btn.textContent.trim()));
  
  // Обновляем анимации
  setTimeout(updatePlayerTurnAnimations, 100);
}

// Функция для тестирования деактивации кнопок (имитация конца хода)
function simulatePlayerActionComplete(tableIndex = 1) {
  console.log(`🎯 Имитация завершения хода игрока на столе ${tableIndex}`);
  
  const tables = document.querySelectorAll('.poker-table');
  const table = tables[tableIndex - 1];
  
  if (!table) {
    console.log(`⚠️ Стол ${tableIndex} не найден`);
    return;
  }
  
  // Деактивируем кнопки действий на этом столе
  const actionButtons = table.querySelectorAll('.action-btn');
  actionButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  });
  
  console.log(`❌ Деактивированы кнопки на столе ${tableIndex}`);
  
  // Обновляем анимации
  setTimeout(updatePlayerTurnAnimations, 100);
}

// Полная демонстрация системы анимаций
function fullAnimationDemo() {
  console.log('🎪 Запуск полной демонстрации системы анимаций');
  
  const tables = document.querySelectorAll('.poker-table');
  if (tables.length === 0) {
    console.log('⚠️ Столы не найдены. Создайте столы сначала.');
    return;
  }
  
  console.log(`🎯 Будет продемонстрирована работа на ${tables.length} столах`);
  
  let currentStep = 0;
  const steps = [
    () => {
      console.log('📍 Шаг 1: Очищаем все анимации');
      clearAllPlayerTurnAnimations();
    },
    () => {
      console.log('📍 Шаг 2: Активируем кнопки на столе 1');
      simulatePlayerTurn(1);
    },
    () => {
      console.log('📍 Шаг 3: Активируем кнопки на всех столах');
      tables.forEach((_, index) => simulatePlayerTurn(index + 1));
    },
    () => {
      console.log('📍 Шаг 4: Деактивируем кнопки на столе 1');
      simulatePlayerActionComplete(1);
    },
    () => {
      console.log('📍 Шаг 5: Деактивируем кнопки на всех столах');
      tables.forEach((_, index) => simulatePlayerActionComplete(index + 1));
    },
    () => {
      console.log('📍 Шаг 6: Финальная проверка (должны быть очищены все анимации)');
      updatePlayerTurnAnimations();
      console.log('✅ Демонстрация завершена!');
    }
  ];
  
  function runNextStep() {
    if (currentStep < steps.length) {
      steps[currentStep]();
      currentStep++;
      setTimeout(runNextStep, 2000);
    }
  }
  
  runNextStep();
}

// ===== СИСТЕМА СЧЕТЧИКА РАЗДАЧ ДЛЯ ОДИНОЧНОГО РЕЖИМА =====

// Функция для симуляции завершения раздачи в одиночном режиме
async function handleSinglePlayerHandCompleted(tableElement, handData = null) {
  console.log('🏆 Обработка завершения раздачи в одиночном режиме');
  
  // Получить номер стола
  const tableNumber = Array.from(document.querySelectorAll('.poker-table')).indexOf(tableElement) + 1;
  
  // Создать данные раздачи если не переданы
  if (!handData) {
    handData = {
      tableNumber: tableNumber,
      timestamp: new Date().toISOString(),
      gameMode: 'single-player',
      completed: true
    };
  }
  
  // Уведомить о завершении раздачи для обновления счетчика
  await notifyHandCompletedForSinglePlayer(tableNumber, handData);
  
  // Показать визуальный эффект завершения
  showHandCompletionEffect(tableElement);
  
  // Показать уведомление
  showNotification('Раздача завершена', 'success');
}

// Уведомить о завершении раздачи для обновления счетчика в одиночном режиме
async function notifyHandCompletedForSinglePlayer(tableId, handData) {
  // Проверяем, что система аутентификации доступна
  if (typeof authManager !== 'undefined' && authManager && authManager.currentUser) {
    const result = await authManager.notifyHandCompleted(tableId, handData);
    if (result) {
      console.log(`📊 Счетчик раздач обновлен. Осталось: ${result.remaining_hands}`);
      
      if (!result.can_continue) {
        showNotification('Лимит раздач исчерпан! Обратитесь к администратору.', 'error');
        blockAllTableActions();
      }
      
      return result;
    }
  } else {
    console.log('⚠️ Система аутентификации недоступна или пользователь не авторизован');
  }
  return null;
}

// Показать эффект завершения раздачи
function showHandCompletionEffect(tableElement) {
  // Добавить CSS класс для анимации завершения стола (без анимации банка)
  tableElement.classList.add('hand-completed');
  
  // Убрать эффект через 3 секунды
  setTimeout(() => {
    tableElement.classList.remove('hand-completed');
  }, 3000);
}

// Заблокировать все действия на столах при исчерпании лимита
function blockAllTableActions() {
  console.log('🚫 Блокировка всех действий - лимит раздач исчерпан');
  
  // Заблокировать все кнопки действий
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });
  
  // Заблокировать кнопки управления столом
  document.querySelectorAll('.table-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });
  
  // Показать предупреждение на всех столах
  document.querySelectorAll('.poker-table').forEach(table => {
    showHandLimitWarningOnTable(table);
  });
}

// Показать предупреждение о лимите на конкретном столе
function showHandLimitWarningOnTable(tableElement) {
  // Убрать существующее предупреждение если есть
  const existingWarning = tableElement.querySelector('.hand-limit-warning');
  if (existingWarning) {
    existingWarning.remove();
  }
  
  // Создать новое предупреждение
  const warning = document.createElement('div');
  warning.className = 'hand-limit-warning';
  warning.innerHTML = `
    <div class="warning-content">
      <i class="fas fa-exclamation-triangle"></i>
      <span>Лимит раздач исчерпан</span>
      <small>Обратитесь к администратору</small>
    </div>
  `;
  
  tableElement.appendChild(warning);
}

// Инициализация обработчиков для одиночного режима
function initializeSinglePlayerHandTracking() {
  console.log('🎯 Инициализация отслеживания раздач в одиночном режиме');
  
  // Наблюдатель за изменениями DOM для отслеживания завершения раздач
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // Проверяем, появились ли новые элементы, указывающие на завершение раздачи
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Ищем индикаторы завершения раздачи
            if (node.classList && (
                node.classList.contains('winner-announcement') ||
                node.classList.contains('hand-result') ||
                node.textContent.includes('выиграл') ||
                node.textContent.includes('победил')
              )) {
              
              // Найти родительский стол
              const tableElement = node.closest('.poker-table');
              if (tableElement) {
                console.log('🏆 Обнаружено завершение раздачи через DOM наблюдатель');
                
                // Задержка для корректной обработки
                setTimeout(() => {
                  handleSinglePlayerHandCompleted(tableElement);
                }, 1000);
              }
            }
          }
        });
      }
    });
  });
  
  // Запускаем наблюдатель для всех столов
  document.querySelectorAll('.poker-table').forEach(table => {
    observer.observe(table, {
      childList: true,
      subtree: true
    });
  });
  
  console.log('✅ Отслеживание завершения раздач в одиночном режиме инициализировано');
}

// Функция для тестирования системы счетчика
function testHandCounterSystem() {
  console.log('🧪 Тестирование системы счетчика раздач');
  
  const table = document.querySelector('.poker-table');
  if (table) {
    handleSinglePlayerHandCompleted(table, {
      testMode: true,
      handNumber: 'TEST-001',
      winner: 'Тест игрок'
    });
  } else {
    console.log('❌ Стол не найден для тестирования');
  }
}

// Глобальные функции для консоли разработчика
window.testHandCounterSystem = testHandCounterSystem;
window.handleSinglePlayerHandCompleted = handleSinglePlayerHandCompleted;
window.blockAllTableActions = blockAllTableActions;

// Функция для демонстрации полной системы
function fullHandCounterDemo() {
  console.log('🎭 Полная демонстрация системы счетчика раздач');
  
  // Сначала покажем информацию о текущем пользователе
  if (typeof authManager !== 'undefined' && authManager && authManager.currentUser) {
    console.log(`👤 Текущий пользователь: ${authManager.currentUser.email}`);
    console.log(`🎯 Лимит раздач: ${authManager.currentUser.hand_limit}`);
    
    // Тестируем завершение раздачи
    testHandCounterSystem();
    
    // Через 5 секунд показываем что изменилось
    setTimeout(() => {
      console.log(`🔄 Обновленный лимит: ${authManager.currentUser.hand_limit}`);
    }, 5000);
  } else {
    console.log('❌ Пользователь не авторизован, демонстрация недоступна');
  }
}

window.fullHandCounterDemo = fullHandCounterDemo;