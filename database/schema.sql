-- ===== БАЗА ДАННЫХ ПОКЕРНОГО СИМУЛЯТОРА =====
-- Схема для системы аутентификации и авторизации

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS Users (
    user_id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    hand_limit INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица ролей
CREATE TABLE IF NOT EXISTS Roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT UNIQUE NOT NULL
);

-- Связующая таблица пользователи-роли
CREATE TABLE IF NOT EXISTS UserRoles (
    user_id TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES Roles(role_id) ON DELETE CASCADE
);

-- Таблица сыгранных раздач
CREATE TABLE IF NOT EXISTS Hands (
    hand_id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id TEXT NOT NULL,
    hand_data TEXT NOT NULL, -- JSON данные о раздаче
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Таблица игровых сессий пользователей
CREATE TABLE IF NOT EXISTS UserSessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    hands_played INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Таблица refresh токенов
CREATE TABLE IF NOT EXISTS RefreshTokens (
    token_id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON Users(google_id);
CREATE INDEX IF NOT EXISTS idx_hands_user_id ON Hands(user_id);
CREATE INDEX IF NOT EXISTS idx_hands_played_at ON Hands(played_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON UserSessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON UserSessions(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON RefreshTokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON RefreshTokens(expires_at);

-- Вставка базовых ролей
INSERT OR IGNORE INTO Roles (role_name) VALUES ('user');
INSERT OR IGNORE INTO Roles (role_name) VALUES ('admin');

-- Триггер для обновления updated_at
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
    AFTER UPDATE ON Users
    FOR EACH ROW
BEGIN
    UPDATE Users SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END; 