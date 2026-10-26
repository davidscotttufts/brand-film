// Renders single frames, or a contact sheet, for review.
//
//   npm run preview -- 3.5 20 61.2     # preview/t0003.5.jpg …, one per time
//   npm run sheet                      # preview/sheet.jpg: a frame every 2s, labelled
//   npm run sheet -- 4                 # …every 4s
//   npm run sheet -- 40 80 1           # …from 40s to 80s, every 1s
//
// Look at the frames, not the code: a frame shows overlap, clipping, text under
// the readable floor, an element that never faded out, and a cue that lands
// before its picture. The sheet is the fastest way to review a whole film.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const film = JSON.parse(readFileSync(join(here, 'film.json'), 'utf8'));
const CHROME = process.env.CHROME_PATH
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const dir = join(here, 'preview');
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(join(here, film.scene)).href + '?t=0');
await page.evaluate(() => document.fonts.ready);
const args = process.argv.slice(2).filter((a) => a !== '--sheet').map(Number);

if (process.argv.includes('--sheet')) {
  const duration = await page.evaluate(() => window.DURATION);
  const [a, b, step] = args.length >= 3 ? args : [0, duration, args[0] || 2];
  const times = [];
  for (let t = a; t <= b; t += step) times.push(+t.toFixed(2));
  const shots = [];
  for (const t of times) {
    await page.evaluate((t) => window.render(t), t);
    shots.push({ t, src: 'data:image/jpeg;base64,' + (await page.locator('#stage').screenshot({ type: 'jpeg', quality: 60 })).toString('base64') });
  }
  // Lay the frames out on a second page, five across, each labelled with its time.
  const sheet = await browser.newPage({ viewport: { width: 2000, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#111;font:600 18px Menlo,monospace;color:#eee;display:grid;grid-template-columns:repeat(5,384px);gap:16px 16px;padding:16px;width:2000px;box-sizing:border-box">${shots.map((s) => `<figure style="margin:0"><img src="${s.src}" style="width:384px;height:216px;display:block"><figcaption style="padding:4px 0">${s.t.toFixed(1)}s</figcaption></figure>`).join('')}</body>`);
  const file = join(dir, `sheet-${a}-${(+b).toFixed(0)}.jpg`);
  await sheet.screenshot({ path: file, type: 'jpeg', quality: 75, fullPage: true });
  console.log(`[sheet] ${times.length} frames -> ${file}`);
} else {
  for (const t of args) {
    await page.evaluate((t) => window.render(t), t);
    const file = join(dir, `t${t.toFixed(1).padStart(6, '0')}.jpg`);
    await page.locator('#stage').screenshot({ path: file, type: 'jpeg', quality: 75 });
    console.log(file);
  }
}
await browser.close();
