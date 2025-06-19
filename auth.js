// ===== УПРАВЛЕНИЕ АУТЕНТИФИКАЦИЕЙ =====

class AuthManager {
    constructor() {
        this.apiBase = '/api';
        this.currentUser = null;
        this.accessToken = null;
        
        // Генерируем уникальный ID для этой вкладки/сессии
        this.sessionId = this.generateSessionId();
        console.log('🔐 Session ID для этой вкладки:', this.sessionId);
        
        this.init();
    }
    
    generateSessionId() {
        return 'tab_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    async init() {
        console.log('🔐 Инициализация системы аутентификации...');
        
        // Попытка автоматического входа с refresh token
        await this.tryAutoLogin();
        
        // Инициализация обработчиков событий
        this.initEventListeners();
        
        // Инициализация валидации паролей
        this.initPasswordValidation();
    }

    initEventListeners() {
        // Формы аутентификации
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Автоматическое скрытие сообщений
        setTimeout(() => {
            const message = document.getElementById('auth-message');
            if (!message.classList.contains('hidden')) {
                this.hideAuthMessage();
            }
        }, 5000);
    }

    initPasswordValidation() {
        const passwordInput = document.getElementById('register-password');
        const requirements = {
            length: { element: document.getElementById('req-length'), test: (pwd) => pwd.length >= 8 },
            uppercase: { element: document.getElementById('req-uppercase'), test: (pwd) => /[A-Z]/.test(pwd) },
            lowercase: { element: document.getElementById('req-lowercase'), test: (pwd) => /[a-z]/.test(pwd) },
            number: { element: document.getElementById('req-number'), test: (pwd) => /\d/.test(pwd) },
            special: { element: document.getElementById('req-special'), test: (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd) }
        };

        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;
            
            Object.values(requirements).forEach(req => {
                const isValid = req.test(password);
                req.element.classList.toggle('valid', isValid);
                req.element.classList.toggle('invalid', !isValid);
                
                const icon = req.element.querySelector('i');
                icon.className = isValid ? 'fas fa-check' : 'fas fa-times';
            });
        });
    }

    // ===== API МЕТОДЫ =====

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include',
            ...options
        };

        if (this.accessToken) {
            config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            return {
                ok: response.ok,
                status: response.status,
                data: data
            };
        } catch (error) {
            console.error('❌ API ошибка:', error);
            return {
                ok: false,
                status: 0,
                data: { success: false, message: `Ошибка сети: ${error.message}` }
            };
        }
    }

    async tryAutoLogin() {
        try {
            // Проверяем сохраненный токен для этой вкладки
            const savedToken = localStorage.getItem(`auth_token_${this.sessionId}`);
            const savedUser = localStorage.getItem(`auth_user_${this.sessionId}`);
            
            if (savedToken && savedUser) {
                this.accessToken = savedToken;
                this.currentUser = JSON.parse(savedUser);
                console.log('✅ Восстановлена сессия из localStorage для', this.currentUser.email);
                this.showMainApp();
                return true;
            }
            
            const result = await this.apiRequest('/auth/token/refresh', { method: 'POST' });
            
            if (result.ok && result.data.data?.accessToken) {
                this.accessToken = result.data.data.accessToken;
                await this.loadUserProfile();
                this.showMainApp();
                console.log('✅ Автоматический вход выполнен');
                return true;
            }
        } catch (error) {
            console.log('ℹ️ Автоматический вход не удался');
        }
        
        this.showAuthScreen();
        return false;
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const loginBtn = document.getElementById('login-btn');

        if (!email || !password) {
            this.showAuthMessage('Заполните все поля', 'error');
            return;
        }

        this.setButtonLoading(loginBtn, true);

        try {
            const result = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (result.ok && result.data.data) {
                this.accessToken = result.data.data.accessToken;
                this.currentUser = result.data.data.user;
                
                // Сохраняем токен и пользователя для этой вкладки
                localStorage.setItem(`auth_token_${this.sessionId}`, this.accessToken);
                localStorage.setItem(`auth_user_${this.sessionId}`, JSON.stringify(this.currentUser));
                console.log('💾 Токен сохранен для сессии:', this.sessionId);
                
                this.showMainApp();
                this.showAuthMessage('Вход выполнен успешно!', 'success');
                console.log('✅ Пользователь вошел в систему:', this.currentUser.email);
            } else {
                this.showAuthMessage(result.data.message || 'Ошибка входа', 'error');
            }
        } catch (error) {
            this.showAuthMessage('Ошибка соединения с сервером', 'error');
        } finally {
            this.setButtonLoading(loginBtn, false);
        }
    }

    async handleRegister() {
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const passwordConfirm = document.getElementById('register-password-confirm').value;
        const registerBtn = document.getElementById('register-btn');

        if (!email || !password || !passwordConfirm) {
            this.showAuthMessage('Заполните все поля', 'error');
            return;
        }

        if (password !== passwordConfirm) {
            this.showAuthMessage('Пароли не совпадают', 'error');
            return;
        }

        this.setButtonLoading(registerBtn, true);

        try {
            const result = await this.apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (result.ok) {
                this.showAuthMessage('Регистрация успешна! Войдите в систему', 'success');
                this.showLoginForm();
                document.getElementById('login-email').value = email;
            } else {
                const errorMessage = result.data.errors 
                    ? result.data.errors.map(err => err.msg).join(', ')
                    : result.data.message || 'Ошибка регистрации';
                this.showAuthMessage(errorMessage, 'error');
            }
        } catch (error) {
            this.showAuthMessage('Ошибка соединения с сервером', 'error');
        } finally {
            this.setButtonLoading(registerBtn, false);
        }
    }

    async loadUserProfile() {
        try {
            const result = await this.apiRequest('/me');
            
            if (result.ok && result.data.data) {
                this.currentUser = result.data.data.user;
                
                // Сохраняем обновленные данные пользователя
                localStorage.setItem(`auth_user_${this.sessionId}`, JSON.stringify(this.currentUser));
                
                this.updateUserInterface();
                return true;
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки профиля:', error);
        }
        return false;
    }

    async logout() {
        try {
            await this.apiRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
            console.log('Ошибка при выходе:', error);
        } finally {
            // Очищаем токены для этой вкладки
            localStorage.removeItem(`auth_token_${this.sessionId}`);
            localStorage.removeItem(`auth_user_${this.sessionId}`);
            console.log('🗑️ Токены очищены для сессии:', this.sessionId);
            
            this.accessToken = null;
            this.currentUser = null;
            this.showAuthScreen();
            this.showAuthMessage('Вы вышли из системы', 'success');
            console.log('✅ Пользователь вышел из системы');
        }
    }

    // ===== UI МЕТОДЫ =====

    showAuthScreen() {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        this.updateUserInterface();
        
        // Инициализация настроек игры после показа главного приложения
        this.initializeGameSettings();
    }

    initializeGameSettings() {
        console.log('🎮 Инициализация игровых настроек...');
        
        // Показываем кнопку скачивания Hand History
        const downloadBtn = document.getElementById('download-hands-btn');
        if (downloadBtn) {
            downloadBtn.style.display = 'inline-block';
            downloadBtn.addEventListener('click', () => {
                this.downloadHandHistory();
            });
        }

        // Ограничения доступа к игровым функциям на основе лимита раздач
        this.checkHandLimitAndBlockIfNeeded();

        // Инициализация остальных элементов интерфейса
        const settingsIcon = document.querySelector('.settings-icon');
        const adminIcon = document.querySelector('.admin-icon');
        const sessionIcon = document.querySelector('.session-icon');
        const userIcon = document.querySelector('.user-icon');
        const logoutIcon = document.querySelector('.logout-icon');

        if (settingsIcon) settingsIcon.style.display = 'block';
        if (sessionIcon) sessionIcon.style.display = 'block';
        if (userIcon) userIcon.style.display = 'block';
        if (logoutIcon) logoutIcon.style.display = 'block';

        // Показываем админ-панель только для администраторов
        if (this.currentUser?.roles?.includes('admin')) {
            if (adminIcon) {
                adminIcon.style.display = 'block';
                console.log('👑 Включена административная панель');
            }
        }

        // Обновляем интерфейс пользователя
        this.updateUserInterface();
        
        console.log('✅ Игровые настройки инициализированы');
    }

    showLoginForm() {
        document.getElementById('login-form').classList.add('active');
        document.getElementById('register-form').classList.remove('active');
        this.clearForms();
    }

    showRegisterForm() {
        document.getElementById('register-form').classList.add('active');
        document.getElementById('login-form').classList.remove('active');
        this.clearForms();
    }

    clearForms() {
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-password-confirm').value = '';
        this.hideAuthMessage();
    }

    updateUserInterface() {
        if (!this.currentUser) return;

        // Обновление информации пользователя
        document.getElementById('current-user-email').textContent = this.currentUser.email;
        document.getElementById('current-hand-limit').textContent = this.currentUser.hand_limit;
        document.getElementById('current-user-role').textContent = 
            this.currentUser.roles.includes('admin') ? 'Администратор' : 'Пользователь';

        // Показ админской кнопки
        const adminBtn = document.getElementById('admin-panel-btn');
        if (this.currentUser.roles.includes('admin')) {
            adminBtn.style.display = 'flex';
        } else {
            adminBtn.style.display = 'none';
        }

        // Обновление профиля в модальном окне
        document.getElementById('profile-email').textContent = this.currentUser.email;
        document.getElementById('profile-hand-limit').textContent = this.currentUser.hand_limit;
        document.getElementById('profile-created-at').textContent = 
            new Date(this.currentUser.created_at).toLocaleDateString('ru-RU');
            
        // Проверка лимита раздач и блокировка игры при достижении нуля
        this.checkHandLimitAndBlockIfNeeded();
    }

    // Новый метод для проверки лимита и блокировки игры
    checkHandLimitAndBlockIfNeeded() {
        if (this.currentUser.hand_limit <= 0) {
            this.blockGameInterface();
            this.showAuthMessage('Лимит раздач исчерпан. Обратитесь к администратору для увеличения лимита.', 'error');
        } else {
            this.unblockGameInterface();
        }
    }

    // Заблокировать игровой интерфейс
    blockGameInterface() {
        console.log('🚫 Блокировка игрового интерфейса - лимит раздач исчерпан');
        
        // Заблокировать кнопки действий
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
        
        // Заблокировать настройки игры
        document.querySelectorAll('.settings-panel input, .settings-panel button, .settings-panel select').forEach(element => {
            element.disabled = true;
            element.style.opacity = '0.5';
        });
        
        // Показать уведомление на всех столах
        document.querySelectorAll('.poker-table').forEach(table => {
            this.showHandLimitWarning(table);
        });
    }

    // Разблокировать игровой интерфейс
    unblockGameInterface() {
        console.log('✅ Разблокировка игрового интерфейса');
        
        // Разблокировать кнопки действий
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });
        
        // Разблокировать настройки игры
        document.querySelectorAll('.settings-panel input, .settings-panel button, .settings-panel select').forEach(element => {
            element.disabled = false;
            element.style.opacity = '1';
        });
        
        // Убрать уведомления с столов
        document.querySelectorAll('.hand-limit-warning').forEach(warning => {
            warning.remove();
        });
    }

    // Показать предупреждение о лимите на столе
    showHandLimitWarning(tableElement) {
        // Убрать существующее предупреждение если есть
        const existingWarning = tableElement.querySelector('.hand-limit-warning');
        if (existingWarning) {
            existingWarning.remove();
        }
        
        // Создать новое предупреждение
        const warning = document.createElement('div');
        warning.className = 'hand-limit-warning';
        warning.innerHTML = `
            <div class="warning-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Лимит раздач исчерпан</span>
                <small>Обратитесь к администратору</small>
            </div>
        `;
        
        tableElement.appendChild(warning);
    }

    // Обновить счетчик раздач после завершения раздачи
    async updateHandLimit(newLimit) {
        if (this.currentUser) {
            this.currentUser.hand_limit = newLimit;
            this.updateUserInterface();
            console.log(`📊 Счетчик раздач обновлен: ${newLimit}`);
        }
    }

    // API вызов для уведомления о завершении раздачи
    async notifyHandCompleted(tableId, handData = null) {
        console.log(`📊 Уведомляем сервер о завершении раздачи на столе ${tableId}`);
        try {
            const result = await this.apiRequest('/game/hand-completed', {
                method: 'POST',
                body: JSON.stringify({ tableId, handData })
            });
            
            if (result.ok && result.data.data) {
                const newLimit = result.data.data.newHandLimit;
                console.log(`✅ Лимит раздач обновлен: ${newLimit}`);
                await this.updateHandLimit(newLimit);
            } else {
                console.error('❌ Ошибка при уведомлении о завершении раздачи:', result.data.message);
            }
        } catch (error) {
            console.error('❌ Ошибка при отправке уведомления о завершении раздачи:', error);
        }
    }

    async downloadHandHistory() {
        console.log('📁 Скачивание Hand History...');
        try {
            const sessionId = currentSessionId || Date.now(); // Используем текущий sessionId
            const response = await fetch(`${this.apiBase}/download-hand-history/${sessionId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                credentials: 'include'
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `hand_history_session_${sessionId}.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                
                this.showAuthMessage('Hand History скачан успешно!', 'success');
                console.log('✅ Hand History скачан');
            } else {
                const errorData = await response.json();
                this.showAuthMessage(errorData.error || 'Ошибка скачивания Hand History', 'error');
                console.error('❌ Ошибка скачивания Hand History:', errorData);
            }
        } catch (error) {
            console.error('❌ Ошибка при скачивании Hand History:', error);
            this.showAuthMessage('Ошибка скачивания файла', 'error');
        }
    }

    setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    showAuthMessage(message, type = 'info') {
        const messageEl = document.getElementById('auth-message');
        const textEl = messageEl.querySelector('.message-text');
        const iconEl = messageEl.querySelector('.message-icon');

        textEl.textContent = message;
        messageEl.className = `auth-message ${type}`;
        
        if (type === 'success') {
            iconEl.className = 'fas fa-check-circle message-icon';
        } else if (type === 'error') {
            iconEl.className = 'fas fa-exclamation-circle message-icon';
        } else {
            iconEl.className = 'fas fa-info-circle message-icon';
        }

        messageEl.classList.remove('hidden');

        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            this.hideAuthMessage();
        }, 5000);
    }

    hideAuthMessage() {
        document.getElementById('auth-message').classList.add('hidden');
    }

    // ===== ДЕМО ФУНКЦИИ =====

    fillDemoAdmin() {
        document.getElementById('login-email').value = 'admin@pokersimu.com';
        document.getElementById('login-password').value = 'AdminPassword123!';
        this.showAuthMessage('Демо-данные администратора заполнены', 'success');
    }

    fillDemoUser() {
        document.getElementById('login-email').value = 'test@example.com';
        document.getElementById('login-password').value = 'Password123!';
        this.showAuthMessage('Демо-данные пользователя заполнены', 'success');
    }
}

