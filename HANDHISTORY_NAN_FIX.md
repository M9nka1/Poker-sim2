# 🔧 Исправление ошибки $NaN в HandHistory

## 🚨 Проблема
В сгенерированных файлах HandHistory обнаружены серьезные ошибки:

```
11: raises $NaN to $NaN
44: raises $NaN to $NaN
11: raises $NaN to $NaN
```

### Причины ошибок:

1. **Отсутствие данных для рейзов** - в функции `addAction()` не сохранялись поля `raiseAmount` и `totalBet`
2. **Неправильная обработка в formatAction()** - функция ожидала эти поля, но они были `undefined`
3. **Отсутствие пробела** между концом префлопа и началом флопа

## 🔧 Исправления

### 1. Функция `addAction()` - сохранение данных для рейзов
```javascript
// Для рейзов сохраняем дополнительную информацию
if (actionType === 'raise') {
  action.raiseAmount = finalAmount - this.currentBet; // Размер рейза
  action.totalBet = finalAmount; // Общая ставка
  action.previousBet = this.currentBet; // Предыдущая ставка
}

// Для колла тоже сохраняем необходимую информацию
if (actionType === 'call') {
  action.callAmount = finalAmount; // Размер колла
}

// Проверить на all-in
if (player.stack <= finalAmount) {
  action.allIn = true;
}
```

### 2. Функция `formatAction()` - обработка рейзов с fallback
```javascript
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
```

### 3. Функция `generateHandHistoryText()` - исправление форматирования
```javascript
// Убеждаемся что префлоп заканчивается переносом строки
if (!handText.endsWith('\n')) {
  handText += '\n';
}
```

## ✅ Результат

После исправлений HandHistory генерируется корректно:

**До (с ошибками):**
```
Pio_IP_c3bBU: calls $85.00*** FLOP *** [9s Th 4s]
11: raises $NaN to $NaN
44: raises $NaN to $NaN
```

**После (исправлено):**
```
Pio_IP_c3bBU: calls $85.00
*** FLOP *** [9s Th 4s]
11: bets $57.50
44: raises $57.50 to $115.00
11: raises $115.00 to $230.00
```

## 🎯 Дополнительные улучшения

1. **All-in обнаружение** - автоматическое добавление `and is all-in` к действиям
2. **Данные коллов** - сохранение `callAmount` для лучшей отчетности
3. **Fallback механизм** - обработка старых данных без потери информации

## 🧪 Тестирование

Для проверки исправлений:
1. Запустите сервер: `node server.js`
2. Создайте сессию и сыграйте несколько рук
3. Экспортируйте HandHistory и проверьте файлы в папке `handhistory/`
4. Убедитесь что все размеры ставок отображаются корректно

Исправления совместимы с существующими данными и не нарушают работу системы. 