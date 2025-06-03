# 🎰 Покерный Симулятор 2.0

> **Профессиональный симулятор покера с поддержкой мультиплеера и экспортом HandHistory**

## 🆕 Последние обновления

### ✨ Накопительная система HandHistory (декабрь 2024)

🎯 **Теперь поддерживается правильная накопительная запись HandHistory:**

**Основные особенности:**
- 📁 **Один файл на стол** - все раздачи стола записываются в один файл
- ✅ **Только завершенные раздачи** - сохраняются только раздачи с действиями игроков
- 🔢 **Правильная нумерация** - `hand_{sessionId}-{tableId}-{handCount}_table_{tableId}.txt`
- 💾 **Автоматическая запись** при завершении сессии
- 🚫 **Умная фильтрация** - пустые раздачи не записываются

**Примеры файлов:**
- `hand_F72765F5-1-7_table_1.txt` - стол #1, 7 завершенных раздач
- `hand_F72765F5-2-22_table_2.txt` - стол #2, 22 завершенные раздачи  
- `hand_F72765F5-3-122_table_3.txt` - стол #3, 122 завершенные раздачи
- `hand_F72765F5-4-0_table_4.txt` - НЕ создается (0 раздач)

### ✨ Улучшенная генерация HandHistory (декабрь 2024)

🎯 **Полная совместимость с покерными трекерами:**
- **Holdem Manager 2** ✅
- **Hand2Note** ✅  
- **PokerTracker 4** ✅
- **DriveHUD** ✅

**Основные улучшения:**
- 🔄 Автоматическая нумерация раздач
- 🃏 Правильный формат карт (As, Kh, 7c, Td)
- 💰 Корректные рейзы ("raises $X.XX to $Y.YY")
- 🎯 Поддержка all-in действий
- 🏆 Секция Show Down с описанием рук
- 📋 Полная Summary секция

**Тестирование:**
```
http://localhost:3000/test-handhistory.html
```

## 📊 Накопительная HandHistory

### Принципы работы
Симулятор накапливает все завершенные раздачи каждого стола и записывает их в отдельные файлы согласно требованиям:

```javascript
// Структура файлов
hand_{sessionId}-{tableId}-{handCount}_table_{tableId}.txt

// Пример логики
if (стол_1.завершенных_раздач === 7) {
  создать_файл("hand_F72765F5-1-7_table_1.txt");
}
if (стол_4.завершенных_раздач === 0) {
  // файл НЕ создается
}
```

### Автоматическая запись
- ✅ При ручном экспорте через интерфейс
- ✅ При завершении сессии (автоматически)
- ✅ Только раздачи с действиями игроков
- ✅ Один файл на стол с накоплением

## 📊 HandHistory и экспорт

### Формат PokerStars
Симулятор генерирует HandHistory в стандартном формате PokerStars:

```
PokerStars Hand #4400520541168030101: Hold'em No Limit ($5.00/$10.00) - 2024/12/14 2:21:47 GMT+03:00
Table 'PioSolver Table' 6-max Seat #6 is the button
Seat 1: Pio_OOP_3bet_SB ($1000.00 in chips)
Seat 2: Pio_BB ($1000.00 in chips)
Seat 3: Pio_EP ($1000.00 in chips)
Seat 4: Pio_MP ($1000.00 in chips)
Seat 5: Pio_CO ($1000.00 in chips)
Seat 6: Pio_IP_c3bBU ($1000.00 in chips)
Pio_OOP_3bet_SB: posts small blind $5.00
Pio_BB: posts big blind $10.00
*** HOLE CARDS ***
Pio_EP: folds
Pio_MP: folds
Pio_CO: folds
Pio_IP_c3bBU: raises $15.00 to $25.00
Pio_OOP_3bet_SB: raises $85.00 to $110.00
Pio_BB: folds
Pio_IP_c3bBU: calls $85.00
*** FLOP *** [Jc Js 4h]
44: bets $57.50
11: calls $57.50
*** TURN *** [Jc Js 4h] [8d]
44: checks
11: checks
*** RIVER *** [Jc Js 4h 8d] [2c]
44: checks
11: checks
*** SHOW DOWN ***
44: shows [3h 3c] (two pair, Jacks and Threes)
11: mucks hand
44 collected $342.50 from pot
*** SUMMARY ***
Total pot $345.00 | Rake $2.50
Board [Jc Js 4h 8d 2c]
Seat 1: Pio_OOP_3bet_SB folded before Flop
Seat 2: Pio_BB folded before Flop
Seat 3: Pio_EP folded before Flop (didn't bet)
Seat 4: Pio_MP folded before Flop (didn't bet)
Seat 5: Pio_CO folded before Flop (didn't bet)
Seat 6: Pio_IP_c3bBU showed [3h 3c] and won ($342.50) with two pair, Jacks and Threes
```

