/**
 * auth/userStore.js
 *
 * Thin wrapper around data/users.json.
 * All reads and writes go through this module so the rest of the app
 * never touches the file system directly for user data.
 *
 * Storage choice: JSON file
 * ─────────────────────────
 * The app has no database. A JSON file gives us:
 *  • Zero extra dependencies / infrastructure
 *  • Human-readable audit trail
 *  • Persistent across server restarts (on Railway: use a Volume for true
 *    persistence; without a Volume the file survives deploys but resets on
 *    re-image — documented in README)
 * Passwords are ALWAYS stored as bcrypt hashes. Plain text never touches disk.
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcryptjs');

const SALT_ROUNDS = 12;
const USERS_FILE  = path.join(__dirname, '..', 'data', 'users.json');

/** Read all users from disk. Returns [] if file missing/corrupt. */
function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/** Persist the users array to disk atomically-ish (write + rename). */
function writeUsers(users) {
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
}

/**
 * Find a user by username (case-insensitive).
 * Returns the user object (with passwordHash) or null.
 * NOTE: never return this object directly to the client.
 */
function findUser(username) {
  const users = readUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

/**
 * Verify a plain-text password against the stored hash.
 * Returns the sanitised user object (no passwordHash) on success, or null.
 */
async function verifyPassword(username, plainPassword) {
  const user = findUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(plainPassword, user.passwordHash);
  if (!ok) return null;
  return { username: user.username, role: user.role };
}

/**
 * Change a user's password.
 * Verifies currentPassword first; hashes and saves the new one.
 * Returns true on success, false if current password is wrong, throws on error.
 */
async function changePassword(username, currentPassword, newPassword) {
  const user = findUser(username);
  if (!user) return false;

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return false;

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const users = readUsers();
  const idx   = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
  users[idx].passwordHash = newHash;
  writeUsers(users);
  return true;
}

module.exports = { findUser, verifyPassword, changePassword };
