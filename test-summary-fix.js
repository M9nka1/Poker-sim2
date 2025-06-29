// Тест для проверки исправления проблемы с отсутствующими игроками в SUMMARY
// Использование: node test-summary-fix.js

// Симуляция проблемного сценария
const testPreflopSpot = `PokerStars Hand #175033914927511: Hold'em No Limit ($0.50/$1.00) - 2025-06-19T13:19:09.275Z.275Z GMT+03:00
Table 'PioSolver Table' 6-max Seat #5 is the button
Seat 1: CC_BB_OOP_vs_CO ($100.00 in chips)
Seat 2: Pio_EP ($100.00 in chips)
Seat 3: Pio_MP ($100.00 in chips)
Seat 4: RFI_IP_CO ($100.00 in chips)
Seat 5: Pio_BTN ($100.00 in chips)
Seat 6: Pio_SB ($100.00 in chips)
Pio_SB: posts small blind $0.50
CC_BB_OOP_vs_CO: posts big blind $1.00
*** HOLE CARDS ***
Pio_EP: folds
Pio_MP: folds
RFI_IP_CO: raises $1.75 to $2.50
Pio_BTN: folds
Pio_SB: folds
CC_BB_OOP_vs_CO: calls $1.50`;

// Тестовые данные для симуляции игроков
const testPlayers = new Map([
  ['player1', { id: 'player1', name: 'CC_BB_OOP_vs_CO', folded: false, cards: [{rank: 'J', suit: 'diamonds'}, {rank: '5', suit: 'diamonds'}] }],
  ['player2', { id: 'player2', name: 'RFI_IP_CO', folded: false, cards: [{rank: 'A', suit: 'spades'}, {rank: 'K', suit: 'hearts'}] }]
]);

const testActivePlayersScenario1 = [testPlayers.get('player1')]; // RFI_IP_CO фолдил
const testActivePlayersScenario2 = [testPlayers.get('player1'), testPlayers.get('player2')]; // Оба дошли до конца

const testWinner = testPlayers.get('player1');

const testHandHistory = {
  actions: [
    { playerName: 'RFI_IP_CO', action: 'fold', street: 'flop' },
    { playerName: 'CC_BB_OOP_vs_CO', action: 'check', street: 'flop' }
  ]
};

// Создаем мок объекта PokerTable
class MockPokerTable {
  constructor() {
    this.preflopSpot = testPreflopSpot;
    this.players = testPlayers;
    this.currentHandHistory = testHandHistory;
    this.pot = 550; // $5.50 в центах
  }

  formatCard(card) {
    const rank = card.rank === '10' ? 'T' : card.rank;
    const suitMap = {
      'spades': 's', 'hearts': 'h', 'diamonds': 'd', 'clubs': 'c'
    };
    const suit = suitMap[card.suit] || 's';
    return `${rank}${suit}`;
  }

  calculateRake() {
    return this.pot * 0.05; // 5% rake
  }

  getHandDescription(cards) {
    if (cards[0].rank === cards[1].rank) {
      return `a pair of ${cards[0].rank}s`;
    }
    return `${cards[0].rank} high`;
  }

