import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromePath } from '../plugins/brand-film/skills/brand-film/template/lib/stage.mjs';

test('chromePath: CHROME_PATH first, then an installed Chrome or Chromium, then Playwright\'s own', () => {
  const none = () => false;
  assert.equal(chromePath({ env: { CHROME_PATH: '/opt/chrome' }, platform: 'linux', exists: none }), '/opt/chrome');
  assert.equal(chromePath({ env: {}, platform: 'linux', exists: (p) => p === '/usr/bin/chromium' }), '/usr/bin/chromium');
  assert.equal(chromePath({ env: {}, platform: 'linux', exists: () => true }), '/usr/bin/google-chrome');
  assert.equal(chromePath({ env: {}, platform: 'darwin', exists: none }), undefined);
  assert.equal(chromePath({ env: {}, platform: 'aix', exists: () => true }), undefined);
});
