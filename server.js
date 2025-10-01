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
    // File might not exist yet
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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

// Define models available on the site. The `premium` flag indicates if
// subscription is required to use the model.
const MODELS = [
  {
    id: 'tinyllama',
    name: 'TinyLlama',
    description: 'A lightweight language model suitable for quick tasks.',
    premium: false
  },
  {
    id: 'deepseek-r1:1.5b',
    name: 'DeepSeek R1 (1.5b)',
    description: 'A more capable model with better reasoning abilities.',
    premium: true
  }
];

// Function to call the mlvoca API. Accepts a prompt and a model ID
// and returns a Promise that resolves with the model response string.
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
    }
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
          // The API returns an object with a 'response' field
          if (typeof json.response === 'string') {
            resolve(json.response);
          } else {
            resolve(body);
          }
        } catch (err) {
          // If JSON parsing fails, return raw body
          resolve(body);
        }
      });
    });
    req.on('error', err => reject(err));
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
    secret: 'llm-site-secret',
    resave: false,
    saveUninitialized: false
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
// Always return HTTP 200 on root.  If the user is not logged in then
// render the login page instead of performing a redirect; this avoids
// Timeweb’s health‑check failing on a 302 status code.
app.get('/', (req, res) => {
  if (!req.session.userPhone) {
    return res.render('login', { title: 'Log In' });
  }
  res.render('index', { title: 'Home' });
});

// Login page
app.get('/login', (req, res) => {
  if (req.session.userPhone) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Log In' });
});

// Handle login
app.post('/login', (req, res) => {
  const phone = (req.body.phone || '').trim();
  if (!phone) {
    return res.render('login', { title: 'Log In', error: 'Please enter a phone number.' });
  }
  const user = findUserByPhone(phone);
  if (!user) {
    // If user does not exist, redirect to register with phone prefilled
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
  res.render('register', { title: 'Register', prefillPhone });
});

// Handle registration
app.post('/register', (req, res) => {
  const phone = (req.body.phone || '').trim();
  if (!phone) {
    return res.render('register', { title: 'Register', prefillPhone: '', error: 'Please enter a phone number.' });
  }
  let user = findUserByPhone(phone);
  if (user) {
    return res.render('register', { title: 'Register', prefillPhone: phone, error: 'User already exists. Please log in.' });
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
  res.render('subscribe', { title: 'Subscription' });
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
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { prompt, model } = req.body;
  if (!prompt || !model) {
    return res.status(400).json({ error: 'Missing prompt or model' });
  }
  const selected = MODELS.find(m => m.id === model);
  if (!selected) {
    return res.status(400).json({ error: 'Unknown model' });
  }
  const user = findUserByPhone(req.session.userPhone);
  if (selected.premium && !user.subscribed) {
    return res.status(403).json({ error: 'Model requires subscription' });
  }
  try {
    const reply = await callLLM(prompt, model);
    res.json({ response: reply });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate response', details: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
// Bind to all network interfaces so the app is reachable from outside the
// container.  On Node.js this is the default if no host is specified,
// but we pass 0.0.0.0 explicitly for clarity.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});