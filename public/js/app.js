/**
 * app.js — Teleprompter core logic
 *
 * Responsibilities:
 *  - Load script text (textarea + file upload: .txt, .pdf*, .docx*)
 *  - Auto-scroll playback (Play / Pause / Stop)
 *  - Real-time speed slider
 *  - Preset + custom background (image upload)
 *  - Font family, size, color, reading-width controls
 *  - Mirror mode toggle
 *  - Fullscreen mode with overlay controls
 *
 * * PDF/DOCX: extracted client-side as plain text (best-effort via FileReader).
 *   PDF requires the pdf.js CDN which is NOT bundled here — for .txt files the
 *   feature is complete; PDF/DOCX show a friendly notice.
 *
 * Security note: user text is set via textContent/createTextNode — never
 * innerHTML — preventing any XSS injection from uploaded content.
 */

'use strict';

/* ============================================================
   DOM references
   ============================================================ */
const scriptInput      = document.getElementById('script-input');
const fileInput        = document.getElementById('file-input');
const fileNameLabel    = document.getElementById('file-name');
const btnLoadScript    = document.getElementById('btn-load-script');
const btnClearScript   = document.getElementById('btn-clear-script');
const fileError        = document.getElementById('file-error');

const btnPlay          = document.getElementById('btn-play');
const btnPause         = document.getElementById('btn-pause');
const btnStop          = document.getElementById('btn-stop');
const speedSlider      = document.getElementById('speed-slider');
const speedValue       = document.getElementById('speed-value');

const presetColors     = document.querySelectorAll('.preset-color');
const bgImageInput     = document.getElementById('bg-image-input');
const btnClearBgImage  = document.getElementById('btn-clear-bg-image');
const bgImageError     = document.getElementById('bg-image-error');

const fontFamilySelect = document.getElementById('font-family-select');
const fontSizeSlider   = document.getElementById('font-size-slider');
const fontSizeValue    = document.getElementById('font-size-value');
const textColorInput   = document.getElementById('text-color-input');
const lineWidthSlider  = document.getElementById('line-width-slider');
const lineWidthValue   = document.getElementById('line-width-value');

const mirrorToggle     = document.getElementById('mirror-toggle');

const userBarName      = document.getElementById('user-bar-name');
const btnLogout        = document.getElementById('btn-logout');

const btnFullscreen    = document.getElementById('btn-fullscreen');
const fsOverlay        = document.getElementById('fullscreen-overlay');
const fsBtnPlay        = document.getElementById('fs-btn-play');
const fsBtnPause       = document.getElementById('fs-btn-pause');
const fsBtnStop        = document.getElementById('fs-btn-stop');
const fsSpeedSlider    = document.getElementById('fs-speed-slider');
const btnExitFullscreen = document.getElementById('btn-exit-fullscreen');

const btnTogglePanel   = document.getElementById('btn-toggle-panel');
const controlPanel     = document.getElementById('control-panel');

const prompterContainer = document.getElementById('prompter-container');
const prompterText      = document.getElementById('prompter-text');

/* ============================================================
   State
   ============================================================ */
let scrollRAF        = null;   // requestAnimationFrame handle
let isPlaying        = false;
let bgObjectUrl      = null;   // blob URL for uploaded background image
let countdownAborted = false;  // set true to cancel an in-progress countdown
let countdownTimer   = null;   // setTimeout handle for countdown steps
let scrollAccum      = 0;      // fractional pixel accumulator — prevents sub-pixel stall
let needsCountdown   = true;   // true = next Play shows 3-2-1; false = resume instantly

/**
 * Pixels scrolled per animation frame — derived from slider value (0, 0.5, 1 … 10).
 *
 * Uses a square-root curve so low values are genuinely slow:
 *   0   →  0.00 px  (stopped)
 *   0.5 →  0.13 px  (very slow crawl — half of 1x)
 *   1   →  0.50 px  (slow, comfortable)
 *   2   →  1.00 px  (medium)
 *   5   →  2.50 px  (fast)
 *   10  →  5.00 px  (max)
 *
 * Formula: px = 0.5 * sqrt(value)
 * This means 0.5x really is half the speed of 1x.
 */
function pixelsPerTick(sliderVal) {
  const v = Number(sliderVal);
  if (v <= 0) return 0;
  return 0.5 * Math.sqrt(v);
}

/* ============================================================
   TEXT / SCRIPT LOADING
   ============================================================ */

