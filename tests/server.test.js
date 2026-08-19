/**
 * tests/server.test.js
 *
 * Integration tests for the Express API layer.
 *
 * Strategy:
 *  - Boot the real Express app (module.exports = app from server.js).
 *  - Use `supertest` for HTTP assertions.
 *  - Each describe block that needs an authenticated session calls loginAs()
 *    which POSTs /api/login and captures the session cookie.
 *  - Tests are read-only where possible; destructive tests (change-password)
 *    use a dedicated temp user written directly to data/users.json before
 *    the test and restored afterwards.
 *
 * NOTE: server.js calls autoSeed() then app.listen() at module load time.
 *       We import `app` directly (module.exports) to avoid port conflicts.
 *       supertest handles binding to an ephemeral port internally.
 */

'use strict';

const request  = require('supertest');
const fs       = require('fs');
const path     = require('path');
const bcrypt   = require('bcryptjs');

// ── load app and wait for seed ──────────────────────────────────────────────
let app;
beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  app = require('../server');
  // Wait for autoSeed() to finish so data/users.json is ready
  if (app._seedReady) await app._seedReady;
});

afterAll(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
});

/* ── helper: log in and return the Set-Cookie header value ────────────────── */
async function loginAs(username, password) {
  const res = await request(app)
    .post('/api/login')
    .send({ username, password });
  // Return the raw Set-Cookie string so tests can attach it to subsequent reqs
  return res.headers['set-cookie'];
}

/* ── helper: get a seeded user's password from the known seed list ─────────── */
// Matches server.js SEED_USERS
const SEED_PASSWORDS = {
  Ankor:  'Scrum#0726@Poker',
  Ramona: 'letmein',
  Ancuta: 'nutrihabits',
};

/* ============================================================
   Public routes — no auth required
   ============================================================ */
describe('public routes', () => {
  test('GET /login.html returns 200', async () => {
    const res = await request(app).get('/login.html');
    expect(res.status).toBe(200);
  });

  test('GET /css/login.css returns 200', async () => {
    const res = await request(app).get('/css/login.css');
    expect(res.status).toBe(200);
  });

  test('GET /js/login.js returns 200', async () => {
    const res = await request(app).get('/js/login.js');
    expect(res.status).toBe(200);
  });

  test('GET / without a session redirects to /login.html', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login\.html/);
  });

  test('GET /nonexistent without a session redirects to /login.html', async () => {
    const res = await request(app).get('/nonexistent-route');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login\.html/);
  });
});

/* ============================================================
   POST /api/login
   ============================================================ */
describe('POST /api/login', () => {
  test('returns 200 and ok:true on valid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'Ramona', password: SEED_PASSWORDS.Ramona });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.username).toBe('Ramona');
  });

  test('returns 200 and sets a session cookie on success', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'Ramona', password: SEED_PASSWORDS.Ramona });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'Ramona', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test('returns 401 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'ghost', password: 'anything' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ password: 'letmein' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'Ramona' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when username exceeds 100 characters', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'a'.repeat(101), password: 'pw' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password exceeds 200 characters', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'Ramona', password: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });

  test('login response does not expose passwordHash', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'Ramona', password: SEED_PASSWORDS.Ramona });
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});

/* ============================================================
   POST /api/logout
   ============================================================ */
