#!/usr/bin/env node

const bcrypt = require('bcrypt');
const database = require('../database/database');

async function createAdmin() {
  try {
    console.log('👑 Создание администратора...');
    
    await database.init();

    // Данные администратора
    const adminEmail = process.argv[2] || 'admin@pokersimu.com';
    const adminPassword = process.argv[3] || 'AdminPassword123!';

    console.log(`📧 Email: ${adminEmail}`);
    
    // Проверка существования пользователя
    const existingUser = await database.get(
      'SELECT user_id FROM Users WHERE email = ?',
      [adminEmail]
    );

    if (existingUser) {
      console.log('⚠️  Пользователь уже существует, назначаем права администратора...');
      
      // Назначение роли администратора существующему пользователю
      const adminRole = await database.get('SELECT role_id FROM Roles WHERE role_name = ?', ['admin']);
      
      // Проверим, есть ли уже роль
      const existingRole = await database.get(
        'SELECT * FROM UserRoles WHERE user_id = ? AND role_id = ?',
        [existingUser.user_id, adminRole.role_id]
      );

      if (!existingRole) {
        await database.run(
          'INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)',
          [existingUser.user_id, adminRole.role_id]
        );
        console.log('✅ Права администратора назначены!');
      } else {
        console.log('ℹ️  Пользователь уже является администратором');
      }

    } else {
      // Создание нового администратора
      console.log('🔐 Создание нового пользователя...');
      
      // Хеширование пароля
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

      // Создание пользователя с явным указанием user_id
      const userId = require('crypto').randomBytes(16).toString('hex');
      
      await database.run(
        'INSERT INTO Users (user_id, email, password_hash, hand_limit) VALUES (?, ?, ?, ?)',
        [userId, adminEmail, passwordHash, 1000] // Даем админу 1000 раздач по умолчанию
      );

      // Назначение роли пользователя
      const userRole = await database.get('SELECT role_id FROM Roles WHERE role_name = ?', ['user']);
      await database.run(
        'INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)',
        [userId, userRole.role_id]
      );

      // Назначение роли администратора
      const adminRole = await database.get('SELECT role_id FROM Roles WHERE role_name = ?', ['admin']);
      await database.run(
        'INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)',
        [userId, adminRole.role_id]
      );

      console.log('✅ Администратор создан успешно!');
      console.log(`🆔 User ID: ${userId}`);
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔑 Пароль: ${adminPassword}`);
      console.log(`🎯 Лимит раздач: 1000`);
    }

    await database.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка создания администратора:', error);
    process.exit(1);
  }
}

// Показать справку
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
👑 Создание администратора

Использование:
  node scripts/create-admin.js [email] [password]

Параметры:
  email     - Email администратора (по умолчанию: admin@pokersimu.com)
  password  - Пароль администратора (по умолчанию: AdminPassword123!)

Примеры:
  node scripts/create-admin.js
  node scripts/create-admin.js admin@example.com MySecretPassword123!

Требования к паролю:
  - Минимум 8 символов
  - Содержит заглавную букву
  - Содержит строчную букву  
  - Содержит цифру
  - Содержит специальный символ
  `);
  process.exit(0);
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  createAdmin();
}

module.exports = { createAdmin }; 