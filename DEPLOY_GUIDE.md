# 🚀 Инструкция по деплою на Railway

Пошаговое руководство по размещению мультиплеер покер симулятора на [Railway](https://railway.com/).

## 📋 Предварительные требования

### 1. Подготовка репозитория
```bash
# Клонируйте или форкните проект
git clone https://github.com/your-username/poker-simulator.git
cd poker-simulator

# Убедитесь, что все файлы присутствуют
ls -la
# Должны быть: server.js, package.json, railway.json, Procfile
```

### 2. Проверка локально
```bash
# Установите зависимости
npm install

# Запустите локально
npm start

# Проверьте что сервер работает на http://localhost:3000
```

## 🛤️ Деплой на Railway

### Способ 1: Через GitHub (Рекомендуется)

#### Шаг 1: Подготовка GitHub репозитория
1. **Форкните проект** на GitHub или создайте свой репозиторий
2. **Загрузите код**:
   ```bash
   git add .
   git commit -m "Initial commit for Railway deployment"
   git push origin main
   ```

#### Шаг 2: Подключение к Railway
1. **Перейдите на** [railway.app](https://railway.app)
2. **Зарегистрируйтесь** или войдите через GitHub
3. **Нажмите "New Project"**
4. **Выберите "Deploy from GitHub repo"**
5. **Выберите ваш репозиторий**

#### Шаг 3: Конфигурация
Railway автоматически:
- ✅ Определит Node.js проект
- ✅ Установит зависимости из `package.json`
- ✅ Запустит сервер через `npm start`
- ✅ Предоставит публичный URL

### Способ 2: Через Railway CLI

#### Установка CLI
```bash
# Установить Railway CLI
npm install -g @railway/cli

# Войти в аккаунт
railway login
```

#### Деплой
```bash
# В папке проекта
railway init

# Деплой
railway up

# Получить URL
railway domain
```

## ⚙️ Конфигурация

### Переменные окружения
Railway автоматически установит:
```bash
PORT=XXXX                 # Порт сервера (автоматически)
RAILWAY_ENVIRONMENT=production
RAILWAY_SERVICE_NAME=poker-simulator
```

### Дополнительные переменные (опционально)
В Railway Dashboard → Settings → Environment:
```bash
NODE_ENV=production
MAX_SESSIONS=100
CLIENT_URL=*
```

### Настройка домена
1. **В Railway Dashboard** → Settings → Domains
2. **Generate Domain** для получения `xxx.railway.app`
3. **Или добавьте custom domain** (требует проверки DNS)

## 🔧 Конфигурационные файлы

### package.json
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### railway.json
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100
  }
}
```

### Procfile
```
web: node server.js
```

## 📊 Мониторинг и отладка

### Логи в реальном времени
```bash
# Через CLI
railway logs

# Или в Railway Dashboard → Deployments
```

### Health Check
Сервер предоставляет endpoint:
```
GET https://your-app.railway.app/health
```

### Метрики
В Railway Dashboard доступны:
- **CPU использование**
- **Memory usage**
- **Request count**
- **Response times**

## 🌐 После деплоя

### Проверка работы
1. **Откройте ваш URL** (например: `poker-simulator-xxxx.railway.app`)
2. **Проверьте WebSocket подключение** - должен появиться статус "Онлайн"
3. **Создайте тестовую сессию**
4. **Откройте второе окно** и присоединитесь к сессии

### Поделиться с игроками
```
🎮 Poker Simulator готов к игре!
🔗 URL: https://your-app.railway.app
📱 Работает на всех устройствах
🎯 Создавайте сессии и играйте онлайн!
```

## 🔄 Обновления

### Автоматические деплои
Railway автоматически пересобирает при push в main:
```bash
git add .
git commit -m "Update feature"
git push origin main
# Railway автоматически деплоит изменения
```

### Ручной редеплой
```bash
# Через CLI
railway up

# Или в Dashboard → Deployments → Redeploy
```

## 🛡️ Безопасность

### HTTPS
Railway автоматически предоставляет HTTPS для всех доменов.

### Environment Variables
Никогда не коммитьте секретные данные:
```bash
# .gitignore
.env
.env.local
.env.production
```

### CORS
Сервер настроен на принятие соединений с любых доменов (`*`).
Для продакшн используйте конкретные домены:
```javascript
// В server.js
const io = socketIo(server, {
  cors: {
    origin: "https://your-domain.com",
    methods: ["GET", "POST"]
  }
});
```

## 🚨 Устранение проблем

### Частые ошибки

#### 1. "Application failed to respond"
```bash
# Проверьте логи
railway logs

# Убедитесь что PORT используется правильно
const PORT = process.env.PORT || 3000;
```

#### 2. "WebSocket connection failed"
```bash
# Проверьте что Socket.IO подключается правильно
const socket = io(window.location.origin);
```

#### 3. "Build failed"
```bash
# Проверьте package.json на синтаксические ошибки
npm install  # Локально
```

### Health Check failed
```bash
# Убедитесь что /health endpoint отвечает
curl https://your-app.railway.app/health
```

### Отладка WebSocket
```javascript
// В браузере (F12 → Console)
console.log('Socket status:', socket.connected);
socket.on('connect', () => console.log('Connected to server'));
socket.on('disconnect', () => console.log('Disconnected'));
```

## 📈 Масштабирование

### Оптимизация производительности
- Railway автоматически масштабирует
- Мониторинг через Dashboard
- Alerts при высокой нагрузке

### Лимиты Railway
- **Free tier**: 500 часов/месяц
- **Pro tier**: Unlimited
- **WebSocket**: Полная поддержка

## 🎯 Финальная проверка

### Чек-лист деплоя
- [ ] ✅ Проект загружен на GitHub
- [ ] ✅ Railway подключен к репозиторию
- [ ] ✅ Сервер запускается без ошибок
- [ ] ✅ Health check отвечает 200
- [ ] ✅ WebSocket подключение работает
- [ ] ✅ Можно создать сессию
- [ ] ✅ Можно присоединиться к сессии
- [ ] ✅ Игровые действия обрабатываются
- [ ] ✅ HandHistory экспортируется

### Готово! 🎉
Ваш мультиплеер покер симулятор готов к онлайн игре!

---

**💡 Совет**: Сохраните URL вашего приложения и поделитесь с друзьями для тестирования! 