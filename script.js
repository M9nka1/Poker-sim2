// ===== ОСНОВНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ =====
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

  // Загрузка файла префлопа
  const preflopFile = document.getElementById('preflop-file');
  if (preflopFile) {
    preflopFile.addEventListener('change', handlePreflopFile);
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

// ===== ЗАГРУЗКА ПРЕФЛОП ФАЙЛА =====
function handlePreflopFile(event) {
  const file = event.target.files[0];
  if (file && file.type === 'text/plain') {
    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      state.settings.preflopSpot = content;
      
      const preview = document.getElementById('preflop-content');
      preview.textContent = content.substring(0, 200) + (content.length > 200 ? '...' : '');
      preview.style.display = 'block';
    };
    reader.readAsText(file);
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
  
  if (rank === 'any') {
    // Сбросить все выборы и выбрать "любой"
    resetRankButtons(btn.closest('.rank-buttons'));
    btn.classList.add('active');
    state.settings.boardSettings[state.ui.currentStreet].ranks[rankType] = ['any'];
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
    } else {
      const index = currentRanks.indexOf(rank);
      if (index > -1) {
        currentRanks.splice(index, 1);
      }
    }
    
    // Если ничего не выбрано, вернуть "любой"
    if (currentRanks.length === 0) {
      anyBtn.classList.add('active');
      state.settings.boardSettings[state.ui.currentStreet].ranks[rankType] = ['any'];
    }
  }
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
    cell.classList.remove('selected');
    cell.innerHTML = hand; // Вернуть обычный текст
  } else {
    // Добавить руку с текущим весом
    if (currentWeight > 0) {
      state.settings.playerRanges[player].handWeights[hand] = currentWeight;
      cell.classList.add('selected');
      // Показать вес в ячейке
      cell.innerHTML = `${hand}<br><small>${currentWeight}%</small>`;
    }
  }
  
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
        // Пара (AA, KK, etc.) - сохраняем как есть
        result.set(normalizedHand, frequency);
        console.log(`    ✅ Пара: ${normalizedHand} → ${frequency}`);
      } else {
        // Рука без указания s/o - добавляем обе версии, но в правильном формате
        // Важно: сохраняем в формате как в матрице (первая буква больше второй + s/o)
        const suitedHand = normalizedHand + 's';
        const offsuitHand = normalizedHand + 'o';
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
        // Сохраняем руку в правильном формате
        const correctedHand = normalizedHand.toLowerCase(); // Приводим к нижнему регистру для совместимости
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
        <span><i class="fas fa-percentage"></i> ${state.settings.rakePercent}%</span>
        <span><i class="fas fa-dollar-sign"></i> ${state.settings.rakeDollar}</span>
      </div>
    </div>
    <div class="table-board">
      <div class="community-cards">
        <div class="card-slot">?</div>
        <div class="card-slot">?</div>
        <div class="card-slot">?</div>
        <div class="card-slot turn">?</div>
        <div class="card-slot river">?</div>
      </div>
    </div>
    <div class="table-players">
      <div class="player player1">
        <div class="player-info">
          <h4>Игрок 1</h4>
          <span class="player-range">${state.settings.playerRanges.player1.currentWeight}% рук</span>
        </div>
        <div class="player-cards">
          <div class="card-slot">?</div>
          <div class="card-slot">?</div>
        </div>
      </div>
      <div class="player player2">
        <div class="player-info">
          <h4>Игрок 2</h4>
          <span class="player-range">${state.settings.playerRanges.player2.currentWeight}% рук</span>
        </div>
        <div class="player-cards">
          <div class="card-slot">?</div>
          <div class="card-slot">?</div>
        </div>
      </div>
    </div>
    <div class="table-actions">
      <button class="btn btn-primary"><i class="fas fa-play"></i> Начать раздачу</button>
      <button class="btn btn-secondary"><i class="fas fa-redo"></i> Новая раздача</button>
    </div>
  `;
  
  return table;
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
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-primary);
    }
    
    .table-info {
      display: flex;
      gap: 15px;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    
    .table-board {
      text-align: center;
      margin-bottom: 20px;
    }
    
    .community-cards {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-bottom: 15px;
    }
    
    .card-slot {
      width: 50px;
      height: 70px;
      background: var(--bg-tertiary);
      border: 2px dashed var(--border-secondary);
      border-radius: var(--border-radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    
    .card-slot.turn, .card-slot.river {
      opacity: 0.5;
    }
    
    .table-players {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    
    .player {
      flex: 1;
      margin: 0 10px;
    }
    
    .player-info {
      text-align: center;
      margin-bottom: 10px;
    }
    
    .player-info h4 {
      margin-bottom: 5px;
      color: var(--accent-primary);
    }
    
    .player-range {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    .player-cards {
      display: flex;
      gap: 5px;
      justify-content: center;
    }
    
    .player-cards .card-slot {
      width: 40px;
      height: 56px;
    }
    
    .table-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    
    .table-actions .btn {
      padding: 8px 16px;
      font-size: 0.85rem;
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
  
  // Инициализировать активные кнопки по умолчанию
  document.querySelectorAll('[data-player="1"][data-position="BTN"]').forEach(btn => btn.classList.add('active'));
  document.querySelectorAll('[data-player="2"][data-position="BB"]').forEach(btn => btn.classList.add('active'));
  
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
      
      // Обновляем настройки - упрощенная логика для IP/OOP
      const simplifiedPosition = position === 'IP' ? 'BTN' : 'BB'; // IP = BTN, OOP = BB
      state.settings.playerRanges.positions[`player${player}`] = simplifiedPosition;
      
      console.log('🎯 IP/OOP позиция обновлена:', `player${player}`, '=', position, '(', simplifiedPosition, ')');
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

// Автоматический тест при загрузке (только для разработки)
if (typeof window !== 'undefined') {
  window.testHandRangeParsing = testHandRangeParsing;
  window.testUserExample = testUserExample;
  window.testUserSpecificExample = testUserSpecificExample;
} 