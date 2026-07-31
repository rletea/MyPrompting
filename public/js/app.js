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
let scrollRAF      = null;   // requestAnimationFrame handle
let isPlaying      = false;
let bgObjectUrl    = null;   // blob URL for uploaded background image

/** Pixels scrolled per animation tick — derived from slider value (1, 1.5, 2 … 10). */
function pixelsPerTick(sliderVal) {
  // Linear mapping: 1x → 0.4 px/tick, each +0.5 step adds 0.2 px
  return 0.4 + (Number(sliderVal) - 1) * 0.4;
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

function startScroll() {
  if (isPlaying) return;
  isPlaying = true;
  btnPlay.disabled  = true;
  btnPause.disabled = false;
  fsBtnPlay.disabled  = true;
  fsBtnPause.disabled = false;

  function tick() {
    const px = pixelsPerTick(speedSlider.value);
    prompterContainer.scrollTop += px;

    // Auto-stop when reaching the bottom
    const { scrollTop, scrollHeight, clientHeight } = prompterContainer;
    if (scrollTop + clientHeight >= scrollHeight - 2) {
      stopScroll();
      return;
    }

    scrollRAF = requestAnimationFrame(tick);
  }

  scrollRAF = requestAnimationFrame(tick);
}

function pauseScroll() {
  if (!isPlaying) return;
  isPlaying = false;
  cancelAnimationFrame(scrollRAF);
  scrollRAF = null;
  btnPlay.disabled  = false;
  btnPause.disabled = true;
  fsBtnPlay.disabled  = false;
  fsBtnPause.disabled = true;
}

function stopScroll() {
  isPlaying = false;
  cancelAnimationFrame(scrollRAF);
  scrollRAF = null;
  prompterContainer.scrollTop = 0;
  btnPlay.disabled  = false;
  btnPause.disabled = true;
  fsBtnPlay.disabled  = false;
  fsBtnPause.disabled = true;
}

btnPlay.addEventListener('click',  startScroll);
btnPause.addEventListener('click', pauseScroll);
btnStop.addEventListener('click',  stopScroll);

// Speed slider — takes effect immediately because pixelsPerTick reads it live
speedSlider.addEventListener('input', () => {
  speedValue.textContent = Number(speedSlider.value) % 1 === 0
    ? speedSlider.value           // e.g. "2"
    : Number(speedSlider.value).toFixed(1);  // e.g. "1.5"
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
btnTogglePanel.addEventListener('click', () => {
  const isMobile = window.innerWidth <= 600;
  if (isMobile) {
    controlPanel.classList.toggle('mobile-open');
  } else {
    controlPanel.classList.toggle('collapsed');
  }
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
      e.preventDefault();
      if (Number(speedSlider.value) > 1) {
        speedSlider.value = Number(speedSlider.value) - 1;
        speedSlider.dispatchEvent(new Event('input'));
      }
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (Number(speedSlider.value) < 10) {
        speedSlider.value = Number(speedSlider.value) + 1;
        speedSlider.dispatchEvent(new Event('input'));
      }
      break;
    case 'KeyF':
      isFullscreenActive() ? exitFullscreen() : enterFullscreen();
      break;
  }
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
})();

/* ============================================================
   MODULE EXPORT (for tests in Node.js environment)
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pixelsPerTick, truncateFilename };
}
