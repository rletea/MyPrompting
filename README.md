# 📽 Teleprompter

A clean, web-based teleprompter application with scrolling speed control, voice recording, background customisation, mirror mode, and fullscreen support.

Built with **Node.js** (Express) on the backend and **Vanilla HTML/CSS/JavaScript** on the frontend — no frontend framework, no database.

---

## Features

| Feature | Details |
|---|---|
| **Script Input** | Paste text directly or load from a `.txt` file |
| **Auto-scroll** | Play / Pause / Stop with real-time speed slider (1–10) |
| **Background** | 5 preset colours + custom background image upload (JPEG, PNG, GIF, WebP) |
| **Font Controls** | Family, size (16–96 px), colour, reading width (40–100%) |
| **Mirror Mode** | Horizontally flips the text for reflective teleprompter glass |
| **Fullscreen** | Dedicated fullscreen view with floating overlay controls |
| **Voice Recording** | Record microphone audio, playback in-browser, download as `.webm`/`.ogg`/`.m4a` |
| **Keyboard Shortcuts** | `Space` play/pause · `S` stop · `↑/↓` speed · `F` fullscreen |

---

## Project Structure

```
Prompter/
├── public/
│   ├── index.html          ← Single-page UI
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js          ← Teleprompter core logic
│       └── recorder.js     ← MediaRecorder voice recording
├── tests/
│   └── app.test.js         ← Jest unit tests
├── server.js               ← Express static server
├── package.json
├── .env.example
└── README.md
```

---

## Local Setup & Run

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

### Steps

```bash
# 1. Clone the repository (or extract the project)
git clone <your-repo-url>
cd Prompter

# 2. Install dependencies
npm install

# 3. (Optional) Copy .env.example and edit if needed
cp .env.example .env

# 4. Start the server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For development with auto-restart on file changes:

```bash
npm run dev   # uses nodemon
```

---

## Running Tests

```bash
npm test
```

Tests use [Jest](https://jestjs.io/) and cover core utility functions (scroll speed calculation, filename truncation, MIME type resolution, byte formatting).

---

## Deployment: Git → Railway

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 2. Create a Railway project

1. Go to [https://railway.app](https://railway.app) and sign in.
2. Click **New Project → Deploy from GitHub repo**.
3. Select your repository.
4. Railway will auto-detect Node.js and run `npm start`.

### 3. Environment variables (optional)

In the Railway project dashboard → **Variables**, add any variables from `.env.example` if needed (e.g. a custom `PORT`).

Railway automatically sets `PORT` — the server reads `process.env.PORT` so no extra config is needed.

### 4. Access your live URL

Railway generates a public URL (e.g. `https://your-app.up.railway.app`).

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `NODE_ENV` | `development` | Set to `production` for static asset caching |

---

## Security Notes

- User script text is inserted via `textContent` / `createTextNode` — **never** `innerHTML` — preventing XSS.
- Uploaded file content is read via the browser `FileReader` API; it never reaches the server.
- Uploaded background images are validated by MIME type and limited to 20 MB.
- HTTP headers are hardened with [Helmet](https://helmetjs.github.io/) (CSP, HSTS, etc.).
- No secrets or hardcoded credentials.

---

## Browser Compatibility

| Feature | Required API |
|---|---|
| Voice Recording | `MediaRecorder` (Chrome, Edge, Firefox, Safari 14.1+) |
| Background image | `URL.createObjectURL` |
| Fullscreen | `requestFullscreen` API |
| Everything else | Broadly supported modern browsers |

---

## License

MIT