describe('POST /api/logout', () => {
  test('returns 200 and ok:true', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('clears the session cookie', async () => {
    const cookie = await loginAs('Ramona', SEED_PASSWORDS.Ramona);
    const res = await request(app)
      .post('/api/logout')
      .set('Cookie', cookie);
    // connect.sid should be cleared (Max-Age=0 or Expires in the past)
    const setCookie = (res.headers['set-cookie'] || []).join(';');
    expect(setCookie).toMatch(/connect\.sid/);
  });

  test('after logout, GET /api/me returns 401', async () => {
    const cookie = await loginAs('Ramona', SEED_PASSWORDS.Ramona);
    await request(app).post('/api/logout').set('Cookie', cookie);
    const res = await request(app).get('/api/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

/* ============================================================
   requireLogin middleware
   ============================================================ */
describe('requireLogin middleware', () => {
  test('unauthenticated GET /api/me returns 401 JSON', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('unauthenticated POST /api/preferences returns 401 JSON', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .send({ speed: 3 });
    expect(res.status).toBe(401);
  });

  test('unauthenticated POST /api/change-password returns 401 JSON', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .send({ currentPassword: 'old', newPassword: 'new123' });
    expect(res.status).toBe(401);
  });
});

/* ============================================================
   GET /api/me  (authenticated)
   ============================================================ */
describe('GET /api/me', () => {
  let cookie;

  beforeAll(async () => {
    cookie = await loginAs('Ancuta', SEED_PASSWORDS.Ancuta);
  });

  test('returns 200 with username and role', async () => {
    const res = await request(app).get('/api/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('Ancuta');
    expect(res.body.role).toBe('user');
  });

  test('response includes a preferences object', async () => {
    const res = await request(app).get('/api/me').set('Cookie', cookie);
    expect(res.body).toHaveProperty('preferences');
    expect(typeof res.body.preferences).toBe('object');
  });

  test('does not expose passwordHash', async () => {
    const res = await request(app).get('/api/me').set('Cookie', cookie);
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});

/* ============================================================
   POST /api/preferences  (authenticated)
   ============================================================ */
describe('POST /api/preferences', () => {
  let cookie;

  beforeAll(async () => {
    cookie = await loginAs('Ancuta', SEED_PASSWORDS.Ancuta);
  });

  test('saves a valid speed and returns ok:true', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: 4.5 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('saved speed is returned on the next GET /api/me', async () => {
    await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: 6 });
    const me = await request(app).get('/api/me').set('Cookie', cookie);
    expect(me.body.preferences.speed).toBe(6);
  });

  test('returns 400 when speed is missing', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 when speed is below 0', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: -1 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when speed exceeds 10', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: 11 });
    expect(res.status).toBe(400);
  });

  test('returns 400 for non-numeric speed', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: 'fast' });
    expect(res.status).toBe(400);
  });

  test('accepts boundary value 0 (stopped)', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: 0 });
    expect(res.status).toBe(200);
  });

  test('accepts boundary value 10 (maximum)', async () => {
    const res = await request(app)
      .post('/api/preferences')
      .set('Cookie', cookie)
      .send({ speed: 10 });
    expect(res.status).toBe(200);
  });
});

/* ============================================================
   POST /api/change-password  (authenticated)
   Uses a temporary test user to avoid mutating the seed users.
   ============================================================ */
describe('POST /api/change-password', () => {
  const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
  const TEST_USER  = { username: '_testchgpw', role: 'user' };
  const INIT_PW    = 'InitPass#1';
  let cookie;
  let originalUsers;

  beforeAll(async () => {
    // Save original file so we can restore it after
    originalUsers = fs.existsSync(USERS_FILE)
      ? fs.readFileSync(USERS_FILE, 'utf8')
      : null;

    // Add the temp test user
    const users = originalUsers ? JSON.parse(originalUsers) : [];
    const hash  = await bcrypt.hash(INIT_PW, 10);
    users.push({ ...TEST_USER, passwordHash: hash });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

    cookie = await loginAs(TEST_USER.username, INIT_PW);
  });

  afterAll(() => {
    // Restore original file content
    if (originalUsers !== null) {
      fs.writeFileSync(USERS_FILE, originalUsers, 'utf8');
    }
  });

  test('returns 200 and ok:true on correct current password', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: INIT_PW, newPassword: 'Changed!99' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('returns 401 when current password is wrong', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'totallywrong', newPassword: 'Irrelevant1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrect/i);
  });

  test('returns 400 when currentPassword is missing', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', cookie)
      .send({ newPassword: 'SomeNew!1' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when newPassword is missing', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: INIT_PW });
    expect(res.status).toBe(400);
  });

  test('returns 400 when new password is shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: INIT_PW, newPassword: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 character/i);
  });

  test('returns 400 when newPassword exceeds 200 characters', async () => {
    const res = await request(app)
      .post('/api/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: INIT_PW, newPassword: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });
});

/* ============================================================
   Protected static assets (served after requireLogin)
   ============================================================ */
describe('protected static files', () => {
  let cookie;

  beforeAll(async () => {
    cookie = await loginAs('Ramona', SEED_PASSWORDS.Ramona);
  });

  test('GET / returns 200 when authenticated', async () => {
    const res = await request(app).get('/').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  test('GET /css/style.css returns 200 when authenticated', async () => {
    const res = await request(app).get('/css/style.css').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  test('GET /js/app.js returns 200 when authenticated', async () => {
    const res = await request(app).get('/js/app.js').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
