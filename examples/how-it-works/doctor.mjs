// Checks what this folder needs, before any work: npm run doctor
//
// Required: Node 18+, the installed packages (npm install), a Chrome or
// Chromium for rendering. For narration and music: the ElevenLabs CLI, signed
// in, with characters left. Optional: pdftotext, soffice and pdftoppm, for
// reading a brand's PDFs and decks.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { account, hasCli } from './lib/elevenlabs.mjs';

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
for (const tool of ['pdftotext', 'soffice', 'pdftoppm']) {
  const ok = spawnSync('which', [tool]).status === 0;
  row(ok ? true : null, tool, ok ? '' : 'optional, for brand PDFs and decks');
}
if (bad) { console.log(`\n${bad} problem(s) to fix before rendering.`); process.exit(1); }
console.log('\nready.');
