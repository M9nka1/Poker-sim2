// Тест проверки исправлений подсчета банка
console.log('🔧 Проверка исправлений подсчета банка');
console.log('=====================================');
console.log('');

// Симуляция данных Hand History с исправленной логикой
const handData = {
  preflopInvestments: {
    'player1': 11500, // $115 в центах
    'player2': 11500  // $115 в центах
  },
  actions: [
    // FLOP
    { playerId: 'player1', action: 'bet', amount: 11500, street: 'flop' },
    { playerId: 'player2', action: 'raise', amount: 11500, totalBet: 23000, street: 'flop' },
    { playerId: 'player1', action: 'call', amount: 11500, street: 'flop' },
    
    // TURN
    { playerId: 'player1', action: 'check', amount: 0, street: 'turn' },
    { playerId: 'player2', action: 'check', amount: 0, street: 'turn' },
    
    // RIVER
    { playerId: 'player1', action: 'bet', amount: 10750, street: 'river' },
    { playerId: 'player2', action: 'raise', amount: 10750, totalBet: 21500, street: 'river' },
    { playerId: 'player1', action: 'raise', amount: 33750, totalBet: 55250, street: 'river' },
    { playerId: 'player2', action: 'raise', amount: 10750, totalBet: 66000, street: 'river' },
    { playerId: 'player1', action: 'call', amount: 10750, street: 'river' }
  ]
};

// Симуляция новой логики подсчета
let totalPot = 0;

// Префлоп
const preflopTotal = Object.values(handData.preflopInvestments).reduce((a, b) => a + b, 0);
totalPot += preflopTotal;
console.log(`💰 Префлоп: $${(preflopTotal / 100).toFixed(2)}`);

// Подсчет по улицам (новая логика)
const streetTotals = { flop: {}, turn: {}, river: {} };

handData.actions.forEach(action => {
  if (action.action === 'bet' || action.action === 'raise' || action.action === 'call') {
    const street = action.street || 'flop';
    
    if (!streetTotals[street]) {
      streetTotals[street] = {};
    }
    if (!streetTotals[street][action.playerId]) {
      streetTotals[street][action.playerId] = 0;
    }
    
    if (action.action === 'bet') {
      streetTotals[street][action.playerId] = action.amount;
    } else if (action.action === 'raise') {
      streetTotals[street][action.playerId] = action.totalBet || action.amount;
    } else if (action.action === 'call') {
      streetTotals[street][action.playerId] += action.amount;
    }
  }
});

// Суммируем все ставки по улицам
Object.keys(streetTotals).forEach(street => {
  const streetTotal = Object.values(streetTotals[street]).reduce((a, b) => a + b, 0);
  if (streetTotal > 0) {
    totalPot += streetTotal;
    console.log(`💰 ${street.toUpperCase()}: $${(streetTotal / 100).toFixed(2)}`);
    
    // Детализация по игрокам
    Object.entries(streetTotals[street]).forEach(([playerId, amount]) => {
      console.log(`   ${playerId}: $${(amount / 100).toFixed(2)}`);
    });
  }
});

console.log('');
console.log(`💰 ИТОГОВЫЙ БАНК: $${(totalPot / 100).toFixed(2)}`);
console.log('');

// Проверка рейка
const rake = totalPot * 0.05;
const rakeCapped = Math.min(rake, 100);
console.log(`💸 РЕЙК: $${(rakeCapped / 100).toFixed(2)}`);
console.log(`🏆 ВЫИГРЫШ: $${((totalPot - rakeCapped) / 100).toFixed(2)}`);
console.log('');

// Сравнение с ожидаемым результатом
const expected = 201000; // $2010 в центах
console.log('🔍 ПРОВЕРКА:');
console.log(`   Ожидаемый банк: $${(expected / 100).toFixed(2)}`);
console.log(`   Рассчитанный банк: $${(totalPot / 100).toFixed(2)}`);
console.log(`   Результат: ${totalPot === expected ? '✅ ПРАВИЛЬНО' : '❌ ОШИБКА'}`); 