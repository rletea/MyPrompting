/**
 * tests/userStore.test.js
 *
 * Unit tests for auth/userStore.js.
 *
 * Strategy: each test suite writes to a temp file in os.tmpdir() and
 * overrides the module-level USERS_FILE path via a Jest module factory.
 * This keeps tests hermetic — no shared state, no touching data/users.json.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Write an arbitrary array of user objects to a temp file and return the path. */
function writeTempUsers(users) {
  const file = path.join(os.tmpdir(), `tp-test-users-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf8');
  return file;
}

/**
 * Load a fresh, isolated instance of userStore that reads/writes to `filePath`.
 * Jest module caching is bypassed with jest.isolateModules.
 */
function loadStore(filePath) {
  // Patch the path constant before the module runs
  jest.resetModules();
  // Override require('path').join so USERS_FILE resolves to our temp file
  jest.doMock('path', () => {
    const realPath = jest.requireActual('path');
    return {
      ...realPath,
      join: (...args) => {
        // Intercept the specific call that builds USERS_FILE
        const joined = realPath.join(...args);
        if (joined.endsWith('data' + realPath.sep + 'users.json') ||
            joined.endsWith('data/users.json') ||
            joined.endsWith('data\\users.json')) {
          return filePath;
        }
        return joined;
      },
    };
  });
  return require('../auth/userStore');
}

/* ── bcrypt hash of "password123" pre-computed at cost 10 for speed ─── */
// Generated once: bcrypt.hashSync('password123', 10)
const HASH_PW123 = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
// Generated once: bcrypt.hashSync('hunter2', 10)
const HASH_HUNTER2 = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

/* ============================================================
   findUser
   ============================================================ */
describe('findUser', () => {
  let store;
  let tmpFile;

  beforeEach(() => {
    tmpFile = writeTempUsers([
      { username: 'Alice', passwordHash: HASH_PW123, role: 'admin' },
      { username: 'Bob',   passwordHash: HASH_PW123, role: 'user'  },
    ]);
    store = loadStore(tmpFile);
  });

  afterEach(() => {
    jest.unmock('path');
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('finds an existing user by exact username', () => {
    const user = store.findUser('Alice');
    expect(user).not.toBeNull();
    expect(user.username).toBe('Alice');
    expect(user.role).toBe('admin');
  });

  test('is case-insensitive', () => {
    expect(store.findUser('alice')).not.toBeNull();
    expect(store.findUser('ALICE')).not.toBeNull();
    expect(store.findUser('aLiCe')).not.toBeNull();
  });

  test('returns null for a non-existent username', () => {
    expect(store.findUser('nobody')).toBeNull();
  });

  test('returns null when the user list is empty', () => {
    const emptyFile = writeTempUsers([]);
    const emptyStore = loadStore(emptyFile);
    expect(emptyStore.findUser('Alice')).toBeNull();
    try { fs.unlinkSync(emptyFile); } catch {}
  });

  test('returned object includes passwordHash (for internal use)', () => {
    const user = store.findUser('Alice');
    expect(user).toHaveProperty('passwordHash');
  });
});

/* ============================================================
   verifyPassword
   ============================================================ */
describe('verifyPassword', () => {
  let store;
  let tmpFile;

  beforeEach(() => {
    tmpFile = writeTempUsers([
      { username: 'Carol', passwordHash: HASH_PW123, role: 'user' },
    ]);
    store = loadStore(tmpFile);
  });

  afterEach(() => {
    jest.unmock('path');
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('returns sanitised user object on correct password', async () => {
    const result = await store.verifyPassword('Carol', 'password123');
    expect(result).not.toBeNull();
    expect(result.username).toBe('Carol');
    expect(result.role).toBe('user');
  });

  test('does NOT include passwordHash in the returned object', async () => {
    const result = await store.verifyPassword('Carol', 'password123');
    expect(result).not.toHaveProperty('passwordHash');
  });

  test('returns null on wrong password', async () => {
    const result = await store.verifyPassword('Carol', 'wrongpass');
    expect(result).toBeNull();
  });

  test('returns null for non-existent user', async () => {
    const result = await store.verifyPassword('nobody', 'password123');
    expect(result).toBeNull();
  });

  test('is case-insensitive for username lookup', async () => {
    const result = await store.verifyPassword('carol', 'password123');
    expect(result).not.toBeNull();
  });
});

/* ============================================================
   savePreferences + getPreferences
   ============================================================ */
describe('savePreferences / getPreferences', () => {
  let store;
  let tmpFile;

  beforeEach(() => {
    tmpFile = writeTempUsers([
      { username: 'Dave', passwordHash: HASH_PW123, role: 'user' },
    ]);
    store = loadStore(tmpFile);
  });

  afterEach(() => {
    jest.unmock('path');
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('getPreferences returns {} when no preferences have been saved', () => {
    expect(store.getPreferences('Dave')).toEqual({});
  });

  test('getPreferences returns {} for unknown user', () => {
    expect(store.getPreferences('nobody')).toEqual({});
  });

  test('savePreferences persists a speed value', () => {
    store.savePreferences('Dave', { speed: 3.5 });
    expect(store.getPreferences('Dave')).toEqual({ speed: 3.5 });
  });

  test('savePreferences merges into existing preferences', () => {
    store.savePreferences('Dave', { speed: 2 });
    store.savePreferences('Dave', { volume: 80 });
    const prefs = store.getPreferences('Dave');
    expect(prefs.speed).toBe(2);
    expect(prefs.volume).toBe(80);
  });

  test('savePreferences overwrites the same key on second call', () => {
    store.savePreferences('Dave', { speed: 1 });
    store.savePreferences('Dave', { speed: 7 });
    expect(store.getPreferences('Dave').speed).toBe(7);
  });

  test('savePreferences on unknown user does nothing (no throw)', () => {
    expect(() => store.savePreferences('nobody', { speed: 5 })).not.toThrow();
  });

  test('preferences are case-insensitive on lookup', () => {
    store.savePreferences('Dave', { speed: 4 });
    expect(store.getPreferences('dave').speed).toBe(4);
    expect(store.getPreferences('DAVE').speed).toBe(4);
  });
});

/* ============================================================
   changePassword
   ============================================================ */
describe('changePassword', () => {
  let store;
  let tmpFile;

  beforeEach(() => {
    tmpFile = writeTempUsers([
      { username: 'Eve', passwordHash: HASH_PW123, role: 'user' },
    ]);
    store = loadStore(tmpFile);
  });

  afterEach(() => {
    jest.unmock('path');
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('returns true and updates hash on correct current password', async () => {
    const ok = await store.changePassword('Eve', 'password123', 'newSecure!9');
    expect(ok).toBe(true);
    // Verify new password works
    const result = await store.verifyPassword('Eve', 'newSecure!9');
    expect(result).not.toBeNull();
  });

  test('old password no longer works after change', async () => {
    await store.changePassword('Eve', 'password123', 'newSecure!9');
    const result = await store.verifyPassword('Eve', 'password123');
    expect(result).toBeNull();
  });

  test('returns false on wrong current password', async () => {
    const ok = await store.changePassword('Eve', 'wrongpassword', 'newSecure!9');
    expect(ok).toBe(false);
  });

  test('returns false for non-existent user', async () => {
    const ok = await store.changePassword('nobody', 'password123', 'newSecure!9');
    expect(ok).toBe(false);
  });

  test('does not modify the file on wrong current password', async () => {
    const before = fs.readFileSync(tmpFile, 'utf8');
    await store.changePassword('Eve', 'wrongpassword', 'newSecure!9');
    const after = fs.readFileSync(tmpFile, 'utf8');
    expect(after).toBe(before);
  });
});
