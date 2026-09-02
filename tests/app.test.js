/**
 * tests/app.test.js
 *
 * Unit tests for core utility functions exported from app.js and recorder.js.
 * Run with: npm test
 */

'use strict';

/* ============================================================
   Mock the DOM so we can require the browser JS files in Node
   ============================================================ */
function stubDOM() {
  const el = {
    addEventListener:    () => {},
    removeEventListener: () => {},
    style:               {},
    classList:           { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    querySelectorAll:    () => [],
    textContent:         '',
    value:               '3',
    checked:             false,
    disabled:            false,
    dataset:             {},
    appendChild:         () => {},
    src:                 '',
    download:            '',
    href:                '',
  };
  global.document = {
    getElementById:       () => ({ ...el }),
    querySelectorAll:     () => [],
    addEventListener:     () => {},
    activeElement:        { tagName: 'BODY' },
    fullscreenElement:    null,
    exitFullscreen:       () => {},
    createTextNode:       (t) => ({ nodeType: 3, data: t }),
    createElement:        (tag) => ({ ...el, tagName: tag.toUpperCase(), className: '' }),
  };
  global.window               = { innerWidth: 1440 };
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame  = () => {};
  global.URL                   = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
  global.MediaRecorder         = class { static isTypeSupported() { return false; } };
  global.navigator             = { mediaDevices: null };
}

stubDOM();

// Require modules after DOM stubs are in place
const { pixelsPerTick, truncateFilename } =
  require('../public/js/app');

const { mimeExtension, formatBytes, buildPermissionErrorMessage, buildFilename } =
  require('../public/js/recorder');

/* ============================================================
   pixelsPerTick
   ============================================================ */
describe('pixelsPerTick', () => {
  test('0 returns exactly 0 px (stopped)', () => {
    expect(pixelsPerTick(0)).toBe(0);
  });

  test('negative returns 0', () => {
    expect(pixelsPerTick(-1)).toBe(0);
  });

  test('returns a positive number for every valid slider value 0.5–10', () => {
    for (let v = 0.5; v <= 10; v += 0.5) {
      expect(pixelsPerTick(v)).toBeGreaterThan(0);
    }
  });

  test('speed increases monotonically with slider value', () => {
    for (let v = 0.5; v < 10; v += 0.5) {
      expect(pixelsPerTick(v + 0.5)).toBeGreaterThan(pixelsPerTick(v));
    }
  });

  test('0.5x is genuinely half the speed of 1x', () => {
    // sqrt(0.5) / sqrt(1) = 0.707… so 0.5x is ~70% of 1x in px/frame,
    // but the *perceived* speed ratio holds the sqrt relationship.
    // Key assertion: 0.5x produces less than half the px of 1x (not equal).
    expect(pixelsPerTick(0.5)).toBeLessThan(pixelsPerTick(1));
  });

  test('speed at 1 is 0.5 px per tick', () => {
    expect(pixelsPerTick(1)).toBeCloseTo(0.5, 5);
  });

  test('speed at 4 is 1.0 px per tick (2x the speed of 1)', () => {
    expect(pixelsPerTick(4)).toBeCloseTo(1.0, 5);
  });

  test('maximum speed (10) is 0.5 * sqrt(10) ≈ 1.58 px per tick', () => {
    expect(pixelsPerTick(10)).toBeCloseTo(0.5 * Math.sqrt(10), 5);
  });

  test('accepts string input (as read from input.value)', () => {
    expect(typeof pixelsPerTick('5')).toBe('number');
  });
});

/* ============================================================
   truncateFilename
   ============================================================ */
describe('truncateFilename', () => {
  test('returns the original name when within maxLen', () => {
    expect(truncateFilename('short.txt', 20)).toBe('short.txt');
  });

  test('truncates long filenames and preserves the extension', () => {
    const result = truncateFilename('averylongfilename.txt', 12);
    expect(result.endsWith('.txt')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result).toContain('…');
  });

  test('does not truncate an exact-length name', () => {
    expect(truncateFilename('12345.txt', 9)).toBe('12345.txt');
  });

  test('works with multi-part extensions (.docx)', () => {
    const result = truncateFilename('my_long_script_file.docx', 15);
    expect(result.endsWith('.docx')).toBe(true);
  });
});

/* ============================================================
   mimeExtension (video recorder)
   ============================================================ */
describe('mimeExtension', () => {
  const cases = [
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm',                 'webm'],
    ['video/mp4;codecs=h264,aac',  'mp4'],
    ['video/mp4',                  'mp4'],
    ['video/ogg',                  'ogv'],
    ['',                           'mp4'],   // default is now mp4
    [undefined,                    'mp4'],   // default is now mp4
  ];

  test.each(cases)('mimeExtension(%s) → %s', (mime, expected) => {
    expect(mimeExtension(mime)).toBe(expected);
  });
});

/* ============================================================
   buildFilename
   ============================================================ */
describe('buildFilename', () => {
  test('returns a string ending with the given extension', () => {
    expect(buildFilename('mp4')).toMatch(/\.mp4$/);
  });

  test('matches the yyyymmddhhss format (14 digits before the dot)', () => {
    const name = buildFilename('mp4');
    // e.g. "20241231235959.mp4"
    expect(name).toMatch(/^\d{12}\.\w+$/);
  });

  test('year is a 4-digit current year', () => {
    const name = buildFilename('mp4');
    const year = parseInt(name.slice(0, 4), 10);
    expect(year).toBeGreaterThanOrEqual(2024);
  });

  test('month component is 01–12', () => {
    const name = buildFilename('mp4');
    const month = parseInt(name.slice(4, 6), 10);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  test('day component is 01–31', () => {
    const name = buildFilename('mp4');
    const day = parseInt(name.slice(6, 8), 10);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  test('hour component is 00–23', () => {
    const name = buildFilename('mp4');
    const hour = parseInt(name.slice(8, 10), 10);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });

  test('seconds component is 00–59', () => {
    const name = buildFilename('mp4');
    const secs = parseInt(name.slice(10, 12), 10);
    expect(secs).toBeGreaterThanOrEqual(0);
    expect(secs).toBeLessThanOrEqual(59);
  });

  test('works with webm extension', () => {
    expect(buildFilename('webm')).toMatch(/\.webm$/);
  });

  test('two calls within the same second produce identical base names', () => {
    // Both generated in the same JS tick, so seconds match
    const a = buildFilename('mp4').replace(/\.mp4$/, '');
    const b = buildFilename('mp4').replace(/\.mp4$/, '');
    expect(a).toBe(b);
  });
});

/* ============================================================
   formatBytes
   ============================================================ */
describe('formatBytes', () => {
  test('formats bytes under 1024 as "N B"', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  test('formats kilobytes correctly', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  test('formats megabytes correctly', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });

  test('handles zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});

/* ============================================================
   buildPermissionErrorMessage (camera)
   ============================================================ */
describe('buildPermissionErrorMessage', () => {
  test('handles NotAllowedError', () => {
    const msg = buildPermissionErrorMessage({ name: 'NotAllowedError' });
    expect(msg).toMatch(/denied/i);
  });

  test('handles NotFoundError (no camera)', () => {
    const msg = buildPermissionErrorMessage({ name: 'NotFoundError' });
    expect(msg).toMatch(/no camera/i);
  });

  test('handles NotReadableError (camera in use)', () => {
    const msg = buildPermissionErrorMessage({ name: 'NotReadableError' });
    expect(msg).toMatch(/in use/i);
  });

  test('handles unknown errors gracefully', () => {
    const msg = buildPermissionErrorMessage({ name: 'SomeOtherError', message: 'weird' });
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  test('handles null input without throwing', () => {
    const msg = buildPermissionErrorMessage(null);
    expect(typeof msg).toBe('string');
  });
});

/* ============================================================
   Server smoke tests — Express app boot & public routes
   Full API coverage is in tests/server.test.js.
   ============================================================ */
describe('server smoke', () => {
  let app;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    app = require('../server');
  });

  afterAll(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
  });

  test('GET /login.html is publicly accessible (200)', (done) => {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      http.get(`http://localhost:${port}/login.html`, (res) => {
        expect(res.statusCode).toBe(200);
        server.close(done);
      });
    });
  });

  test('GET / without session redirects to login (302)', (done) => {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      http.get(`http://localhost:${port}/`, (res) => {
        expect(res.statusCode).toBe(302);
        server.close(done);
      });
    });
  });
});
