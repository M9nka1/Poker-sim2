# 📊 Накопительная система HandHistory

## 🎯 Описание

Покерный симулятор теперь поддерживает **накопительную систему HandHistory**, где все завершенные раздачи одного стола записываются в **один файл**, согласно требованиям пользователя.

## 🔧 Принципы работы

### ✅ Что записывается:
- **Только завершенные раздачи** с действиями игроков
- **Все раздачи одного стола** в одном файле
- **Правильная нумерация** раздач в хронологическом порядке

### ❌ Что НЕ записывается:
- Незавершенные раздачи
- Раздачи без действий игроков
- Пустые раздачи

## 📁 Формат файлов

### Имя файла:
```
hand_{sessionId}-{tableId}-{handCount}_table_{tableId}.txt
```

### Примеры:
- `hand_F72765F5-1-7_table_1.txt` - стол #1, 7 завершенных раздач
- `hand_F72765F5-2-22_table_2.txt` - стол #2, 22 завершенные раздачи  
- `hand_F72765F5-3-122_table_3.txt` - стол #3, 122 завершенные раздачи
- `hand_F72765F5-4-0_table_4.txt` - НЕ создается (0 раздач)

## 🏗️ Архитектура

### Класс PokerTable
```javascript
class PokerTable {
  constructor() {
    // ...
    this.completedHands = [];    // Массив завершенных раздач
    this.tableHandCount = 0;     // Счетчик завершенных раздач
  }
}
```

### Основные методы:

#### 1. `saveCompletedHand()`
```javascript
// Сохранить завершенную раздачу в накопительную историю
saveCompletedHand() {
  // Проверка наличия действий игроков
  const hasPlayerActions = this.currentHandHistory && 
                           this.currentHandHistory.actions && 
                           this.currentHandHistory.actions.length > 0;

  if (!hasPlayerActions) {
    console.log('📝 Раздача не сохранена - нет действий игроков');
    return;
  }

  // Генерация HandHistory и добавление в массив
  const handHistoryText = this.generateHandHistoryText();
  this.completedHands.push({
    handNumber: this.handNumber,
    tableHandNumber: this.tableHandCount,
    text: handHistoryText,
    timestamp: new Date().toISOString()
  });
}
```

#### 2. `exportHandHistory()`
```javascript
// Экспорт всех завершенных раздач стола
exportHandHistory() {
  const allHandsText = this.completedHands.map(hand => hand.text).join('\n\n');
  
  return {
    tableId: this.tableId,
    totalHands: this.completedHands.length,
    fileName: this.getHandHistoryFileName(),
    formatted: allHandsText,
    format: 'pokerstars'
  };
}
```

#### 3. `writeHandHistoryToFile()`
```javascript
// Запись HandHistory в файл
writeHandHistoryToFile() {
  const fileName = this.getHandHistoryFileName();
  const filePath = path.join(__dirname, 'handhistory', fileName);
  
  // Создание папки handhistory если её нет
  if (!fs.existsSync(handhistoryDir)) {
    fs.mkdirSync(handhistoryDir, { recursive: true });
  }
  
  const allHandsText = this.completedHands.map(hand => hand.text).join('\n\n');
  fs.writeFileSync(filePath, allHandsText, 'utf8');
}
```

#### 4. `getHandHistoryFileName()`
```javascript
// Генерация имени файла
getHandHistoryFileName() {
  return `hand_${this.sessionId}-${this.tableId}-${this.tableHandCount}_table_${this.tableId}.txt`;
}
```

### Класс PokerSession

#### `writeAllHandHistories()`
```javascript
// Запись HandHistory всех столов сессии
writeAllHandHistories() {
  const results = [];
  
  this.tables.forEach(table => {
    if (table.tableHandCount > 0) {
      const success = table.writeHandHistoryToFile();
      results.push({
        tableId: table.tableId,
        handsCount: table.tableHandCount,
        fileName: table.getHandHistoryFileName(),
        success: success
      });
    }
  });
  
  return results;
}
```

## 📝 Логика записи

### 1. Во время игры:
- Каждая завершенная раздача добавляется в `completedHands[]`
- Увеличивается счетчик `tableHandCount`
- Проверяется наличие действий игроков

### 2. При экспорте:
- Пользователь нажимает "Экспорт HandHistory"
- Вызывается `exportHandHistory()` и `writeHandHistoryToFile()`
- Создается файл с накопленными раздачами

### 3. При завершении сессии:
- Автоматически вызывается `writeAllHandHistories()`
- Создаются файлы для всех столов с раздачами
- Выводится статистика

## 📊 Пример работы

### Лог сервера:
```
💾 Раздача #1 сохранена в накопительную историю стола 1 (всего раздач: 1)
💾 Раздача #2 сохранена в накопительную историю стола 1 (всего раздач: 2)
💾 Раздача #3 сохранена в накопительную историю стола 1 (всего раздач: 3)

📊 HandHistory экспортирована для стола 1: 3 раздач
💾 HandHistory записана в файл: hand_ABC123-1-3_table_1.txt (3 раздач)
```

### Содержимое файла:
```
PokerStars Hand #4400520541168030101: Hold'em No Limit ($5.00/$10.00) - 2024/12/14 2:21:47 GMT+03:00
Table 'PioSolver Table' 6-max Seat #6 is the button
... [Раздача #1] ...

PokerStars Hand #4400520541168030102: Hold'em No Limit ($5.00/$10.00) - 2024/12/14 2:21:47 GMT+03:00
Table 'PioSolver Table' 6-max Seat #6 is the button
... [Раздача #2] ...

PokerStars Hand #4400520541168030103: Hold'em No Limit ($5.00/$10.00) - 2024/12/14 2:21:47 GMT+03:00
Table 'PioSolver Table' 6-max Seat #6 is the button
... [Раздача #3] ...
```

## 🎯 Преимущества

1. **Совместимость** с покерными трекерами (HM2, Hand2Note, PT4)
2. **Организованность** - один файл на стол
3. **Оптимизация** - только завершенные раздачи с действиями
4. **Автоматизация** - запись при завершении сессии
5. **Информативность** - четкие имена файлов с количеством раздач

## 🚀 Использование

### 1. Экспорт вручную:
- Нажать кнопку "💾 Экспорт HandHistory" на интерфейсе стола
- Файл создастся в папке `handhistory/`

### 2. Автоматический экспорт:
- При завершении сессии (отключение всех игроков)
- Все файлы создаются автоматически
- Выводится итоговая статистика

### 3. API:
```javascript
// Экспорт HandHistory конкретного стола
socket.emit('export-hand-history', { tableId: 1 });

// Ответ сервера
socket.on('hand-history-exported', (data) => {
  console.log('Файл:', data.fileName);
  console.log('Раздач:', data.handHistory.totalHands);
  console.log('Записан в файл:', data.fileWritten);
});
```

## 📂 Структура проекта

```
C:\Poker_Sim2\
├── server.js                 # Основной сервер
├── handhistory/              # Папка с файлами HandHistory
│   ├── hand_ABC123-1-7_table_1.txt
│   ├── hand_ABC123-2-22_table_2.txt
│   └── hand_ABC123-3-122_table_3.txt
├── HANDHISTORY_CUMULATIVE.md # Эта документация
└── ...
``` 