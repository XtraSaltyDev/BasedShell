const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeRuntimeEnv } = require('../dist/main/session-manager.js');

test('sanitizeRuntimeEnv strips npm and shell session variables while preserving normal env', () => {
  const input = {
    PATH: '/usr/bin:/bin',
    HOME: '/Users/tester',
    LANG: 'en_US.UTF-8',
    npm_config_prefix: '/opt/homebrew',
    npm_package_name: 'basedshell',
    npm_lifecycle_event: 'dev',
    SHELL_SESSION_DIR: '/tmp/shell-session',
    SHELL_SESSION_HISTORY: '1',
    SHELL_SESSION_TEST: 'abc',
    TERM_SESSION_ID: 'w0t1p0:ABC',
    TERM_PROGRAM: 'Apple_Terminal',
    TERM_PROGRAM_VERSION: '457',
    CUSTOM_FLAG: 'true'
  };

  const sanitized = sanitizeRuntimeEnv(input);

  assert.equal(sanitized.PATH, '/usr/bin:/bin');
  assert.equal(sanitized.HOME, '/Users/tester');
  assert.equal(sanitized.LANG, 'en_US.UTF-8');
  assert.equal(sanitized.CUSTOM_FLAG, 'true');

  assert.equal('npm_config_prefix' in sanitized, false);
  assert.equal('npm_package_name' in sanitized, false);
  assert.equal('npm_lifecycle_event' in sanitized, false);
  assert.equal('SHELL_SESSION_DIR' in sanitized, false);
  assert.equal('SHELL_SESSION_HISTORY' in sanitized, false);
  assert.equal('SHELL_SESSION_TEST' in sanitized, false);
  assert.equal('TERM_SESSION_ID' in sanitized, false);
  assert.equal('TERM_PROGRAM' in sanitized, false);
  assert.equal('TERM_PROGRAM_VERSION' in sanitized, false);
});
