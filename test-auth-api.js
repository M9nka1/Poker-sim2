#!/usr/bin/env node

// Тестовый скрипт для проверки API аутентификации
const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3001'; // Используем порт 3001

// Функция для выполнения HTTP запросов
function makeRequest(method, path, data = null, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      }
    };

    if (data) {
      data = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

// Основная функция тестирования
async function runTests() {
  console.log('🧪 Запуск тестов API аутентификации...\n');

  try {
    // Тест 1: Регистрация нового пользователя
    console.log('📝 Тест 1: Регистрация пользователя');
    const registerData = {
      email: 'test@example.com',
      password: 'Password123!'
    };

    const registerResponse = await makeRequest('POST', '/api/auth/register', registerData);
    console.log(`   Статус: ${registerResponse.status}`);
    console.log(`   Ответ:`, registerResponse.data);

    if (registerResponse.status === 201) {
      console.log('   ✅ Регистрация успешна!');
    } else {
      console.log('   ❌ Ошибка регистрации');
    }

    // Извлекаем cookies для последующих запросов
    const setCookieHeader = registerResponse.headers['set-cookie'];
    let cookies = '';
    if (setCookieHeader) {
      cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
    }

    console.log('\n');

    // Тест 2: Повторная регистрация того же пользователя (должна вернуть ошибку)
    console.log('📝 Тест 2: Повторная регистрация (ошибка ожидается)');
    const duplicateRegisterResponse = await makeRequest('POST', '/api/auth/register', registerData);
    console.log(`   Статус: ${duplicateRegisterResponse.status}`);
    console.log(`   Ответ:`, duplicateRegisterResponse.data);

    if (duplicateRegisterResponse.status === 409) {
      console.log('   ✅ Корректно обработана повторная регистрация!');
    } else {
      console.log('   ❌ Неожиданный ответ на повторную регистрацию');
    }

    console.log('\n');

    // Тест 3: Вход с правильными данными
    console.log('📝 Тест 3: Вход с правильными данными');
    const loginData = {
      email: 'test@example.com',
      password: 'Password123!'
    };

    const loginResponse = await makeRequest('POST', '/api/auth/login', loginData);
    console.log(`   Статус: ${loginResponse.status}`);
    console.log(`   Ответ:`, loginResponse.data);

    let accessToken = '';
    if (loginResponse.status === 200 && loginResponse.data.data) {
      accessToken = loginResponse.data.data.accessToken;
      console.log('   ✅ Вход успешен!');
      
      // Обновляем cookies
      const loginSetCookie = loginResponse.headers['set-cookie'];
      if (loginSetCookie) {
        cookies = loginSetCookie.map(cookie => cookie.split(';')[0]).join('; ');
      }
    } else {
      console.log('   ❌ Ошибка входа');
    }

    console.log('\n');

    // Тест 4: Вход с неправильным паролем
    console.log('📝 Тест 4: Вход с неправильным паролем');
    const wrongPasswordData = {
      email: 'test@example.com',
      password: 'WrongPassword123!'
    };

    const wrongLoginResponse = await makeRequest('POST', '/api/auth/login', wrongPasswordData);
    console.log(`   Статус: ${wrongLoginResponse.status}`);
    console.log(`   Ответ:`, wrongLoginResponse.data);

    if (wrongLoginResponse.status === 401) {
      console.log('   ✅ Корректно обработан неправильный пароль!');
    } else {
      console.log('   ❌ Неожиданный ответ на неправильный пароль');
    }

    console.log('\n');

    // Тест 5: Обновление токена
    if (cookies) {
      console.log('📝 Тест 5: Обновление access токена');
      const refreshResponse = await makeRequest('POST', '/api/auth/token/refresh', null, cookies);
      console.log(`   Статус: ${refreshResponse.status}`);
      console.log(`   Ответ:`, refreshResponse.data);

      if (refreshResponse.status === 200) {
        console.log('   ✅ Токен успешно обновлен!');
      } else {
        console.log('   ❌ Ошибка обновления токена');
      }

      console.log('\n');
    }

    // Тест 6: Защищенный эндпоинт с токеном
    if (accessToken) {
      console.log('📝 Тест 6: Доступ к защищенному эндпоинту');
      
      // Делаем запрос с авторизацией
      const protectedReq = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/auth/logout',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': cookies,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            console.log(`   Статус: ${res.statusCode}`);
            console.log(`   Ответ:`, parsed);
            
            if (res.statusCode === 200) {
              console.log('   ✅ Выход успешен!');
            } else {
              console.log('   ❌ Ошибка выхода');
            }
          } catch (error) {
            console.log(`   Статус: ${res.statusCode}`);
            console.log(`   Ответ:`, data);
          }
        });
      });

      protectedReq.on('error', (error) => {
        console.log('   ❌ Ошибка запроса:', error.message);
      });

      protectedReq.end();
    }

    console.log('\n🎉 Тестирование завершено!');

  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов:', error.message);
    console.log('\n💡 Убедитесь, что сервер запущен на http://localhost:3001');
  }
}

// Проверка валидации
async function testValidation() {
  console.log('\n🔍 Тестирование валидации...\n');

  // Тест слабого пароля
  console.log('📝 Тест: Слабый пароль');
  const weakPasswordData = {
    email: 'weak@example.com',
    password: '123'
  };

  const weakPasswordResponse = await makeRequest('POST', '/api/auth/register', weakPasswordData);
  console.log(`   Статус: ${weakPasswordResponse.status}`);
  console.log(`   Ответ:`, weakPasswordResponse.data);

  if (weakPasswordResponse.status === 400) {
    console.log('   ✅ Валидация пароля работает!');
  } else {
    console.log('   ❌ Валидация пароля не работает');
  }

  console.log('\n');

  // Тест неправильного email
  console.log('📝 Тест: Неправильный email');
  const invalidEmailData = {
    email: 'invalid-email',
    password: 'Password123!'
  };

  const invalidEmailResponse = await makeRequest('POST', '/api/auth/register', invalidEmailData);
  console.log(`   Статус: ${invalidEmailResponse.status}`);
  console.log(`   Ответ:`, invalidEmailResponse.data);

  if (invalidEmailResponse.status === 400) {
    console.log('   ✅ Валидация email работает!');
  } else {
    console.log('   ❌ Валидация email не работает');
  }
}

// Запуск всех тестов
async function main() {
  console.log('🚀 Начинаем комплексное тестирование API аутентификации\n');
  
  await runTests();
  await testValidation();
  
  console.log('\n📊 Тестирование завершено. Проверьте результаты выше.');
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runTests, testValidation }; 