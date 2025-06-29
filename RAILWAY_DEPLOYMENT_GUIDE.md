# 🚂 Руководство по развертыванию на Railway

## 🎯 Краткое описание

Railway - это современная платформа для развертывания приложений с автоматической интеграцией GitHub и мгновенными деплоями.

## 📋 Пошаговая инструкция

### 1. **Создание аккаунта на Railway**

1. Перейдите на **[Railway.com](https://railway.com/)**
2. Нажмите **"Sign up"**
3. Войдите через **GitHub** (рекомендуется)

### 2. **Создание нового проекта**

1. На главной странице Railway нажмите **"New Project"**
2. Выберите **"Deploy from GitHub repo"**
3. Если первый раз - Railway попросит разрешения для доступа к GitHub

### 3. **Подключение репозитория**

1. Найдите репозиторий **`M9nka1/Poker-sim2`**
2. Выберите его из списка
3. Нажмите **"Add Variables"** (НЕ "Deploy Now")

### 4. **Настройка переменных окружения**

Добавьте следующие переменные:

```bash
NODE_ENV=production
PORT=3000
```

**Опционально (если нужно):**
```bash
# Для дополнительной конфигурации
CORS_ORIGIN=*
SESSION_SECRET=your-secret-key
```

### 5. **Запуск развертывания**

1. После добавления переменных нажмите **"Deploy"**
2. Railway автоматически:
   - Обнаружит Node.js проект
   - Установит зависимости (`npm install`)
   - Запустит сервер (`npm start`)

### 6. **Получение публичного URL**

1. После успешного деплоя перейдите в **Settings** вашего сервиса
2. В разделе **Networking** нажмите **"Generate Domain"**
3. Получите URL вида: `https://your-app-name.railway.app`

## ⚙️ Конфигурация проекта

### Файл `railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Health Check Endpoint
```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    activeSessions: activeSessions.size,
    activeUsers: activeUsers.size,
    timestamp: new Date().toISOString()
  });
});
```

## 🔄 Автоматические деплои

Railway автоматически развернет приложение при каждом push в `master` ветку:

1. **Push код** → `git push origin master`
2. **Railway** автоматически обнаружит изменения
3. **Автоматический билд** и деплой
4. **Обновленное приложение** доступно через несколько минут

## 📊 Мониторинг

### В панели Railway вы можете отслеживать:
- **📈 Логи приложения** - в реальном времени
- **📊 Метрики производительности** - CPU, память, трафик
- **🚀 История деплоев** - все версии и откаты
- **🔗 Статус health check** - `/health` endpoint

### Полезные команды для локальной разработки:
```bash
# Просмотр логов
railway logs

# Подключение к production базе данных локально
railway connect

# Открытие приложения в браузере
railway open
```

## 🛠️ Расширенная настройка

### Добавление базы данных
1. В Project Canvas нажмите **"+ New"**
2. Выберите **"Database"** → **"PostgreSQL"**
3. Автоматически создастся переменная `DATABASE_URL`

### Переменные окружения
```bash
# Общие переменные для покерного приложения
NODE_ENV=production
PORT=3000
DATABASE_URL=${DATABASE_URL}  # Автоматически создается
CORS_ORIGIN=*
SESSION_SECRET=your-generated-secret

# Дополнительные настройки
MAX_PLAYERS_PER_SESSION=6
MAX_TABLES_PER_SESSION=4
HAND_HISTORY_ENABLED=true
```

## 🎉 Готово!

После выполнения всех шагов:

✅ **Ваше приложение доступно** по URL Railway  
✅ **Автоматические деплои** настроены  
✅ **Health monitoring** работает  
✅ **HandHistory система** функционирует  
✅ **Файлы HandHistory** сохраняются и доступны для скачивания  

### 🔗 Полезные ссылки:
- [Railway Documentation](https://docs.railway.com/)
- [Railway Templates](https://railway.app/templates)
- [Railway Discord Community](https://discord.gg/railway)

## 🚨 Troubleshooting

### Проблема: Приложение не запускается
**Решение:** Проверьте логи в Railway dashboard

### Проблема: Переменные окружения не работают
**Решение:** Убедитесь что переменные добавлены в Railway Variables

### Проблема: Health check fails
**Решение:** Проверьте что endpoint `/health` возвращает статус 200

### Проблема: Файлы HandHistory не создаются
**Решение:** Папка `handhistory/` создается автоматически при первой игре 