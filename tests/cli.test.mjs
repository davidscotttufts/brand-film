// lint.mjs and tokens.mjs, run as a film folder runs them: no API, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEMPLATE } from '../scripts/sync-example.mjs';

function film(edit = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bf-'));
  cpSync(TEMPLATE, dir, { recursive: true });
  for (const [file, fn] of Object.entries(edit)) {
    const p = join(dir, file);
    writeFileSync(p, JSON.stringify(fn(JSON.parse(readFileSync(p, 'utf8'))), null, 1));
  }
  return dir;
}
const run = (dir, script, ...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });

test('the template passes tokens and lint', () => {
  const dir = film();
  assert.equal(run(dir, 'tokens.mjs').status, 0);
  const r = run(dir, 'lint.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('lint fails on an overlapping window, a long sentence and a leading acronym', () => {
  const dir = film({
    'narration.json': (n) => {
      n.takes[0].until = n.takes[1].at + 1;
      n.takes[1].text = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen.';
      n.takes[2].speak = 'A P I keys leak.'; delete n.takes[2].text; delete n.takes[2].anchors;
      return n;
    },
  });
  run(dir, 'tokens.mjs');
  const r = run(dir, 'lint.mjs');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /after b-start starts/);
  assert.match(r.stderr, /19 words/);
  assert.match(r.stderr, /spelled acronym/);
});

test('lint warns about digits the lexicon does not cover', () => {
  const dir = film({ 'narration.json': (n) => { n.takes[0].text = 'Founded in 2019.'; return n; } });
  run(dir, 'tokens.mjs');
  assert.match(run(dir, 'lint.mjs').stdout, /"2019" is sent as digits/);
});

test('tokens fails on a contrast pair under 3:1 and on a broken lexicon rule', () => {
  const dir = film({
    'brand-tokens.json': (b) => {
      b.video = { color: { 'stage-muted': '#2a2c30' } };
      b.brand.pronunciations.push({ written: 'x', spoken: '' });
      return b;
    },
  });
  const r = run(dir, 'tokens.mjs');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stage-muted on stage is .* under 3:1/);
  assert.match(r.stderr, /"spoken" is empty/);
});

test('tokens --check fails on a stale css', () => {
  const dir = film();
  run(dir, 'tokens.mjs');
  writeFileSync(join(dir, 'brand-tokens.css'), '/* edited */');
  assert.equal(run(dir, 'tokens.mjs', '--check').status, 1);
});
