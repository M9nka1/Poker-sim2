// ===== МУЛЬТИПЛЕЕР КЛИЕНТ =====
class MultiplayerClient {
  constructor() {
    this.socket = null;
    this.userId = null;
    this.sessionId = null;
    this.playerName = null;
    this.sessionCode = null;
    this.isConnected = false; // 🔧 ИСПРАВЛЕНИЕ: Добавляем отслеживание состояния подключения
    this.isHost = false; // 🔧 ИСПРАВЛЕНИЕ: Добавляем статус хоста
    this.tables = new Map(); // Кэш информации о столах
    this.lastTablesCount = 0; // Отслеживание изменений количества столов
    
    // История действий для каждого стола
    this.actionHistory = new Map(); // tableId -> ActionTracker
    
    this.initializeSocket();
    this.showConnectionStatus();
  }

  initializeSocket() {
    console.log('🔌 Инициализация соединения...');
    
    // Получаем токен аутентификации
    const token = this.getAuthToken();
    
    // Инициализация Socket.IO с токеном аутентификации
    this.socket = io({
      auth: {
        token: token
      },
      transports: ['websocket', 'polling']
    });
    
    // Добавить глобальное логирование всех событий для отладки
    this.socket.onAny((eventName, data) => {
      console.log(`📡 СОБЫТИЕ: ${eventName}`, data);
      
      // Специальное логирование для table-updated
      if (eventName === 'table-updated') {
        console.log(`🎯 TABLE-UPDATED СОБЫТИЕ:`, {
          tableId: data?.tableId,
          currentPlayer: data?.currentPlayer,
          currentBet: data?.currentBet,
          playersCount: data?.players?.length,
          playerIds: data?.players?.map(p => p.id),
          currentUserId: this.userId
        });
      }
      
      // Специальное логирование для событий, связанных со столами
      if (eventName.includes('table') || eventName.includes('hand') || eventName.includes('action')) {
        console.log(`🎯 СОБЫТИЕ СТОЛА: ${eventName}`, {
          tableId: data?.tableId,
          hasTableInfo: !!data?.tableInfo,
          playersCount: data?.tableInfo?.players?.length,
          playerIds: data?.tableInfo?.players?.map(p => p.id),
          currentUserId: this.userId
        });
      }
    });
    
    this.socket.on('connect', () => {
      console.log('✅ Подключено к серверу');
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Отключено от сервера');
      this.updateConnectionStatus(false);
    });

    // Обработчики мультиплеерных событий
    this.socket.on('session-created', (data) => this.handleSessionCreated(data));
    this.socket.on('session-joined', (data) => this.handleSessionJoined(data));
    this.socket.on('player-joined', (data) => this.handlePlayerJoined(data));
    this.socket.on('game-started', (data) => this.handleGameStarted(data));
    this.socket.on('action-processed', (data) => this.handleActionProcessed(data));
    this.socket.on('hand-completed', (data) => this.handleHandCompleted(data));
    this.socket.on('street-changed', (data) => this.handleStreetChanged(data));
    this.socket.on('hand-history-exported', (data) => this.handleHandHistoryExported(data));
    this.socket.on('player-disconnected', (data) => this.handlePlayerDisconnected(data));
    this.socket.on('error', (data) => this.handleError(data));
    
    // Новые обработчики для обновлений столов и раздач
    this.socket.on('table-updated', (data) => this.handleTableUpdated(data));
    this.socket.on('table-update', (data) => this.handleTableUpdate(data));
    this.socket.on('new-hand-started', (data) => this.handleNewHandStarted(data));
    this.socket.on('new-hand-auto-started', (data) => this.handleNewHandAutoStarted(data));
    this.socket.on('all-in-deal-started', (data) => this.handleAllInDealStarted(data));
    this.socket.on('card-dealt-all-in', (data) => this.handleCardDealtAllIn(data));
    
    console.log('🎮 Обработчики событий мультиплеера установлены');
  }

  showConnectionStatus() {
    // Убираем индикатор подключения - он не нужен
    console.log('Connection status initialized');
  }

  // Получить токен аутентификации из localStorage
  getAuthToken() {
    // Сначала пробуем найти токен с sessionId
    const sessionId = this.getSessionId();
    if (sessionId) {
      const tokenWithSession = localStorage.getItem(`auth_token_${sessionId}`);
      if (tokenWithSession) {
        return tokenWithSession;
      }
    }
    
    // Fallback на старый формат
    const fallbackToken = localStorage.getItem('accessToken');
    return fallbackToken || null;
  }

  // Получить sessionId из localStorage или сгенерировать новый
  getSessionId() {
    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = 'tab_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }

  updateConnectionStatus(connected) {
    // 🔧 ИСПРАВЛЕНИЕ: Правильно устанавливаем состояние подключения
    this.isConnected = connected;
    console.log('Connection status:', connected ? 'connected' : 'disconnected');
    
    if (connected) {
      console.log('✅ Соединение с сервером установлено');
    } else {
      console.log('❌ Соединение с сервером потеряно');
    }
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
          player1: 'IP',
          player2: 'OOP'
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

  // Алиас для совместимости с кнопками
  newHand(tableId) {
    this.requestNewHand(tableId);
  }

  // Обновление настроек сессии
  updateSettings() {
    if (!this.isConnected || !this.sessionId) {
      console.log('⚠️ Нет активной сессии для обновления настроек');
      return;
    }

    // Преобразовать настройки для отправки на сервер
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
          player1: 'IP',
          player2: 'OOP'
        }
      }
    };

    console.log('🔧 Обновление настроек сессии:', settingsForServer);
    console.log('🎯 Позиции игроков:', settingsForServer.playerRanges.positions);

    this.socket.emit('update-settings', {
      settings: settingsForServer
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
    
    // Создаем столы при запуске игры
    this.generateMultiplayerTables(data.sessionInfo);
    
    showNotification('Игра началась!', 'success');
    console.log('Игра началась:', data);
  }

  handleActionProcessed(data) {
    console.log('🎯 ПОЛУЧЕНО СОБЫТИЕ action-processed:', data);
    console.log('✅ Действие обработано:', data.action?.action, data);
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (data.tableInfo) {
      const heroPlayer = data.tableInfo.players.find(p => p.id === this.userId);
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${data.tableId}, пропускаем обработку действия`);
        return;
      }
      console.log(`✅ Игрок ${this.userId} участвует на столе ${data.tableId}`);
    }
    
    // Проверяем смену улицы перед записью действия
    if (data.tableInfo && data.tableInfo.street) {
      console.log(`🛣️ Проверка улицы: текущая=${data.tableInfo.street}`);
      this.checkAndUpdateStreet(data.tableId, data.tableInfo.street);
    }
    
    // Записать действие в историю
    if (data.action && data.tableId) {
      console.log(`📝 ПОПЫТКА ЗАПИСИ ДЕЙСТВИЯ: playerId=${data.action.playerId}, action=${data.action.action}, amount=${data.action.amount || 0}, tableId=${data.tableId}`);
      console.log(`📝 Данные действия:`, data.action);
      this.recordAction(data.tableId, data.action.playerId, data.action.action, data.action.amount || 0);
    } else {
      console.log(`❌ НЕ УДАЛОСЬ ЗАПИСАТЬ ДЕЙСТВИЕ: action=${!!data.action}, tableId=${data.tableId}`);
      console.log(`❌ Детали:`, { action: data.action, tableId: data.tableId });
    }
    
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
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (data.tableInfo) {
      const heroPlayer = data.tableInfo.players.find(p => p.id === this.userId);
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${data.tableId}, пропускаем обработку завершения раздачи`);
        return;
      }
    }
    
    // ОЧИЩАЕМ ЗАПИСИ ДЕЙСТВИЙ ПРИ ЗАВЕРШЕНИИ РАЗДАЧИ
    console.log(`🧹 Очищаем записи действий для стола ${data.tableId} при завершении раздачи`);
    this.resetActionTracker(data.tableId);
    
    // Уведомить об завершении раздачи для счетчика раздач
    this.notifyHandCompletedForCounter(data.tableId, data.handData);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Вместо всплывающего окна показываем только легкий визуальный эффект
    this.highlightHandCompletion(data.tableId);
    
    // Показать уведомление в правом верхнем углу
    this.showNotification('Раздача завершена', 'success');
    
