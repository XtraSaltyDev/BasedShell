const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SettingsService } = require('../dist/main/settings.js');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basedshell-settings-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('settings defaults include split ratio memory keys', () => {
  withTempDir((dir) => {
    const service = new SettingsService(dir);
    const settings = service.get();
    assert.equal(settings.ui.lastVerticalSplitRatio, null);
    assert.equal(settings.ui.lastHorizontalSplitRatio, null);
  });
});

test('settings sanitize split ratio memory and clamp ranges', () => {
  withTempDir((dir) => {
    const service = new SettingsService(dir);
    const clamped = service.update({
      ui: {
        lastVerticalSplitRatio: 0.01,
        lastHorizontalSplitRatio: 0.99
      }
    });
    assert.equal(clamped.ui.lastVerticalSplitRatio, 0.15);
    assert.equal(clamped.ui.lastHorizontalSplitRatio, 0.85);

    const sanitized = service.update({
      ui: {
        // Intentionally invalid values to verify fallback to null.
        lastVerticalSplitRatio: /** @type {any} */ ('not-a-number'),
        lastHorizontalSplitRatio: /** @type {any} */ (Number.NaN)
      }
    });
    assert.equal(sanitized.ui.lastVerticalSplitRatio, null);
    assert.equal(sanitized.ui.lastHorizontalSplitRatio, null);
  });
});