// ===== АДМИНИСТРАТИВНЫЕ ФУНКЦИИ =====

class AdminManager {
    constructor(authManager) {
        this.auth = authManager;
        this.users = [];
    }

    async loadAllUsers() {
        try {
            const result = await this.auth.apiRequest('/admin/users');
            
            if (result.ok && result.data.data) {
                this.users = result.data.data.users;
                this.updateUsersList();
                this.updateStats();
                
                document.getElementById('users-list').classList.remove('hidden');
            } else {
                this.auth.showAuthMessage('Ошибка загрузки пользователей', 'error');
            }
        } catch (error) {
            this.auth.showAuthMessage('Ошибка соединения с сервером', 'error');
        }
    }

    updateUsersList() {
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';

        this.users.forEach(user => {
            const row = document.createElement('div');
            row.className = 'user-row';
            row.innerHTML = `
                <span>${user.email}</span>
                <span>${user.hand_limit}</span>
                <span class="user-roles">${user.roles.join(', ')}</span>
                <div class="user-actions-cell">
                    <button class="user-action-btn" onclick="adminManager.editUserLimit('${user.user_id}', ${user.hand_limit})">
                        Лимит
                    </button>
                </div>
            `;
            tbody.appendChild(row);
        });
    }

    updateStats() {
        document.getElementById('total-users').textContent = this.users.length;
        
        // Подсчет общего количества раздач можно добавить позже
        document.getElementById('total-hands').textContent = '0';
    }

