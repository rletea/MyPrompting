/**
 * scripts/seed-users.js
 *
 * Run ONCE to create data/users.json with bcrypt-hashed passwords.
 * Usage:  npm run seed
 *
 * Re-running is safe — it will SKIP any user that already exists,
 * so existing password changes are preserved.
 */

'use strict';

const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');

const SALT_ROUNDS = 12;
const DATA_DIR    = path.join(__dirname, '..', 'data');
const USERS_FILE  = path.join(DATA_DIR, 'users.json');

// Initial seed accounts — plain-text passwords ONLY here, hashed before writing.
// NEVER log or persist these plain-text values.
const SEED_USERS = [
  { username: 'Ankor',  password: 'Scrum#0726@Poker', role: 'admin' },
  { username: 'Ramona', password: 'B08RMX',            role: 'user'  },
  { username: 'Ancuta', password: 'nutrihabits',       role: 'user'  },
];

async function seed() {
  // Ensure data/ directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load existing users (if any) so we can skip already-seeded accounts
  let existing = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch {
      existing = [];
    }
  }

  const existingMap = new Map(existing.map((u) => [u.username.toLowerCase(), u]));
  let modified = false;

  for (const u of SEED_USERS) {
    const key = u.username.toLowerCase();
    const existingUser = existingMap.get(key);
    if (!existingUser) {
      const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
      existing.push({ username: u.username, passwordHash: hash, role: u.role });
      modified = true;
      console.log(`  ADDED   ${u.username}`);
    } else {
      const match = await bcrypt.compare(u.password, existingUser.passwordHash);
      if (!match) {
        existingUser.passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
        modified = true;
        console.log(`  UPDATED ${u.username} (password updated to match seed)`);
      } else {
        console.log(`  SKIP    ${u.username} (already exists and matches)`);
      }
    }
  }

  if (modified) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(existing, null, 2), 'utf8');
    console.log(`\nWrote ${existing.length} user(s) to ${USERS_FILE}`);
  } else {
    console.log('\nAll seed users already present and up-to-date. Nothing written.');
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