  generateSummarySeats(winner, activePlayers) {
    let summaryText = '';
    
    // Извлекаем информацию о местах из префлоп спота
    const seatMatches = Array.from(this.preflopSpot.matchAll(/Seat (\d+): ([^(]+) \([^)]+\)/g));
    
    // DEBUG: Логируем информацию для отладки
    console.log('🔍 DEBUG generateSummarySeats:');
    console.log('  seatMatches:', seatMatches.map(m => `Seat ${m[1]}: ${m[2].trim()}`));
    console.log('  activePlayers:', activePlayers.map(p => `${p.name} (folded: ${p.folded})`));
    console.log('  winner:', winner ? winner.name : 'none');
    
    seatMatches.forEach(match => {
      const seatNumber = match[1];
      const playerName = match[2].trim();
      
      console.log(`\n  🎯 Обрабатываем Seat ${seatNumber}: ${playerName}`);
      
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
      console.log(`    Найден в this.players:`, player ? `${player.name} (folded: ${player.folded})` : 'НЕТ');
      
      if (player) {
        // Это один из реальных игроков, участвующих в раздаче
        if (player.folded) {
          // Игрок сфолдил во время постфлоп игры
          console.log(`    ✅ Игрок сфолдил на постфлопе`);
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded on the Flop\n`;
        } else if (activePlayers.includes(player)) {
          // Игрок дошел до конца
          if (player.id === winner.id) {
            console.log(`    ✅ Игрок ВЫИГРАЛ`);
            const rakeAmount = this.calculateRake();
            const winAmount = this.pot - rakeAmount;
            const handDescription = this.getHandDescription(player.cards);
            summaryText += `Seat ${seatNumber}: ${playerName}${position} showed [${player.cards.map(c => this.formatCard(c)).join(' ')}] and won ($${(winAmount / 100).toFixed(2)}) with ${handDescription}\n`;
          } else {
            console.log(`    ✅ Игрок проиграл но дошел до конца`);
            const handDescription = this.getHandDescription(player.cards);
            summaryText += `Seat ${seatNumber}: ${playerName}${position} showed [${player.cards.map(c => this.formatCard(c)).join(' ')}] and lost with ${handDescription}\n`;
          }
        } else {
          // ✅ ИСПРАВЛЕНИЕ: Добавляем обработку игроков которые фолдили но не помечены как folded
          console.log(`    ⚠️ Игрок найден но не в activePlayers и не folded - вероятно фолдил`);
          
          // Проверяем действия игрока в истории раздачи
          const playerActions = this.currentHandHistory?.actions?.filter(a => a.playerName === playerName) || [];
          const hasFoldAction = playerActions.some(a => a.action === 'fold');
          
          if (hasFoldAction) {
            // Определяем на какой улице сфолдил
            const foldAction = playerActions.find(a => a.action === 'fold');
            const streetName = foldAction.street.charAt(0).toUpperCase() + foldAction.street.slice(1);
            summaryText += `Seat ${seatNumber}: ${playerName}${position} folded on the ${streetName}\n`;
          } else {
            // Если нет явного fold action, но игрок не активен - скорее всего фолдил на флопе
            summaryText += `Seat ${seatNumber}: ${playerName}${position} folded on the Flop\n`;
          }
        }
      } else {
        // Это игрок из префлоп спота, который не участвует в постфлоп игре
        console.log(`    ❌ Игрок НЕ найден в активных игроках - фолдил на префлопе`);
        if (this.preflopSpot.includes(`${playerName}: folds`) && !this.preflopSpot.includes(`${playerName}: posts`)) {
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop (didn't bet)\n`;
        } else {
          summaryText += `Seat ${seatNumber}: ${playerName}${position} folded before Flop\n`;
        }
      }
    });
    
    console.log(`  📊 SUMMARY результат:\n${summaryText}`);
    return summaryText;
  }
}

// Запускаем тест
console.log('🧪 ТЕСТ: Проверка исправления проблемы с SUMMARY\n');

const mockTable = new MockPokerTable();

console.log('📋 Сценарий 1: RFI_IP_CO фолдил на флопе');
console.log('='*50);
const summary1 = mockTable.generateSummarySeats(testWinner, testActivePlayersScenario1);
console.log('\n📋 Ожидаемый результат: RFI_IP_CO должен появиться как "folded on the Flop"');
console.log('✅ Результат содержит RFI_IP_CO?', summary1.includes('RFI_IP_CO') ? 'ДА' : 'НЕТ');

console.log('\n' + '='*60 + '\n');

console.log('📋 Сценарий 2: Оба игрока дошли до конца');
console.log('='*50);
const summary2 = mockTable.generateSummarySeats(testWinner, testActivePlayersScenario2);
console.log('\n📋 Ожидаемый результат: Оба игрока должны быть в SUMMARY');
console.log('✅ Результат содержит RFI_IP_CO?', summary2.includes('RFI_IP_CO') ? 'ДА' : 'НЕТ');
console.log('✅ Результат содержит CC_BB_OOP_vs_CO?', summary2.includes('CC_BB_OOP_vs_CO') ? 'ДА' : 'НЕТ'); 