    async editUserLimit(userId, currentLimit) {
        const newLimit = prompt(`Новый лимит раздач для пользователя:`, currentLimit);
        
        if (newLimit === null || newLimit === '') return;
        
        const limit = parseInt(newLimit);
        if (isNaN(limit) || limit < 0) {
            this.auth.showAuthMessage('Введите корректное число', 'error');
            return;
        }

        try {
            const result = await this.auth.apiRequest(`/admin/users/${userId}/limit`, {
                method: 'POST',
                body: JSON.stringify({ limit })
            });

            if (result.ok) {
                this.auth.showAuthMessage('Лимит обновлен', 'success');
                await this.loadAllUsers(); // Перезагрузка списка
            } else {
                this.auth.showAuthMessage(result.data.message || 'Ошибка обновления', 'error');
            }
        } catch (error) {
            this.auth.showAuthMessage('Ошибка соединения с сервером', 'error');
        }
    }

    async exportAllHands() {
        try {
            const response = await fetch('/api/admin/hands/all/download', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.auth.accessToken}`
                },
                credentials: 'include'
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `all_hands_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.auth.showAuthMessage('Экспорт завершен', 'success');
            } else {
                this.auth.showAuthMessage('Ошибка экспорта', 'error');
            }
        } catch (error) {
            this.auth.showAuthMessage('Ошибка соединения с сервером', 'error');
        }
    }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====

