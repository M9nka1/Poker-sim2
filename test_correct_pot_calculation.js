// Тест правильности подсчета банка по вашему примеру
console.log('🧮 Тест правильного подсчета банка');
console.log('=====================================');
console.log('');

// Данные из вашего примера Hand History
const example = {
  preflop: 230,
  flop: {
    player1_bet: 115,
    player2_raise_to: 230,
    player1_call: 115  // довел до 230
  },
  turn: {
    player1: 0, // check
    player2: 0  // check
  },
  river: {
    player1_bet: 107.50,
    player2_raise_to: 215,
    player1_raise_to: 552.50,
    player2_raise_to: 660,
    player1_call: 107.50  // довел до 660
  }
};

console.log('📊 Пошаговый расчет:');
console.log('');

console.log('1️⃣ ПРЕФЛОП:');
console.log(`   Общий банк: $${example.preflop}`);
console.log('');

console.log('2️⃣ ФЛОП:');
console.log(`   Игрок 1: bet $${example.flop.player1_bet} + call $${example.flop.player1_call} = $${example.flop.player1_bet + example.flop.player1_call}`);
console.log(`   Игрок 2: raise to $${example.flop.player2_raise_to} = $${example.flop.player2_raise_to}`);
console.log(`   Итого на флопе: $${(example.flop.player1_bet + example.flop.player1_call) + example.flop.player2_raise_to}`);
console.log('');

console.log('3️⃣ ТЁРН:');
console.log(`   Игрок 1: check ($${example.turn.player1})`);
console.log(`   Игрок 2: check ($${example.turn.player2})`);
console.log(`   Итого на тёрне: $${example.turn.player1 + example.turn.player2}`);
console.log('');

console.log('4️⃣ РИВЕР:');
console.log(`   Игрок 1 финальная ставка: $${example.river.player1_raise_to + example.river.player1_call}`);
console.log(`   Игрок 2 финальная ставка: $${example.river.player2_raise_to}`);
console.log(`   Итого на ривере: $${(example.river.player1_raise_to + example.river.player1_call) + example.river.player2_raise_to}`);
console.log('');

const totalPot = example.preflop + 
                (example.flop.player1_bet + example.flop.player1_call + example.flop.player2_raise_to) +
                (example.turn.player1 + example.turn.player2) +
                (example.river.player1_raise_to + example.river.player1_call + example.river.player2_raise_to);

console.log('💰 ИТОГОВЫЙ РАСЧЕТ:');
console.log(`   Префлоп: $${example.preflop}`);
console.log(`   Флоп: $${(example.flop.player1_bet + example.flop.player1_call) + example.flop.player2_raise_to}`);
console.log(`   Тёрн: $${example.turn.player1 + example.turn.player2}`);
console.log(`   Ривер: $${(example.river.player1_raise_to + example.river.player1_call) + example.river.player2_raise_to}`);
console.log(`   ========================`);
console.log(`   ОБЩИЙ БАНК: $${totalPot}`);
console.log('');

console.log('🔍 СРАВНЕНИЕ:');
console.log(`   Ожидаемый банк: $${totalPot}`);
console.log(`   Показанный в HH: $3790`);
console.log(`   Разница: $${3790 - totalPot} (${3790 > totalPot ? 'переплата' : 'недоплата'})`);
console.log('');

// Проверка рейка
const rake = totalPot * 0.05; // 5%
const rakeCapped = Math.min(rake, 100); // $1.00 cap
console.log('💸 РЕЙК:');
console.log(`   5% от $${totalPot} = $${rake.toFixed(2)}`);
console.log(`   С учетом кэпа $1.00 = $${rakeCapped.toFixed(2)}`);
console.log(`   Выигрыш после рейка: $${(totalPot - rakeCapped).toFixed(2)}`); 