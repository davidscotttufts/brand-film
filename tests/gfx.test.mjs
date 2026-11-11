// The graphics kit's pure helpers, loaded the way a scene loads it (a plain script).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../plugins/brand-film/skills/brand-film/template/lib/gfx.js', import.meta.url), 'utf8'), ctx);
const G = ctx.GFX;

test('a counter lands on its value and formats it', () => {
  assert.equal(G.counter(0, 1, 2, 1204), '0');
  assert.equal(G.counter(5, 1, 2, 1204), '1,204');
  assert.equal(G.counter(5, 1, 2, 4.2, { decimals: 1, prefix: '$', suffix: 'M' }), '$4.2M');
  const mid = Number(G.counter(1.5, 1, 2, 100));
  assert.ok(mid > 50 && mid < 100, `ease-out passes halfway early (${mid})`);
});

test('typing is a pure function of time', () => {
  assert.equal(G.typed('gorilla', 0.9, 1, 10), '');
  assert.equal(G.typed('gorilla', 1.3, 1, 10), 'gor');
  assert.equal(G.typed('gorilla', 9, 1, 10), 'gorilla');
  assert.equal(G.caret(0.2), true);
  assert.equal(G.caret(0.7), false);
});

test('a clip holds its first frame, plays, then holds its last (or loops)', () => {
  assert.equal(G.clipFrame(0, 2, 90, 30), 0);
  assert.equal(G.clipFrame(3, 2, 90, 30), 30);
  assert.equal(G.clipFrame(60, 2, 90, 30), 89);
  assert.equal(G.clipFrame(5.5, 2, 90, 30, { loop: true }), 15);
  assert.equal(G.clipFrame(3, 2, 90, 30, { rate: 0.5 }), 15);
});
