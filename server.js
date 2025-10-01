const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');

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
    description: 'Fast and efficient model for everyday tasks',
    premium: false
  },
  {
    id: 'deepseek-r1:1.5b',
    name: 'DeepSeek R1',
    description: 'Advanced reasoning capabilities for complex queries',
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

// Create Express app
const app = express();

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'llm-site-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

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
  if (!phone) {
    return res.render('login', { 
      title: 'Log In', 
      error: 'Please enter a phone number.' 
    });
  }
  
  if (phone.length < 10) {
    return res.render('login', { 
      title: 'Log In', 
      error: 'Please enter a valid phone number.' 
    });
  }
  
  const user = findUserByPhone(phone);
  if (!user) {
    return res.redirect(`/register?phone=${encodeURIComponent(phone)}`);
  }
  
  req.session.userPhone = user.phone;
  res.redirect('/');
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
  
  if (!phone) {
    return res.render('register', { 
      title: 'Register', 
      prefillPhone: '', 
      error: 'Please enter a phone number.' 
    });
  }
  
  if (phone.length < 10) {
    return res.render('register', { 
      title: 'Register', 
      prefillPhone: phone, 
      error: 'Please enter a valid phone number (at least 10 digits).' 
    });
  }
  
  let user = findUserByPhone(phone);
  if (user) {
    return res.render('register', { 
      title: 'Register', 
      prefillPhone: phone, 
      error: 'User already exists. Please log in.' 
    });
  }
  
  user = createUser(phone);
  req.session.userPhone = user.phone;
  res.redirect('/');
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
      ? 'Subscription activated successfully!' 
      : 'Subscription cancelled.';
    
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
      error: 'Unauthorized. Please log in.' 
    });
  }
  
  const { prompt, model } = req.body;
  
  if (!prompt || !model) {
    return res.status(400).json({ 
      error: 'Missing prompt or model selection.' 
    });
  }
  
  if (prompt.length > 5000) {
    return res.status(400).json({ 
      error: 'Prompt is too long. Please limit to 5000 characters.' 
    });
  }
  
  const selected = MODELS.find(m => m.id === model);
  if (!selected) {
    return res.status(400).json({ 
      error: 'Unknown model selected.' 
    });
  }
  
  const user = findUserByPhone(req.session.userPhone);
  if (!user) {
    return res.status(401).json({ 
      error: 'User not found. Please log in again.' 
    });
  }
  
  if (selected.premium && !user.subscribed) {
    return res.status(403).json({ 
      error: 'This model requires an active subscription. Please upgrade your account.' 
    });
  }
  
  try {
    const reply = await callLLM(prompt, model);
    res.json({ response: reply });
  } catch (err) {
    console.error('LLM API Error:', err.message);
    res.status(500).json({ 
      error: 'Failed to generate response. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});