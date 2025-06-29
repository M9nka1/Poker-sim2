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

  // ===== МЕТОДЫ ДЛЯ РАБОТЫ С СЕССИЯМИ ПОЛЬЗОВАТЕЛЕЙ =====

  // Создать новую сессию пользователя
  async createUserSession(userId, sessionId) {
    try {
      const result = await this.run(
        'INSERT INTO UserSessions (session_id, user_id) VALUES (?, ?)',
        [sessionId, userId]
      );
      console.log(`📝 Создана сессия ${sessionId} для пользователя ${userId}`);
      return result;
    } catch (error) {
      console.error('❌ Ошибка создания сессии пользователя:', error);
      throw error;
    }
  }

  // Получить все сессии пользователя
  async getUserSessions(userId) {
    try {
      const sessions = await this.all(
        'SELECT * FROM UserSessions WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return sessions;
    } catch (error) {
      console.error('❌ Ошибка получения сессий пользователя:', error);
      throw error;
    }
  }

  // Завершить сессию пользователя
  async endUserSession(sessionId, handsPlayed = 0) {
    try {
      const result = await this.run(
        'UPDATE UserSessions SET ended_at = CURRENT_TIMESTAMP, hands_played = ? WHERE session_id = ?',
        [handsPlayed, sessionId]
      );
      console.log(`📝 Завершена сессия ${sessionId}, сыграно раздач: ${handsPlayed}`);
      return result;
    } catch (error) {
      console.error('❌ Ошибка завершения сессии:', error);
      throw error;
    }
  }

  // Получить информацию о сессии
  async getSessionInfo(sessionId) {
    try {
      const session = await this.get(
        'SELECT * FROM UserSessions WHERE session_id = ?',
        [sessionId]
      );
      return session;
    } catch (error) {
      console.error('❌ Ошибка получения информации о сессии:', error);
      throw error;
    }
  }

  // Получить статистику сессий пользователя
  async getUserSessionStats(userId) {
    try {
      const stats = await this.get(`
        SELECT 
          COUNT(*) as total_sessions,
          SUM(hands_played) as total_hands,
          AVG(hands_played) as avg_hands_per_session,
          MAX(created_at) as last_session_date
        FROM UserSessions 
        WHERE user_id = ?
      `, [userId]);
      return stats;
    } catch (error) {
      console.error('❌ Ошибка получения статистики сессий:', error);
      throw error;
    }
  }
}

// Экспорт singleton экземпляра
module.exports = new Database(); 