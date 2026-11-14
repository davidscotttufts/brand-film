// Where this film stands, and the next command: npm run status
//
// For a session picking up a film another one started, or a person coming
// back to it: each step is done, out of date, or not started, judged from the
// files alone (no API, no render). Out of date means a file it was made from
// has changed since: a take whose text no longer matches takes.lock.json, a
// render older than the scene, the narration, the score or the tokens.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const p = (f) => join(here, f);
const json = (f) => (existsSync(p(f)) ? JSON.parse(readFileSync(p(f), 'utf8')) : null);
const mtime = (f) => (existsSync(p(f)) ? statSync(p(f)).mtimeMs : 0);
const film = json('film.json') ?? {};
const nar = json('narration.json') ?? { takes: [] };
const steps = [];
const step = (name, state, next, detail = '') => steps.push({ name, state, next, detail });

// 1. The brand.
const tokens = spawnSync(process.execPath, [p('tokens.mjs'), '--check'], { cwd: here, encoding: 'utf8' });
const tokensOk = tokens.status === 0 && existsSync(p('brand-tokens.resolved.json'));
step('brand tokens', tokensOk ? 'done' : existsSync(p('brand-tokens.css')) ? 'out of date' : 'not started', 'npm run tokens',
  tokensOk ? '' : (tokens.stderr.trim().split('\n')[0] ?? ''));

// 2. The script.
const lint = spawnSync(process.execPath, [p('lint.mjs')], { cwd: here, encoding: 'utf8' });
step('script', lint.status === 0 ? 'done' : 'failing', 'npm run lint', lint.status === 0 ? '' : (lint.stderr.trim().split('\n')[0] ?? ''));

// 3. The voice: every take voiced from its current text.
const lock = json('takes.lock.json');
const voiced = new Map((lock?.takes ?? []).map((t) => [t.id, t.written]));
const changed = nar.takes.filter((t) => voiced.get(t.id) !== (t.text ?? t.speak));
step('narration', !lock ? 'not started' : changed.length ? 'out of date' : 'done', 'npm run narrate',
  changed.length && lock ? `${changed.length} take(s) changed: ${changed.map((t) => t.id).join(', ')}` : '');

// 4. Footage, effects, music.
if (existsSync(p('clips.json'))) step('clips', !existsSync(p('clips/manifest.js')) ? 'not started' : mtime('clips/manifest.js') < mtime('clips.json') ? 'out of date' : 'done', 'npm run clips');
step('sound effects', existsSync(p('sfx/manifest.json')) && mtime('sfx/manifest.json') >= mtime('sfx.json') ? 'done' : 'out of date', 'npm run sfx');
const music = json('music.json');
if (music && music.use !== false) step('music', !existsSync(p('music/manifest.json')) ? 'not started' : mtime('music/manifest.json') < mtime('music.json') ? 'out of date' : 'done', 'npm run music');

// 5. The render: newer than everything it was made from.
const report = `out/${film.basename}.report.json`;
const inputs = [film.scene ?? 'scene.html', 'narration/manifest.json', 'music/manifest.json', 'sfx/manifest.json', 'brand-tokens.css', 'film.json', 'clips/manifest.js'];
const newer = inputs.filter((f) => mtime(f) > mtime(report));
step('render', !existsSync(p(report)) ? 'not started' : newer.length ? 'out of date' : 'done', 'npm run sheet, then npm run render',
  existsSync(p(report)) && newer.length ? `changed since: ${newer.join(', ')}` : '');

for (const s of steps) console.log(`${s.state === 'done' ? 'done ' : 'TODO '} ${s.name.padEnd(14)} ${s.state === 'done' ? '' : `${s.state}${s.detail ? ` (${s.detail})` : ''}`}`);
const next = steps.find((s) => s.state !== 'done');
console.log(next ? `\nnext: ${next.next}` : '\nall done: deliver (references/review-and-delivery.md)');
