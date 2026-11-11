// Splits footage into its shots, so a clip is chosen by looking at it.
//
//   npm run shots -- media/demo.mp4                  # media/demo.shots.json + preview/demo.shots.jpg
//   npm run shots -- media/demo.mp4 --threshold 0.2  # more sensitive (default 0.3)
//
// ffmpeg's scene-change score finds each cut; a shot shorter than 0.4 s is
// merged into the one before (a flash, a whip pan). The JSON lists every shot
// with its start and end; the contact sheet shows a frame from the middle of
// each, labelled with its times, so the right seconds go into clips.json
// `in`/`out` without scrubbing a video by hand.
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectShots, pacing } from './lib/media.mjs';
import { chromePath, contactSheet } from './lib/stage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('usage: npm run shots -- <video> [--threshold 0.3]'); process.exit(1); }
const at = process.argv.indexOf('--threshold');
const threshold = at > -1 ? Number(process.argv[at + 1]) : 0.3;
const abs = resolve(process.cwd(), file);
const shots = detectShots(ffmpegPath, abs, { threshold });
const name = basename(file, extname(file));

/** A JPEG of one frame, as a data: URL. */
export function frameAt(t, width = 384) {
  const r = spawnSync(ffmpegPath, ['-loglevel', 'error', '-ss', String(t), '-i', abs, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-f', 'image2', '-c:v', 'mjpeg', '-'], { maxBuffer: 16 * 1024 * 1024 });
  return `data:image/jpeg;base64,${r.stdout.toString('base64')}`;
}

const out = join(dirname(abs), `${name}.shots.json`);
writeFileSync(out, JSON.stringify({ file, threshold, ...pacing(shots), shots }, null, 2) + '\n');
mkdirSync(join(here, 'preview'), { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath() });
const sheet = join(here, 'preview', `${name}.shots.jpg`);
await contactSheet(browser, shots.map((s, i) => ({ src: frameAt((s.start + s.end) / 2), label: `${i + 1}  ${s.start.toFixed(1)}–${s.end.toFixed(1)}s` })), sheet);
await browser.close();
const p = pacing(shots);
console.log(`[shots] ${p.shotCount} shots (median ${p.medianShot}s) -> ${out}\n[shots] contact sheet -> ${sheet}`);