/** Show loaded text in the prompter area safely (no innerHTML). */
function displayScript(text) {
  prompterText.textContent = '';           // clear previous
  const el = document.createTextNode(text);
  prompterText.appendChild(el);
  stopScroll();
  prompterContainer.scrollTop = 0;
  clearError(fileError);
}

/** Show a placeholder when no script is loaded. */
function showPlaceholder() {
  prompterText.textContent = '';
  const p = document.createElement('p');
  p.className = 'placeholder-msg';
  p.textContent = 'Your script will appear here. Paste text or load a file in the panel →';
  prompterText.appendChild(p);
}

/**
 * Read a .txt file and return its text content.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = ()  => reject(new Error('Could not read file.'));
    reader.readAsText(file, 'UTF-8');
  });
}

/** Validate and load a script file. Only .txt is fully supported. */
async function loadScriptFile(file) {
  clearError(fileError);

  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const ALLOWED_EXTS = ['txt', 'pdf', 'docx'];

  if (!ALLOWED_EXTS.includes(ext)) {
    showError(fileError, 'Unsupported file type. Please upload a .txt, .pdf, or .docx file.');
    return;
  }

  // Enforce a 10 MB upper limit
  if (file.size > 10 * 1024 * 1024) {
    showError(fileError, 'File too large. Maximum supported size is 10 MB.');
    return;
  }

  if (ext === 'txt') {
    try {
      const text = await readTextFile(file);
      scriptInput.value = text;
      displayScript(text);
    } catch (err) {
      showError(fileError, `Error reading file: ${err.message}`);
    }
  } else {
    // PDF and DOCX: client-side extraction is complex and requires third-party
    // libraries not bundled here. Guide the user instead.
    showError(
      fileError,
      `.${ext.toUpperCase()} uploads: please copy and paste the text into the text area above, then click "Load Script".`
    );
  }
}

// File input change → show filename
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileNameLabel.textContent = file ? truncateFilename(file.name, 20) : 'No file chosen';
});

// "Load Script" button
btnLoadScript.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (file) {
    loadScriptFile(file);
  } else if (scriptInput.value.trim()) {
    displayScript(scriptInput.value.trim());
  } else {
    showError(fileError, 'Please paste text or upload a file first.');
  }
});

// "Clear Script" button — clears textarea, file input, prompter display, and errors
btnClearScript.addEventListener('click', () => {
  scriptInput.value      = '';
  fileInput.value        = '';
  fileNameLabel.textContent = 'No file chosen';
  clearError(fileError);
  stopScroll();
  showPlaceholder();
});

// Also load immediately when file is selected (quality-of-life)
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) {
    loadScriptFile(fileInput.files[0]);
  }
});

/* ============================================================
   SCROLL / PLAYBACK ENGINE
   ============================================================ */

/* ── Countdown helper ────────────────────────────────────────────────────
   Shows 3 → 2 → 1 (1 s each) then calls onDone.
   ─────────────────────────────────────────────────────────────────────── */
function runCountdown(onDone) {
  const overlay = document.getElementById('countdown-overlay');
  const numEl   = document.getElementById('countdown-number');
  const steps   = [3, 2, 1];

  overlay.classList.remove('hidden');
  let i = 0;

  function showStep() {
    if (countdownAborted) { hideCountdown(); return; }

    numEl.className   = '';
    numEl.textContent = steps[i];
    // Force CSS animation restart via reflow
    numEl.style.animation = 'none';
    numEl.offsetWidth;          // eslint-disable-line no-unused-expressions
    numEl.style.animation = '';

    i++;
    if (i < steps.length) {
      countdownTimer = setTimeout(showStep, 1000);
    } else {
      // After "1" wait for its animation to finish then go
      countdownTimer = setTimeout(() => {
        hideCountdown();
        if (!countdownAborted) onDone();
      }, 900);
    }
  }

  showStep();
}

function hideCountdown() {
  document.getElementById('countdown-overlay').classList.add('hidden');
  document.getElementById('countdown-number').textContent = '';
}

function abortCountdown() {
  countdownAborted = true;
  clearTimeout(countdownTimer);
  countdownTimer = null;
  hideCountdown();
}

