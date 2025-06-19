const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

async function testHandHistoryCreation() {
  console.log('🧪 Тестирование создания HandHistory файлов...');
  
  try {
    // Подключаемся к серверу
    const socket1 = io('http://localhost:3001');
    const socket2 = io('http://localhost:3001');
    
    let sessionId = null;
    let gameStarted = false;
    
    // Настройки игры
    const gameSettings = {
      preflopSpot: `
Effective stack: $100
Preflop investments: SB $0.5, BB $2.5, CO $2.5
Player ranges:
BB: 22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o
CO: 22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 98s, 87s, 76s, 65s, 54s, A8o+, KTo+, QTo+, JTo
      `,
      playerRanges: {
        positions: {
          player1: 'CO',
          player2: 'BB'
        }
      },
      flopRestrictions: {
        suits: 'any',
        pairing: 'any',
        ranks: { high: ['any'], middle: ['any'], low: ['any'] }
      }
    };
    
    // Создание сессии
    socket1.emit('create-session', {
      playerName: 'TestPlayer1',
      userId: 'test-user-1',
      settings: gameSettings
    });
    
    socket1.on('session-created', (data) => {
      console.log('✅ Сессия создана:', data.sessionId);
      sessionId = data.sessionId;
      
      // Присоединяем второго игрока
      socket2.emit('join-session', {
        sessionId: sessionId,
        playerName: 'TestPlayer2'
      });
    });
    
    socket2.on('session-joined', () => {
      console.log('✅ Второй игрок присоединился');
    });
    
    socket1.on('game-started', () => {
      console.log('✅ Игра началась');
      gameStarted = true;
    });
    
    socket2.on('game-started', () => {
      console.log('✅ Игра началась для второго игрока');
    });
    
    // Обработка обновлений стола
    let handCount = 0;
    let currentTableData = null;
    
    socket1.on('table-updated', (data) => {
      currentTableData = data;
      console.log(`📊 Обновление стола: ${data.message}, раздача ${data.handNumber}, улица ${data.street}`);
      
      if (data.actionRequired && data.currentPlayer) {
        // Автоматически делаем check
        setTimeout(() => {
          socket1.emit('player-action', {
            tableId: data.tableId,
            action: 'check'
          });
        }, 500);
      }
    });
    
    socket2.on('table-updated', (data) => {
      console.log(`📊 Обновление стола для игрока 2: ${data.message}, раздача ${data.handNumber}`);
      
      if (data.actionRequired && data.currentPlayer) {
        // Автоматически делаем check
        setTimeout(() => {
          socket2.emit('player-action', {
            tableId: data.tableId,
            action: 'check'
          });
        }, 500);
      }
    });
    
    socket1.on('hand-completed', (data) => {
      handCount++;
      console.log(`🏆 Раздача ${handCount} завершена!`);
      
      if (handCount >= 2) {
        // Проверяем, создался ли файл HandHistory
        setTimeout(() => {
          checkHandHistoryFiles(sessionId);
          socket1.disconnect();
          socket2.disconnect();
          process.exit(0);
        }, 1000);
      }
    });
    
    // Ждем некоторое время для завершения теста
    setTimeout(() => {
      console.log('⏰ Тайм-аут теста');
      if (handCount > 0) {
        checkHandHistoryFiles(sessionId);
      } else {
        console.log('❌ Ни одна раздача не была завершена');
      }
      socket1.disconnect();
      socket2.disconnect();
      process.exit(1);
    }, 30000); // 30 секунд тайм-аут
    
  } catch (error) {
    console.error('❌ Ошибка теста:', error);
    process.exit(1);
  }
}

function checkHandHistoryFiles(sessionId) {
  const handHistoryDir = path.join(__dirname, 'hand_histories');
  
  if (!fs.existsSync(handHistoryDir)) {
    console.log('❌ Директория hand_histories не существует');
    return;
  }
  
  const files = fs.readdirSync(handHistoryDir);
  const sessionFiles = files.filter(file => file.includes(sessionId));
  
  console.log(`📁 Найдено ${sessionFiles.length} файлов для сессии ${sessionId}:`);
  sessionFiles.forEach(file => {
    const filePath = path.join(handHistoryDir, file);
    const stats = fs.statSync(filePath);
    console.log(`  📄 ${file} (${stats.size} байт)`);
    
    if (stats.size > 0) {
      const content = fs.readFileSync(filePath, 'utf8');
      console.log(`  📝 Содержимое (первые 200 символов):`);
      console.log(`  ${content.substring(0, 200)}...`);
    }
  });
  
  if (sessionFiles.length > 0 && sessionFiles.some(file => {
    const stats = fs.statSync(path.join(handHistoryDir, file));
    return stats.size > 0;
  })) {
    console.log('✅ HandHistory файлы успешно созданы!');
  } else {
    console.log('❌ HandHistory файлы не созданы или пусты');
  }
}

testHandHistoryCreation(); 