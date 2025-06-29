const bcrypt = require('bcrypt');
const database = require('./database/database');

async function createTestUsers() {
  try {
    // Инициализируем базу данных
    await database.init();
    
    console.log('🔐 Создание тестовых пользователей...');
    
    // Список тестовых пользователей
    const testUsers = [
      { email: 'player1@test.com', password: 'Password123!', handLimit: 100 },
      { email: 'player2@test.com', password: 'Password123!', handLimit: 100 },
      { email: 'player3@test.com', password: 'Password123!', handLimit: 50 },
      { email: 'player4@test.com', password: 'Password123!', handLimit: 50 },
      { email: 'tester@gmail.com', password: 'Password123!', handLimit: 200 },
      { email: 'demo@test.com', password: 'demo123', handLimit: 1000 }
    ];
    
    for (const userData of testUsers) {
      try {
        // Проверяем, существует ли пользователь
        const existingUser = await database.get(
          'SELECT user_id FROM Users WHERE email = ?',
          [userData.email]
        );
        
        if (existingUser) {
          console.log(`⚠️ Пользователь ${userData.email} уже существует`);
          continue;
        }
        
        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        // Создаем пользователя
        await database.run(
          'INSERT INTO Users (user_id, email, password_hash, hand_limit) VALUES (?, ?, ?, ?)',
          [userData.email, userData.email, hashedPassword, userData.handLimit]
        );
        
        // Назначаем роль "пользователь"
        await database.run(
          'INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)',
          [userData.email, 1] // role_id = 1 для роли "user"
        );
        
        console.log(`✅ Создан пользователь: ${userData.email} (лимит: ${userData.handLimit})`);
        
      } catch (error) {
        console.error(`❌ Ошибка создания пользователя ${userData.email}:`, error.message);
      }
    }
    
    console.log('🎉 Процесс создания тестовых пользователей завершен!');
    console.log('');
    console.log('📋 Список созданных аккаунтов:');
    console.log('┌─────────────────────┬─────────────────┬─────────┐');
    console.log('│ Email               │ Пароль          │ Лимит   │');
    console.log('├─────────────────────┼─────────────────┼─────────┤');
    testUsers.forEach(user => {
      console.log(`│ ${user.email.padEnd(19)} │ ${user.password.padEnd(15)} │ ${user.handLimit.toString().padEnd(7)} │`);
    });
    console.log('└─────────────────────┴─────────────────┴─────────┘');
    console.log('');
    console.log('🚀 Используйте эти аккаунты для тестирования в разных браузерах!');
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  } finally {
    await database.close();
    process.exit(0);
  }
}

// Запуск скрипта
createTestUsers(); 