    // Сервер автоматически запустит новую раздачу, не нужно готовить вручную
    console.log('⏳ Ожидание автоматического запуска новой раздачи...');
  }

  // Уведомить о завершении раздачи для обновления счетчика
  async notifyHandCompletedForCounter(tableId, handData) {
    // Проверяем, что система аутентификации доступна
    if (typeof authManager !== 'undefined' && authManager) {
      const result = await authManager.notifyHandCompleted(tableId, handData);
      if (result) {
        console.log(`📊 Счетчик раздач обновлен. Осталось: ${result.remaining_hands}`);
        
        if (!result.can_continue) {
          this.showNotification('Лимит раздач исчерпан! Обратитесь к администратору.', 'error');
        }
      }
    } else {
      console.log('⚠️ Система аутентификации недоступна, счетчик раздач не обновлен');
    }
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
    
    // Добавить CSS класс для анимации завершения стола (без анимации банка)
    tableElement.classList.add('hand-completed');
    
    // Убрать эффект через 3 секунды
    setTimeout(() => {
      tableElement.classList.remove('hand-completed');
    }, 3000);
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
    console.log('🛣️ Смена улицы:', data);
    
    // Обновить улицу в истории действий
    if (data.tableId && data.street) {
      console.log(`🛣️ Устанавливаем улицу ${data.street} для стола ${data.tableId}`);
      this.setStreet(data.tableId, data.street);
    }
    
    // Обновить интерфейс стола для новой улицы
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    this.showNotification(`Новая улица: ${this.getStreetName(data.street)}`, 'info');
    console.log('✅ Улица изменена:', data);
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
    console.log('🎲 Предыдущее количество столов:', this.lastTablesCount);
    console.log('🎲 Текущее количество столов:', sessionInfo.tablesCount);
    
    const tablesArea = document.getElementById('tables-area');
    
    // Скрыть welcome screen но оставить session panel
    const welcomeScreen = tablesArea.querySelector('.welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.style.display = 'none';
    }
    
    // Проверяем существующую сетку столов
    let tablesGrid = tablesArea.querySelector('.tables-grid');
    
    // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: проверяем реальное количество существующих столов
    const existingTables = tablesGrid ? tablesGrid.querySelectorAll('.poker-table').length : 0;
    console.log('🎲 Существующих столов в DOM:', existingTables);
    
    // Пересоздаем столы только если:
    // 1. Сетки столов вообще нет
    // 2. Количество столов в sessionInfo отличается от lastTablesCount
    // 3. Количество существующих столов в DOM не совпадает с ожидаемым
    const shouldRecreate = !tablesGrid || 
                          sessionInfo.tablesCount !== this.lastTablesCount ||
                          existingTables !== sessionInfo.tablesCount;
    
    console.log('🎲 Нужно пересоздавать столы:', shouldRecreate);
    
    if (shouldRecreate) {
      console.log('🎲 Пересоздаем столы...');
      
      // Удалить старую сетку только если количество столов изменилось
      if (tablesGrid) {
        console.log('🗑️ Удаляем старую сетку столов');
        tablesGrid.remove();
      }
      
      tablesGrid = document.createElement('div');
      tablesGrid.className = `tables-grid ${this.getTableGridClass(sessionInfo.tablesCount)}`;
      tablesArea.appendChild(tablesGrid);
      
      // Создать новые столы
      sessionInfo.tables.forEach((tableInfo, index) => {
        console.log(`🎯 Создание стола ${index + 1}:`, tableInfo);
        const table = this.createMultiplayerTable(tableInfo, index + 1);
        tablesGrid.appendChild(table);
      });
      
      this.lastTablesCount = sessionInfo.tablesCount;
      console.log('✅ Столы пересозданы, lastTablesCount обновлен до:', this.lastTablesCount);
    } else {
      console.log('🔄 Обновляем существующие столы...');
      // Если сетка существует, только обновляем столы
      sessionInfo.tables.forEach((tableInfo, index) => {
        console.log(`🔄 Обновление стола ${index + 1}:`, tableInfo);
        this.updateTableUI(tableInfo.tableId, tableInfo);
      });
      console.log('✅ Столы обновлены без пересоздания');
    }
    
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
                ${this.renderCommunityCards(tableInfo.communityCards || [])}
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
    
    // Инициализировать историю действий для стола
    this.initializeActionTracker(tableInfo.tableId);
    
    return table;
  }

  renderOpponentPlayer(player, handHistoryInfo) {
    if (!player) {
      return `
        <div class="player-section opponent">
          <div class="player-info-horizontal">
            <div class="player-name">Ожидание игрока...</div>
            <div class="player-position">-</div>
            <div class="player-stack">$0.00</div>
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
        <div class="player-info-horizontal">
          <div class="player-name">${player.name}</div>
          <div class="player-position">${player.position}</div>
          <div class="player-stack">$${playerStack.toFixed(2)}</div>
        </div>
        <div class="player-cards-section">
          ${this.renderPlayerCards(player.cards, 'opponent')}
        </div>
      </div>
    `;
  }

  renderCommunityCards(cards) {
    // Защита от undefined/null
    if (!cards) cards = [];
    
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (i < cards.length) {
        const card = cards[i];
        
        // Обработка разных форматов карт
        let rank, suit, suitClass;
        
        if (typeof card === 'string') {
          // Если карта в строковом формате, например "As" или "Kh"
          rank = card.charAt(0);
          const suitChar = card.charAt(1);
          suit = this.getSuitSymbol(suitChar);
          suitClass = this.getSuitClass(suit);
        } else if (card && typeof card === 'object') {
          // Если карта в формате объекта
          rank = card.rank || card.value || '?';
          const cardSuit = card.suit || '?';
          // Проверяем, является ли suit уже символом или буквой
          if (cardSuit.length === 1 && ['♠', '♥', '♦', '♣'].includes(cardSuit)) {
            // Уже символ масти
            suit = cardSuit;
          } else {
            // Буквенное обозначение, конвертируем в символ
            suit = this.getSuitSymbol(cardSuit);
          }
          suitClass = this.getSuitClass(suit);
        } else {
          // Если карта не определена
          rank = '?';
          suit = '?';
          suitClass = 'spades';
        }
        
        html += `<div class="community-card ${suitClass}" data-suit="${suit}">
                   <span class="card-rank">${rank}</span>
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
      if (card && card.hidden) {
        // Рубашка карты
        return `<div class="player-card hidden"><i class="fas fa-square"></i></div>`;
      } else {
        // Открытая карта - обработка разных форматов
        let rank, suit, suitClass;
        
        if (typeof card === 'string') {
          // Если карта в строковом формате, например "As" или "Kh"
          rank = card.charAt(0);
          const suitChar = card.charAt(1);
          suit = this.getSuitSymbol(suitChar);
          suitClass = this.getSuitClass(suit);
        } else if (card && typeof card === 'object') {
          // Если карта в формате объекта
          rank = card.rank || card.value || '?';
          const cardSuit = card.suit || '?';
          // Проверяем, является ли suit уже символом или буквой
          if (cardSuit.length === 1 && ['♠', '♥', '♦', '♣'].includes(cardSuit)) {
            // Уже символ масти
            suit = cardSuit;
          } else {
            // Буквенное обозначение, конвертируем в символ
            suit = this.getSuitSymbol(cardSuit);
          }
          suitClass = this.getSuitClass(suit);
        } else {
          // Если карта не определена
          rank = '?';
          suit = '?';
          suitClass = 'spades';
        }
        
        return `<div class="player-card ${suitClass}" data-suit="${suit}">
                  <span class="card-rank">${rank}</span>
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

  getSuitSymbol(suitChar) {
    const suitSymbolMap = {
      'h': '♥',
      'd': '♦',
      'c': '♣',
      's': '♠'
    };
    return suitSymbolMap[suitChar.toLowerCase()] || '♠';
  }

  renderTableActions(tableInfo, tableId = null) {
    // Использовать переданный tableId или взять из tableInfo
    const currentTableId = tableId || tableInfo.tableId;
    if (!currentTableId) {
      console.error('❌ Не удалось определить tableId для кнопок действий');
      return '<div class="action-info">Ошибка: не определен ID стола</div>';
    }
    
    console.log('🎮 Генерация кнопок действий для стола:', currentTableId);
    console.log('🎮 TableInfo содержит игроков:', tableInfo.players?.map(p => ({ id: p.id, name: p.name })));
    console.log('🎮 Текущий userId:', this.userId);
    
    // Определить героя и его позицию
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    if (!heroPlayer) {
      console.warn(`⚠️ Герой не найден на столе ${currentTableId}! UserId: ${this.userId}, игроки:`, tableInfo.players?.map(p => p.id));
      // 🔧 ИСПРАВЛЕНИЕ: Возвращаем информативное сообщение вместо пустой строки
      return `
        <div class="table-actions" style="opacity: 0.7;">
          <div style="text-align: center; color: #888; font-size: 0.8rem;">Не участвуете в игре</div>
        </div>
      `;
    }
    
    console.log('✅ Герой найден:', heroPlayer.name, 'позиция:', heroPlayer.position);
    
    // Сохранить информацию о столе в кэш для расчета минимального рейза
    this.tables.set(currentTableId, tableInfo);
    
    // Использовать позицию из данных игрока
    const heroPosition = heroPlayer.position;
    
    // Получить оппонента
    const opponent = tableInfo.players.find(p => p.id !== this.userId);
    const opponentPosition = opponent ? opponent.position : null;
    
    // Определить состояние торгов - использовать данные от сервера
    let heroCurrentBet = 0;
    let opponentCurrentBet = 0;
    let maxBet = 0;
    
    // Приоритет: данные от сервера (currentBet и players.bet)
    if (tableInfo.currentBet !== undefined && tableInfo.players) {
      // Найти ставки игроков из серверных данных
      const heroPlayerData = tableInfo.players.find(p => p.id === this.userId);
      const opponentPlayerData = tableInfo.players.find(p => p.id === opponent?.id);
      
      heroCurrentBet = heroPlayerData?.bet || 0;
      opponentCurrentBet = opponentPlayerData?.bet || 0;
      maxBet = Math.max(heroCurrentBet, opponentCurrentBet, tableInfo.currentBet || 0);
      
      console.log('💰 Использую серверные данные о ставках:', {
        heroCurrentBet: `$${(heroCurrentBet / 100).toFixed(2)}`,
        opponentCurrentBet: `$${(opponentCurrentBet / 100).toFixed(2)}`,
        serverCurrentBet: `$${((tableInfo.currentBet || 0) / 100).toFixed(2)}`,
        maxBet: `$${(maxBet / 100).toFixed(2)}`
      });
    } else {
      // Fallback: локальные данные из streetBets
      const currentStreet = tableInfo.currentStreet || 'preflop';
      const streetBets = tableInfo.streetBets || {};
      const currentBets = streetBets[currentStreet] || {};
      heroCurrentBet = currentBets[this.userId] || 0;
      opponentCurrentBet = currentBets[opponent?.id] || 0;
      maxBet = Math.max(heroCurrentBet, opponentCurrentBet, 0);
      
      console.log('💰 Использую локальные данные о ставках (fallback):', {
        heroCurrentBet: `$${(heroCurrentBet / 100).toFixed(2)}`,
        opponentCurrentBet: `$${(opponentCurrentBet / 100).toFixed(2)}`,
        maxBet: `$${(maxBet / 100).toFixed(2)}`
      });
    }
    
    // Рассчитать размер пота для кнопок сайзинга
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const potAmount = this.calculatePotAmount(tableInfo, handHistoryInfo);
    
    // Рассчитать минимальный рейз
    const minimumRaise = this.calculateMinimumRaise(currentTableId);
    
    // Определить максимальную возможную ставку (ограничено стеком)
    const heroStack = (heroPlayer.stack || 0) / 100; // в долларах
    const heroCurrentBetDollars = (heroPlayer.bet || 0) / 100; // в долларах
    const maxPossibleBet = heroStack + heroCurrentBetDollars;
    
    console.log(`🎯 Герой: ${heroPosition} vs Оппонент: ${opponentPosition}`);
    console.log(`💰 Ставки: Герой ${heroCurrentBet}, Оппонент ${opponentCurrentBet}, Макс: ${maxBet}`);
    console.log(`🏦 Размер пота: $${potAmount.toFixed(2)}`);
    console.log(`🔥 Минимальный рейз: $${minimumRaise.toFixed(2)}`);
    console.log(`💰 Максимальная ставка: $${maxPossibleBet.toFixed(2)} (ограничено стеком)`);
    
    // Проверить активна ли раздача
    if (!tableInfo.isHandActive) {
      return `
        <div class="table-actions">
          <div style="text-align: center; margin-bottom: 10px;">
            <button class="action-btn start-hand-btn" onclick="multiplayerClient.requestNewHand(${currentTableId})" style="background: #28a745; color: white;">
              Начать раздачу
            </button>
          </div>
        </div>
      `;
    }
    
    // Проверить очередь хода
    if (!this.isHeroTurn(tableInfo, heroPlayer)) {
      return `
        <div class="table-actions" style="opacity: 0.5; pointer-events: none;">
          <div style="text-align: center; color: #666; font-size: 0.8rem;">Ожидание хода...</div>
        </div>
      `;
    }
    
    // Определить доступные действия
    const canCheck = heroCurrentBet === maxBet;
    const canCall = heroCurrentBet < maxBet;
    const callAmount = maxBet - heroCurrentBet;
    
    // Определить значение для предзаполнения поля ввода
    let inputDefaultValue;
    if (canCheck) {
      inputDefaultValue = Math.min(handHistoryInfo.bigBlind, maxPossibleBet).toFixed(2);
    } else {
      inputDefaultValue = Math.min(minimumRaise, maxPossibleBet).toFixed(2);
    }

    let actionsHTML = `
      <div class="table-actions" data-table-id="${currentTableId}" onwheel="multiplayerClient.handleTableWheel(event, ${currentTableId})">
        <!-- Кнопки сайзинга -->
        <div class="sizing-buttons">
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 25, ${potAmount})" title="25% пота">25</button>
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 50, ${potAmount})" title="50% пота">50</button>
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 75, ${potAmount})" title="75% пота">75</button>
          <button class="sizing-btn" onclick="multiplayerClient.setSizingPercentage(${currentTableId}, 150, ${potAmount})" title="150% пота">150</button>
          <input type="text" class="sizing-input" id="sizing-input-${currentTableId}" placeholder="$" title="Размер ставки" 
                 value="${inputDefaultValue}"
                 onwheel="multiplayerClient.handleSizingWheel(event, ${currentTableId})"
                 oninput="multiplayerClient.handleSizingInputChange(event, ${currentTableId})"
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
    
    // BET или RAISE с отображением размера из поля ввода
    if (canCheck) {
      const minBet = handHistoryInfo.bigBlind;
      actionsHTML += `<button class="action-btn bet-btn" id="bet-btn-${currentTableId}" onclick="multiplayerClient.makeBetFromInput(${currentTableId}, 'bet')">BET $${inputDefaultValue}</button>`;
    } else {
      actionsHTML += `<button class="action-btn raise-btn" id="raise-btn-${currentTableId}" onclick="multiplayerClient.makeBetFromInput(${currentTableId}, 'raise')">RAISE $${inputDefaultValue}</button>`;
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
    // Использовать информацию от сервера если доступна
    if (tableInfo.currentPlayer !== undefined) {
      const isHeroToAct = tableInfo.currentPlayer === heroPlayer.id;
      console.log('🎯 Использую данные сервера - герой должен ходить:', isHeroToAct, {
        currentPlayer: tableInfo.currentPlayer,
        heroId: heroPlayer.id,
        isMatch: isHeroToAct
      });
      return isHeroToAct;
    }
    
    // Fallback: проверяем activeToAct для совместимости
    if (tableInfo.activeToAct !== undefined) {
      const isHeroToAct = tableInfo.activeToAct === heroPlayer.id;
      console.log('🎯 Использую данные сервера (activeToAct) - герой должен ходить:', isHeroToAct);
      return isHeroToAct;
    }
    
    // Fallback на клиентскую логику если сервер не предоставил информацию
    console.log('🎯 Используем клиентскую логику определения очереди');
    
    // Проверить что раздача активна
    if (!tableInfo.isHandActive) {
      console.log('🎯 Раздача неактивна');
      return false;
    }
    
    // Проверить что игрок не сфолдил
    if (heroPlayer.folded) {
      console.log('🎯 Герой сфолдил');
      return false;
    }
    
    // Простая логика для определения очереди хода в хедс-ап
    const currentStreet = tableInfo.currentStreet || 'preflop';
    const streetBets = tableInfo.streetBets || {};
    const currentBets = streetBets[currentStreet] || {};
    
    console.log('🎯 Проверка очереди хода:', {
      heroPosition: heroPlayer.position,
      currentStreet,
      currentBets,
      heroActed: heroPlayer.acted
    });
    
    // Получить оппонента
    const opponent = tableInfo.players.find(p => p.id !== heroPlayer.id);
    if (!opponent) return false;
    
    console.log('🎯 Оппонент:', {
      opponentPosition: opponent.position,
      heroPosition: heroPlayer.position,
      opponentActed: opponent.acted
    });
    
    // Проверить кто уже действовал на этой улице
    const heroActed = heroPlayer.acted || currentBets.hasOwnProperty(heroPlayer.id);
    const opponentActed = opponent.acted || currentBets.hasOwnProperty(opponent.id);
    const heroBet = heroPlayer.bet || currentBets[heroPlayer.id] || 0;
    const opponentBet = opponent.bet || currentBets[opponent.id] || 0;
    
    console.log('🎯 Состояние действий:', {
      heroActed,
      opponentActed,
      heroBet,
      opponentBet,
      heroPosition: heroPlayer.position,
      opponentPosition: opponent.position
    });
    
    // Если торги завершены (оба действовали и ставки равны), никто не ходит
    if (heroActed && opponentActed && heroBet === opponentBet) {
      console.log('🎯 Торги завершены: оба действовали с равными ставками');
      return false;
    }
    
    // Если один из игроков еще не действовал
    if (!heroActed && opponentActed) {
      console.log('🎯 Герой еще не действовал, его очередь');
      return true;
    }
    
    if (heroActed && !opponentActed) {
      console.log('🎯 Оппонент еще не действовал, очередь оппонента');
      return false;
    }
    
    // Если никто не действовал, определяем по позиции
    if (!heroActed && !opponentActed) {
      // Определить кто должен ходить первым на основе позиций
      const isHeroInPosition = this.isInPosition(heroPlayer.position, opponent.position);
      const shouldHeroActFirst = !isHeroInPosition; // OOP ходит первым
      console.log('🎯 Никто не действовал, должен ходить OOP:', shouldHeroActFirst);
      return shouldHeroActFirst;
    }
    
    // Если ставки разные, должен отвечать тот, у кого меньше ставка
    if (heroBet !== opponentBet) {
      const shouldHeroAct = heroBet < opponentBet;
      console.log('🎯 Разные ставки, должен отвечать тот у кого меньше:', shouldHeroAct);
      return shouldHeroAct;
    }
    
    console.log('🎯 Неопределенная ситуация, возвращаем false');
    return false;
  }

  showBetDialog(tableId) {
    // Получить информацию о блайндах для минимальной ставки
    const tableInfo = this.tables.get(tableId);
    let minimumBet = 1.00; // Значение по умолчанию
    
    if (tableInfo) {
      const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
      minimumBet = handHistoryInfo.bigBlind;
    }
    
    const defaultValue = minimumBet.toFixed(2);
    const betAmount = prompt(`Введите размер ставки (в долларах):\nМинимальная ставка: $${minimumBet.toFixed(2)}`, defaultValue);
    
    if (betAmount && !isNaN(betAmount)) {
      const amountInDollars = parseFloat(betAmount);
      
      // Проверить что ставка не меньше минимальной
      if (amountInDollars < minimumBet) {
        alert(`Размер ставки должен быть не меньше $${minimumBet.toFixed(2)}`);
        return;
      }
      
      const amountInCents = Math.round(amountInDollars * 100);
      if (amountInCents > 0) {
        this.makeAction(tableId, 'bet', amountInCents);
      }
    }
  }

  showRaiseDialog(tableId) {
    // Рассчитать минимальный рейз
    const minimumRaise = this.calculateMinimumRaise(tableId);
    const defaultValue = minimumRaise > 0 ? minimumRaise.toFixed(2) : '';
    
    const raiseAmount = prompt(`Введите размер рейза (в долларах):\nМинимальный рейз: $${minimumRaise.toFixed(2)}`, defaultValue);
    if (raiseAmount && !isNaN(raiseAmount)) {
      const amountInDollars = parseFloat(raiseAmount);
      
      // Проверить что рейз не меньше минимального
      if (amountInDollars < minimumRaise) {
        alert(`Размер рейза должен быть не меньше $${minimumRaise.toFixed(2)}`);
        return;
      }
      
      const amountInCents = Math.round(amountInDollars * 100);
      if (amountInCents > 0) {
        this.makeAction(tableId, 'raise', amountInCents);
      }
    }
  }

  // Методы для работы с кнопками сайзинга
  setSizingPercentage(tableId, percentage, potAmount) {
    // potAmount уже в долларах (приходит из calculatePotAmount)
    let betAmount = potAmount * (percentage / 100);
    
    // Получить информацию о столе для ограничения по стеку
    const tableInfo = this.tables.get(tableId);
    if (tableInfo) {
      const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
      if (heroPlayer) {
        // Максимальная ставка ограничена оставшимся стеком игрока
        const heroStack = (heroPlayer.stack || 0) / 100; // в долларах
        const heroCurrentBet = (heroPlayer.currentBet || 0) / 100;
        const maxPossibleBet = heroStack + heroCurrentBet; // весь доступный стек
        
        // Ограничить ставку размером стека
        betAmount = Math.min(betAmount, maxPossibleBet);
        
        console.log(`💰 Сайзинг ${percentage}% от пота $${potAmount.toFixed(2)} = $${(potAmount * (percentage / 100)).toFixed(2)}, ограничен стеком до $${betAmount.toFixed(2)}`);
      }
    }
    
    const betInDollars = betAmount.toFixed(2);
    
    const inputElement = document.getElementById(`sizing-input-${tableId}`);
    if (inputElement) {
      inputElement.value = betInDollars;
      inputElement.focus();
      
      // Обновить текст кнопки ставки
      if (tableInfo) {
        const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
        const opponent = tableInfo.players.find(p => p.id !== this.userId);
        const heroCurrentBet = (heroPlayer?.bet || 0) / 100;
        const opponentCurrentBet = (opponent?.bet || 0) / 100;
        const maxBet = Math.max(heroCurrentBet, opponentCurrentBet, 0);
        const canCheck = heroCurrentBet === maxBet;
        
        this.updateBetButtonText(tableId, parseFloat(betInDollars), canCheck);
      }
    }
    
    console.log(`💰 Установлен сайзинг ${percentage}% от пота: $${betInDollars}`);
  }

  handleSizingWheel(event, tableId) {
    event.preventDefault();
    
    const inputElement = event.target;
    const currentValue = parseFloat(inputElement.value) || 0;
    
    // Получить информацию о столе для определения шага изменения
    const tableInfo = this.tables.get(tableId);
    if (!tableInfo) return;
    
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const bigBlindAmount = handHistoryInfo.bigBlind;
    
    // Определить шаг изменения: BB для небольших сумм, потом переходим на более крупные шаги
    let step = bigBlindAmount;
    if (currentValue > bigBlindAmount * 10) {
      step = bigBlindAmount * 2; // Шаг в 2BB для крупных сумм
    }
    if (currentValue > bigBlindAmount * 50) {
      step = bigBlindAmount * 5; // Шаг в 5BB для очень крупных сумм
    }
    
    // Определить направление прокрутки
    const delta = event.deltaY > 0 ? -step : step;
    let newValue = currentValue + delta;
    
    // Определить минимальное значение
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponent = tableInfo.players.find(p => p.id !== this.userId);
    const heroCurrentBet = (heroPlayer?.bet || 0) / 100;
    const opponentCurrentBet = (opponent?.bet || 0) / 100;
    const maxBet = Math.max(heroCurrentBet, opponentCurrentBet, 0);
    const canCheck = heroCurrentBet === maxBet;
    
    let minimumValue;
    if (canCheck) {
      // Если можем чекнуть, минимальная ставка = BB
      minimumValue = bigBlindAmount;
    } else {
      // Если нужно рейзить, минимум = минимальный рейз
      minimumValue = this.calculateMinimumRaise(tableId);
    }
    
    // Определить максимальное значение (ограничено стеком игрока)
    const heroStack = (heroPlayer?.stack || 0) / 100; // в долларах
    const maxPossibleBet = heroStack + heroCurrentBet; // весь доступный стек
    
    // Применить ограничения (минимум и максимум)
    newValue = Math.max(minimumValue, newValue);
    newValue = Math.min(maxPossibleBet, newValue);
    
    // Округлить до центов
    newValue = Math.round(newValue * 100) / 100;
    
    inputElement.value = newValue.toFixed(2);
    
    // Обновить текст кнопки ставки
    this.updateBetButtonText(tableId, newValue, canCheck);
    
    console.log(`🖱️ Изменение размера ставки колесиком: $${newValue.toFixed(2)} (шаг: $${step.toFixed(2)}, макс: $${maxPossibleBet.toFixed(2)})`);
  }

  // Функция для обновления текста кнопки ставки
  updateBetButtonText(tableId, amount, canCheck) {
    const betBtnId = canCheck ? `bet-btn-${tableId}` : `raise-btn-${tableId}`;
    const betBtn = document.getElementById(betBtnId);
    
    if (betBtn) {
      const action = canCheck ? 'BET' : 'RAISE';
      betBtn.textContent = `${action} $${amount.toFixed(2)}`;
    }
  }

  // Обработчик изменения поля ввода ставки
  handleSizingInputChange(event, tableId) {
    const inputElement = event.target;
    const newValue = parseFloat(inputElement.value) || 0;
    
    const tableInfo = this.tables.get(tableId);
    if (!tableInfo) return;
    
    // Определить можно ли чекнуть
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponent = tableInfo.players.find(p => p.id !== this.userId);
    const heroCurrentBet = (heroPlayer?.bet || 0) / 100;
    const opponentCurrentBet = (opponent?.bet || 0) / 100;
    const maxBet = Math.max(heroCurrentBet, opponentCurrentBet, 0);
    const canCheck = heroCurrentBet === maxBet;
    
    // Обновить текст кнопки
    this.updateBetButtonText(tableId, newValue, canCheck);
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
      console.error('❌ Элемент ввода ставки не найден для стола', tableId);
      return;
    }
    
    let amount = parseFloat(inputElement.value);
    
    // Если сумма не введена или невалидна, использовать минимальные значения
    if (isNaN(amount) || amount <= 0) {
      const tableInfo = this.tables.get(tableId);
      if (tableInfo) {
        if (actionType === 'bet') {
          const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
          amount = handHistoryInfo.bigBlind;
        } else if (actionType === 'raise') {
          amount = this.calculateMinimumRaise(tableId);
        }
      }
      
      if (isNaN(amount) || amount <= 0) {
        this.showNotification('Введите корректный размер ставки', 'error');
        return;
      }
    }
    
    // Валидация минимума и максимума
    const tableInfo = this.tables.get(tableId);
    if (tableInfo) {
      const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
      if (heroPlayer) {
        // Проверка максимума (ограничено стеком)
        const heroStack = (heroPlayer.stack || 0) / 100; // в долларах
        const heroCurrentBet = (heroPlayer.bet || 0) / 100;
        const maxPossibleBet = heroStack + heroCurrentBet;
        
        if (amount > maxPossibleBet) {
          this.showNotification(`Максимальная ставка: $${maxPossibleBet.toFixed(2)} (ограничено стеком)`, 'error');
          return;
        }
        
        // Проверка минимума для рейза
        if (actionType === 'raise') {
          const minimumRaise = this.calculateMinimumRaise(tableId);
          
          // Разрешить олл-ин даже если он меньше минимального рейза
          const isAllIn = amount === maxPossibleBet;
          
          if (amount < minimumRaise && !isAllIn) {
            this.showNotification(`Минимальный рейз: $${minimumRaise.toFixed(2)} (или олл-ин: $${maxPossibleBet.toFixed(2)})`, 'error');
            return;
          }
        }
      }
    }
    
    // Конвертировать в центы
    const amountInCents = Math.round(amount * 100);
    
    console.log(`💰 ${actionType.toUpperCase()} на сумму $${amount.toFixed(2)} (${amountInCents} центов)`);
    
    // Отправить действие
    this.makeAction(tableId, actionType, amountInCents);
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
    console.log('🔄 НАЧАЛО updateTableUI для стола:', tableId);
    console.log('📊 Данные стола:', {
      tableId,
      currentPlayer: tableInfo?.currentPlayer,
      currentBet: tableInfo?.currentBet,
      playersCount: tableInfo?.players?.length,
      players: tableInfo?.players?.map(p => ({ id: p.id, name: p.name, bet: p.bet, hasActed: p.hasActed })),
      myUserId: this.userId
    });
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    console.log('🎯 Поиск героя в updateTableUI:', {
      myUserId: this.userId,
      foundHero: !!heroPlayer,
      heroData: heroPlayer
    });
    
    if (!heroPlayer) {
      console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${tableId}, пропускаем обновление интерфейса`);
      return;
    }
    
    // Сохранить информацию о столе в кэш
    this.tables.set(tableId, tableInfo);
    
    const tableElement = document.querySelector(`[data-table-id=\"${tableId}\"]`);
    if (!tableElement) return;

    // Определить героя и оппонента
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
          <div class="player-stack">$${heroStack.toFixed(2)}</div>
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
    console.log('🎮 Поиск области действий:', {
      tableId,
      actionsAreaFound: !!actionsArea,
      selector: '.table-actions'
    });
    
    if (actionsArea) {
      const newActions = this.renderTableActions(tableInfo, tableId);
      console.log('🎮 Новые кнопки действий для стола', tableId, ':', newActions);
      actionsArea.innerHTML = newActions;
      console.log('✅ Кнопки действий обновлены для стола', tableId);
    } else {
      console.error('❌ Область действий не найдена для стола', tableId);
    }
    
    console.log('🏁 КОНЕЦ updateTableUI для стола:', tableId);
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
  // Обработчик обновления стола
  handleTableUpdated(data) {
    console.log('🔄 Получено обновление стола:', data);
    
    const tableId = data.tableId;
    
    // Инициализируем трекер действий если его нет
    this.initializeActionTracker(tableId);
    
    // Извлекаем информацию о столе из разных форматов данных
    let tableInfo;
    if (data.tableInfo) {
      tableInfo = data.tableInfo;
      console.log('📦 Данные в формате tableInfo');
    } else {
      // Данные переданы напрямую
      tableInfo = {
        ...data
      };
      console.log('📦 Данные в новом формат (прямые поля)');
    }
    
    // УЛУЧШЕННАЯ ЛОГИКА: Добавляем разделители по количеству карт И по смене улиц
    if (tableInfo && tableInfo.communityCards) {
      const cardCount = tableInfo.communityCards.length;
      const currentTracker = this.actionHistory.get(tableId);
      
      if (currentTracker) {
        // Инициализируем флаги если их нет
        if (currentTracker.separatorAdded4 === undefined) currentTracker.separatorAdded4 = false;
        if (currentTracker.separatorAdded5 === undefined) currentTracker.separatorAdded5 = false;
        if (currentTracker.lastCardCount === undefined) currentTracker.lastCardCount = 0;
        
        // Проверяем, изменилось ли количество карт
        if (cardCount !== currentTracker.lastCardCount) {
          console.log(`🃏 Изменение количества карт: ${currentTracker.lastCardCount} → ${cardCount}`);
          
          // При 4 картах добавляем первый разделитель (флоп -> тёрн)
          if (cardCount === 4 && !currentTracker.separatorAdded4) {
            console.log(`🛣️ Добавляем разделитель при 4 картах (флоп → тёрн)`);
            this.addSeparatorToActions(tableId);
            currentTracker.separatorAdded4 = true;
            // Также меняем улицу в трекере
            currentTracker.setStreet('turn');
          }
          // При 5 картах добавляем второй разделитель (тёрн -> ривер)
          else if (cardCount === 5 && !currentTracker.separatorAdded5) {
            console.log(`🛣️ Добавляем разделитель при 5 картах (тёрн → ривер)`);
            this.addSeparatorToActions(tableId);
            currentTracker.separatorAdded5 = true;
            // Также меняем улицу в трекере
            currentTracker.setStreet('river');
          }
          
          // Обновляем последнее количество карт
          currentTracker.lastCardCount = cardCount;
        }
      }
    }
    
    // ДОПОЛНИТЕЛЬНАЯ ЛОГИКА: Проверяем смену улиц по полю street
    if (tableInfo && tableInfo.street) {
      const currentTracker = this.actionHistory.get(tableId);
      if (currentTracker && currentTracker.currentStreet !== tableInfo.street) {
        console.log(`🛣️ Смена улицы через поле street: ${currentTracker.currentStreet} → ${tableInfo.street}`);
        
        // Добавляем разделитель если есть действия на текущей улице
        const hasHeroActions = currentTracker.heroActions[currentTracker.currentStreet] && 
                              currentTracker.heroActions[currentTracker.currentStreet].length > 0;
        const hasOpponentActions = currentTracker.opponentActions[currentTracker.currentStreet] && 
                                  currentTracker.opponentActions[currentTracker.currentStreet].length > 0;
        
        if (hasHeroActions || hasOpponentActions) {
          console.log(`➕ Добавляем разделитель при смене улицы через street поле`);
          this.addSeparatorToActions(tableId);
        }
        
        // Устанавливаем новую улицу
        currentTracker.setStreet(tableInfo.street);
      }
    }
    
    console.log('🔄 Обработка обновления стола:', {
      tableId,
      currentPlayer: tableInfo?.currentPlayer,
      currentBet: tableInfo?.currentBet,
      players: tableInfo?.players?.map(p => ({ id: p.id, name: p.name, bet: p.bet, hasActed: p.hasActed })),
      myUserId: this.userId
    });
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (tableInfo.players && tableInfo.players.length > 0) {
      const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
      console.log('🎯 Поиск героя:', {
        myUserId: this.userId,
        foundHero: !!heroPlayer,
        heroData: heroPlayer,
        allPlayerIds: tableInfo.players.map(p => p.id)
      });
      
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${tableId}, пропускаем обновление стола`);
        return;
      }
    }
    
    // Проверяем и записываем действия игроков
    if (tableInfo.players) {
      // Получаем предыдущее состояние стола для сравнения
      const previousTableInfo = this.tables.get(tableId);
      
      tableInfo.players.forEach(player => {
        // Получаем предыдущее состояние игрока
        let previousPlayer = null;
        let previousBet = 0;
        let previousHasActed = false;
        
        if (previousTableInfo && previousTableInfo.players) {
          previousPlayer = previousTableInfo.players.find(p => p.id === player.id);
          if (previousPlayer) {
            previousBet = previousPlayer.bet || 0;
            previousHasActed = previousPlayer.hasActed || false;
          }
        }
        
        // Записываем действие только если игрок только что совершил его
        if (player.hasActed && !previousHasActed) {
          let action = 'check';
          let amount = player.bet;
          
          // Проверяем, не фолд ли это
          if (player.folded || (player.bet === 0 && tableInfo.currentBet > 0)) {
            action = 'fold';
            amount = 0;
          } else if (player.bet === 0 && tableInfo.currentBet === 0) {
            // Игрок поставил 0 при отсутствии ставок на столе - это CHECK
            action = 'check';
            amount = 0;
          } else if (player.bet > 0) {
            // УЛУЧШЕННАЯ ЛОГИКА: определяем действие по контексту
            
            // Получаем максимальную ставку среди других игроков (исключая текущего)
            const otherPlayersBets = tableInfo.players
              .filter(p => p.id !== player.id)
              .map(p => p.bet || 0);
            const maxOtherBet = Math.max(0, ...otherPlayersBets);
            
            console.log(`🎯 Анализ ставки игрока ${player.name}: его ставка=${player.bet}, макс. ставка других=${maxOtherBet}, текущая ставка стола=${tableInfo.currentBet}, предыдущая ставка=${previousBet}`);
            
            // Если игрок уравнял текущую ставку стола - это CALL
            if (player.bet === tableInfo.currentBet && tableInfo.currentBet > 0) {
              action = 'call';
            }
            // Если игрок поставил больше текущей ставки стола - это BET или RAISE
            else if (player.bet > tableInfo.currentBet) {
              if (tableInfo.currentBet === 0) {
                // Нет ставки на столе - это BET
                action = 'bet';
              } else {
                // Есть ставка на столе - это RAISE
                action = 'raise';
              }
            }
            // Если игрок поставил меньше текущей ставки стола - это может быть ALL-IN или ошибка
            else if (player.bet < tableInfo.currentBet && player.bet > 0) {
              // Предполагаем что это ALL-IN
              action = 'call'; // или 'all-in' если хотим отдельно отслеживать
            }
            // Fallback - если логика не сработала
            else {
              if (tableInfo.currentBet === 0) {
                action = 'bet';
              } else {
                action = 'call';
              }
            }
          } else {
            // Ставка 0 - проверяем контекст
            if (tableInfo.currentBet === 0) {
              action = 'check';
            } else {
              // Если есть ставка на столе, а игрок поставил 0 - это фолд
              action = 'fold';
            }
          }
          
          console.log(`🎯 Записываем действие: игрок ${player.name}, действие: ${action}, сумма: ${amount}, текущая ставка стола: ${tableInfo.currentBet}, предыдущая ставка игрока: ${previousBet}`);
          this.recordAction(tableId, player.id, action, amount);
        }
      });
    }

    // Обновить кэш стола
    this.tables.set(tableId, tableInfo);
    
    // Обновить анимации очереди хода
    this.updatePlayerTurnAnimationsFromTableInfo(tableInfo);
    
    // Найти элемент стола
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    console.log('🔍 Поиск элемента стола:', {
      tableId,
      elementFound: !!tableElement,
      selector: `[data-table-id="${tableId}"]`
    });
    
    if (tableElement) {
      // 🔧 ИСПРАВЛЕНИЕ: Используем updateTableUI вместо полной замены элемента
      console.log('🔄 Вызов updateTableUI для стола:', tableId);
      this.updateTableUI(tableId, tableInfo);
      
      console.log('✅ Стол обновлен через updateTableUI');
    } else {
      console.error('❌ Элемент стола не найден:', tableId);
      // Попробуем найти все элементы столов для отладки
      const allTables = document.querySelectorAll('[data-table-id]');
      console.log('🔍 Все найденные столы:', Array.from(allTables).map(el => el.getAttribute('data-table-id')));
    }
  }

  handleTableUpdate(data) {
    console.log('📥 ПОЛУЧЕНО table-updated событие:', data);
    
    // Проверяем, не является ли это событием завершения раздачи
    if (data.message === 'Раздача завершена') {
      console.log('🏁 Получено событие завершения раздачи, ожидаем новую раздачу...');
      
      // ОЧИЩАЕМ ЗАПИСИ ДЕЙСТВИЙ ПРИ ЗАВЕРШЕНИИ РАЗДАЧИ
      this.resetActionTracker(data.tableId);
      
      // Показать сообщение о завершении раздачи
      const tableElement = document.querySelector(`[data-table-id="${data.tableId}"]`);
      if (tableElement) {
        const actionsArea = tableElement.querySelector('.table-actions');
        if (actionsArea) {
          actionsArea.innerHTML = `
            <div class="table-actions" style="opacity: 0.7; pointer-events: none;">
              <div style="text-align: center; color: #4CAF50; font-size: 0.9rem; font-weight: bold;">
                🏁 Раздача завершена
              </div>
            </div>
          `;
        }
      }
      return; // Не обрабатываем дальше
    }
    
    // Проверяем, не является ли это событием смены улицы
    if (data.street && data.tableId) {
      console.log(`🛣️ Обнаружена смена улицы на ${data.street} для стола ${data.tableId}`);
      this.setStreet(data.tableId, data.street);
      // Обновляем отображение после смены улицы
      this.updateActionDisplays(data.tableId);
    }
    
    // Проверяем, в каком формате пришли данные
    let tableInfo;
    let tableId;
    
    if (data.tableInfo) {
      // Старый формат: { tableId, tableInfo: {...} }
      tableId = data.tableId;
      tableInfo = data.tableInfo;
      console.log('📦 Данные в старом формате (tableInfo)');
    } else {
      // Новый формат: { tableId, currentPlayer, currentBet, players }
      tableId = data.tableId;
      tableInfo = {
        tableId: data.tableId,
        currentPlayer: data.currentPlayer,
        currentBet: data.currentBet,
        players: data.players || [],
        // Копируем все остальные поля
        ...data
      };
      console.log('📦 Данные в новом формат (прямые поля)');
    }
    
    // УПРОЩЕННАЯ ЛОГИКА: Добавляем разделители по количеству карт
    if (tableInfo && tableInfo.communityCards) {
      const cardCount = tableInfo.communityCards.length;
      const currentTracker = this.actionHistory.get(tableId);
      
      if (currentTracker) {
        // Инициализируем флаги если их нет
        if (currentTracker.separatorAdded4 === undefined) currentTracker.separatorAdded4 = false;
        if (currentTracker.separatorAdded5 === undefined) currentTracker.separatorAdded5 = false;
        if (currentTracker.lastCardCount === undefined) currentTracker.lastCardCount = 0;
        
        // Проверяем, изменилось ли количество карт
        if (cardCount !== currentTracker.lastCardCount) {
          console.log(`🃏 Изменение количества карт: ${currentTracker.lastCardCount} → ${cardCount}`);
          
          // При 4 картах добавляем первый разделитель (флоп -> тёрн)
          if (cardCount === 4 && !currentTracker.separatorAdded4) {
            console.log(`🛣️ Добавляем разделитель при 4 картах (флоп → тёрн)`);
            this.addSeparatorToActions(tableId);
            currentTracker.separatorAdded4 = true;
            // Также меняем улицу в трекере
            currentTracker.setStreet('turn');
          }
          // При 5 картах добавляем второй разделитель (тёрн -> ривер)
          else if (cardCount === 5 && !currentTracker.separatorAdded5) {
            console.log(`🛣️ Добавляем разделитель при 5 картах (тёрн → ривер)`);
            this.addSeparatorToActions(tableId);
            currentTracker.separatorAdded5 = true;
            // Также меняем улицу в трекере
            currentTracker.setStreet('river');
          }
          
          // Обновляем последнее количество карт
          currentTracker.lastCardCount = cardCount;
        }
      }
    }
    
    console.log('🔄 Обработка обновления стола:', {
      tableId,
      currentPlayer: tableInfo?.currentPlayer,
      currentBet: tableInfo?.currentBet,
      players: tableInfo?.players?.map(p => ({ id: p.id, name: p.name, bet: p.bet, hasActed: p.hasActed })),
      myUserId: this.userId
    });
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (tableInfo.players && tableInfo.players.length > 0) {
      const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
      console.log('🎯 Поиск героя:', {
        myUserId: this.userId,
        foundHero: !!heroPlayer,
        heroData: heroPlayer,
        allPlayerIds: tableInfo.players.map(p => p.id)
      });
      
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${tableId}, пропускаем обновление стола`);
        return;
      }
    }
    
    // Проверяем и записываем действия игроков
    if (tableInfo.players) {
      // Получаем предыдущее состояние стола для сравнения
      const previousTableInfo = this.tables.get(tableId);
      
      tableInfo.players.forEach(player => {
        // Получаем предыдущее состояние игрока
        let previousPlayer = null;
        let previousBet = 0;
        let previousHasActed = false;
        
        if (previousTableInfo && previousTableInfo.players) {
          previousPlayer = previousTableInfo.players.find(p => p.id === player.id);
          if (previousPlayer) {
            previousBet = previousPlayer.bet || 0;
            previousHasActed = previousPlayer.hasActed || false;
          }
        }
        
        // Записываем действие только если игрок только что совершил его
        if (player.hasActed && !previousHasActed) {
          let action = 'check';
          let amount = player.bet;
          
          // Проверяем, не фолд ли это
          if (player.folded || (player.bet === 0 && tableInfo.currentBet > 0)) {
            action = 'fold';
            amount = 0;
          } else if (player.bet === 0 && tableInfo.currentBet === 0) {
            // Игрок поставил 0 при отсутствии ставок на столе - это CHECK
            action = 'check';
            amount = 0;
          } else if (player.bet > 0) {
            // УЛУЧШЕННАЯ ЛОГИКА: определяем действие по контексту
            
            // Получаем максимальную ставку среди других игроков (исключая текущего)
            const otherPlayersBets = tableInfo.players
              .filter(p => p.id !== player.id)
              .map(p => p.bet || 0);
            const maxOtherBet = Math.max(0, ...otherPlayersBets);
            
            console.log(`🎯 Анализ ставки игрока ${player.name}: его ставка=${player.bet}, макс. ставка других=${maxOtherBet}, текущая ставка стола=${tableInfo.currentBet}, предыдущая ставка=${previousBet}`);
            
            // Если игрок уравнял текущую ставку стола - это CALL
            if (player.bet === tableInfo.currentBet && tableInfo.currentBet > 0) {
              action = 'call';
            }
            // Если игрок поставил больше текущей ставки стола - это BET или RAISE
            else if (player.bet > tableInfo.currentBet) {
              if (tableInfo.currentBet === 0) {
                // Нет ставки на столе - это BET
                action = 'bet';
              } else {
                // Есть ставка на столе - это RAISE
                action = 'raise';
              }
            }
            // Если игрок поставил меньше текущей ставки стола - это может быть ALL-IN или ошибка
            else if (player.bet < tableInfo.currentBet && player.bet > 0) {
              // Предполагаем что это ALL-IN
              action = 'call'; // или 'all-in' если хотим отдельно отслеживать
            }
            // Fallback - если логика не сработала
            else {
              if (tableInfo.currentBet === 0) {
                action = 'bet';
              } else {
                action = 'call';
              }
            }
          } else {
            // Ставка 0 - проверяем контекст
            if (tableInfo.currentBet === 0) {
              action = 'check';
            } else {
              // Если есть ставка на столе, а игрок поставил 0 - это фолд
              action = 'fold';
            }
          }
          
          console.log(`🎯 Записываем действие: игрок ${player.name}, действие: ${action}, сумма: ${amount}, текущая ставка стола: ${tableInfo.currentBet}, предыдущая ставка игрока: ${previousBet}`);
          this.recordAction(tableId, player.id, action, amount);
        }
      });
    }

    // Обновить кэш стола
    this.tables.set(tableId, tableInfo);
    
    // Найти элемент стола
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    console.log('🔍 Поиск элемента стола:', {
      tableId,
      elementFound: !!tableElement,
      selector: `[data-table-id="${tableId}"]`
    });
    
    if (tableElement) {
      // 🔧 ИСПРАВЛЕНИЕ: Используем updateTableUI вместо полной замены элемента
      console.log('🔄 Вызов updateTableUI для стола:', tableId);
      this.updateTableUI(tableId, tableInfo);
      
      console.log('✅ Стол обновлен через updateTableUI');
    } else {
      console.error('❌ Элемент стола не найден:', tableId);
      // Попробуем найти все элементы столов для отладки
      const allTables = document.querySelectorAll('[data-table-id]');
      console.log('🔍 Все найденные столы:', Array.from(allTables).map(el => el.getAttribute('data-table-id')));
    }
  }

  handleNewHandStarted(data) {
    console.log('🎲 Началась новая раздача:', data);
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (data.tableInfo) {
      const heroPlayer = data.tableInfo.players.find(p => p.id === this.userId);
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${data.tableId}, пропускаем обработку новой раздачи`);
        return;
      }
    }
    
    // Сбросить историю действий для новой раздачи
    console.log(`🧹 Сбрасываем историю действий для новой раздачи на столе ${data.tableId}`);
    this.resetActionTracker(data.tableId);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать уведомление
    this.showNotification(`Новая раздача началась на столе ${data.tableId}`, 'info');
    
    console.log(`✅ Стол ${data.tableId} - новая раздача инициализирована`);
  }

  handleNewHandAutoStarted(data) {
    console.log('🔄 Автоматически началась новая раздача:', data);
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (data.tableInfo) {
      const heroPlayer = data.tableInfo.players.find(p => p.id === this.userId);
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${data.tableId}, пропускаем обработку автоматической раздачи`);
        return;
      }
    }
    
    // Сбросить историю действий для новой раздачи
    this.resetActionTracker(data.tableId);
    
    // Обновить интерфейс стола
    if (data.tableInfo) {
      this.updateTableUI(data.tableId, data.tableInfo);
    }
    
    // Показать уведомление с информацией об автоматическом запуске
    this.showNotification(`${data.message} (раздача #${data.handNumber})`, 'success');
    
    console.log(`🎮 Стол ${data.tableId} - автоматическая раздача #${data.handNumber} началась`);
  }

  handleAllInDealStarted(data) {
    console.log('🎯 Началась автоматическая раздача all-in:', data);
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (data.tableInfo) {
      const heroPlayer = data.tableInfo.players.find(p => p.id === this.userId);
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${data.tableId}, пропускаем обработку all-in раздачи`);
        return;
      }
    }
    
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
    
    // 🔧 ИСПРАВЛЕНИЕ: Проверяем, участвует ли текущий игрок на этом столе
    if (data.tableInfo) {
      const heroPlayer = data.tableInfo.players.find(p => p.id === this.userId);
      if (!heroPlayer) {
        console.log(`⚠️ Игрок ${this.userId} не участвует на столе ${data.tableId}, пропускаем обработку раздачи карты all-in`);
        return;
      }
    }
    
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

  // Рассчитать минимальный размер рейза согласно правилам покера
  calculateMinimumRaise(tableId) {
    const tableInfo = this.tables.get(tableId);
    if (!tableInfo) {
      console.log('❌ Информация о столе не найдена для расчета минимального рейза');
      return 0;
    }
    
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponent = tableInfo.players.find(p => p.id !== this.userId);
    
    if (!heroPlayer || !opponent) {
      console.log('❌ Игроки не найдены для расчета минимального рейза');
      return 0;
    }
    
    // Получить текущие ставки игроков
    const heroBet = (heroPlayer.bet || 0) / 100; // в долларах
    const opponentBet = (opponent.bet || 0) / 100; // в долларах
    const currentBet = Math.max(heroBet, opponentBet);
    
    // Получить информацию о блайндах
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const bigBlind = handHistoryInfo.bigBlind;
    
    // Определить размер последнего увеличения ставки согласно правилам покера
    let lastRaiseSize = bigBlind; // По умолчанию BB
    
    if (currentBet > 0) {
      // Правило: минимальный рейз = размер предыдущей ставки/рейза
      // Если есть текущая ставка, минимальный рейз = удвоить эту ставку
      // Пример: бет $50 → минимальный рейз до $100 (увеличение на $50)
      lastRaiseSize = currentBet;
    }
    
    // Минимальный рейз = текущая максимальная ставка + размер последнего увеличения
    const minimumRaiseTotal = currentBet + lastRaiseSize;
    
    console.log(`💰 Расчет минимального рейза:`, {
      heroBet: `$${heroBet.toFixed(2)}`,
      opponentBet: `$${opponentBet.toFixed(2)}`,
      currentBet: `$${currentBet.toFixed(2)}`,
      lastRaiseSize: `$${lastRaiseSize.toFixed(2)}`,
      minimumRaiseTotal: `$${minimumRaiseTotal.toFixed(2)}`
    });
    
    return minimumRaiseTotal;
  }

  // Обработчик колесика мыши для всего стола
  handleTableWheel(event, tableId) {
    event.preventDefault();
    
    const inputElement = document.getElementById(`sizing-input-${tableId}`);
    if (!inputElement) return;
    
    const currentValue = parseFloat(inputElement.value) || 0;
    
    // Получить информацию о столе для определения шага изменения
    const tableInfo = this.tables.get(tableId);
    if (!tableInfo) return;
    
    const handHistoryInfo = this.parseHandHistoryInfo(tableInfo);
    const bigBlindAmount = handHistoryInfo.bigBlind;
    
    // Определить шаг изменения: BB для небольших сумм, потом переходим на более крупные шаги
    let step = bigBlindAmount;
    if (currentValue > bigBlindAmount * 10) {
      step = bigBlindAmount * 2; // Шаг в 2BB для крупных сумм
    }
    if (currentValue > bigBlindAmount * 50) {
      step = bigBlindAmount * 5; // Шаг в 5BB для очень крупных сумм
    }
    
    // Определить направление прокрутки
    const delta = event.deltaY > 0 ? -step : step;
    let newValue = currentValue + delta;
    
    // Определить минимальное значение
    const heroPlayer = tableInfo.players.find(p => p.id === this.userId);
    const opponent = tableInfo.players.find(p => p.id !== this.userId);
    const heroCurrentBet = (heroPlayer?.bet || 0) / 100;
    const opponentCurrentBet = (opponent?.bet || 0) / 100;
    const maxBet = Math.max(heroCurrentBet, opponentCurrentBet, 0);
    const canCheck = heroCurrentBet === maxBet;
    
    let minimumValue;
    if (canCheck) {
      // Если можем чекнуть, минимальная ставка = BB
      minimumValue = bigBlindAmount;
    } else {
      // Если нужно рейзить, минимум = минимальный рейз
      minimumValue = this.calculateMinimumRaise(tableId);
    }
    
    // Определить максимальное значение (ограничено стеком игрока)
    const heroStack = (heroPlayer?.stack || 0) / 100; // в долларах
    const maxPossibleBet = heroStack + heroCurrentBet; // весь доступный стек
    
    // Применить ограничения (минимум и максимум)
    newValue = Math.max(minimumValue, newValue);
    newValue = Math.min(maxPossibleBet, newValue);
    
    // Округлить до центов
    newValue = Math.round(newValue * 100) / 100;
    
    inputElement.value = newValue.toFixed(2);
    
    // Обновить текст кнопки ставки
    this.updateBetButtonText(tableId, newValue, canCheck);
    
    console.log(`🖱️ Изменение размера ставки колесиком на столе ${tableId}: $${newValue.toFixed(2)} (шаг: $${step.toFixed(2)}, макс: $${maxPossibleBet.toFixed(2)})`);
  }

  // ===== МЕТОДЫ ДЛЯ РАБОТЫ С ИСТОРИЕЙ ДЕЙСТВИЙ =====
  initializeActionTracker(tableId) {
    if (!this.actionHistory.has(tableId)) {
      const tracker = new ActionTracker();
      // Инициализируем флаги разделителей
      tracker.separatorAdded4 = false;
      tracker.separatorAdded5 = false;
      tracker.lastCardCount = 0;
      this.actionHistory.set(tableId, tracker);
    }
  }

  resetActionTracker(tableId) {
    console.log(`🔄 Сброс трекера действий для стола ${tableId}`);
    
    if (this.actionHistory.has(tableId)) {
      this.actionHistory.get(tableId).reset();
    } else {
      this.initializeActionTracker(tableId);
    }
    
    // Сбрасываем флаги разделителей
    const tracker = this.actionHistory.get(tableId);
    if (tracker) {
      tracker.separatorAdded4 = false;
      tracker.separatorAdded5 = false;
    }
    
    // Принудительно очищаем отображение действий
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (tableElement) {
      const heroActionsElement = tableElement.querySelector('.hero-actions-display .actions-text');
      const opponentActionsElement = tableElement.querySelector('.opponent-actions-display .actions-text');
      
      if (heroActionsElement) {
        heroActionsElement.textContent = '';
        console.log(`🧹 Очищены действия героя для стола ${tableId}`);
      }
      
      if (opponentActionsElement) {
        opponentActionsElement.textContent = '';
        console.log(`🧹 Очищены действия оппонента для стола ${tableId}`);
      }
    }
    
    this.updateActionDisplays(tableId);
  }

  addSeparatorToActions(tableId) {
    console.log(`➕ Добавление разделителя для стола ${tableId}`);
    const tracker = this.actionHistory.get(tableId);
    if (tracker) {
      tracker.addSeparator();
      // Сразу обновляем отображение после добавления разделителя
      this.updateActionDisplays(tableId);
    }
  }

  recordAction(tableId, playerId, action, amount) {
    console.log(`🎯 ВЫЗОВ recordAction: tableId=${tableId}, playerId=${playerId}, action=${action}, amount=${amount}`);
    
    this.initializeActionTracker(tableId);
    const tracker = this.actionHistory.get(tableId);
    
    if (!tracker) {
      console.log(`❌ Трекер не найден для стола ${tableId}`);
      return;
    }
    
    // Определяем, является ли это действие героя
    const isHero = playerId === this.userId;
    console.log(`🎯 Определение героя: playerId=${playerId}, this.userId=${this.userId}, isHero=${isHero}`);
    
    tracker.addAction(playerId, action, amount, isHero);
    this.updateActionDisplays(tableId);
    
    console.log(`📝 ЗАПИСАНО ДЕЙСТВИЕ: ${action} ${amount} для игрока ${playerId} (герой: ${isHero})`);
  }

  checkAndUpdateStreet(tableId, newStreet) {
    console.log(`🛣️ Проверка смены улицы для стола ${tableId}: новая улица = ${newStreet}`);
    this.initializeActionTracker(tableId);
    const tracker = this.actionHistory.get(tableId);
    
    if (tracker.currentStreet !== newStreet) {
      console.log(`🔄 Смена улицы: ${tracker.currentStreet} → ${newStreet}`);
      
      // Добавляем разделитель перед сменой улицы (если есть действия)
      if (tracker.heroActions[tracker.currentStreet].length > 0 || 
          tracker.opponentActions[tracker.currentStreet].length > 0) {
        console.log(`➕ Добавляем разделитель перед сменой улицы`);
        tracker.addSeparator();
      }
      
      // Устанавливаем новую улицу
      tracker.setStreet(newStreet);
      this.updateActionDisplays(tableId);
      
      // Показываем уведомление о смене улицы
      this.showNotification(`Новая улица: ${this.getStreetName(newStreet)}`, 'info');
    }
  }

  setStreet(tableId, street) {
    this.initializeActionTracker(tableId);
    const tracker = this.actionHistory.get(tableId);
    tracker.setStreet(street);
    
    console.log(`🛣️ Улица изменена на ${street} для стола ${tableId}`);
  }

  updateActionDisplays(tableId) {
    console.log(`🎯 Обновление отображения действий для стола ${tableId}`);
    
    const tableElement = document.querySelector(`[data-table-id="${tableId}"]`);
    if (!tableElement) {
      console.log(`❌ Элемент стола ${tableId} не найден`);
      return;
    }

    const tracker = this.actionHistory.get(tableId);
    if (!tracker) {
      console.log(`❌ Трекер действий для стола ${tableId} не найден`);
      return;
    }

    // Обновляем отображение действий героя
    const heroActionsElement = tableElement.querySelector('.hero-actions-display .actions-text');
    console.log(`🎯 Поиск героя actions element:`, !!heroActionsElement);
    if (heroActionsElement) {
      const heroActionsString = tracker.getActionsString(true);
      console.log(`🎯 Строка действий героя: "${heroActionsString}"`);
      heroActionsElement.innerHTML = heroActionsString || '';
    } else {
      console.log(`❌ Элемент .hero-actions-display .actions-text не найден для стола ${tableId}`);
    }

    // Обновляем отображение действий оппонента
    const opponentActionsElement = tableElement.querySelector('.opponent-actions-display .actions-text');
    console.log(`🎯 Поиск оппонента actions element:`, !!opponentActionsElement);
    if (opponentActionsElement) {
      const opponentActionsString = tracker.getActionsString(false);
      console.log(`🎯 Строка действий оппонента: "${opponentActionsString}"`);
      opponentActionsElement.innerHTML = opponentActionsString || '';
    } else {
      console.log(`❌ Элемент .opponent-actions-display .actions-text не найден для стола ${tableId}`);
    }
  }

  // ===== АНИМАЦИИ ОЧЕРЕДИ ХОДА В МУЛЬТИПЛЕЕРЕ =====

  setPlayerTurnAnimation(playerId, isActive = true) {
    console.log(`🎬 Установка анимации очереди хода для игрока ${playerId}, активная: ${isActive}`);
    
    // Очищаем все анимации
    this.clearAllPlayerTurnAnimations();
    
    if (!isActive) return;
    
    // Находим контейнер для данного игрока
    const tables = document.querySelectorAll('.multiplayer-table');
    
    tables.forEach(table => {
      const tableId = table.dataset.tableId;
      
      // Проверяем героя
      const heroSection = table.querySelector('.player-section.hero-green');
      const heroPlayer = this.findPlayerInTableInfo(tableId, 'hero');
      
      if (heroPlayer && heroPlayer.id === playerId && heroSection) {
        heroSection.classList.add('active-turn');
        console.log(`🎬 Анимация активирована для героя на столе ${tableId}`);
        return;
      }
      
      // Проверяем оппонента
      const opponentArea = table.querySelector('.opponent-area-compact');
      const opponentPlayer = this.findPlayerInTableInfo(tableId, 'opponent');
      
      if (opponentPlayer && opponentPlayer.id === playerId && opponentArea) {
        opponentArea.classList.add('active-turn');
        console.log(`🎬 Анимация активирована для оппонента на столе ${tableId}`);
        return;
      }
    });
  }

  clearAllPlayerTurnAnimations() {
    // Убираем анимацию у всех возможных контейнеров игроков
    const containers = document.querySelectorAll(
      '.opponent-area-compact.active-turn, .player-section.hero-green.active-turn'
    );
    
    containers.forEach(container => {
      container.classList.remove('active-turn');
    });
    
    console.log(`🎬 Очищены анимации очереди хода в мультиплеере (${containers.length} контейнеров)`);
  }

  updatePlayerTurnAnimationsFromTableInfo(tableInfo) {
    console.log('🎬 Обновление анимаций очереди хода:', {
      currentPlayer: tableInfo.currentPlayer,
      actionRequired: tableInfo.actionRequired
    });
    
    if (tableInfo.currentPlayer && tableInfo.actionRequired) {
      this.setPlayerTurnAnimation(tableInfo.currentPlayer, true);
    } else {
      this.clearAllPlayerTurnAnimations();
    }
  }

  findPlayerInTableInfo(tableId, role) {
    // Заглушка - нужно получить информацию о игроке из кеша таблиц
    const tableData = this.sessionInfo?.tables?.find(t => t.tableId === tableId);
    if (!tableData) return null;
    
    if (role === 'hero') {
      return tableData.players.find(p => p.id === this.currentUserId);
    } else if (role === 'opponent') {
      return tableData.players.find(p => p.id !== this.currentUserId);
    }
    
    return null;
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
  const filesIcon = document.querySelector('.files-icon');
  
  if (sessionActive && sessionId) {
    sessionIcon.style.display = 'flex';
    sessionIcon.dataset.tooltip = `Сессия: ${sessionId}`;
    sessionIcon.classList.add('active');
    
    // Показать иконку экспорта когда игра активна
    if (exportIcon) {
      exportIcon.style.display = 'flex';
    }
    
    // Показать иконку управления файлами когда игра активна
    if (filesIcon) {
      filesIcon.style.display = 'flex';
    }
  } else {
    sessionIcon.style.display = 'none';
    sessionIcon.classList.remove('active');
    
    // Скрыть иконку экспорта когда сессия неактивна
    if (exportIcon) {
      exportIcon.style.display = 'none';
    }
    
    // Скрыть иконку управления файлами когда сессия неактивна
    if (filesIcon) {
      filesIcon.style.display = 'none';
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

function openHandHistoryManager() {
  // Открыть страницу управления файлами HandHistory в новой вкладке
  window.open('/handhistory-manager-auth.html', '_blank');
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

// ===== КЛАСС ДЛЯ ОТСЛЕЖИВАНИЯ ДЕЙСТВИЙ ИГРОКОВ =====
class ActionTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.heroActions = {
      flop: [],
      turn: [],
      river: []
    };
    this.opponentActions = {
      flop: [],
      turn: [],
      river: []
    };
    this.currentStreet = 'flop';
    // Отслеживаем последние записанные действия для каждого игрока
    this.lastRecordedActions = new Map();
  }

  setStreet(street) {
    const oldStreet = this.currentStreet;
    this.currentStreet = street;
    console.log(`🛣️ ActionTracker: улица изменена с ${oldStreet} на ${street}`);
    
    // Очищаем кэш записанных действий при смене улицы
    this.lastRecordedActions.clear();
  }

  addSeparator() {
    console.log(`➕ ActionTracker: добавление разделителя "|" на улице ${this.currentStreet}`);
    
    // Добавляем разделитель к текущим действиям обоих игроков
    // Но только если у них есть действия на текущей улице
    const hasHeroActions = this.heroActions[this.currentStreet] && this.heroActions[this.currentStreet].length > 0;
    const hasOpponentActions = this.opponentActions[this.currentStreet] && this.opponentActions[this.currentStreet].length > 0;
    
    console.log(`🎯 Проверка действий для разделителя:`, {
      currentStreet: this.currentStreet,
      hasHeroActions,
      hasOpponentActions,
      heroActions: this.heroActions[this.currentStreet],
      opponentActions: this.opponentActions[this.currentStreet]
    });
    
    // Добавляем разделитель только если есть действия на текущей улице
    if (hasHeroActions) {
      this.heroActions[this.currentStreet].push('|');
      console.log(`✅ Добавлен разделитель к действиям героя`);
    }
    if (hasOpponentActions) {
      this.opponentActions[this.currentStreet].push('|');
      console.log(`✅ Добавлен разделитель к действиям оппонента`);
    }
  }

  addAction(playerId, action, amount, isHero) {
    const actionCode = this.getActionCode(action, amount);
    const playerActions = isHero ? this.heroActions : this.opponentActions;
    
    console.log(`🎯 Попытка добавить действие:`, {
      playerId,
      action,
      amount,
      actionCode,
      isHero,
      currentStreet: this.currentStreet
    });
    
    // Создаем уникальный ключ для действия
    const actionKey = `${playerId}_${this.currentStreet}_${action}_${amount}`;
    
    // Проверяем, не записывали ли мы уже это действие
    if (this.lastRecordedActions.has(actionKey)) {
      console.log(`⚠️ Пропускаем уже записанное действие: ${actionCode} для игрока ${playerId}`);
      return;
    }
    
    if (playerActions[this.currentStreet]) {
      playerActions[this.currentStreet].push(actionCode);
      this.lastRecordedActions.set(actionKey, true);
      console.log(`✅ Добавлено действие: ${actionCode} для ${isHero ? 'героя' : 'оппонента'} (${playerId}) на улице ${this.currentStreet}`);
      console.log(`📊 Текущие действия на ${this.currentStreet}:`, playerActions[this.currentStreet]);
    } else {
      console.error(`❌ Неизвестная улица: ${this.currentStreet}`);
    }
  }

  getActionCode(action, amount) {
    switch (action) {
      case 'check':
        return '<span class="action-check">Check</span>';
      case 'call':
        return `<span class="action-call">Call ${this.formatAmount(amount)}</span>`;
      case 'bet':
        return `<span class="action-bet">Bet ${this.formatAmount(amount)}</span>`;
      case 'raise':
        return `<span class="action-raise">Raise ${this.formatAmount(amount)}</span>`;
      case 'fold':
        return '<span class="action-fold">Fold</span>';
      case 'all-in':
        return `<span class="action-bet">All-in ${this.formatAmount(amount)}</span>`;
      default:
        return `<span class="action-check">${action}</span>`;
    }
  }

  formatAmount(amount) {
    // Конвертируем центы в доллары
    const dollars = amount / 100;
    
    // Форматируем с символом доллара
    if (dollars >= 1000) {
      return `$${(dollars / 1000).toFixed(1).replace('.0', '')}k`;
    } else if (dollars % 1 === 0) {
      return `$${dollars}`;
    } else {
      return `$${dollars.toFixed(2).replace(/\.?0+$/, '')}`;
    }
  }

  getActionsString(isHero) {
    const playerActions = isHero ? this.heroActions : this.opponentActions;
    const allActions = [];

    console.log(`🎯 Формирование строки действий для ${isHero ? 'героя' : 'оппонента'}:`, {
      flop: playerActions.flop,
      turn: playerActions.turn,
      river: playerActions.river
    });

    // Собираем все действия в одну строку с простыми разделителями
    if (playerActions.flop.length > 0) {
      allActions.push(...playerActions.flop);
    }
    if (playerActions.turn.length > 0) {
      allActions.push(...playerActions.turn);
    }
    if (playerActions.river.length > 0) {
      allActions.push(...playerActions.river);
    }

    // Соединяем все действия простыми пробелами
    const result = allActions.join(' ');
    console.log(`🎯 Итоговая строка действий: "${result}"`);
    return result;
  }
} 