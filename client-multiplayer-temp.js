// ===== МУЛЬТИПЛЕЕР КЛИЕНТ =====
class MultiplayerClient {
  constructor() {
    this.socket = null;
    this.userId = null;
    this.sessionId = null;
    this.isConnected = false;
    this.isHost = false;
    this.serverUrl = 'http://localhost:3000';
    
    this.initializeSocket();
  }

  initializeSocket() {
    // Инициализация Socket.IO с явным указанием URL
    this.socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true
    });

    // Показать индикатор подключения
    this.showConnectionStatus();

    // Обработчики подключения
    this.socket.on('connect', () => {
      console.log('✅ Подключен к серверу');
      this.isConnected = true;
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Отключен от сервера');
      this.isConnected = false;
      this.updateConnectionStatus(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Ошибка подключения:', error);
      this.isConnected = false;
      this.updateConnectionStatus(false);
      showNotification('Ошибка подключения к серверу. Проверьте что сервер запущен на порту 3000', 'error');
    });

    // Обработчики игровых событий
    this.socket.on('session-created', this.handleSessionCreated.bind(this));
    this.socket.on('session-joined', this.handleSessionJoined.bind(this));
    this.socket.on('player-joined', this.handlePlayerJoined.bind(this));
    this.socket.on('game-started', this.handleGameStarted.bind(this));
    this.socket.on('action-processed', this.handleActionProcessed.bind(this));
    this.socket.on('street-changed', this.handleStreetChanged.bind(this));
    this.socket.on('hand-history-exported', this.handleHandHistoryExported.bind(this));
    this.socket.on('player-disconnected', this.handlePlayerDisconnected.bind(this));
    this.socket.on('error', this.handleError.bind(this));
    this.socket.on('hand-completed', this.handleHandCompleted.bind(this));
    this.socket.on('table-updated', this.handleTableUpdated.bind(this));
    this.socket.on('new-hand-started', this.handleNewHandStarted.bind(this));
  }

  showConnectionStatus() {
    // Убираем индикатор подключения - он не нужен
    console.log('Connection status initialized');
  }

  updateConnectionStatus(connected) {
    // Убираем обновление статуса подключения
    console.log('Connection status:', connected ? 'connected' : 'disconnected');
  }

  // ===== СОЗДАНИЕ И ПРИСОЕДИНЕНИЕ К СЕССИИ =====
  createSession(playerName) {
    if (!this.isConnected) {
      showNotification('Нет подключения к серверу', 'error');
      return;
    }

    // Преобразовать Set объекты в массивы для JSON сериализации
    const settingsForServer = {
      ...state.settings,
      playerRanges: {
        player1: {
          currentWeight: state.settings.playerRanges.player1.currentWeight,
          handWeights: state.settings.playerRanges.player1.handWeights
        },
        player2: {
          currentWeight: state.settings.playerRanges.player2.currentWeight,
          handWeights: state.settings.playerRanges.player2.handWeights
        },
        // Включаем позиции игроков
        positions: state.settings.playerRanges.positions || {
          player1: 'BTN',
          player2: 'BB'
        }
      }
    };

    // Логирование настроек для отладки
    console.log('🔧 Создание сессии с настройками:', settingsForServer);
    console.log('🃏 Настройки флопа:', settingsForServer.boardSettings.flop);
    console.log('🎯 Диапазоны рук:', settingsForServer.playerRanges);
    console.log('🎯 Позиции игроков:', settingsForServer.playerRanges.positions);
    
    // Детальная информация о диапазонах
    console.log('📊 Player 1 диапазон:', {
      currentWeight: settingsForServer.playerRanges.player1.currentWeight,
      handsCount: Object.keys(settingsForServer.playerRanges.player1.handWeights).length,
      handWeights: settingsForServer.playerRanges.player1.handWeights
    });
    
    console.log('📊 Player 2 диапазон:', {
      currentWeight: settingsForServer.playerRanges.player2.currentWeight,
      handsCount: Object.keys(settingsForServer.playerRanges.player2.handWeights).length,
      handWeights: settingsForServer.playerRanges.player2.handWeights
    });

    const sessionData = {
      playerName: playerName || 'Player 1',
      settings: settingsForServer
    };

    this.socket.emit('create-session', sessionData);
  }

  joinSession(sessionId, playerName) {
    if (!this.isConnected) {
      showNotification('Нет подключения к серверу', 'error');
      return;
    }

    this.socket.emit('join-session', {
      sessionId: sessionId.toUpperCase(),
      playerName: playerName || 'Player 2'
    });
  }

  startGame() {
    if (!this.isHost) {
      showNotification('Только создатель сессии может начать игру', 'warning');
      return;
    }

    this.socket.emit('start-game');
  }

  // ===== ИГРОВЫЕ ДЕЙСТВИЯ =====
  makeAction(tableId, action, amount = 0) {
    console.log('🎲 Отправка действия:', { tableId, action, amount });
    console.log('🎯 tableId тип:', typeof tableId, 'значение:', tableId);
    
    // Убедиться что tableId это число
    const numericTableId = parseInt(tableId);
    if (isNaN(numericTableId)) {
      console.error('❌ Неверный tableId:', tableId);
      return;
    }
    
    const actionData = {
      tableId: numericTableId,
      action,
      amount: Math.round(amount) // Убедиться что amount в центах
    };
    
    console.log('📤 Отправляемые данные:', actionData);
    this.socket.emit('player-action', actionData);
  }

  nextStreet(tableId, street) {
    this.socket.emit('next-street', {
      tableId,
      street
    });
  }

  exportHandHistory(tableId) {
    this.socket.emit('export-hand-history', {
      tableId
    });
  }

  requestNewHand(tableId) {
    console.log('🔄 Запрос новой раздачи для стола:', tableId);
    this.socket.emit('new-hand', {
      tableId
    });
  }

  // ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
  handleSessionCreated(data) {
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.isHost = true;

    // Показать иконку сессии и компактную панель
    updateSessionIcon(true, data.sessionId);
    this.displaySessionCode(data.sessionId);
    
    // Обновить UI
    this.updateSessionUI(data.sessionInfo);
    
    showNotification(`Сессия создана! Код: ${data.sessionId}`, 'success');
    console.log('Сессия создана:', data);
  }

  handleSessionJoined(data) {
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.isHost = false;

    // Показать иконку сессии и панель для присоединившегося игрока
    updateSessionIcon(true, data.sessionId);
    this.displayJoinedSessionPanel(data.sessionId);

    // Обновить UI
    this.updateSessionUI(data.sessionInfo);
    
    showNotification('Успешно присоединились к сессии!', 'success');
    console.log('Присоединились к сессии:', data);
  }

  handlePlayerJoined(data) {
    this.updateSessionUI(data.sessionInfo);
    showNotification(`${data.playerName} присоединился к игре`, 'info');

    // Если достаточно игроков и мы хост, показать кнопку старта
    if (this.isHost && data.sessionInfo.playersCount >= 2) {
      this.showStartGameButton();
    }
  }

  handleGameStarted(data) {
    closeSettingsPanel();
    this.generateMultiplayerTables(data.sessionInfo);
    showNotification('Игра началась!', 'success');
    console.log('Игра началась:', data);
  }

  handleActionProcessed(data) {
    console.log('✅ Действие обработано:', data.action.action, data);
    
    // Обновить интерфейс стола после действия
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Обработать автоматическую смену улицы
    if (data.streetChanged) {
      console.log(`🔄 Автоматическая смена улицы: ${data.previousStreet} → ${data.tableInfo.street}`);
      this.showNotification(`Новая улица: ${this.getStreetName(data.tableInfo.street)}`, 'info');
      
      // Дополнительные эффекты для смены улицы
      this.highlightStreetChange(data.tableId, data.tableInfo.street);
    }
    
    // Обработать завершение раздачи
    if (data.handCompleted) {
      console.log('🏁 Раздача завершена автоматически');
      this.showNotification('Раздача завершена', 'success');
      
      // Эффекты завершения раздачи
      this.highlightHandCompletion(data.tableId);
    }
    
    // Показать уведомление о действии (если раздача не завершилась)
    if (!data.handCompleted) {
      const actionText = this.getActionText(data.action);
      this.showNotification(`Действие: ${actionText}`, 'info');
    }
  }

  // Новый обработчик события завершения раздачи
  handleHandCompleted(data) {
    console.log('🏆 Получено событие завершения раздачи:', data);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать подробную информацию о результате
    this.showHandResults(data);
    
    // Автоматически подготовить к новой раздаче через несколько секунд
    setTimeout(() => {
      this.prepareNewHand(data.tableId);
    }, 3000);
  }

  // Показать результаты раздачи
  showHandResults(data) {
    const tableElement = document.querySelector(`[data-table-id="${data.tableId}"]`);
    if (!tableElement) return;
    
    // Создать оверлей с результатами
    const overlay = document.createElement('div');
    overlay.className = 'hand-results-overlay';
    overlay.innerHTML = `
      <div class="hand-results-content">
        <h3>🏆 Раздача завершена</h3>
        <div class="results-details">
          <p>Банк: $${((data.tableInfo.pot || 0) / 100).toFixed(2)}</p>
          <p>Раздача #${data.tableInfo.handNumber || 1}</p>
        </div>
        <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">
          Продолжить
        </button>
      </div>
    `;
    
    tableElement.appendChild(overlay);
    
    // Автоматически убрать через 5 секунд
    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.remove();
      }
    }, 5000);
  }

  // Подготовить к новой раздаче
  prepareNewHand(tableId) {
    console.log(`🔄 Подготовка к новой раздаче на столе ${tableId}`);
    // Здесь можно добавить логику для автоматического начала новой раздачи
    // Пока просто показываем сообщение
    this.showNotification('Готов к новой раздаче', 'info');
  }

  // Получить читаемое название улицы
  getStreetName(street) {
    const streetNames = {
      'preflop': 'Префлоп',
      'flop': 'Флоп',
      'turn': 'Терн',
      'river': 'Ривер'
    };
    return streetNames[street] || street;
  }

  // Подсветить смену улицы
  highlightStreetChange(tableId, newStreet) {
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (!tableElement) return;
    
    // Добавить CSS класс для анимации
    tableElement.classList.add('street-changed');
    
    // Найти область с картами борда и подсветить новую карту
    const communityCards = tableElement.querySelector('.community-cards');
    if (communityCards) {
      communityCards.classList.add('new-card-highlight');
      
      // Убрать подсветку через 2 секунды
      setTimeout(() => {
        communityCards.classList.remove('new-card-highlight');
        tableElement.classList.remove('street-changed');
      }, 2000);
    }
  }

  // Подсветить завершение раздачи
  highlightHandCompletion(tableId) {
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (!tableElement) return;
    
    // Добавить CSS класс для анимации завершения
    tableElement.classList.add('hand-completed');
    
    // Найти область банка и сделать её пульсирующей
    const potDisplay = tableElement.querySelector('.pot-display');
    if (potDisplay) {
      potDisplay.classList.add('pot-winner-highlight');
      
      // Убрать эффекты через 3 секунды
      setTimeout(() => {
        potDisplay.classList.remove('pot-winner-highlight');
        tableElement.classList.remove('hand-completed');
      }, 3000);
    }
  }

  getActionText(action) {
    switch (action.action) {
      case 'fold': return 'Фолд';
      case 'check': return 'Чек';
      case 'call': return `Колл $${(action.amount / 100).toFixed(2)}`;
      case 'bet': return `Бет $${(action.amount / 100).toFixed(2)}`;
      case 'raise': return `Рейз до $${(action.amount / 100).toFixed(2)}`;
      default: return action.action;
    }
  }

  handleStreetChanged(data) {
    // Обновить интерфейс стола для новой улицы
    this.updateTableUI(data.tableId, data.tableInfo);
    
    showNotification(`Новая улица: ${data.street}`, 'info');
    console.log('Улица изменена:', data);
  }

  handleHandHistoryExported(data) {
    // Скачать файл HandHistory
    this.downloadHandHistory(data.handHistory, data.tableId);
    
    showNotification('HandHistory экспортирован', 'success');
    console.log('HandHistory экспортирован:', data);
  }

  handlePlayerDisconnected(data) {
    this.updateSessionUI(data.sessionInfo);
    showNotification('Игрок отключился', 'warning');
  }

  handleError(data) {
    showNotification(data.message, 'error');
    console.error('Ошибка сервера:', data);
  }

  // ===== UI МЕТОДЫ =====
  displaySessionCode(sessionId) {
    // Убираем создание панели сессии - будем использовать только всплывающее меню
    console.log('Session created with ID:', sessionId);
  }

  displayJoinedSessionPanel(sessionId) {
    // Убираем создание панели для присоединившегося игрока
    console.log('Joined session with ID:', sessionId);
  }

  updateTablesGridLayout(collapsed) {
    const tablesGrid = document.querySelector('.tables-grid');
    if (tablesGrid) {
      tablesGrid.classList.remove('with-session-panel', 'collapsed-session-panel');
      if (collapsed) {
        tablesGrid.classList.add('collapsed-session-panel');
      } else {
        tablesGrid.classList.add('with-session-panel');
      }
    }
  }

  showStartGameButton() {
    const sessionPanel = document.querySelector('.session-panel-content');
    if (sessionPanel && !sessionPanel.querySelector('.start-game-btn')) {
      const startButton = document.createElement('button');
      startButton.className = 'btn btn-primary start-game-btn';
      startButton.innerHTML = '<i class="fas fa-play"></i> Начать игру';
      startButton.onclick = () => this.startGame();
      sessionPanel.appendChild(startButton);
    }
  }

  updateSessionUI(sessionInfo) {
    // Обновить информацию о сессии в компактной панели
    const sessionStats = document.querySelector('.session-stats-compact');
    if (sessionStats) {
      sessionStats.innerHTML = `
        <div class="stat-compact">
          <span class="stat-label">Игроки:</span>
          <span class="stat-value">${sessionInfo.playersCount}/2</span>
        </div>
        <div class="stat-compact">
          <span class="stat-label">Столы:</span>
          <span class="stat-value">${sessionInfo.tablesCount}</span>
        </div>
        <div class="stat-compact">
          <span class="stat-label">Статус:</span>
          <span class="stat-value status-${sessionInfo.status}">${this.getStatusText(sessionInfo.status)}</span>
        </div>
      `;
    }

    // Добавить или обновить список игроков
    this.updatePlayersList(sessionInfo);
  }

  updatePlayersList(sessionInfo) {
    // Найти или создать список игроков
    let playersList = document.querySelector('.players-list');
    
    if (!playersList) {
      playersList = document.createElement('div');
      playersList.className = 'players-list';
      
      const sessionPanel = document.querySelector('.session-panel-content');
      if (sessionPanel) {
        const instructions = sessionPanel.querySelector('.session-instructions');
        sessionPanel.insertBefore(playersList, instructions);
      }
    }

    // Собрать информацию об игроках из столов
    const allPlayers = new Set();
    if (sessionInfo.tables && sessionInfo.tables.length > 0) {
      sessionInfo.tables.forEach(table => {
        table.players.forEach(player => {
          allPlayers.add(player.name);
        });
      });
    }

    // Отобразить список игроков
    playersList.innerHTML = `
      <div class="players-list-header">
        <i class="fas fa-users"></i> Подключенные игроки:
      </div>
      <div class="players-list-content">
        ${Array.from(allPlayers).map(playerName => 
          `<div class="player-item">
            <i class="fas fa-user"></i> ${playerName}
          </div>`
        ).join('')}
      </div>
    `;
  }

  getStatusText(status) {
    const statusMap = {
      'waiting': 'Ожидание',
      'playing': 'Игра',
      'finished': 'Завершена'
    };
    return statusMap[status] || status;
  }

  generateMultiplayerTables(sessionInfo) {
    console.log('🎲 Генерация столов, данные сессии:', sessionInfo);
    console.log('🎲 Количество столов:', sessionInfo.tables?.length);
    console.log('🎲 Данные столов:', sessionInfo.tables);
    
    const tablesArea = document.getElementById('tables-area');
    
    // Скрыть welcome screen но оставить session panel
    const welcomeScreen = tablesArea.querySelector('.welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.style.display = 'none';
    }
    
    // Удалить старую сетку столов если есть
    const existingGrid = tablesArea.querySelector('.tables-grid');
    if (existingGrid) {
      existingGrid.remove();
    }

    const tablesGrid = document.createElement('div');
    tablesGrid.className = `tables-grid ${this.getTableGridClass(sessionInfo.tablesCount)}`;

    sessionInfo.tables.forEach((tableInfo, index) => {
      console.log(`🎯 Создание стола ${index + 1}:`, tableInfo);
      const table = this.createMultiplayerTable(tableInfo, index + 1);
      tablesGrid.appendChild(table);
    });

    tablesArea.appendChild(tablesGrid);
    
    // Показать иконку экспорта после создания столов
    const exportIcon = document.querySelector('.export-icon');
    if (exportIcon) {
      exportIcon.style.display = 'flex';
    }
  }

  createMultiplayerTable(tableInfo, tableNumber) {
    const table = document.createElement('div');
    table.className = 'poker-table multiplayer-table';
    table.dataset.tableId = tableInfo.tableId;
    
    // Определить героя и оппонента
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponentPlayer = tableInfo.players.find(p => p.id !== this.userId);
    
    // Парсинг информации о банке и блайндах из preflopSpot
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const potAmount = this.calculatePotAmount(tableInfo, handHistoryInfo);
    const effectiveStack = this.calculateEffectiveStack(tableInfo, handHistoryInfo);
    
    console.log('💰 Парсинг hand history:', handHistoryInfo);
    console.log('🏦 Рассчитанный банк:', potAmount);
    console.log('💵 Эффективный стек:', effectiveStack);
    
    table.innerHTML = `
      <div class="table-layout">
        <!-- Верхняя строка: заголовок стола слева + оппонент справа -->
        <div class="top-row">
          <div class="table-header-compact">
            <div class="table-title">Стол ${tableNumber}</div>
            <div class="table-stats">
              <span><i class="fas fa-users"></i> ${tableInfo.players.length}/2</span>
            </div>
          </div>
          <div class="opponent-area-compact">
            ${this.renderOpponentPlayer(opponentPlayer, handHistoryInfo)}
          </div>
        </div>

        <!-- Центральная область: карты и банк -->
        <div class="center-area">
          <div class="board-content">
            <!-- Левая часть: ставки и карты -->
            <div class="board-with-betting">
              <!-- Ставка верхнего игрока -->
              <div class="opponent-bet-display">
                <div class="bet-amount">$0.00</div>
                <!-- Контейнер действий оппонента -->
                <div class="opponent-actions-display">
                  <div class="actions-text"></div>
                </div>
              </div>
              
              <!-- Общие карты -->
              <div class="community-cards">
                ${this.renderCommunityCards(tableInfo.communityCards)}
              </div>
              
              <!-- Ставка нижнего игрока -->
              <div class="hero-bet-display">
                <div class="bet-amount">$0.00</div>
                <!-- Контейнер действий героя -->
                <div class="hero-actions-display">
                  <div class="actions-text"></div>
                </div>
              </div>
            </div>
            
            <!-- Правая часть: информация о банке -->
            <div class="pot-display">
              <div class="pot-label">Банк</div>
              <div class="pot-amount">$${potAmount.toFixed(2)}</div>
              <div class="bb-info">BB: $${handHistoryInfo.bigBlind.toFixed(2)}</div>
              <div class="effective-stack">Эфф: $${effectiveStack.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <!-- Герой как единый блок (аналогично верхнему игроку) -->
        <div class="hero-area">
          <div class="player-section hero-green">
            <div class="player-cards-section">
              ${this.renderHeroCards(heroPlayer)}
            </div>
            <div class="player-info-horizontal-green">
              ${heroPlayer ? `
                <div class="player-name">${heroPlayer.name}</div>
                <div class="player-position">${heroPlayer.position}</div>
                <div class="player-stack">$${((heroPlayer.stack || 0) / 100).toFixed(2)}</div>
              ` : ''}
            </div>
          </div>
          <div class="actions-right">
            <div class="table-actions">
              ${this.renderTableActions(tableInfo, tableInfo.tableId)}
            </div>
          </div>
        </div>
      </div>
    `;
    
    return table;
  }

  renderOpponentPlayer(player, handHistoryInfo) {
    if (!player) {
      return `
        <div class="player-section opponent">
          <div class="player-info-section">
            <div class="player-name">Ожидание игрока...</div>
            <div class="player-position">-</div>
            <div class="player-stack">Стек: $0.00</div>
          </div>
          <div class="player-cards-section">
            <div class="player-card empty">?</div>
            <div class="player-card empty">?</div>
          </div>
        </div>
      `;
    }

    // Используем стек игрока из server.js (уже учитывает ставки)
    const playerStack = (player.stack || 0) / 100; // конвертируем в доллары

    return `
      <div class="player-section opponent">
        <div class="player-info-section">
          <div class="player-name">${player.name}</div>
          <div class="player-position">${player.position}</div>
          <div class="player-stack">Стек: $${playerStack.toFixed(2)}</div>
        </div>
        <div class="player-cards-section">
          ${this.renderPlayerCards(player.cards, 'opponent')}
        </div>
      </div>
    `;
  }

  renderCommunityCards(cards) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (i < cards.length) {
        const card = cards[i];
        const suitClass = this.getSuitClass(card.suit);
        html += `<div class="community-card ${suitClass}" data-suit="${card.suit}">
                   <span class="card-rank">${card.rank}</span>
                 </div>`;
      } else {
        html += `<div class="community-card empty">?</div>`;
      }
    }
    return html;
  }

  renderPlayerCards(cards, role) {
    if (!cards || cards.length === 0) {
      return `
        <div class="player-card empty">?</div>
        <div class="player-card empty">?</div>
      `;
    }

    // Для оппонента всегда показываем закрытые карты (рубашки)
    if (role === 'opponent') {
      return `
        <div class="player-card hidden"><i class="fas fa-square"></i></div>
        <div class="player-card hidden"><i class="fas fa-square"></i></div>
      `;
    }

    // Для героя показываем открытые карты
    return cards.map(card => {
      if (card.hidden) {
        // Рубашка карты
        return `<div class="player-card hidden"><i class="fas fa-square"></i></div>`;
      } else {
        // Открытая карта
        const suitClass = this.getSuitClass(card.suit);
        return `<div class="player-card ${suitClass}" data-suit="${card.suit}">
                  <span class="card-rank">${card.rank}</span>
                </div>`;
      }
    }).join('');
  }

  getSuitClass(suit) {
    const suitMap = {
      '♥': 'hearts',
      '♦': 'diamonds', 
      '♣': 'clubs',
      '♠': 'spades'
    };
    return suitMap[suit] || 'spades';
  }

  renderTableActions(tableInfo, tableId = null) {
    // Использовать переданный tableId или взять из tableInfo
    const currentTableId = tableId || tableInfo.tableId;
    if (!currentTableId) {
      console.error('❌ Не удалось определить tableId для кнопок действий');
      return '<div class="action-info">Ошибка: не определен ID стола</div>';
    }
    
    console.log('🎮 Генерация кнопок действий для стола:', currentTableId);
    
    // Определить героя и его позицию
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    if (!heroPlayer) return '';
    
    // Использовать позицию из данных игрока
    const heroPosition = heroPlayer.position;
    
    // Получить оппонента
    const opponent = tableInfo.players.find(p => p.id !== this.userId);
    const opponentPosition = opponent ? opponent.position : null;
    
    // Определить состояние торгов на текущей улице
    const currentStreet = tableInfo.currentStreet || 'preflop';
    const streetBets = tableInfo.streetBets || {};
    const currentBets = streetBets[currentStreet] || {};
    const heroCurrentBet = currentBets[this.userId] || 0;
    const opponentCurrentBet = currentBets[opponent?.id] || 0;
    const maxBet = Math.max(heroCurrentBet, opponentCurrentBet, 0);
    
    // Рассчитать размер пота для кнопок сайзинга
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const potAmount = this.calculatePotAmount(tableInfo, handHistoryInfo);
    
    console.log(`🎯 Герой: ${heroPosition} vs Оппонент: ${opponentPosition}`);
    console.log(`💰 Ставки: Герой ${heroCurrentBet}, Оппонент ${opponentCurrentBet}, Макс: ${maxBet}`);
    console.log(`🏦 Размер пота: $${potAmount.toFixed(2)}`);
    
    // Проверить очередь хода
    if (!this.isHeroTurn(tableInfo, heroPlayer)) {
      return `
        <div class="table-actions" style="opacity: 0.5; pointer-events: none;">
          <div style="text-align: center; color: #666; font-size: 0.8rem;">Ожидание...</div>
        </div>
      `;
    }
    
    // Определить доступные действия
    const canCheck = heroCurrentBet === maxBet;
    const canCall = heroCurrentBet < maxBet;
    const callAmount = maxBet - heroCurrentBet;

    let actionsHTML = `
      <div class="table-actions">
        <!-- Кнопки сайзинга -->
        <div class="sizing-buttons">
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 25, ${potAmount})" title="25% пота">25</button>
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 50, ${potAmount})" title="50% пота">50</button>
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 75, ${potAmount})" title="75% пота">75</button>
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 150, ${potAmount})" title="150% пота">150</button>
          <input type="text" class="sizing-input" id="sizing-input-${currentTableId}" placeholder="$" title="Размер ставки" 
                 onwheel="multiplayerClient.handleSizingWheel(event, ${currentTableId})"
                 onkeydown="multiplayerClient.handleSizingKeydown(event, ${currentTableId})"
                 onclick="this.select()">
          <button class="sizing-settings-btn" onclick="multiplayerClient.showSizingSettings(${currentTableId})" title="Настройки сайзингов">⚙</button>
        </div>
        
        <!-- Основные кнопки действий -->
        <div class="main-actions">
    `;
    
    // Всегда доступен FOLD (кроме случая когда можно чекнуть бесплатно)
    if (!canCheck) {
      actionsHTML += `<button class="action-btn fold-btn" onclick="multiplayerClient.makeAction(${currentTableId}, 'fold')">FOLD</button>`;
    }
    
    // CHECK или CALL
    if (canCheck) {
      actionsHTML += `<button class="action-btn check-btn" onclick="multiplayerClient.makeAction(${currentTableId}, 'check')">CHECK</button>`;
    } else if (canCall) {
      actionsHTML += `<button class="action-btn call-btn" onclick="multiplayerClient.makeAction(${currentTableId}, 'call', ${callAmount})">CALL $${(callAmount / 100).toFixed(2)}</button>`;
    }
    
    // BET или RAISE
    if (canCheck) {
      actionsHTML += `<button class="action-btn bet-btn" onclick="multiplayerClient.makeBetFromInput(${currentTableId}, 'bet')">BET</button>`;
    } else {
      actionsHTML += `<button class="action-btn raise-btn" onclick="multiplayerClient.makeBetFromInput(${currentTableId}, 'raise')">RAISE</button>`;
    }
    
    actionsHTML += '</div></div>';
    
    console.log('🎮 Сгенерированы кнопки действий для стола', currentTableId);
    return actionsHTML;
  }

  getPlayerPosition(isPlayerOne) {
    // Получить позицию из настроек или использовать позицию из данных игрока
    return isPlayerOne ? 'player1' : 'player2';
  }

  isHeroTurn(tableInfo, heroPlayer) {
    // Простая логика для определения очереди хода в хедс-ап
    const currentStreet = tableInfo.currentStreet || 'preflop';
    const streetBets = tableInfo.streetBets || {};
    const currentBets = streetBets[currentStreet] || {};
    
    console.log('🎯 Проверка очереди хода:', {
      heroPosition: heroPlayer.position,
      currentStreet,
      currentBets
    });
    
    // Получить оппонента
    const opponent = tableInfo.players.find(p => p.id !== heroPlayer.id);
    if (!opponent) return false;
    
    console.log('🎯 Оппонент:', {
      opponentPosition: opponent.position,
      heroPosition: heroPlayer.position
    });
    
    // Проверить кто уже действовал на этой улице
    const heroActed = currentBets.hasOwnProperty(heroPlayer.id);
    const opponentActed = currentBets.hasOwnProperty(opponent.id);
    const heroBet = currentBets[heroPlayer.id] || 0;
    const opponentBet = currentBets[opponent.id] || 0;
    
    console.log('🎯 Состояние действий:', {
      heroActed,
      opponentActed,
      heroBet,
      opponentBet,
      heroPosition: heroPlayer.position,
      opponentPosition: opponent.position
    });
    
    // Определить кто должен ходить первым на основе позиций
    const isHeroInPosition = this.isInPosition(heroPlayer.position, opponent.position);
    
    console.log('🎯 Позиционность:', {
      isHeroInPosition,
      heroPosition: heroPlayer.position,
      opponentPosition: opponent.position
    });
    
    // Если никто еще не действовал, ходит OOP (вне позиции)
    if (!heroActed && !opponentActed) {
      const shouldHeroActFirst = !isHeroInPosition;
      console.log('🎯 Никто не действовал, должен ходить OOP:', shouldHeroActFirst);
      return shouldHeroActFirst;
    }
    
    // Если один игрок уже действовал, ходит другой
    if (heroActed && !opponentActed) {
      console.log('🎯 Герой уже действовал, ходит оппонент: false');
      return false;
    }
    
    if (opponentActed && !heroActed) {
      console.log('🎯 Оппонент уже действовал, ходит герой: true');
      return true;
    }
    
    // Если оба действовали и ставки равны, раунд торгов завершен
    if (heroActed && opponentActed && heroBet === opponentBet) {
      console.log('🎯 Оба действовали с равными ставками, торги завершены: false');
      return false;
    }
    
    // Если ставки разные, должен отвечать тот, у кого меньше ставка
    if (heroActed && opponentActed && heroBet !== opponentBet) {
      const shouldHeroAct = heroBet < opponentBet;
      console.log('🎯 Разные ставки, должен отвечать тот у кого меньше:', shouldHeroAct);
      return shouldHeroAct;
    }
    
    console.log('🎯 Неопределенная ситуация, возвращаем false');
    return false;
  }

  showBetDialog(tableId) {
    const betAmount = prompt('Введите размер ставки (в долларах):');
    if (betAmount && !isNaN(betAmount)) {
      const amountInCents = Math.round(parseFloat(betAmount) * 100);
      if (amountInCents > 0) {
        this.makeAction(tableId, 'bet', amountInCents);
      }
    }
  }

  showRaiseDialog(tableId) {
    const raiseAmount = prompt('Введите размер рейза (в долларах):');
    if (raiseAmount && !isNaN(raiseAmount)) {
      const amountInCents = Math.round(parseFloat(raiseAmount) * 100);
      if (amountInCents > 0) {
        this.makeAction(tableId, 'raise', amountInCents);
      }
    }
  }

  // Методы для работы с кнопками сайзинга
  setSizingPercentage(tableId, percentage, potAmount) {
    // potAmount уже в долларах (приходит из calculatePotAmount)
    const betAmount = potAmount * (percentage / 100);
    const betInDollars = betAmount.toFixed(2);
    
    const inputElement = document.getElementById(`sizing-input-${tableId}`);
    if (inputElement) {
      inputElement.value = betInDollars;
      inputElement.focus();
    }
    
    console.log(`💰 Установлен сайзинг ${percentage}% от пота $${potAmount.toFixed(2)}: $${betInDollars}`);
  }

  handleSizingWheel(event, tableId) {
    event.preventDefault();
    
    const inputElement = event.target;
    const currentValue = parseFloat(inputElement.value) || 0;
    const bigBlindAmount = 2; // Предполагаем BB = $2, можно получить из tableInfo
    
    // Определить направление прокрутки
    const delta = event.deltaY > 0 ? -bigBlindAmount : bigBlindAmount;
    const newValue = Math.max(0, currentValue + delta);
    
    inputElement.value = newValue.toFixed(2);
    
    console.log(`🖱️ Изменение размера ставки колесиком: $${newValue.toFixed(2)}`);
  }

  handleSizingKeydown(event, tableId) {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Определить тип действия (bet или raise) на основе состояния игры
      const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
      const checkBtn = tableElement?.querySelector('.check-btn');
      const actionType = checkBtn ? 'bet' : 'raise';
      
      this.makeBetFromInput(tableId, actionType);
    }
  }

  makeBetFromInput(tableId, actionType) {
    const inputElement = document.getElementById(`sizing-input-${tableId}`);
    if (!inputElement) {
      this.showBetDialog(tableId);
      return;
    }
    
    const betAmountStr = inputElement.value.trim();
    if (!betAmountStr || isNaN(betAmountStr)) {
      // Если поле пустое или некорректное, показать стандартный диалог
      if (actionType === 'bet') {
        this.showBetDialog(tableId);
      } else {
        this.showRaiseDialog(tableId);
      }
      return;
    }
    
    const betAmount = parseFloat(betAmountStr);
    if (betAmount <= 0) {
      alert('Размер ставки должен быть больше нуля');
      return;
    }
    
    const amountInCents = Math.round(betAmount * 100);
    this.makeAction(tableId, actionType, amountInCents);
    
    // Очистить поле после ставки
    inputElement.value = '';
    
    console.log(`💰 ${actionType.toUpperCase()} из поля ввода: $${betAmount.toFixed(2)}`);
  }

  showSizingSettings(tableId) {
    // Показать модальное окно с настройками кнопок сайзинга
    const settings = this.getSizingSettings() || [25, 50, 75, 150];
    const settingsStr = settings.join(', ');
    
    const newSettings = prompt(
      `Введите проценты для кнопок сайзинга через запятую:\nТекущие: ${settingsStr}`,
      settingsStr
    );
    
    if (newSettings) {
      try {
        const values = newSettings.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v > 0);
        if (values.length > 0) {
          this.setSizingSettings(values);
          // Обновить интерфейс стола для отображения новых кнопок
          const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
          if (tableElement) {
            // Найти tableInfo для обновления
            // Это упрощенная версия - в реальности нужно получить актуальные данные стола
            console.log('⚙️ Настройки сайзинга обновлены:', values);
          }
        }
      } catch (error) {
        alert('Ошибка в формате. Используйте числа через запятую (например: 25, 50, 75, 100)');
      }
    }
  }

  getSizingSettings() {
    try {
      return JSON.parse(localStorage.getItem('pokersim_sizing_settings'));
    } catch {
      return null;
    }
  }

  setSizingSettings(settings) {
    localStorage.setItem('pokersim_sizing_settings', JSON.stringify(settings));
  }

  updateTableUI(tableId, tableInfo) {
    console.log('🔄 Обновление интерфейса стола:', tableId, tableInfo);
    
    const tableElement = document.querySelector(`[data-table-id=\"${tableId}\"]`);
    if (!tableElement) return;

    // Определить героя и оппонента
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponentPlayer = tableInfo.players.find(p => p.id !== this.userId);
    
    // Парсинг информации о банке и блайндах
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const potAmount = this.calculatePotAmount(tableInfo, handHistoryInfo);
    const effectiveStack = this.calculateEffectiveStack(tableInfo, handHistoryInfo);

    console.log('💰 Обновление - парсинг hand history:', handHistoryInfo);
    console.log('🏦 Обновление - рассчитанный банк:', potAmount);
    console.log('💵 Обновление - эффективный стек:', effectiveStack);

    // Обновить карты героя
    if (heroPlayer) {
      const heroCardsArea = tableElement.querySelector('.hero-cards-center');
      if (heroCardsArea) {
        heroCardsArea.innerHTML = this.renderHeroCards(heroPlayer);
      }
      
      // Обновить информацию о герое
      const heroInfoArea = tableElement.querySelector('.player-section.hero-green .player-info-horizontal-green');
      if (heroInfoArea) {
        const heroStack = (heroPlayer.stack || 0) / 100; // конвертируем в доллары
        heroInfoArea.innerHTML = `
          <div class="player-name">${heroPlayer.name}</div>
          <div class="player-position">${heroPlayer.position}</div>
          <div class="player-stack">Стек: $${heroStack.toFixed(2)}</div>
        `;
      }
    }

    // Обновить информацию об оппоненте
    if (opponentPlayer) {
      const opponentArea = tableElement.querySelector('.opponent-area-compact');
      if (opponentArea) {
        opponentArea.innerHTML = this.renderOpponentPlayer(opponentPlayer, handHistoryInfo);
      }
    }
    
    // Обновить карты борда
    const communityCardsArea = tableElement.querySelector('.community-cards');
    if (communityCardsArea) {
      communityCardsArea.innerHTML = this.renderCommunityCards(tableInfo.communityCards || []);
    }

    // Обновить информацию о банке
    const potDisplay = tableElement.querySelector('.pot-display');
    if (potDisplay) {
      potDisplay.innerHTML = `
        <div class="pot-label">Банк</div>
        <div class="pot-amount">$${potAmount.toFixed(2)}</div>
        <div class="bb-info">BB: $${handHistoryInfo.bigBlind.toFixed(2)}</div>
        <div class="effective-stack">Эфф: $${effectiveStack.toFixed(2)}</div>
      `;
    }

    // Обновить ставки игроков
    const opponentBetDisplay = tableElement.querySelector('.opponent-bet-display .bet-amount');
    const heroBetDisplay = tableElement.querySelector('.hero-bet-display .bet-amount');
    
    if (opponentBetDisplay && opponentPlayer) {
      const opponentBetAmount = (opponentPlayer.bet || 0) / 100;
      opponentBetDisplay.textContent = `$${opponentBetAmount.toFixed(2)}`;
    }
    
    if (heroBetDisplay && heroPlayer) {
      const heroBetAmount = (heroPlayer.bet || 0) / 100;
      heroBetDisplay.textContent = `$${heroBetAmount.toFixed(2)}`;
    }

    // Обновить кнопки действий
    const actionsArea = tableElement.querySelector('.table-actions');
    if (actionsArea) {
      const newActions = this.renderTableActions(tableInfo, tableId);
      console.log('🎮 Новые кнопки действий для стола', tableId, ':', newActions);
      actionsArea.innerHTML = newActions;
    }
  }

  getTableGridClass(tablesCount) {
    const classMap = {
      1: 'one-table',
      2: 'two-tables',
      3: 'three-tables',
      4: 'four-tables'
    };
    return classMap[tablesCount] || 'one-table';
  }

  downloadHandHistory(handHistory, tableId) {
    const filename = `hand_${handHistory.raw.handId}_table_${tableId}.txt`;
    const content = handHistory.formatted;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  renderHeroCards(player) {
    if (!player) {
      return `
        <div class="player-cards-section">
          <div class="player-card empty">?</div>
          <div class="player-card empty">?</div>
        </div>
      `;
    }

    return `
      <div class="player-cards-section">
        ${this.renderPlayerCards(player.cards, 'hero')}
      </div>
    `;
  }

  renderHeroWithActions(player, tableId) {
    // Implementation of renderHeroWithActions method
  }

  showNotification(message, type = 'info') {
    // Попробовать использовать глобальную функцию showNotification если она существует
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, type);
      return;
    }
    
    // Фолбек: простое уведомление в консоли
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Можно также показать alert для важных сообщений
    if (type === 'error') {
      alert(`Ошибка: ${message}`);
    }
  }

  // Определить кто в позиции (IP) против кого (OOP)
  isInPosition(heroPosition, opponentPosition) {
    // Порядок позиций от ранней к поздней
    const positionOrder = ['SB', 'BB', 'EP', 'MP', 'CO', 'BTN'];
    
    const heroIndex = positionOrder.indexOf(heroPosition);
    const opponentIndex = positionOrder.indexOf(opponentPosition);
    
    // Если позиция не найдена, вернуть false
    if (heroIndex === -1 || opponentIndex === -1) {
      return false;
    }
    
    // Игрок в позиции, если его индекс больше (позже по очереди)
    return heroIndex > opponentIndex;
  }

  parseHandHistoryInfo(tableInfo) {
    // Если сервер уже предоставил парсинг информации, используем её
    if (tableInfo.handHistoryInfo) {
      return tableInfo.handHistoryInfo;
    }

    // Иначе используем значения по умолчанию
    return {
      bigBlind: 1.00,
      smallBlind: 0.50,
      initialPot: 0,
      effectiveStack: 100.00,
      flopBets: { player1: 0, player2: 0 },
      turnBets: { player1: 0, player2: 0 },
      riverBets: { player1: 0, player2: 0 }
    };
  }

  calculatePotAmount(tableInfo, handHistoryInfo) {
    // Используем реальное значение банка с сервера (уже в центах)
    // Конвертируем в доллары для отображения  
    return (tableInfo.pot || 0) / 100;
  }

  calculateEffectiveStack(tableInfo, handHistoryInfo) {
    // Получить героя для расчета эффективного стека
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponentPlayer = tableInfo.players.find(p => p.id !== this.userId);
    
    if (!heroPlayer || !opponentPlayer) {
      return handHistoryInfo.effectiveStack || 1000; // fallback
    }
    
    // Эффективный стек = минимум из стеков игроков
    const heroStack = (heroPlayer.stack || 0) / 100; // конвертируем в доллары
    const opponentStack = (opponentPlayer.stack || 0) / 100;
    
    return Math.min(heroStack, opponentStack);
  }

  calculateStreetBets(tableInfo, street) {
    // Подсчитать общую сумму ставок на улице
    const streetBets = tableInfo.streetBets?.[street] || {};
    return Object.values(streetBets).reduce((sum, bet) => sum + (bet / 100), 0);
  }

  // Обработчик обновления стола
  handleTableUpdated(data) {
    console.log('📡 Получено обновление стола:', data);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать сообщение если есть
    if (data.message) {
      this.showNotification(data.message, 'info');
    }
    
    console.log(`✅ Стол ${data.tableId} обновлен: ${data.message || 'обновление состояния'}`);
  }

  handleNewHandStarted(data) {
    console.log('🎲 Началась новая раздача:', data);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать уведомление
    this.showNotification(`Новая раздача началась на столе ${data.tableId}`, 'info');
    
    console.log(`✅ Стол ${data.tableId} - новая раздача инициализирована`);
  }

  handleAllInDealStarted(data) {
    console.log('🎯 Началась автоматическая раздача all-in:', data);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать специальное уведомление all-in
    this.showAllInNotification(data.tableId, 'All-in! Автоматическая раздача карт...');
    
    // Заблокировать кнопки действий на столе
    this.disableTableActions(data.tableId);
    
    console.log(`✅ Стол ${data.tableId} - началась all-in раздача`);
  }

  handleCardDealtAllIn(data) {
    console.log('🃏 Карта раздана в all-in режиме:', data);
    
    // Обновить интерфейс стола с новой картой
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать анимацию новой карты
    this.animateNewCard(data.tableId, data.street);
    
    // Показать уведомление о раздаче карты
    this.showNotification(`Раздача: ${data.streetName}`, 'info');
    
    console.log(`✅ Стол ${data.tableId} - раздана карта ${data.street}`);
  }
  
  // Показать специальное all-in уведомление
  showAllInNotification(tableId, message) {
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (!tableElement) return;
    
    // Создать оверлей all-in
    const overlay = document.createElement('div');
    overlay.className = 'all-in-overlay';
    overlay.innerHTML = `
      <div class="all-in-content">
        <div class="all-in-icon">🎯</div>
        <h3>ALL-IN!</h3>
        <p>${message}</p>
        <div class="all-in-progress">
          <div class="progress-bar"></div>
        </div>
      </div>
    `;
    
    // Добавить стили для оверлея
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 140, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      border-radius: 8px;
      backdrop-filter: blur(3px);
    `;
    
    tableElement.appendChild(overlay);
    
    // Убрать через несколько секунд
    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s ease';
        setTimeout(() => overlay.remove(), 500);
      }
    }, 3000);
  }
  
  // Анимация новой карты
  animateNewCard(tableId, street) {
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (!tableElement) return;
    
    const communityCards = tableElement.querySelector('.community-cards');
    if (!communityCards) return;
    
    // Добавить CSS класс для анимации
    communityCards.classList.add('new-card-animation');
    
    // Создать временный эффект вспышки
    const flash = document.createElement('div');
    flash.className = 'card-flash-effect';
    flash.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(45deg, #ffd700, #ffed4e);
      opacity: 0.7;
      border-radius: 8px;
      animation: cardFlash 0.5s ease-out;
      pointer-events: none;
      z-index: 100;
    `;
    
    communityCards.appendChild(flash);
    
    // Убрать эффекты через время
    setTimeout(() => {
      communityCards.classList.remove('new-card-animation');
      if (flash.parentElement) {
        flash.remove();
      }
    }, 1000);
  }
  
  // Заблокировать кнопки действий на столе
  disableTableActions(tableId) {
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (!tableElement) return;
    
    const actionsArea = tableElement.querySelector('.table-actions');
    if (actionsArea) {
      actionsArea.style.opacity = '0.5';
      actionsArea.style.pointerEvents = 'none';
      
      // Показать сообщение вместо кнопок
      actionsArea.innerHTML = `
        <div class="all-in-message">
          <i class="fas fa-clock"></i>
          <div>All-in режим</div>
          <div style="font-size: 0.8rem; color: #ccc;">Автоматическая раздача карт...</div>
        </div>
      `;
    }
  }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
