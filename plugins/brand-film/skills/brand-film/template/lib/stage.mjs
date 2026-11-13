// Opening the scene in headless Chrome, the same way for render.mjs and
// preview.mjs: at an aspect, in a language, with the burned-in captions
// overlay when asked, and a shot(t) that waits for every image the frame shows.
//
// Aspects: the scene is 1920×1080 by default. A scene that also lays out for
// another shape lists it in window.ASPECTS (e.g. ['16:9', '9:16', '1:1']) and
// reads ?aspect=9x16 to set its own stage size and layout; the renderer
// refuses an aspect the scene does not list rather than squashing it.
import { existsSync } from 'node:fs';

export const ASPECTS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

/** { name: '9:16', tag: '9x16', width, height }; throws on an aspect that isn't in ASPECTS. */
export function aspectOf(name = '16:9') {
  const a = ASPECTS[name];
  if (!a) throw new Error(`unknown aspect "${name}"; use one of ${Object.keys(ASPECTS).join(', ')}`);
  return { name, tag: name.replace(':', 'x'), ...a };
}

// The installed Google Chrome (or Chromium) wherever it usually lives, so a
// render doesn't depend on Playwright's own browser build matching the
// playwright-core npm happened to install. CHROME_PATH wins; undefined means
// Playwright's Chromium (npx playwright install chromium).
export const CHROME_CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
};
export const chromePath = ({ env = process.env, platform = process.platform, exists = existsSync } = {}) =>
  env.CHROME_PATH || (CHROME_CANDIDATES[platform] ?? []).find((p) => exists(p));

/**
 * Open the scene. Returns { browser, page, aspect, shot(t, opts) }.
 *   scene: absolute path to scene.html; aspect: '16:9' …; lang: a language code or null
 */
export async function openStage({ chromium, scene, aspect = '16:9', lang = null, browser = null }) {
  const { pathToFileURL } = await import('node:url');
  const a = aspectOf(aspect);
  const b = browser ?? await chromium.launch({ executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: a.width, height: a.height }, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ t: '0' });
  if (a.name !== '16:9') q.set('aspect', a.tag);
  if (lang) q.set('lang', lang);
  await page.goto(`${pathToFileURL(scene).href}?${q}`);
  await page.evaluate(() => document.fonts.ready);
  if (a.name !== '16:9') {
    const supported = await page.evaluate(() => window.ASPECTS ?? ['16:9']);
    if (!supported.includes(a.name)) {
      if (!browser) await b.close();
      throw new Error(`the scene does not lay out for ${a.name} (window.ASPECTS is ${JSON.stringify(supported)}); add a ${a.tag} layout to scene.html first`);
    }
  }
  const stage = page.locator('#stage');
  /** Draw frame t, wait for every image it shows to decode, and screenshot the stage. */
  const shot = async (t, opts) => {
    await page.evaluate(async (t) => {
      window.render(t);
      window.__bfOverlay?.(t);
      const pending = [...document.images].filter((i) => i.src && !i.complete);
      if (pending.length) await Promise.all(pending.map((i) => i.decode().catch(() => {})));
    }, t);
    return stage.screenshot(opts);
  };
  return { browser: b, page, aspect: a, shot };
}

/**
 * Burned-in captions: an overlay on the stage, drawn as a pure function of t
 * like the scene. `cues` are [{ start, end, words: [{ text, start, end }], text }]
 * (lib/captions.mjs burnCues). In "word" mode the word being spoken takes the
 * highlight colour; in "line" mode (or a cue with no word times) the cue's
 * text shows plain. Colours and size come from the brand's tokens:
 * --video-caption-text, --video-caption-highlight, --video-caption-box,
 * --video-size-caption, --video-font-headline. `position` is where the
 * caption's centre sits, as a fraction of the stage height.
 */
export async function installCaptions(page, cues, { mode = 'word', position = 0.7 } = {}) {
  await page.evaluate(({ cues, mode, position }) => {
    const stage = document.getElementById('stage');
    const box = document.createElement('div');
    box.id = 'bf-captions';
    const margin = getComputedStyle(document.documentElement).getPropertyValue('--video-margin') || '80px';
    Object.assign(box.style, {
      position: 'absolute', left: margin, right: margin, top: `${position * 100}%`, transform: 'translateY(-50%)',
      display: 'flex', justifyContent: 'center', zIndex: 2147483647, pointerEvents: 'none', visibility: 'hidden',
    });
    const line = document.createElement('div');
    Object.assign(line.style, {
      font: '800 var(--video-size-caption, 64px)/1.15 var(--video-font-headline, sans-serif)', letterSpacing: '-0.01em',
      color: 'var(--video-caption-text, #fff)', background: 'var(--video-caption-box, #000)',
      padding: '0.18em 0.42em', borderRadius: '0.28em', textAlign: 'center', maxWidth: '100%',
      boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
    });
    box.appendChild(line);
    stage.appendChild(box);
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let shown = null;
    window.__bfOverlay = (t) => {
      const cue = cues.find((c) => t >= c.start && t < c.end);
      if (!cue) { box.style.visibility = 'hidden'; shown = null; return; }
      box.style.visibility = 'visible';
      let html;
      if (mode === 'word' && cue.words?.length) {
        let cur = -1;
        cue.words.forEach((w, i) => { if (w.start <= t) cur = i; });
        html = cue.words.map((w, i) => (i === cur ? `<span style="color:var(--video-caption-highlight, #ff0)">${esc(w.text)}</span>` : esc(w.text))).join(' ');
      } else html = esc(cue.text);
      if (html !== shown) { line.innerHTML = html; shown = html; }
    };
  }, { cues, mode, position });
}

/** A labelled contact sheet of images, five across, written as a JPEG. shots: [{ src (data: URL), label }]. */
export async function contactSheet(browser, shots, file, { width = 384, height = 216 } = {}) {
  const sheet = await browser.newPage({ viewport: { width: 2000, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#111;font:600 18px Menlo,monospace;color:#eee;display:grid;grid-template-columns:repeat(5,${width}px);gap:16px 16px;padding:16px;width:${16 + 5 * (width + 16)}px;box-sizing:border-box">${shots.map((s) => `<figure style="margin:0"><img src="${s.src}" style="width:${width}px;height:${height}px;object-fit:contain;background:#000;display:block"><figcaption style="padding:4px 0">${s.label}</figcaption></figure>`).join('')}</body>`);
  await sheet.screenshot({ path: file, type: 'jpeg', quality: 75, fullPage: true });
  await sheet.close();
}