### Экспорт файлов
```javascript
// Программный экспорт
const handHistory = table.exportHandHistory();
console.log(`Экспортировано ${handHistory.totalHands} раздач в файл ${handHistory.fileName}`);

// API экспорт
socket.emit('export-hand-history', { tableId: 1 });
```

## 🎮 Основные возможности

### 🎯 Мультиплеер
- **Одновременная игра** на 4 столах
- **Независимые раздачи** на каждом столе  
- **Реальное время** через WebSocket
- **Синхронизация** между игроками

### 🃏 Настройка раздач
- **Диапазоны рук** для каждого игрока
- **Ограничения флопа** (текстуры, карты)
- **Позиции игроков** (BTN, BB, SB, etc.)
- **Размеры ставок** и структура блайндов

### 📊 Продвинутая аналитика
- **Экспорт в трекеры** (HM2, Hand2Note, PT4)
- **Детальная статистика** по раздачам
- **Анализ действий** игроков
- **Накопительные отчеты** по столам

## 🚀 Быстрый старт

### 1. Установка и запуск
```bash
git clone <repository>
cd Poker_Sim2
npm install
node server.js
```

### 2. Создание сессии
```
http://localhost:3000
```
1. Создать сессию с настройками
2. Подключить второго игрока
3. Начать игру на всех столах

### 3. Экспорт HandHistory
- Играйте раздачи на столах
- Используйте кнопку "💾 Экспорт HandHistory"  
- Файлы сохранятся в папку `handhistory/`
- При завершении сессии - автоматический экспорт

## 📁 Структура проекта

```
C:\Poker_Sim2\
├── server.js                          # 🖥️ Основной сервер
├── client-multiplayer.js              # 🌐 Клиентский код
├── index.html                         # 🎮 Главная страница
├── handhistory/                       # 📂 Папка с HandHistory файлами
│   ├── hand_ABC123-1-7_table_1.txt    #    Стол #1 (7 раздач)
│   ├── hand_ABC123-2-22_table_2.txt   #    Стол #2 (22 раздачи)
│   └── hand_ABC123-3-122_table_3.txt  #    Стол #3 (122 раздачи)
├── example_handhistory_pokerstars.txt # 📄 Пример HandHistory
├── README.md                          # 📖 Эта документация
├── HANDHISTORY_FORMAT.md              # 📊 Техническая документация HandHistory
├── HANDHISTORY_CUMULATIVE.md          # 📁 Документация накопительной системы
└── test-handhistory.html              # 🧪 Тестирование HandHistory
```

## 🔧 Техническая документация

### Подробные руководства:
- **[HANDHISTORY_FORMAT.md](HANDHISTORY_FORMAT.md)** - Техническая документация по формату HandHistory
- **[HANDHISTORY_CUMULATIVE.md](HANDHISTORY_CUMULATIVE.md)** - Накопительная система HandHistory
- **[HANDHISTORY_BUGFIX.md](HANDHISTORY_BUGFIX.md)** - История исправления проблем

### API для разработчиков:
```javascript
// Создание сессии
socket.emit('create-session', {
  playerRanges: { /* настройки диапазонов */ },
  boardSettings: { /* настройки доски */ },
  preflopSpot: "..." // HandHistory префлоп спот
});

// Действие игрока  
socket.emit('player-action', {
  tableId: 1,
  action: 'call', // call, raise, fold, check
  amount: 5750    // в центах
});

// Экспорт HandHistory
socket.emit('export-hand-history', { tableId: 1 });
```

## 💡 Особенности

### 🎯 Умная логика
- **Валидация действий** игроков
- **Автоматические переходы** между улицами
- **Корректное управление** банками и ставками
- **Независимость столов** - действия на одном столе не влияют на другие

### 📊 Совместимость
- **Формат PokerStars** для максимальной совместимости
- **Поддержка всех трекеров** (HM2, Hand2Note, PT4, DriveHUD)
- **Корректное форматирование** карт, действий и результатов

### 🔒 Надежность  
- **Автоматическое сохранение** при завершении сессий
- **Проверка целостности** данных HandHistory
- **Graceful shutdown** с сохранением всех данных
- **Детальное логирование** для отладки

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи сервера в консоли
2. Убедитесь что все файлы HandHistory корректны
3. Используйте тестовую страницу для диагностики
4. Обратитесь к технической документации

---

**Покерный Симулятор 2.0** - ваш надежный инструмент для профессионального анализа покерных ситуаций! 🎰✨ 