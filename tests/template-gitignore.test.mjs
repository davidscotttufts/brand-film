// The template's .gitignore decides what a film folder commits. Checked with
// git itself (check-ignore), inside a parent repository that ignores lib/ the
// way many projects do, so a rule that git would not honour fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '..', 'plugins', 'brand-film', 'skills', 'brand-film', 'template');

function ignored(paths) {
  const repo = mkdtempSync(join(tmpdir(), 'bf-gitignore-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, '.gitignore'), 'lib/\n');
    const film = join(repo, 'film');
    mkdirSync(film);
    copyFileSync(join(template, '.gitignore'), join(film, '.gitignore'));
    const out = {};
    for (const p of paths) {
      mkdirSync(dirname(join(film, p)), { recursive: true });
      writeFileSync(join(film, p), '');
      out[p] = spawnSync('git', ['check-ignore', '-q', join('film', p)], { cwd: repo }).status === 0;
    }
    return out;
  } finally { rmSync(repo, { recursive: true, force: true }); }
}

test('a film folder commits its final audio and its lib/, and ignores what is free to rebuild', () => {
  const r = ignored([
    'narration/a-open.0123456789ab.mp3', 'narration/a-open.0123456789ab.verify.json',
    'narration/a-open.0123456789ab.alignment.json', 'music/score.0123456789ab.mp3',
    'lib/lexicon.mjs',
    'out/film.mp4', 'preview/t0001.0.jpg', 'sfx/tick.0123456789ab.wav', 'node_modules/x/index.js',
    'clips/demo.0123456789ab/00001.jpg', 'sfx/door.0123456789ab.mp3', 'media.lock.json', 'house-style.md',
  ]);
  for (const p of ['narration/a-open.0123456789ab.mp3', 'narration/a-open.0123456789ab.verify.json',
    'narration/a-open.0123456789ab.alignment.json', 'music/score.0123456789ab.mp3', 'lib/lexicon.mjs', 'sfx/door.0123456789ab.mp3', 'media.lock.json', 'house-style.md']) {
    assert.equal(r[p], false, `${p} must be committed`);
  }
  for (const p of ['out/film.mp4', 'preview/t0001.0.jpg', 'sfx/tick.0123456789ab.wav', 'node_modules/x/index.js', 'clips/demo.0123456789ab/00001.jpg']) {
    assert.equal(r[p], true, `${p} must be ignored`);
  }
});