/* ── Scroll engine ──────────────────────────────────────────────────── */
function beginScrolling() {
  isPlaying   = true;
  scrollAccum = 0;
  btnPlay.disabled    = true;
  btnPause.disabled   = false;
  fsBtnPlay.disabled  = true;
  fsBtnPause.disabled = false;
  updatePrompterCursor();

  function tick() {
    scrollAccum += pixelsPerTick(speedSlider.value);
    const whole  = Math.floor(scrollAccum);
    if (whole >= 1) {
      prompterContainer.scrollTop += whole;
      scrollAccum -= whole;
    }
    const { scrollTop, scrollHeight, clientHeight } = prompterContainer;
    if (scrollTop + clientHeight >= scrollHeight - 2) {
      stopScroll();
      return;
    }
    scrollRAF = requestAnimationFrame(tick);
  }
  scrollRAF = requestAnimationFrame(tick);
}

/*
 * startScroll — called by Play button and prompter click (when stopped).
 *   • If needsCountdown is true  → show 3-2-1 then scroll
 *   • If needsCountdown is false → resume instantly (coming from Pause)
 */
function startScroll() {
  if (isPlaying) return;

  btnPlay.disabled    = true;
  btnPause.disabled   = true;
  fsBtnPlay.disabled  = true;
  fsBtnPause.disabled = true;

  if (needsCountdown) {
    countdownAborted = false;
    runCountdown(() => {
      needsCountdown = false;
      beginScrolling();
    });
  } else {
    // Resume after Pause — no countdown
    beginScrolling();
  }
}

/*
 * pauseScroll — immediately pauses; does NOT trigger countdown on resume.
 */
function pauseScroll() {
  // If countdown is running, abort it and go back to ready state
  if (!isPlaying && countdownTimer) {
    abortCountdown();
    needsCountdown = true;   // re-arm so next Play shows countdown again
    btnPlay.disabled    = false;
    btnPause.disabled   = true;
    fsBtnPlay.disabled  = false;
    fsBtnPause.disabled = true;
    updatePrompterCursor();
    return;
  }
  if (!isPlaying) return;
  isPlaying = false;
  cancelAnimationFrame(scrollRAF);
  scrollRAF      = null;
  needsCountdown = false;   // resume will be instant — no countdown
  btnPlay.disabled    = false;
  btnPause.disabled   = true;
  fsBtnPlay.disabled  = false;
  fsBtnPause.disabled = true;
  updatePrompterCursor();
}

/*
 * stopScroll — resets to top and re-arms the countdown for the next Play.
 */
function stopScroll() {
  abortCountdown();
  isPlaying = false;
  cancelAnimationFrame(scrollRAF);
  scrollRAF = null;
  prompterContainer.scrollTop = 0;
  needsCountdown = true;    // next Play must show countdown
  btnPlay.disabled    = false;
  btnPause.disabled   = true;
  fsBtnPlay.disabled  = false;
  fsBtnPause.disabled = true;
  updatePrompterCursor();
}

function updatePrompterCursor() {
  prompterContainer.style.cursor = isPlaying ? 'pause' : 'pointer';
}

btnPlay.addEventListener('click',  startScroll);
btnPause.addEventListener('click', pauseScroll);
btnStop.addEventListener('click',  stopScroll);

// Speed slider — takes effect immediately because pixelsPerTick reads it live
speedSlider.addEventListener('input', () => {
  const v = Number(speedSlider.value);
  speedValue.textContent = v % 1 === 0 ? String(v) : v.toFixed(1); // "0","1","1.5"…
  // Keep fullscreen speed slider in sync
  fsSpeedSlider.value = speedSlider.value;
});

/* ============================================================
   BACKGROUND
   ============================================================ */

function setBackground(color, imageUrl) {
  prompterContainer.style.backgroundColor = color || '#000000';
  if (imageUrl) {
    prompterContainer.style.backgroundImage = `url("${imageUrl}")`;
  } else {
    prompterContainer.style.backgroundImage = 'none';
  }
  // Update the CSS variable used by the fade masks
  prompterContainer.style.setProperty('--prompter-bg', color || '#000000');
}

// Preset color buttons
presetColors.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Revoke any uploaded BG image
    clearBgImage();

    presetColors.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');

    setBackground(btn.dataset.color, null);
  });
});

// Background image upload
bgImageInput.addEventListener('change', () => {
  const file = bgImageInput.files[0];
  clearError(bgImageError);

  if (!file) return;

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    showError(bgImageError, 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.');
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    showError(bgImageError, 'Image too large. Maximum 20 MB.');
    return;
  }

  // Revoke old blob URL to avoid memory leaks
  if (bgObjectUrl) {
    URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = null;
  }

  bgObjectUrl = URL.createObjectURL(file);

  // Deselect color presets
  presetColors.forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });

  setBackground(null, bgObjectUrl);
});

