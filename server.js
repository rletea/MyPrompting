'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const session      = require('express-session');
const path         = require('path');
const fs           = require('fs');
const bcrypt       = require('bcryptjs');

const { verifyPassword, changePassword } = require('./auth/userStore');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Auto-seed: runs at every startup, skips users that already exist.
// This means no manual "npm run seed" step is required on Railway.
// Plain-text passwords exist only here in memory during hashing — never logged.
// ---------------------------------------------------------------------------
const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const SEED_USERS = [
  { username: 'Ankor',  password: 'Scrum#0726@Poker', role: 'admin' },
  { username: 'Ramona', password: 'letmein',           role: 'user'  },
  { username: 'Ancuta', password: 'nutrihabits',       role: 'user'  },
];

async function autoSeed() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  let existing = [];
  if (fs.existsSync(USERS_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { existing = []; }
  }

  const existingNames = new Set(existing.map((u) => u.username.toLowerCase()));
  const toAdd = [];

  for (const u of SEED_USERS) {
    if (existingNames.has(u.username.toLowerCase())) continue; // already exists
    const hash = await bcrypt.hash(u.password, 12);
    toAdd.push({ username: u.username, passwordHash: hash, role: u.role });
    console.log(`[seed] Added user: ${u.username}`);
  }

  if (toAdd.length > 0) {
    const tmp = USERS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...existing, ...toAdd], null, 2), 'utf8');
    fs.renameSync(tmp, USERS_FILE);
  }
}

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        mediaSrc:   ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        fontSrc:    ["'self'"],
        objectSrc:  ["'none'"],
        baseUri:    ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

app.disable('x-powered-by');

// Trust Railway's reverse proxy so req.secure is set correctly,
// which allows the session cookie's `secure` flag to work over HTTPS.
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.warn(
    '[WARN] SESSION_SECRET is not set. Using an insecure fallback. ' +
    'Set SESSION_SECRET in your .env or Railway Variables before going to production.'
  );
}

const INACTIVITY_MS = 3 * 60 * 60 * 1000; // 3 hours — must match client-side

app.use(
  session({
    secret:            SESSION_SECRET || 'change-me-insecure-fallback',
    resave:            false,
    saveUninitialized: false,
    rolling:           true,   // reset cookie expiry on every response while active
    cookie: {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production' ? 'auto' : false,
      sameSite: 'lax',
      maxAge:   INACTIVITY_MS, // server-side expiry matches client 3h inactivity
    },
  })
);

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  // API calls → 401 JSON; page requests → redirect to login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login.html');
}

// ---------------------------------------------------------------------------
// Public routes (no auth required)
// ---------------------------------------------------------------------------

// Serve login page and its assets without auth
// (use sendFile for individual files — express.static on a file path doesn't work)
app.get('/login.html',    (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/css/login.css', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'css', 'login.css')));
app.get('/js/login.js',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'js', 'login.js')));

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  // Basic length guards to prevent bcrypt DoS on huge inputs
  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  const user = await verifyPassword(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Regenerate session to prevent session fixation
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.user = user; // { username, role } — no passwordHash
    res.json({ ok: true, username: user.username, role: user.role });
  });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Protected routes (login required from here on)
// ---------------------------------------------------------------------------
app.use(requireLogin);

// GET /api/me — return current session user (no password)
app.get('/api/me', (req, res) => {
  res.json({ username: req.session.user.username, role: req.session.user.role });
});

// POST /api/change-password
app.post('/api/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.session.user.username;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new password are required.' });
  }

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' ||
      currentPassword.length > 200 || newPassword.length > 200) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const ok = await changePassword(username, currentPassword, newPassword);
  if (!ok) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  res.json({ ok: true, message: 'Password changed successfully.' });
});

// ---------------------------------------------------------------------------
// Static files (protected — served only after requireLogin above)
// ---------------------------------------------------------------------------

// No-cache headers for HTML
app.get('*.html', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge:       0,
    etag:         false,
    lastModified: false,
    setHeaders(res) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    },
  })
);

// ---------------------------------------------------------------------------
// Catch-all — redirect unauthenticated users, serve app to authenticated ones
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start server — seed users first, then listen
// ---------------------------------------------------------------------------
autoSeed()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Teleprompter server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[seed] Fatal error during startup seed:', err);
    process.exit(1);
  });

module.exports = app;