// Инициализация менеджеров
let authManager, adminManager;

document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();
    adminManager = new AdminManager(authManager);
    
    // Делаем менеджеры доступными глобально для кнопок
    window.authManager = authManager;
    window.adminManager = adminManager;
    
    // Убеждаемся что функции настроек доступны для всех пользователей
    if (typeof toggleSettingsPanel !== 'function') {
        console.warn('⚠️ toggleSettingsPanel не найдена, создаем fallback');
        window.toggleSettingsPanel = function() {
            const panel = document.querySelector('.settings-panel');
            if (panel) {
                panel.classList.toggle('active');
            }
        };
    }
});

// Функции для HTML кнопок
function showLoginForm() {
    authManager.showLoginForm();
}

function showRegisterForm() {
    authManager.showRegisterForm();
}

function fillDemoAdmin() {
    authManager.fillDemoAdmin();
}

function fillDemoUser() {
    authManager.fillDemoUser();
}

function logout() {
    authManager.logout();
}

function hideAuthMessage() {
    authManager.hideAuthMessage();
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    panel.classList.toggle('hidden');
}

function showUserProfile() {
    document.getElementById('user-profile-modal').classList.add('active');
}

function closeUserProfile() {
    document.getElementById('user-profile-modal').classList.remove('active');
}

