# 📽 Teleprompter

A web-based teleprompter application with scrolling speed control, voice recording, background customisation, mirror mode, fullscreen support, and a secure login system.

Built with **Node.js** (Express) on the backend and **Vanilla HTML/CSS/JavaScript** on the frontend.

---

## Features

| Feature | Details |
|---|---|
| **Login system** | Movie-style login page; bcrypt-hashed passwords; session-based auth |
| **Change password** | Logged-in users can update their password (requires current password) |
| **Logout** | Session destroyed; cookie cleared |
| **Script Input** | Paste text or load a `.txt` file |
| **Auto-scroll** | Play / Pause / Stop with real-time speed slider (1–10 in 0.5 steps) |
| **Background** | 5 preset colours + custom background image upload |
| **Font Controls** | Family, size (16–96 px), colour, reading width |
| **Mirror Mode** | Horizontally flips text for reflective glass |
| **Fullscreen** | Dedicated fullscreen view with floating overlay controls |
| **Voice Recording** | Record, playback, download as `.webm`/`.ogg` |
| **Keyboard Shortcuts** | `Space` play/pause · `S` stop · `↑/↓` speed · `F` fullscreen |

---

## Project Structure

```
Prompter/
├── auth/
│   └── userStore.js        ← User read/write + bcrypt verification
├── data/
│   └── users.json          ← Persisted user store (bcrypt hashes, never plain text)
├── public/
│   ├── index.html          ← Main teleprompter UI (login-protected)
│   ├── login.html          ← Movie-style login page (public)
│   ├── change-password.html← Change password page (login-protected)
│   ├── css/
│   │   ├── style.css
│   │   └── login.css
│   └── js/
│       ├── app.js
│       ├── recorder.js
│       ├── login.js
│       └── change-password.js
├── scripts/
│   └── seed-users.js       ← One-time seed for initial users
├── tests/
│   └── app.test.js
├── server.js               ← Express server (auth routes + static serving)
├── package.json
├── .env.example
└── README.md
```

---

## User Storage

Passwords are stored in `data/users.json` as **bcrypt hashes** (12 salt rounds). Plain-text passwords are never written to disk or logged.

**Railway note:** Railway's ephemeral filesystem resets on re-image (not on redeploy). For true persistence across re-images, attach a Railway **Volume** mounted at `/app/data`. For most use cases (redeploys only), the file persists fine.

---

## Local Setup & Run

### Prerequisites
- Node.js v18+
- npm v9+

### Steps

```bash
# 1. Clone / extract the project
git clone https://github.com/rletea/MyPrompting.git
cd MyPrompting

# 2. Install dependencies
npm install

# 3. Copy and configure environment variables
cp .env.example .env
# Edit .env — set SESSION_SECRET to a long random string:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Seed initial users (run once — safe to re-run, skips existing users)
npm run seed

# 5. Start the server
npm start
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to the login page.

**Initial accounts:**

| Username | Password | Role |
|---|---|---|
| Ankor | Scrum#0726@Poker | admin |
| Ramona | letmein | user |
| Ancuta | nutrihabits | user |

For development with auto-restart:
```bash
npm run dev
```

---

## Running Tests

```bash
npm test
```

---

## Deployment: Git → Railway

### 1. Push to GitHub
```bash
git add .
git commit -m "Your message"
git push
```

### 2. Railway setup
1. Go to [https://railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select `rletea/MyPrompting`
3. Railway auto-detects Node.js and runs `npm start`

### 3. Environment variables on Railway
In your Railway project → **Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | *(long random string — generate as above)* |

### 4. Seed users on Railway
After first deploy, open a Railway **Shell** and run:
```bash
npm run seed
```

### 5. (Recommended) Attach a Volume for user data persistence
In Railway → your service → **Volumes** → mount at `/app/data`.
This ensures `data/users.json` survives re-images.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port (Railway sets automatically) |
| `NODE_ENV` | `development` | Set to `production` for secure cookies (HTTPS) |
| `SESSION_SECRET` | *(none — required)* | Secret for signing session cookies |

---

## Security

- Passwords stored as **bcrypt hashes** (12 salt rounds) — never plain text
- `bcrypt.compare()` used for all verification — timing-safe
- Sessions use `httpOnly`, `sameSite: lax`, `secure: true` (in production)
- Session is regenerated on login (prevents session fixation)
- User script text set via `textContent` only — no XSS via uploads
- HTTP headers hardened with Helmet (CSP, HSTS, etc.)
- No secrets hardcoded — all in environment variables

---

## Test Plan

| # | Test | Expected |
|---|---|---|
| a | Log in with each seeded user + correct password | Redirected to teleprompter app |
| b | Log in with wrong password | Error: "Invalid username or password." |
| c | Inspect `data/users.json` | Passwords show as `$2b$12$…` bcrypt hashes |
| d | Change password, log out, log in with new password | Succeeds |
| e | Visit `/` without session | Redirected to `/login.html` |
| f | Fullscreen button appears below Voice Recording and works | ✅ |

---

## License

MIT
