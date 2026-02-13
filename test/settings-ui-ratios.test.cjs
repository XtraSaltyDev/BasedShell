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
    assert.equal(settings.promptStyle, 'system');
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

test('settings sanitize prompt style values', () => {
  withTempDir((dir) => {
    const service = new SettingsService(dir);
    const minimal = service.update({
      promptStyle: 'minimal'
    });
    assert.equal(minimal.promptStyle, 'minimal');

    const sanitized = service.update({
      promptStyle: /** @type {any} */ ('invalid')
    });
    assert.equal(sanitized.promptStyle, 'system');
  });
});

test('settings migration defaults prompt style for legacy files', () => {
  withTempDir((dir) => {
    const legacySettings = {
      schemaVersion: 3,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
      lineHeight: 1.35,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 20000,
      backgroundOpacity: 0.92,
      theme: 'graphite',
      appearancePreference: 'system',
      vibrancy: false,
      ui: {
        lastVerticalSplitRatio: null,
        lastHorizontalSplitRatio: null
      },
      profiles: [
        {
          id: 'default',
          name: 'Default Shell',
          shell: process.env.SHELL || '/bin/zsh',
          args: ['-l'],
          cwd: process.env.HOME || '/',
          env: {}
        }
      ],
      defaultProfileId: 'default'
    };

    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(legacySettings), 'utf8');
    const service = new SettingsService(dir);
    const settings = service.get();
    assert.equal(settings.schemaVersion, 4);
    assert.equal(settings.promptStyle, 'system');
  });
});