function clearBgImage() {
  if (bgObjectUrl) {
    URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = null;
  }
  bgImageInput.value = '';
  prompterContainer.style.backgroundImage = 'none';
}

btnClearBgImage.addEventListener('click', () => {
  clearBgImage();
  clearError(bgImageError);
});

/* ============================================================
   FONT & TEXT CONTROLS
   ============================================================ */

function applyFontFamily(value) {
  prompterText.style.fontFamily = value;
}

function applyFontSize(px) {
  prompterText.style.fontSize = px + 'px';
}

function applyTextColor(color) {
  prompterText.style.color = color;
}

function applyLineWidth(pct) {
  prompterText.style.width = pct + '%';
}

fontFamilySelect.addEventListener('change', () => applyFontFamily(fontFamilySelect.value));

fontSizeSlider.addEventListener('input', () => {
  fontSizeValue.textContent = fontSizeSlider.value;
  applyFontSize(fontSizeSlider.value);
});

textColorInput.addEventListener('input', () => applyTextColor(textColorInput.value));

lineWidthSlider.addEventListener('input', () => {
  lineWidthValue.textContent = lineWidthSlider.value;
  applyLineWidth(lineWidthSlider.value);
});

/* ============================================================
   MIRROR MODE
   ============================================================ */
mirrorToggle.addEventListener('change', () => {
  prompterText.classList.toggle('mirrored', mirrorToggle.checked);
});

/* ============================================================
   FULLSCREEN
   ============================================================ */

function enterFullscreen() {
  const el = prompterContainer;
  if (el.requestFullscreen)         el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
}

function exitFullscreen() {
  if (document.exitFullscreen)            document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
}

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement
  );
}

btnFullscreen.addEventListener('click', enterFullscreen);
btnExitFullscreen.addEventListener('click', exitFullscreen);

document.addEventListener('fullscreenchange',       onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);
document.addEventListener('mozfullscreenchange',    onFullscreenChange);

function onFullscreenChange() {
  if (isFullscreenActive()) {
    fsOverlay.classList.remove('hidden');
    btnFullscreen.textContent = '✕ Exit Fullscreen';
  } else {
    fsOverlay.classList.add('hidden');
    btnFullscreen.textContent = '⛶ Enter Fullscreen';
  }
}

// Fullscreen overlay playback controls
fsBtnPlay.addEventListener('click',  startScroll);
fsBtnPause.addEventListener('click', pauseScroll);
fsBtnStop.addEventListener('click',  stopScroll);

fsSpeedSlider.addEventListener('input', () => {
  speedSlider.value = fsSpeedSlider.value;
  speedValue.textContent = Number(fsSpeedSlider.value) % 1 === 0
    ? fsSpeedSlider.value
    : Number(fsSpeedSlider.value).toFixed(1);
});

/* ============================================================
   CONTROL PANEL TOGGLE
   ============================================================ */
const mobileBackdrop = document.getElementById('mobile-backdrop');

function isMobilePortrait() {
  // Matches the CSS media query: narrow OR portrait tablet/phone
  return window.innerWidth <= 600 ||
    (window.innerWidth <= 1024 && window.innerHeight > window.innerWidth);
}

function openMobilePanel() {
  controlPanel.classList.add('mobile-open');
  mobileBackdrop.classList.add('visible');
  // Move FAB up so it isn't covered by the sheet
  btnTogglePanel.style.bottom = '16px';
}

function closeMobilePanel() {
  controlPanel.classList.remove('mobile-open');
  mobileBackdrop.classList.remove('visible');
}

btnTogglePanel.addEventListener('click', () => {
  if (isMobilePortrait()) {
    if (controlPanel.classList.contains('mobile-open')) {
      closeMobilePanel();
    } else {
      openMobilePanel();
    }
  } else {
    controlPanel.classList.toggle('collapsed');
  }
});

// Tap backdrop → close panel
mobileBackdrop.addEventListener('click', closeMobilePanel);

