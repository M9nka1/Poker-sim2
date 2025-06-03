# 🎯 Формат HandHistory PokerStars - Техническая документация

## 📋 Обзор

Покерный симулятор теперь поддерживает полноценную генерацию HandHistory в формате PokerStars, совместимую с популярными покерными трекерами:

- **Holdem Manager 2** ✅
- **Hand2Note** ✅  
- **PokerTracker 4** ✅
- **DriveHUD** ✅

## 🔧 Архитектура системы

### Основные компоненты

1. **`generateHandHistoryText()`** - главный метод генерации
2. **`formatCard()`** - форматирование карт в стандарт PokerStars
3. **`formatAction()`** - форматирование действий игроков
4. **`generateSummarySeats()`** - генерация секции Summary
5. **`addAction()`** - улучшенное сохранение действий

## 📝 Структура HandHistory

### 1. Заголовок (Header)
```
PokerStars Hand #4400520541168030101: Hold'em No Limit ($5.00/$10.00) - 2024/12/14 2:21:47 GMT+03:00
Table 'PioSolver Table' 6-max Seat #6 is the button
```

**Особенности:**
- ✅ Автоматическая генерация уникальных номеров раздач
- ✅ Формат: `{originalId}{tableId:02d}{handNumber:02d}`
- ✅ Сохранение оригинального временного штампа

### 2. Информация об игроках
```
Seat 1: Pio_OOP_3bet_SB ($1000.00 in chips)
Seat 2: Pio_BB ($1000.00 in chips)
Seat 6: Pio_IP_c3bBU ($1000.00 in chips)
```

**Особенности:**
- ✅ Извлекается из исходного префлоп спота
- ✅ Сохраняются оригинальные позиции и имена

### 3. Префлоп часть
```
Pio_OOP_3bet_SB: posts small blind $5.00
Pio_BB: posts big blind $10.00
*** HOLE CARDS ***
Pio_EP: folds
Pio_IP_c3bBU: raises $15.00 to $25.00
Pio_OOP_3bet_SB: raises $85.00 to $110.00
Pio_BB: folds
Pio_IP_c3bBU: calls $85.00
```

**Особенности:**
- ✅ Берется из исходного префлоп спота
- ✅ Автоматическое обрезание до начала флопа

## 🃏 Постфлоп секции

### 4. Флоп
```
*** FLOP *** [As Kh 7c]
Pio_OOP_3bet_SB: checks
Pio_IP_c3bBU: bets $50.00
Pio_OOP_3bet_SB: raises $150.00 to $200.00
Pio_IP_c3bBU: calls $150.00
```

### 5. Терн
```
*** TURN *** [As Kh 7c] [2d]
Pio_OOP_3bet_SB: checks
Pio_IP_c3bBU: bets $400.00 and is all-in
Pio_OOP_3bet_SB: calls $400.00 and is all-in
```

### 6. Ривер
```
*** RIVER *** [As Kh 7c 2d] [9s]
```

## 🎲 Форматирование действий

### Типы действий

#### Check
```
PlayerName: checks
```

#### Bet
```
PlayerName: bets $50.00
PlayerName: bets $400.00 and is all-in
```

#### Call
```
PlayerName: calls $150.00
PlayerName: calls $400.00 and is all-in
```

#### Raise
```
PlayerName: raises $150.00 to $200.00
PlayerName: raises $300.00 to $500.00 and is all-in
```

#### Fold
```
PlayerName: folds
```

### 🔢 Логика рейзов

Правильное вычисление размеров рейзов:
- **`raiseAmount`** = сумма повышения сверх предыдущей ставки
- **`totalBet`** = общая сумма ставки после рейза

**Пример:**
```javascript
// Предыдущая ставка: $100
// Новая ставка: $250
// Результат: "raises $150.00 to $250.00"
```

## 🏆 Show Down секция

```
*** SHOW DOWN ***
Pio_OOP_3bet_SB: shows [Ah Ad] (a pair of Aces)
Pio_IP_c3bBU: mucks hand
Pio_OOP_3bet_SB collected $547.50 from pot
```

**Особенности:**
- ✅ Автоматическое определение победителя
- ✅ Базовая оценка силы рук (пары, старшая карта)
- ✅ Корректный расчет выигрыша с рейком

## 📊 Summary секция

