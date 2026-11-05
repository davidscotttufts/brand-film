// Checks what this folder needs, before any work: npm run doctor
//
// Required: Node 18+, the installed packages (npm install), a Chrome or
// Chromium for rendering. For narration and music: the ElevenLabs CLI, signed
// in, with characters left, and the ElevenLabs API reachable from here (a
// sandbox or a proxy that blocks it shows up now, not halfway through a run).
// The film's source page, when film.json `sourceUrl` names one, must be
// reachable too. Optional: pdftotext, soffice and pdftoppm (a brand's PDFs and
// decks); whisper.cpp (the fallback transcriber); yt-dlp (downloading footage
// that clips.json names by URL); blender (3D clips).
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { account, hasCli } from './lib/elevenlabs.mjs';
import { KEYS, apiKey } from './lib/keys.mjs';

const require = createRequire(import.meta.url);
let bad = 0;
const row = (ok, what, detail = '') => { if (ok === false) bad++; console.log(`${ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'note'}  ${what}${detail ? `  ${detail}` : ''}`); };

const major = Number(process.versions.node.split('.')[0]);
row(major >= 18, 'node', `v${process.versions.node}${major < 18 ? ' (need 18+)' : ''}`);

let ff = null, pw = null;
try { ff = require('ffmpeg-static'); } catch { /* not installed */ }
try { pw = require.resolve('playwright-core'); } catch { /* not installed */ }
row(Boolean(ff && existsSync(ff)), 'ffmpeg-static', ff ? '' : 'run npm install');
row(Boolean(pw), 'playwright-core', pw ? '' : 'run npm install');

const chrome = process.env.CHROME_PATH
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null);
if (chrome) row(existsSync(chrome), 'chrome', existsSync(chrome) ? chrome : `${chrome} not found; set CHROME_PATH`);
else row(null, 'chrome', 'CHROME_PATH unset; Playwright\'s own Chromium is used (npx playwright install chromium)');

if (!hasCli()) {
  row(null, 'elevenlabs CLI', 'not installed: npm i -g @elevenlabs/cli (needed for narration and music; a silent render works without it)');
} else {
  const a = account();
  if (!a) row(false, 'elevenlabs account', 'not signed in: elevenlabs auth login, or set ELEVENLABS_API_KEY');
  else {
    row(true, 'elevenlabs account', `${a.tier} plan, ${a.remaining ?? '?'} characters left`);
    if (a.tier === 'free') row(null, 'licence', 'the free plan has no commercial licence and requires attribution; use a paid plan for a film you will publish');
  }
}
/** Can this machine reach a URL? Any HTTP answer counts; only no answer fails. */
async function reach(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000), redirect: 'manual' });
    return { ok: true, status: r.status };
  } catch (e) { return { ok: false, why: e.cause?.code ?? e.name ?? String(e) }; }
}
if (hasCli()) {
  const r = await reach('https://api.elevenlabs.io/v1/models');
  row(r.ok, 'network: api.elevenlabs.io', r.ok ? '' : `unreachable (${r.why}); allow it in the sandbox or proxy, or narration and music will fail`);
}
const filmPath = new URL('./film.json', import.meta.url);
const film = existsSync(filmPath) ? JSON.parse(readFileSync(filmPath, 'utf8')) : {};
if (/^https?:/.test(film.sourceUrl ?? '')) {
  const r = await reach(film.sourceUrl);
  row(r.ok ? true : null, `network: ${new URL(film.sourceUrl).host}`, r.ok ? `the source page answers (${r.status})` : `unreachable (${r.why}); npm run source cannot refresh it from here`);
}
const has = (tool, args = ['--version']) => spawnSync(tool, args, { encoding: 'utf8' }).status === 0;
for (const tool of ['pdftotext', 'soffice', 'pdftoppm']) {
  const ok = spawnSync('which', [tool]).status === 0;
  row(ok ? true : null, tool, ok ? '' : 'optional, for brand PDFs and decks');
}
const whisper = process.env.WHISPER_CPP || 'whisper-cli';
const wOk = has(whisper, ['--help']) && Boolean(process.env.WHISPER_MODEL && existsSync(process.env.WHISPER_MODEL));
row(wOk ? true : null, 'whisper.cpp', wOk ? process.env.WHISPER_MODEL : 'optional: the fallback transcriber when ElevenLabs speech-to-text fails (brew install whisper-cpp, set WHISPER_MODEL)');
row(has('yt-dlp') ? true : null, 'yt-dlp', has('yt-dlp') ? '' : 'optional: downloads footage clips.json names by URL (only footage you have the rights to)');
const keyed = Object.keys(KEYS).filter((p) => apiKey(p));
row(true, 'stock: wikimedia, openverse', 'Creative Commons pictures (and Commons video), no key');
row(keyed.length ? true : null, 'stock: unsplash, pexels, pixabay', keyed.length ? `keys for ${keyed.join(', ')}` : 'optional: a free key each widens npm run find (lib/keys.mjs says where)');
const blender = process.env.BLENDER_PATH || (process.platform === 'darwin' && existsSync('/Applications/Blender.app/Contents/MacOS/Blender') ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
row(has(blender) ? true : null, 'blender', has(blender) ? blender : 'optional: renders 3D clips (clips.json "blender"); set BLENDER_PATH if it is not on PATH');
if (bad) { console.log(`\n${bad} problem(s) to fix before rendering.`); process.exit(1); }
console.log('\nready.');
