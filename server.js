const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const OpenAI = require('openai');
const MongoStore = require('connect-mongo');

// Path to users JSON file
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure data directory exists
fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });

// Helper functions to load and save users
function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save users:', err);
  }
}

function findUserByPhone(phone) {
  const users = loadUsers();
  return users.find(u => u.phone === phone);
}

function createUser(phone) {
  const users = loadUsers();
  const user = {
    phone,
    subscribed: false,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  return user;
}

function updateUser(user) {
  const users = loadUsers();
  const index = users.findIndex(u => u.phone === user.phone);
  if (index !== -1) {
    users[index] = user;
    saveUsers(users);
  }
}

// Define models available on the site
const MODELS = [
  {
    id: 'tinyllama',
    name: 'TinyLlama',
    description: 'Быстрая и эффективная модель для повседневных задач',
    premium: false
  },
  {
    id: 'deepseek-r1:1.5b',
    name: 'DeepSeek R1',
    description: 'Продвинутые возможности для сложных запросов',
    premium: true
  }
];

// Function to call the mlvoca API
function callLLM(prompt, model) {
  const data = JSON.stringify({
    model,
    prompt,
    stream: false
  });

  const options = {
    hostname: 'mlvoca.com',
    path: '/api/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    timeout: 60000
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      
      res.on('data', chunk => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.response && typeof json.response === 'string') {
            resolve(json.response);
          } else if (json.error) {
            reject(new Error(json.error));
          } else {
            resolve(body);
          }
        } catch (err) {
          if (body.trim()) {
            resolve(body);
          } else {
            reject(new Error('Empty response from API'));
          }
        }
      });
    });

    req.on('error', err => {
      reject(new Error(`API request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timeout'));
    });

    req.write(data);
    req.end();
  });
}

// Initialize OpenAI client with Cody API
const client = new OpenAI({
  baseURL: 'https://cody.su/api/v1',
  apiKey: 'cody-...', // Replace with your actual API key
});

// Create Express app
const app = express();

// If the app runs behind a proxy (Heroku, nginx, etc.), enable trust proxy
// so express-session can set secure cookies correctly when using HTTPS.
if (process.env.TRUST_PROXY || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session middleware - ИСПРАВЛЕННАЯ ВЕРСИЯ
// Configure session store: prefer MongoDB when MONGO_URL is set, otherwise
// fall back to the default MemoryStore with a clear warning for production.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

// Session store configuration
if (process.env.MONGO_URL) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'llm-site-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGO_URL,
        collectionName: 'sessions',
      }),
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        httpOnly: true,
        // Use explicit env var to control secure cookie behavior. Default false
        // to avoid cookies being dropped on HTTP during testing.
        secure: COOKIE_SECURE,
      },
    })
  );
} else {
  console.warn('MONGO_URL not set — using MemoryStore for sessions. This is NOT recommended for production.');
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'llm-site-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        httpOnly: true,
        secure: COOKIE_SECURE,
      },
    })
  );
}

// Optional debugging middleware for sessions. Enable by setting DEBUG_SESSION=true
if (process.env.DEBUG_SESSION === 'true') {
  app.use((req, res, next) => {
    console.log('--- Session Debug Start ---');
    console.log('URL:', req.method, req.originalUrl);
    console.log('Cookies header:', req.headers.cookie);
    console.log('SessionID:', req.sessionID);
    try {
      console.log('Session content:', JSON.stringify(req.session));
    } catch (err) {
      console.log('Session content (non-serializable):', req.session);
    }
    console.log('--- Session Debug End ---');
    next();
  });
}

// Middleware to expose user object and models to views
app.use((req, res, next) => {
  const userPhone = req.session.userPhone;
  let user = null;
  if (userPhone) {
    user = findUserByPhone(userPhone);
  }
  res.locals.currentUser = user;
  res.locals.models = MODELS;
  next();
});

// Route: home page / chat interface
app.get('/', (req, res) => {
  if (!req.session.userPhone) {
    return res.render('login', { title: 'Log In', error: null });
  }
  res.render('index', { title: 'Home' });
});

// Login page
app.get('/login', (req, res) => {
  if (req.session.userPhone) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Log In', error: null });
});

// Handle login
app.post('/login', (req, res) => {
  const phone = (req.body.phone || '').trim();
  
  console.log('Login attempt:', phone); // Для отладки
  
  if (!phone) {
    return res.render('login', { 
      title: 'Log In', 
      error: 'Пожалуйста, введите номер телефона.' 
    });
  }
  
  if (phone.length < 10) {
    return res.render('login', { 
      title: 'Log In', 
      error: 'Пожалуйста, введите корректный номер телефона.' 
    });
  }
  
  const user = findUserByPhone(phone);
  if (!user) {
    console.log('User not found, redirecting to register');
    return res.redirect(`/register?phone=${encodeURIComponent(phone)}`);
  }
  
  console.log('User found, setting session');
  req.session.userPhone = user.phone;
  
  // Сохраняем сессию явно перед редиректом
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.render('login', { 
        title: 'Log In', 
        error: 'Ошибка сохранения сессии. Попробуйте снова.' 
      });
    }
    console.log('Session saved, redirecting to home');
    // Debug: show Set-Cookie header if present
    const setCookie = res.getHeader && res.getHeader('Set-Cookie');
    console.log('Set-Cookie header after save:', setCookie);
    res.redirect('/');
  });
});

// Registration page
app.get('/register', (req, res) => {
  if (req.session.userPhone) {
    return res.redirect('/');
  }
  const prefillPhone = req.query.phone || '';
  res.render('register', { 
    title: 'Register', 
    prefillPhone,
    error: null 
  });
});

// Handle registration
app.post('/register', (req, res) => {
  const phone = (req.body.phone || '').trim();
  
  console.log('Registration attempt:', phone); // Для отладки
  
  if (!phone) {
    return res.render('register', { 
      title: 'Register', 
      prefillPhone: '', 
      error: 'Пожалуйста, введите номер телефона.' 
    });
  }
  
  if (phone.length < 10) {
    return res.render('register', { 
      title: 'Register', 
      prefillPhone: phone, 
      error: 'Пожалуйста, введите корректный номер телефона (минимум 10 цифр).' 
    });
  }
  
  let user = findUserByPhone(phone);
  if (user) {
    return res.render('register', { 
      title: 'Register', 
      prefillPhone: phone, 
      error: 'Пользователь с таким номером уже существует. Пожалуйста, войдите.' 
    });
  }
  
  console.log('Creating new user');
  user = createUser(phone);
  req.session.userPhone = user.phone;
  
  // Сохраняем сессию явно перед редиректом
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.render('register', { 
        title: 'Register', 
        prefillPhone: phone,
        error: 'Ошибка сохранения сессии. Попробуйте снова.' 
      });
    }
    console.log('Session saved, redirecting to home');
    res.redirect('/');
  });
});

// Subscription page
app.get('/subscribe', (req, res) => {
  if (!req.session.userPhone) {
    return res.redirect('/login');
  }
  res.render('subscribe', { 
    title: 'Subscription',
    success: null,
    error: null
  });
});

// Handle subscription toggle
app.post('/subscribe', (req, res) => {
  if (!req.session.userPhone) {
    return res.redirect('/login');
  }
  
  const user = findUserByPhone(req.session.userPhone);
  if (user) {
    user.subscribed = !user.subscribed;
    updateUser(user);
    
    const message = user.subscribed 
      ? 'Подписка успешно активирована!' 
      : 'Подписка отменена.';
    
    return res.render('subscribe', { 
      title: 'Subscription',
      success: message,
      error: null
    });
  }
  
  res.redirect('/subscribe');
});

// Handle logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Endpoint for generating responses
app.post('/generate', async (req, res) => {
  if (!req.session.userPhone) {
    return res.status(401).json({ 
      error: 'Не авторизован. Пожалуйста, войдите.' 
    });
  }
  
  const { prompt, model } = req.body;
  
  if (!prompt || !model) {
    return res.status(400).json({ 
      error: 'Отсутствует запрос или выбор модели.' 
    });
  }
  
  if (prompt.length > 5000) {
    return res.status(400).json({ 
      error: 'Запрос слишком длинный. Пожалуйста, ограничьте до 5000 символов.' 
    });
  }
  
  const selected = MODELS.find(m => m.id === model);
  if (!selected) {
    return res.status(400).json({ 
      error: 'Неизвестная модель.' 
    });
  }
  
  const user = findUserByPhone(req.session.userPhone);
  if (!user) {
    return res.status(401).json({ 
      error: 'Пользователь не найден. Пожалуйста, войдите снова.' 
    });
  }
  
  if (selected.premium && !user.subscribed) {
    return res.status(403).json({ 
      error: 'Эта модель требует активную подписку. Пожалуйста, обновите свой аккаунт.' 
    });
  }
  
  try {
    const reply = await callLLM(prompt, model);
    res.json({ response: reply });
  } catch (err) {
    console.error('LLM API Error:', err.message);
    res.status(500).json({ 
      error: 'Не удалось сгенерировать ответ. Пожалуйста, попробуйте снова.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Example route to use Cody API for text completion
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: message }],
    });

    res.json({ response: completion.choices[0].message.content });
  } catch (error) {
    console.error('Error with Cody API:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Example route to generate an image
app.post('/api/image', async (req, res) => {
  try {
    const { prompt } = req.body;
    const image = await client.images.generate({
      model: 'FLUX.1-kontext',
      prompt,
    });

    res.json({ image: image.data[0].b64_json });
  } catch (error) {
    console.error('Error with Cody API:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});