function loadAllUsers() {
    adminManager.loadAllUsers();
}

function exportAllHands() {
    adminManager.exportAllHands();
}

async function downloadUserHands() {
    try {
        const response = await fetch('/api/me/hands', {
            headers: {
                'Authorization': `Bearer ${authManager.accessToken}`
            },
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data.data, null, 2)], {
                type: 'application/json'
            });
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my_hands_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            authManager.showAuthMessage('Скачивание завершено', 'success');
        } else {
            authManager.showAuthMessage('Ошибка скачивания', 'error');
        }
    } catch (error) {
        authManager.showAuthMessage('Ошибка соединения с сервером', 'error');
    }
} 

// ===== ОБЕСПЕЧЕНИЕ ДОСТУПНОСТИ НАСТРОЕК ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ =====

// Убеждаемся что все пользователи могут использовать настройки
function ensureSettingsAccess() {
    console.log('🔧 Обеспечение доступности настроек для всех пользователей...');
    
    // Проверяем и создаем fallback функции для всех пользователей
    if (typeof window.toggleSettingsPanel !== 'function') {
        console.log('📝 Создание функции toggleSettingsPanel для всех пользователей');
        window.toggleSettingsPanel = function() {
            console.log('🎯 Открытие настроек для всех пользователей');
            const panel = document.querySelector('.settings-panel');
            if (panel) {
                const isActive = panel.classList.contains('active');
                if (isActive) {
                    panel.classList.remove('active');
                    console.log('✅ Панель настроек закрыта');
                } else {
                    panel.classList.add('active');
                    console.log('✅ Панель настроек открыта');
                    
                    // Инициализируем drag & drop если функция доступна
                    if (typeof initializeDragAndDrop === 'function') {
                        initializeDragAndDrop();
                    }
                }
            } else {
                console.warn('⚠️ Панель настроек не найдена в DOM');
            }
        };
    }
    
    // Создаем fallback для showMultiplayerMenu если нужно
    if (typeof window.showMultiplayerMenu !== 'function') {
        console.log('📝 Создание функции showMultiplayerMenu для всех пользователей');
        window.showMultiplayerMenu = function() {
            console.log('🎯 Открытие мультиплеер меню для всех пользователей');
            
            // Если функция еще не загружена, создаем простую альтернативу
            const menu = document.createElement('div');
            menu.className = 'multiplayer-menu';
            menu.innerHTML = `
                <div class="multiplayer-menu-content">
                    <h3><i class="fas fa-users"></i> Мультиплеер</h3>
                    <p>Мультиплеер функция загружается...</p>
                    <button onclick="this.parentElement.parentElement.remove()">Закрыть</button>
                </div>
            `;
            
            menu.style.cssText = `
                position: fixed;
                top: 70px;
                left: 15px;
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid var(--accent-primary);
                border-radius: 8px;
                padding: 15px;
                z-index: 1001;
                backdrop-filter: blur(10px);
                min-width: 200px;
                color: white;
            `;
            
            document.body.appendChild(menu);
        };
    }
    
    console.log('✅ Доступность настроек обеспечена для всех пользователей');
}

// Вызываем проверку при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(ensureSettingsAccess, 500); // Небольшая задержка для уверенности загрузки
});

// Дополнительная проверка после полной загрузки
window.addEventListener('load', () => {
    setTimeout(ensureSettingsAccess, 1000);
}); 