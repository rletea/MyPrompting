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
  { username: 'Ramona', password: 'letmein',           role: 'user'  },
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

  const existingNames = new Set(existing.map((u) => u.username.toLowerCase()));
  const toAdd = [];

  for (const u of SEED_USERS) {
    if (existingNames.has(u.username.toLowerCase())) {
      console.log(`  SKIP  ${u.username} (already exists)`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    toAdd.push({ username: u.username, passwordHash: hash, role: u.role });
    console.log(`  ADDED ${u.username}`);
  }

  if (toAdd.length > 0) {
    const updated = [...existing, ...toAdd];
    fs.writeFileSync(USERS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    console.log(`\nWrote ${updated.length} user(s) to ${USERS_FILE}`);
  } else {
    console.log('\nAll seed users already present. Nothing written.');
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
