// Checks brand-tokens.json, the film's design system, and writes brand-tokens.css.
//
//   npm run tokens                  # check, fill gaps from the default, write the css
//   npm run tokens -- --check       # check only; exit 1 on a failure or a stale css
//
// brand-tokens.json holds what the brand's own sources define: a `brand` block
// (name, sources, logos, fonts, signature, pronunciation lexicon) and a
// `video` group (colour roles, type, narrator, motion, sound). default-tokens.json
// is the neutral default identity: any key the brand leaves out is inherited
// from it, and every inherited key is listed, so a half-built brand renders
// instead of failing, and says so.
//
// The scene links brand-tokens.css and uses only var(--video-*) names, so a
// brand change is one edit here and a re-render. The check fails on a contrast
// pair under 3:1, a logo or font file that is not on disk, or a broken
// pronunciation rule. A `contrast` pair is [text, ground]; under 4.5:1 it is
// reported LARGE: keep that pair to display text (24px bold and up).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintLexicon } from './lib/lexicon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes('--check');
const defPath = join(here, 'default-tokens.json');

const def = JSON.parse(readFileSync(defPath, 'utf8'));
const own = existsSync(join(here, 'brand-tokens.json')) ? JSON.parse(readFileSync(join(here, 'brand-tokens.json'), 'utf8')) : {};
const inherited = [];
function merge(base, over, path) {
  if (over === undefined) { inherited.push(path); return structuredClone(base); }
  if (base && over && typeof base === 'object' && typeof over === 'object' && !Array.isArray(base)) {
    const outObj = { ...over };
    for (const k of Object.keys(base)) outObj[k] = merge(base[k], over[k], path ? `${path}.${k}` : k);
    return outObj;
  }
  return over;
}
const cfg = { brand: merge(def.brand, own.brand, 'brand'), video: merge(def.video, own.video, 'video'), contrast: own.contrast ?? def.contrast };
const isDefault = (cfg.brand.name ?? 'Default') === 'Default';
if (inherited.length && !isDefault) console.log(`[tokens] inherited from the default identity: ${inherited.join(', ')}`);
if (isDefault) console.log('[tokens] brand is the neutral default identity');

const v = cfg.video;
let failures = 0;
const fail = (m) => { failures++; console.error(`[tokens] FAIL ${m}`); };

// Colour to linear sRGB, for #hex, rgb() and oklch().
function linear(c) {
  const lin = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  let m;
  if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c))) {
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
    return [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  }
  if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(c))) return [m[1], m[2], m[3]].map((x) => lin(+x / 255));
  if ((m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i.exec(c))) {
    const L = m[2] ? +m[1] / 100 : +m[1], C = +m[3], H = (+m[4] * Math.PI) / 180;
    const a = C * Math.cos(H), b = C * Math.sin(H);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s].map((x) => Math.max(0, Math.min(1, x)));
  }
  return null;
}
const lum = (rgb) => rgb.reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const floor = v.accessibility?.minTextContrast ?? 4.5;
for (const [fg, bg] of cfg.contrast ?? []) {
  const a = linear(v.color[fg] ?? ''), b = linear(v.color[bg] ?? '');
  if (!a || !b) { fail(`contrast ${fg} on ${bg}: unknown colour or format (use #hex, rgb() or oklch())`); continue; }
  const r = ratio(a, b);
  if (r < 3) fail(`${fg} on ${bg} is ${r.toFixed(2)}:1, under 3:1 even for large text`);
  else console.log(`[tokens] ${r >= floor ? 'ok   ' : 'LARGE'} ${fg} on ${bg} ${r.toFixed(2)}:1${r >= floor ? '' : ' (display text only: 24px bold and up)'}`);
}

for (const [k, p] of Object.entries(cfg.brand.logo ?? {})) {
  if (typeof p === 'string' && /\.(png|svg|jpe?g|webp)$/i.test(p) && !existsSync(join(here, p))) fail(`brand.logo.${k}: ${p} is not on disk (copy it from the brand's source, never redraw it)`);
}
for (const file of cfg.brand.fontFiles ?? []) if (!existsSync(join(here, file.src))) fail(`font file ${file.src} is not on disk`);
for (const p of lintLexicon(cfg.brand.pronunciations ?? [])) fail(`brand.${p}`);
if ((cfg.brand.pronunciations ?? []).length) console.log(`[tokens] ${cfg.brand.pronunciations.length} pronunciation rule(s)`);

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const css = [`/* ${cfg.brand.name} film tokens. Generated from brand-tokens.json by \`npm run tokens\`; do not edit. */`];
if (cfg.brand.fontsHref) css.push(`@import url("${cfg.brand.fontsHref}");`);
for (const file of cfg.brand.fontFiles ?? []) {
  css.push(`@font-face { font-family: "${file.family}"; src: url("${file.src}"); font-weight: ${file.weight ?? 400}; font-style: ${file.style ?? 'normal'}; font-display: block; }`);
}
css.push(':root {');
for (const [k, val] of Object.entries(v.color)) css.push(`  --video-${k}: ${val};`);
for (const [k, val] of Object.entries(v.fontFamily ?? {})) css.push(`  --video-font-${k}: ${val};`);
for (const [k, val] of Object.entries(v.type?.sizesPxAt1080p ?? {})) css.push(`  --video-size-${kebab(k)}: ${val}px;`);
css.push(`  --video-margin: ${v.canvas?.marginLeftPx ?? 160}px;`);
css.push(`  --video-reveal: ${(v.motion?.revealMsMin ?? 400) / 1000}s;`);
css.push('}', '');
const out = css.join('\n');

const cssPath = join(here, 'brand-tokens.css');
const stale = !existsSync(cssPath) || readFileSync(cssPath, 'utf8') !== out;
if (check) { if (stale) fail('brand-tokens.css is stale: run npm run tokens'); }
else if (stale) { writeFileSync(cssPath, out); console.log('[tokens] wrote brand-tokens.css'); }
else console.log('[tokens] brand-tokens.css is current');
// The resolved file narrate.mjs reads (narrator) and the scene can fetch for non-CSS values.
if (!check) writeFileSync(join(here, 'brand-tokens.resolved.json'), JSON.stringify(cfg, null, 2) + '\n');
if (failures) { console.error(`\n[tokens] ${failures} failure(s). Fix brand-tokens.json, then re-run.`); process.exit(1); }