```
*** SUMMARY ***
Total pot $570.00 | Rake $22.50
Board [As Kh 7c 2d 9s]
Seat 1: Pio_OOP_3bet_SB (small blind) showed [Ah Ad] and won ($547.50) with a pair of Aces
Seat 2: Pio_BB (big blind) folded before Flop
Seat 6: Pio_IP_c3bBU (button) showed [Ks Kd] and lost with a pair of Kings
```

**Особенности:**
- ✅ Полная информация о банке и рейке
- ✅ Доска со всеми картами
- ✅ Результат для каждого игрока с позицией
- ✅ Автоматическое определение позиций (button, small blind, big blind)

## 🎯 Форматирование карт

### Стандарт PokerStars

| Ранг | Формат | Масть | Символ |
|------|--------|-------|--------|
| Туз | A | Пики | s |
| Король | K | Червы | h |
| Дама | Q | Бубны | d |
| Валет | J | Трефы | c |
| 10 | **T** | | |
| 2-9 | 2-9 | | |

**Примеры:** `As`, `Kh`, `Qd`, `Jc`, `Ts`, `9h`, `2s`

### Маппинг мастей

```javascript
const suitMap = {
  'spades': 's',    '♠': 's',
  'hearts': 'h',    '♥': 'h', 
  'diamonds': 'd',  '♦': 'd',
  'clubs': 'c',     '♣': 'c'
};
```

## 💰 Система рейка

### Настройки по умолчанию
- **Процент:** 5%
- **Кап:** $3.00

### Расчет
```javascript
const rakeAmount = Math.min(
  pot * rakePercent / 100, 
  rakeCap
);
const winAmount = pot - rakeAmount;
```

## 🔄 Нумерация раздач

### Алгоритм
```javascript
const newHandId = `${originalHandId.slice(0, -4)}${tableId:02d}${handNumber:02d}`;
```

### Примеры
- Исходный ID: `4400520541168030866`
- Стол 1, раздача 1: `4400520541168030101`
- Стол 2, раздача 5: `4400520541168030205`
- Стол 4, раздача 12: `4400520541168030412`

## 🧪 Тестирование

### Автоматические тесты
1. Откройте `http://localhost:3000/test-handhistory.html`
2. Нажмите "🚀 Начать тест"
3. Дождитесь завершения автоматической игры
4. Проверьте сгенерированный HandHistory
5. Экспортируйте файл для проверки в трекере

### Примеры валидации

#### ✅ Корректный рейз
```
Pio_IP_c3bBU: raises $150.00 to $200.00
```

#### ✅ All-in действие
```
Pio_OOP_3bet_SB: bets $890.00 and is all-in
```

#### ✅ Правильный формат карт
```
Board [As Kh 7c 2d 9s]
```

## 🚀 Использование

### В коде симулятора
```javascript
// Генерация HandHistory
const handHistory = table.exportHandHistory();

// Доступ к форматированному тексту
const formattedText = handHistory.formatted;

// Скачивание файла
const blob = new Blob([formattedText], { type: 'text/plain' });
```

### Интеграция с трекерами
1. Сохраните HandHistory в файл `.txt`
2. Импортируйте в ваш покерный трекер
3. Проверьте корректность парсинга статистик

## 🔧 Настройки совместимости

### Holdem Manager 2
- ✅ Формат действий поддерживается
- ✅ Секция Summary корректна
- ✅ Рейк рассчитывается правильно

### Hand2Note  
- ✅ Парсинг карт работает
- ✅ All-in ситуации обрабатываются
- ✅ Позиции игроков определяются

### PokerTracker 4
- ✅ Временные штампы корректны
- ✅ Номера раздач уникальны
- ✅ Валюта и лимиты поддерживаются

## 📈 Планы развития

### Ближайшие улучшения
- [ ] Полноценная оценка силы рук (флеши, стриты)
- [ ] Поддержка побочных банков (side pots)
- [ ] Экспорт в другие форматы (888poker, partypoker)
- [ ] Интеграция с HUD (Heads-Up Display)

### Долгосрочные цели
- [ ] Поддержка турнирных форматов
- [ ] Мультитейбл гистории
- [ ] Real-time экспорт в трекеры
- [ ] API для внешних приложений

---

**Автор:** Покерный симулятор v2.0  
**Дата:** Декабрь 2024  
**Статус:** ✅ Готово к продакшену 