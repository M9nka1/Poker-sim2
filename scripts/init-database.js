#!/usr/bin/env node

const database = require('../database/database');

async function initDatabase() {
  try {
    console.log('🔧 Инициализация базы данных...');
    
    await database.init();
    
    console.log('✅ База данных успешно инициализирована!');
    console.log('📊 Созданы таблицы:');
    console.log('   - Users (пользователи)');
    console.log('   - Roles (роли)');  
    console.log('   - UserRoles (связь пользователей и ролей)');
    console.log('   - Hands (сыгранные раздачи)');
    console.log('   - RefreshTokens (токены обновления)');
    
    await database.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    process.exit(1);
  }
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase }; 