const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    this.db = null;
  }

  // Инициализация подключения к базе данных
  async init() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, 'poker_simulator.db');
      
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('❌ Ошибка подключения к базе данных:', err.message);
          reject(err);
        } else {
          console.log('✅ Подключение к базе данных установлено');
          this.initSchema()
            .then(() => resolve())
            .catch(reject);
        }
      });

      // Включить foreign keys
      this.db.run('PRAGMA foreign_keys = ON');
    });
  }

  // Инициализация схемы базы данных
  async initSchema() {
    return new Promise((resolve, reject) => {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      this.db.exec(schema, (err) => {
        if (err) {
          console.error('❌ Ошибка создания схемы:', err.message);
          reject(err);
        } else {
          console.log('✅ Схема базы данных инициализирована');
          resolve();
        }
      });
    });
  }

  // Выполнение SQL запроса с параметрами
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Получение одной записи
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Получение всех записей
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Закрытие соединения
  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✅ Соединение с базой данных закрыто');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

// Экспорт singleton экземпляра
module.exports = new Database(); 