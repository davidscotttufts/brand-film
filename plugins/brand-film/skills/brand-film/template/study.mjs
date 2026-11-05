// Measures a brand's existing videos, so a new film can match them.
//
//   npm run study -- media/brand-reel.mp4 [more videos…]   # study/<name>.json, preview/<name>.shots.jpg
//
// For each video: its shape and length, its pacing (shots, median shot,
// cuts a minute), its main colours (sampled once a second), and its loudness.
// These are evidence for the film's design system and house style, not rules:
// read the numbers with the contact sheet, then write what holds into
// brand-tokens.json (colours the brand really uses) and house-style.md
// (`npm run lesson -- picture "A new shot every 2 to 3 seconds"`).
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectShots, pacing, palette, probe } from './lib/media.mjs';
import { chromePath, contactSheet } from './lib/stage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: npm run study -- <video> [more videos…]'); process.exit(1); }
mkdirSync(join(here, 'study'), { recursive: true });
mkdirSync(join(here, 'preview'), { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath() });
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

for (const file of files) {
  const abs = resolve(process.cwd(), file);
  const name = basename(file, extname(file));
  const info = probe(ffmpegPath, abs);
  const shots = detectShots(ffmpegPath, abs);
  // Colours: one 64×36 frame a second, as raw RGB.
  const raw = spawnSync(ffmpegPath, ['-loglevel', 'error', '-i', abs, '-vf', 'fps=1,scale=64:36', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 512 * 1024 * 1024 });
  const colours = palette(new Uint8Array(raw.stdout.buffer, raw.stdout.byteOffset, raw.stdout.length), 6);
  let loudness = null;
  if (info.audio) {
    const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', abs, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const tail = (r.stderr ?? '').split('Summary:').pop();
    loudness = { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1] ?? NaN), lra: Number(/LRA:\s+([\d.]+) LU/.exec(tail)?.[1] ?? NaN) };
  }
  const g = gcd(info.width, info.height) || 1;
  const study = { file, duration: +info.duration.toFixed(2), width: info.width, height: info.height, aspect: `${info.width / g}:${info.height / g}`, fps: info.fps, ...pacing(shots), colours, loudness, shots };
  writeFileSync(join(here, 'study', `${name}.json`), JSON.stringify(study, null, 2) + '\n');
  const frameAt = (t) => `data:image/jpeg;base64,${spawnSync(ffmpegPath, ['-loglevel', 'error', '-ss', String(t), '-i', abs, '-frames:v', '1', '-vf', 'scale=384:-2', '-f', 'image2', '-c:v', 'mjpeg', '-'], { maxBuffer: 16 * 1024 * 1024 }).stdout.toString('base64')}`;
  await contactSheet(browser, shots.slice(0, 40).map((s, i) => ({ src: frameAt((s.start + s.end) / 2), label: `${i + 1}  ${s.start.toFixed(1)}s` })), join(here, 'preview', `${name}.shots.jpg`));
  console.log(`[study] ${file}: ${study.aspect}, ${study.duration}s, ${study.shotCount} shots (median ${study.medianShot}s, ${study.cutsPerMinute} cuts/min)`);
  console.log(`        colours ${colours.map((c) => `${c.hex} ${Math.round(c.share * 100)}%`).join(', ')}${loudness ? `; ${loudness.lufs} LUFS` : '; silent'}`);
}
await browser.close();
console.log(`\nwrote study/*.json and preview/*.shots.jpg. Carry what holds into brand-tokens.json and house-style.md (npm run lesson).`);
