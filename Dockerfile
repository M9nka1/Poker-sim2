# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаем директории для данных
RUN mkdir -p hand_histories database

# Открываем порт
EXPOSE 3001

# Запускаем приложение
CMD ["node", "server-with-auth.js"] 