function copySessionCode(sessionId) {
  // Скопировать код в буфер обмена
  navigator.clipboard.writeText(sessionId).then(() => {
    // Визуальная обратная связь
    const button = event.target.closest('button');
    const originalText = button.innerHTML;
    
    button.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
    button.style.background = 'linear-gradient(135deg, #4ade80, #06d6a0)';
    button.style.color = '#0a0a0a';
    
    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.background = '';
      button.style.color = '';
    }, 2000);
    
    showNotification(`Код сессии ${sessionId} скопирован в буфер обмена`, 'success');
  }).catch(err => {
    // Fallback для старых браузеров
    const textArea = document.createElement('textarea');
    textArea.value = sessionId;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    showNotification(`Код сессии ${sessionId} скопирован`, 'success');
  });
}

function showJoinSessionDialog() {
  const sessionId = prompt('Введите код сессии:');
  if (sessionId) {
    const playerName = prompt('Введите ваше имя:') || 'Player 2';
    multiplayerClient.joinSession(sessionId, playerName);
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
let multiplayerClient;

document.addEventListener('DOMContentLoaded', function() {
  // Инициализировать мультиплеер клиент
  multiplayerClient = new MultiplayerClient();
  
  // Инициализируем перетаскивание элементов
  initializeDragAndDrop();
  
  // Добавляем стили
  addMultiplayerStyles();
  
  // Убедиться что матрицы рук инициализированы
  // (функции из script.js должны быть уже загружены)
  setTimeout(() => {
    if (typeof generateHandMatrices === 'function') {
      console.log('🎯 Инициализация матриц рук для мультиплеера...');
      generateHandMatrices();
      updateRangeSliders();
      console.log('✅ Матрицы рук инициализированы');
    } else {
      console.warn('⚠️ Функции матриц рук не найдены');
    }
  }, 100);
});

function addMultiplayerStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Стили для всплывающих меню */
    .session-menu {
      box-shadow: var(--shadow-lg);
    }
    
    .session-menu-content h3 {
      margin: 0 0 15px 0;
      color: var(--accent-primary);
      font-size: 1rem;
      font-weight: 600;
    }
    
    .session-options {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .session-code-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .session-label {
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 500;
    }
    
    .session-code-compact {
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      font-size: 1.1rem;
      letter-spacing: 0.1em;
      text-align: center;
    }
    
    .session-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--border-primary);
    }
    
    .btn-sm {
      padding: 8px 12px;
      font-size: 0.85rem;
      border-radius: 6px;
      font-weight: 500;
      transition: all 0.3s ease;
    }
    
    .btn-sm:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    }
    
    .start-game-btn {
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)) !important;
      border: none !important;
      color: white !important;
    }
    
    .start-game-btn:hover {
      background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary)) !important;
    }
    
    /* Дополнительные стили для столов */
    .multiplayer-table .table-header {
      border-bottom: 2px solid var(--accent-primary);
      background: rgba(74, 222, 128, 0.05);
    }
    
    .multiplayer-table .table-header h3 {
      color: var(--accent-primary);
    }
    
    /* Анимации при обновлении карт */
    .player-card.filled,
    .community-card.filled {
      animation: cardFlip 0.3s ease;
    }
    
    @keyframes cardFlip {
      0% { 
        transform: rotateY(-90deg);
        opacity: 0;
      }
      50% {
        transform: rotateY(0deg);
        opacity: 0.5;
      }
      100% { 
        transform: rotateY(0deg);
        opacity: 1;
      }
    }
    
    /* Эффекты при действиях игроков */
    .player-section.active {
      box-shadow: 0 0 15px rgba(74, 222, 128, 0.5);
      border-color: var(--accent-primary);
    }
    
    .player-section.folded {
      opacity: 0.5;
      filter: grayscale(100%);
    }
    
    /* All-in эффекты */
    .all-in-overlay {
      animation: allInAppear 0.5s ease-out;
    }
    
    .all-in-content {
      text-align: center;
      color: white;
      background: rgba(0, 0, 0, 0.8);
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    
    .all-in-icon {
      font-size: 3rem;
      margin-bottom: 10px;
      animation: pulse 1s infinite;
    }
    
    .all-in-content h3 {
      margin: 10px 0;
      font-size: 1.5rem;
      color: #ffd700;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    }
    
    .all-in-progress {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      margin-top: 15px;
      overflow: hidden;
    }
    
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #ffd700, #ffed4e);
      width: 0%;
      animation: progressFill 3s ease-out forwards;
    }
    
    .new-card-animation {
      animation: cardGlow 1s ease-out;
    }
    
    .all-in-message {
      text-align: center;
      padding: 15px;
      background: rgba(255, 140, 0, 0.1);
      border: 2px solid #ff8c00;
      border-radius: 8px;
      color: #ff8c00;
    }
    
    .all-in-message i {
      font-size: 1.2rem;
      margin-bottom: 5px;
      display: block;
    }
    
    @keyframes allInAppear {
      0% {
        opacity: 0;
        transform: scale(0.8);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
    }
    
    @keyframes progressFill {
      0% {
        width: 0%;
      }
      100% {
        width: 100%;
      }
    }
    
    @keyframes cardGlow {
      0% {
        box-shadow: 0 0 0 rgba(255, 215, 0, 0);
      }
      50% {
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
      }
      100% {
        box-shadow: 0 0 0 rgba(255, 215, 0, 0);
      }
    }
    
    @keyframes cardFlash {
      0% {
        opacity: 0;
        transform: scale(0.8);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.05);
      }
      100% {
        opacity: 0;
        transform: scale(1);
      }
    }
  `;
  
  document.head.appendChild(style);
}

// ===== ФУНКЦИИ ДЛЯ КОМПАКТНОГО МЕНЮ =====
function toggleSettingsPanel() {
  const panel = document.querySelector('.settings-panel');
  const isActive = panel.classList.contains('active');
  
  if (isActive) {
    panel.classList.remove('active');
  } else {
    panel.classList.add('active');
    // Инициализируем drag & drop
    initializeDragAndDrop();
  }
}

function showMultiplayerMenu() {
  // Показать меню мультиплеера
  const menu = document.createElement('div');
  menu.className = 'multiplayer-menu';
  menu.innerHTML = `
    <div class="multiplayer-menu-content">
      <h3><i class="fas fa-users"></i> Мультиплеер</h3>
      <div class="multiplayer-options">
        <button class="btn btn-primary" onclick="showCreateSessionDialog(); closeMultiplayerMenu()">
          <i class="fas fa-plus"></i> Создать сессию
        </button>
        <button class="btn btn-secondary" onclick="showJoinSessionDialog(); closeMultiplayerMenu()">
          <i class="fas fa-sign-in-alt"></i> Присоединиться
        </button>
      </div>
    </div>
  `;
  
  menu.style.cssText = `
    position: fixed;
    top: 70px;
    left: 15px;
    background: rgba(0, 0, 0, 0.95);
    border: 2px solid var(--accent-primary);
    border-radius: 8px;
    padding: 15px;
    z-index: 1001;
    backdrop-filter: blur(10px);
    min-width: 200px;
  `;
  
  document.body.appendChild(menu);
  
  // Закрыть при клике вне меню
  setTimeout(() => {
    document.addEventListener('click', function closeOnOutside(e) {
      if (!menu.contains(e.target) && !e.target.closest('.menu-icon[data-tooltip="Мультиплеер"]')) {
        closeMultiplayerMenu();
        document.removeEventListener('click', closeOnOutside);
      }
    });
  }, 100);
}

function closeMultiplayerMenu() {
  const menu = document.querySelector('.multiplayer-menu');
  if (menu) {
    menu.remove();
  }
}

function showCreateSessionDialog() {
  const playerName = prompt('Введите ваше имя:') || 'Player 1';
  if (playerName) {
    multiplayerClient.createSession(playerName);
  }
}

function showSessionInfo() {
  // Показать всплывающее меню с информацией о сессии
  const sessionId = multiplayerClient.sessionId;
  if (!sessionId) return;
  
  const menu = document.createElement('div');
  menu.className = 'session-menu';
  menu.innerHTML = `
    <div class="session-menu-content">
      <h3><i class="fas fa-wifi"></i> Сессия: ${sessionId}</h3>
      <div class="session-options">
        <div class="session-code-section">
          <span class="session-label">Код сессии:</span>
          <div class="session-code-compact">${sessionId}</div>
          <button class="btn btn-sm btn-secondary" onclick="copySessionCode('${sessionId}'); closeSessionMenu()">
            <i class="fas fa-copy"></i> Копировать
          </button>
        </div>
        <div class="session-actions">
          ${multiplayerClient.isHost ? `
            <button class="btn btn-sm btn-primary start-game-btn" onclick="multiplayerClient.startGame(); closeSessionMenu()">
              <i class="fas fa-play"></i> Начать игру
            </button>
          ` : ''}
          <button class="btn btn-sm btn-danger" onclick="leaveSession(); closeSessionMenu()">
            <i class="fas fa-sign-out-alt"></i> Покинуть сессию
          </button>
        </div>
      </div>
    </div>
  `;
  
  menu.style.cssText = `
    position: fixed;
    top: 70px;
    left: 15px;
    background: rgba(0, 0, 0, 0.95);
    border: 2px solid var(--accent-primary);
    border-radius: 8px;
    padding: 15px;
    z-index: 1001;
    backdrop-filter: blur(10px);
    min-width: 250px;
  `;
  
  document.body.appendChild(menu);
  
  // Закрыть при клике вне меню
  setTimeout(() => {
    document.addEventListener('click', function closeOnOutside(e) {
      if (!menu.contains(e.target) && !e.target.closest('.session-icon')) {
        closeSessionMenu();
        document.removeEventListener('click', closeOnOutside);
      }
    });
  }, 100);
}

function closeSessionMenu() {
  const menu = document.querySelector('.session-menu');
  if (menu) {
    menu.remove();
  }
}

function leaveSession() {
  if (multiplayerClient && multiplayerClient.sessionId) {
    // Логика покидания сессии
    multiplayerClient.sessionId = null;
    multiplayerClient.isHost = false;
    updateSessionIcon(false);
    showNotification('Вы покинули сессию', 'info');
  }
}

function updateSessionIcon(sessionActive, sessionId = null) {
  const sessionIcon = document.querySelector('.session-icon');
  const exportIcon = document.querySelector('.export-icon');
  
  if (sessionActive && sessionId) {
    sessionIcon.style.display = 'flex';
    sessionIcon.dataset.tooltip = `Сессия: ${sessionId}`;
    sessionIcon.classList.add('active');
    
    // Показать иконку экспорта когда игра активна
    if (exportIcon) {
      exportIcon.style.display = 'flex';
    }
  } else {
    sessionIcon.style.display = 'none';
    sessionIcon.classList.remove('active');
    
    // Скрыть иконку экспорта когда сессия неактивна
    if (exportIcon) {
      exportIcon.style.display = 'none';
    }
  }
}

function exportAllTables() {
  // Экспортировать HandHistory для всех активных столов
  if (!multiplayerClient || !multiplayerClient.sessionId) {
    showNotification('Нет активной сессии', 'warning');
    return;
  }
  
  const tables = document.querySelectorAll('.poker-table[data-table-id]');
  if (tables.length === 0) {
    showNotification('Нет активных столов для экспорта', 'warning');
    return;
  }
  
  tables.forEach(table => {
    const tableId = parseInt(table.dataset.tableId);
    if (tableId) {
      multiplayerClient.exportHandHistory(tableId);
    }
  });
  
  showNotification(`Экспорт запущен для ${tables.length} столов`, 'success');
}

// Функции управления перетаскиванием элементов
function initializeDragAndDrop() {
  // Перетаскивание всегда включено
  toggleDragMode(true);
}

function toggleDragMode(enabled) {
  const draggableElements = document.querySelectorAll('.pot-display, .board-area, .opponent-area, .hero-area, .table-actions, .opponent-bet-display, .hero-bet-display');
  
  draggableElements.forEach(element => {
    if (enabled) {
      makeDraggable(element);
      element.style.cursor = 'move';
      element.classList.add('draggable-active');
    } else {
      removeDraggable(element);
      element.style.cursor = '';
      element.classList.remove('draggable-active');
    }
  });
}

function makeDraggable(element) {
  let isDragging = false;
  let startX, startY, initialX, initialY;
  
  // Восстанавливаем позицию из локального хранилища
  const savedPosition = getSavedPosition(element);
  if (savedPosition) {
    element.style.position = 'absolute';
    element.style.left = savedPosition.x + 'px';
    element.style.top = savedPosition.y + 'px';
  }
  
  element.addEventListener('mousedown', startDrag);
  
  function startDrag(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = element.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    
    element.style.position = 'absolute';
    element.style.zIndex = '9999';
    element.classList.add('dragging');
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newX = initialX + deltaX;
    const newY = initialY + deltaY;
    
    element.style.left = newX + 'px';
    element.style.top = newY + 'px';
  }
  
  function stopDrag() {
    if (!isDragging) return;
    
    isDragging = false;
    element.style.zIndex = '';
    element.classList.remove('dragging');
    
    // Сохраняем позицию
    saveElementPosition(element);
    
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    
    showNotification('Позиция элемента сохранена', 'success');
  }
}

function removeDraggable(element) {
  // Удаляем все обработчики событий drag & drop
  element.removeEventListener('mousedown', startDrag);
}

function saveElementPosition(element) {
  const rect = element.getBoundingClientRect();
  const elementId = getElementId(element);
  
  const position = {
    x: rect.left,
    y: rect.top
  };
  
  localStorage.setItem(`element_position_${elementId}`, JSON.stringify(position));
}

function getSavedPosition(element) {
  const elementId = getElementId(element);
  const saved = localStorage.getItem(`element_position_${elementId}`);
  return saved ? JSON.parse(saved) : null;
}

function getElementId(element) {
  // Создаем уникальный идентификатор для элемента
  if (element.classList.contains('pot-display')) return 'pot-display';
  if (element.classList.contains('board-area')) return 'board-area';
  if (element.classList.contains('opponent-area')) return 'opponent-area';
  if (element.classList.contains('hero-area')) return 'hero-area';
  if (element.classList.contains('table-actions')) return 'table-actions';
  if (element.classList.contains('opponent-bet-display')) return 'opponent-bet-display';
  if (element.classList.contains('hero-bet-display')) return 'hero-bet-display';
  return 'unknown';
} 
