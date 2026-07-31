'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],   // inline styles used by dynamic theming
        imgSrc: ["'self'", 'data:', 'blob:'],       // blob: needed for uploaded background images
        mediaSrc: ["'self'", 'blob:'],              // blob: needed for audio playback/download
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

// Disable X-Powered-By (already handled by helmet, but explicit for clarity)
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
app.use(
  express.static(path.join(__dirname, 'public'), {
    // Cache static assets for 1 hour in production
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  })
);

// ---------------------------------------------------------------------------
// Catch-all — serve index.html for any unmatched route (SPA-style)
// ---------------------------------------------------------------------------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Teleprompter server running on http://localhost:${PORT}`);
});

module.exports = app; // exported for testing
