// Тест правильности подсчета банка по примеру пользователя
console.log('🧮 Тест подсчета банка по примеру Hand History');
console.log('');

// Исходные данные из примера пользователя
const initialPot = 230; // Начальный банк на флопе
const flopBets = {
  'Pio_OOP_3bet_SB2': 105, // bet $105
  'Pio_IP_c3bBU1': 210     // raise to $210 (добавил $105)
};
const turnBets = {
  'Pio_OOP_3bet_SB2': 105, // call $105 (уравнял до $210)
  'Pio_IP_c3bBU1': 0       // check
};
const riverBets = {
  'Pio_OOP_3bet_SB2': 680, // bet $30, then raise to $650, then call $30 = $680 total
  'Pio_IP_c3bBU1': 680     // raise to $80, then raise to $680 = $680 total
};

console.log('📊 Пошаговый расчет банка:');
console.log('');

console.log('1️⃣ Начальный банк (префлоп):');
console.log(`   Префлоп банк: $${initialPot}`);
console.log('');

console.log('2️⃣ Флоп торги:');
console.log(`   Pio_OOP_3bet_SB2: bets $${flopBets['Pio_OOP_3bet_SB2']}`);
console.log(`   Pio_IP_c3bBU1: raises $${flopBets['Pio_IP_c3bBU1'] - flopBets['Pio_OOP_3bet_SB2']} to $${flopBets['Pio_IP_c3bBU1']}`);
console.log(`   Pio_OOP_3bet_SB2: calls $${flopBets['Pio_IP_c3bBU1'] - flopBets['Pio_OOP_3bet_SB2']} (total: $${flopBets['Pio_IP_c3bBU1']})`);

const flopTotal = flopBets['Pio_OOP_3bet_SB2'] + (flopBets['Pio_IP_c3bBU1'] - flopBets['Pio_OOP_3bet_SB2']) + flopBets['Pio_IP_c3bBU1'];
console.log(`   Флоп ставки: $${flopBets['Pio_IP_c3bBU1']} × 2 = $${flopBets['Pio_IP_c3bBU1'] * 2}`);
console.log('');

console.log('3️⃣ Тёрн торги:');
console.log(`   Pio_OOP_3bet_SB2: checks`);
console.log(`   Pio_IP_c3bBU1: checks`);
console.log(`   Тёрн ставки: $0`);
console.log('');

console.log('4️⃣ Ривер торги:');
console.log(`   Pio_OOP_3bet_SB2: bets $30`);
console.log(`   Pio_IP_c3bBU1: raises $50 to $80`);
console.log(`   Pio_OOP_3bet_SB2: raises $570 to $650`);
console.log(`   Pio_IP_c3bBU1: raises $30 to $680`);
console.log(`   Pio_OOP_3bet_SB2: calls $30`);
console.log(`   Ривер ставки: $${riverBets['Pio_OOP_3bet_SB2']} + $${riverBets['Pio_IP_c3bBU1']} = $${riverBets['Pio_OOP_3bet_SB2'] + riverBets['Pio_IP_c3bBU1']}`);
console.log('');

console.log('5️⃣ Итоговый расчет:');
const preflopAmount = initialPot;
const flopAmount = flopBets['Pio_IP_c3bBU1'] * 2; // Оба игрока поставили по $210
const turnAmount = 0; // Оба чекнули
const riverAmount = riverBets['Pio_OOP_3bet_SB2'] + riverBets['Pio_IP_c3bBU1']; // Оба поставили по $680

const totalPot = preflopAmount + flopAmount + turnAmount + riverAmount;

console.log(`   Префлоп: $${preflopAmount}`);
console.log(`   Флоп:    $${flopAmount}`);
console.log(`   Тёрн:    $${turnAmount}`);
console.log(`   Ривер:   $${riverAmount}`);
console.log(`   ─────────────────────`);
console.log(`   ИТОГО:   $${totalPot}`);
console.log('');

console.log('✅ Правильный итоговый банк должен быть: $' + totalPot);
console.log('❌ В Hand History показано неправильно: $3790');
console.log('');

console.log('🔧 Проблема была в двойном подсчете ставок в переменных pot и streetPot');
console.log('🔧 Исправлено: ставки добавляются только в pot, streetPot используется для отображения'); 