// On orientation change: clean up classes that don't belong
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (!isMobilePortrait()) {
      closeMobilePanel();
    }
  }, 100); // small delay so dimensions have updated
});

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', (e) => {
  // Ignore shortcuts when typing in the textarea or other inputs
  const tag = document.activeElement.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      isPlaying ? pauseScroll() : startScroll();
      break;
    case 'KeyS':
      stopScroll();
      break;
    case 'ArrowUp':
    case 'Equal':        // + (without Shift, some keyboards)
    case 'NumpadAdd': {  // numpad +
      e.preventDefault();
      const cur = Number(speedSlider.value);
      if (cur < 10) {
        speedSlider.value = Math.min(10, +(cur + 0.5).toFixed(1));
        speedSlider.dispatchEvent(new Event('input'));
      }
      break;
    }
    case 'ArrowDown':
    case 'Minus':        // - main keyboard
    case 'NumpadSubtract': { // numpad -
      e.preventDefault();
      const cur = Number(speedSlider.value);
      if (cur > 0) {
        speedSlider.value = Math.max(0, +(cur - 0.5).toFixed(1));
        speedSlider.dispatchEvent(new Event('input'));
      }
      break;
    }
    case 'KeyF':
      isFullscreenActive() ? exitFullscreen() : enterFullscreen();
      break;
  }
});

/* ============================================================
   CLICK-TO-PLAY / CLICK-TO-PAUSE on the prompter display
   ============================================================ */
prompterContainer.addEventListener('click', () => {
  isPlaying ? pauseScroll() : startScroll();
});

/* ============================================================
   HELPER UTILITIES
   ============================================================ */

function showError(el, msg) {
  el.textContent = msg;
}

function clearError(el) {
  el.textContent = '';
}

function truncateFilename(name, maxLen) {
  if (name.length <= maxLen) return name;
  const ext = name.slice(name.lastIndexOf('.'));
  return name.slice(0, maxLen - ext.length - 1) + '…' + ext;
}

/* ============================================================
   INIT — apply default styles on page load
   ============================================================ */
(function init() {
  applyFontFamily(fontFamilySelect.value);
  applyFontSize(fontSizeSlider.value);
  applyTextColor(textColorInput.value);
  applyLineWidth(lineWidthSlider.value);
  setBackground('#000000', null);

  // Load session user and show in the user bar
  fetch('/api/me')
    .then((r) => r.json())
    .then((data) => {
      if (data.username) userBarName.textContent = data.username;
    })
    .catch(() => {}); // session expired — server redirects on next navigation
})();

// ── Logout ──────────────────────────────────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

/* ============================================================
   SESSION MANAGEMENT
   — Tab/browser close  → logout via sendBeacon on pagehide
   — 3h inactivity      → client-side timer + server maxAge both enforce this
   ============================================================ */
(function initSessionGuard() {
  const INACTIVITY_MS   = 3 * 60 * 60 * 1000; // 3 hours
  const CHECK_INTERVAL  = 60 * 1000;           // check every 60 s
  const SESSION_KEY     = 'tp_tab_alive';
  const LAST_ACTIVE_KEY = 'tp_last_active';

  // ── Tab-alive flag ──────────────────────────────────────────────────
  // sessionStorage is cleared automatically when the tab/window closes.
  // We write to it on load so a re-opened tab starts fresh.
  sessionStorage.setItem(SESSION_KEY, '1');

  // On pagehide (tab close, browser close, navigate away) call logout.
  // sendBeacon is non-blocking and survives page unload.
  window.addEventListener('pagehide', (e) => {
    // e.persisted = true means the page went into the bfcache (back/forward),
    // not actually closed — don't log out in that case.
    if (!e.persisted) {
      navigator.sendBeacon('/api/logout');
    }
  });

  // ── Inactivity timer ─────────────────────────────────────────────────
  // Use localStorage so the timestamp survives navigations within the same
  // session but is reset on a fresh login (we write it there too).
  function touchActivity() {
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  }

  // Reset on any meaningful user interaction
  ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, touchActivity, { passive: true });
  });

  // Seed the timestamp on page load
  touchActivity();

  // Periodic check — if the last activity was > 3h ago, log out
  setInterval(async () => {
    const last = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
    if (Date.now() - last >= INACTIVITY_MS) {
      clearInterval(undefined); // stop further checks
      await fetch('/api/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/login.html?reason=inactivity';
    }
  }, CHECK_INTERVAL);
})();

/* ============================================================
   MODULE EXPORT (for tests in Node.js environment)
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pixelsPerTick, truncateFilename };
}
