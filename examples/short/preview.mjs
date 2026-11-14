// Renders single frames, or a contact sheet, for review.
//
//   npm run preview -- 3.5 20 61.2     # preview/t0003.5.jpg …, one per time
//   npm run sheet                      # preview/sheet.jpg: a frame every 2s, labelled
//   npm run sheet -- 4                 # …every 4s
//   npm run sheet -- 40 80 1           # …from 40s to 80s, every 1s
//   npm run sheet -- --lang es         # …with the scene's Spanish on-screen text
//   npm run sheet -- --aspect 9:16     # …in another of film.json `aspects`
//
// A shape that film.json `burnCaptions` lists shows its burned-in captions here
// too, from narration/manifest.json, so they are reviewed with the picture.
//
// Look at the frames, not the code: a frame shows overlap, clipping, text under
// the readable floor, an element that never faded out, and a cue that lands
// before its picture. The sheet is the fastest way to review a whole film.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aspectOf, contactSheet, installCaptions, openStage } from './lib/stage.mjs';
import { burnCues, lineCues } from './lib/captions.mjs';
import { langPaths } from './lib/lang.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const film = JSON.parse(readFileSync(join(here, 'film.json'), 'utf8'));
const dir = join(here, 'preview');
mkdirSync(dir, { recursive: true });
const opt = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const lang = opt('--lang');
const aspect = aspectOf(opt('--aspect') ?? film.aspects?.[0] ?? '16:9');
const tag = aspect.name === (film.aspects?.[0] ?? '16:9') ? '' : `.${aspect.tag}`;
let stage;
try { stage = await openStage({ chromium, scene: join(here, film.scene), aspect: aspect.name, lang }); } catch (e) { console.error(`[preview] ${e.message}`); process.exit(1); }
const { browser, page, shot } = stage;
if (film.burnCaptions === true || film.burnCaptions?.includes?.(aspect.name)) {
  const nar = existsSync(join(here, 'narration.json')) ? JSON.parse(readFileSync(join(here, 'narration.json'), 'utf8')) : {};
  const m = join(langPaths(here, lang, nar.language ?? 'en').narrationDir, 'manifest.json');
  const tk = existsSync(join(here, 'brand-tokens.resolved.json')) ? JSON.parse(readFileSync(join(here, 'brand-tokens.resolved.json'), 'utf8')) : {};
  const style = tk.video?.captions ?? {};
  const cues = existsSync(m) ? burnCues(JSON.parse(readFileSync(m, 'utf8')), style.maxWords ?? 5) : lineCues(await page.evaluate(() => window.CAPTIONS ?? []));
  await installCaptions(page, cues, { mode: style.mode ?? 'word', position: style.position?.[aspect.tag] ?? style.position?.default ?? 0.72 });
}
const flags = new Set(['--sheet', '--lang', '--aspect']);
const args = process.argv.slice(2).filter((a, i, all) => !flags.has(a) && all[i - 1] !== '--lang' && all[i - 1] !== '--aspect').map(Number);
const suffix = `${lang ? `.${lang}` : ''}${tag}`;

if (process.argv.includes('--sheet')) {
  const duration = await page.evaluate(() => window.DURATION);
  const [a, b, step] = args.length >= 3 ? args : [0, duration, args[0] || 2];
  const shots = [];
  for (let t = a; t <= b + 1e-9; t += step) {
    const tt = +t.toFixed(2);
    shots.push({ label: `${tt.toFixed(1)}s`, src: 'data:image/jpeg;base64,' + (await shot(tt, { type: 'jpeg', quality: 60 })).toString('base64') });
  }
  // Each frame at the shape's own proportions, 384 px on its long side.
  const scale = 384 / Math.max(aspect.width, aspect.height);
  const file = join(dir, `sheet-${a}-${(+b).toFixed(0)}${suffix}.jpg`);
  await contactSheet(browser, shots, file, { width: Math.round(aspect.width * scale) || 384, height: Math.round(aspect.height * scale) || 216 });
  console.log(`[sheet] ${shots.length} frames -> ${file}`);
} else {
  for (const t of args) {
    const file = join(dir, `t${t.toFixed(1).padStart(6, '0')}${suffix}.jpg`);
    writeFileSync(file, await shot(t, { type: 'jpeg', quality: 75 }));
    console.log(file);
  }
}
await browser.close();
