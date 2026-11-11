// Finds stock pictures and footage the film may use, with their licences read
// from the library, and adds the one you choose to clips.json.
//
//   npm run find -- "server room"                       # pictures from every library this machine can search
//   npm run find -- "robot arm" --kind video            # footage
//   npm run find -- "city at night" --from wikimedia,pexels --count 6
//   npm run find -- --add 3 --id racks                  # result 3 of the last search → clips.json
//   npm run find -- --add 7 --id arm --in 1.5 --out 5   # …a video, trimmed
//   npm run find -- --keys                              # which libraries are ready
//
// Libraries (lib/stock.mjs): Wikimedia Commons and Openverse (Creative Commons
// and public domain, no key), Unsplash, Pexels and Pixabay (their own licences,
// a free key each: lib/keys.mjs). NonCommercial and NoDerivatives results never
// appear. Results are numbered across libraries in find/last.json, and
// preview/find-<query>.jpg is a contact sheet of them, labelled with number,
// library, licence and flags:
//   share-alike  the film may have to carry the same licence (ask the user)
//   people       a recognisable person: no model release; reads as an endorsement
//   brand        a logo or a product that isn't the brand's
// Look at the sheet before adding: the picture has to prove the line.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, attribution, search } from './lib/stock.mjs';
import { KEYS, apiKey } from './lib/keys.mjs';
import { chromePath, contactSheet } from './lib/stage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const opt = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const dir = join(here, 'find');
mkdirSync(dir, { recursive: true });

if (process.argv.includes('--keys')) {
  for (const [name, p] of Object.entries(PROVIDERS)) {
    const ready = !p.key || apiKey(name);
    console.log(`${ready ? 'ready' : 'no key'}  ${name.padEnd(10)} ${p.kinds.join(' and ')}${p.key && !ready ? `  set ${KEYS[name].env}, or the Keychain item ${KEYS[name].service} (${KEYS[name].url})` : ''}`);
  }
  process.exit(0);
}

if (opt('--add')) {
  const last = existsSync(join(dir, 'last.json')) ? JSON.parse(readFileSync(join(dir, 'last.json'), 'utf8')) : null;
  if (!last) { console.error('[find] no search yet: npm run find -- "<what the shot shows>"'); process.exit(1); }
  const n = Number(opt('--add'));
  const r = last.results.find((x) => x.n === n);
  if (!r) { console.error(`[find] no result ${n} in the last search ("${last.query}", ${last.results.length} results)`); process.exit(1); }
  const id = opt('--id') ?? `${r.provider}-${r.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
  const cfgPath = join(here, 'clips.json');
  const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : { clips: [] };
  if (cfg.clips.some((c) => c.id === id)) { console.error(`[find] clips.json already has "${id}"; choose another --id`); process.exit(1); }
  const clip = {
    id, kind: r.kind, url: r.file, page: r.page, provider: r.provider, title: r.title, author: r.author, authorUrl: r.authorUrl,
    licence: r.licence, licenceName: r.licenceName, licenceUrl: r.licenceUrl, via: r.via,
    ...(r.track ? { track: r.track } : {}),
    ...(r.kind === 'video' && opt('--in') ? { in: Number(opt('--in')) } : {}),
    ...(r.kind === 'video' && opt('--out') ? { out: Number(opt('--out')) } : {}),
    ...(r.flags.length ? { flags: r.flags } : {}),
  };
  cfg.clips.push(clip);
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[find] added "${id}" to clips.json: ${attribution(clip)}`);
  for (const f of r.flags) console.warn(`[find] ${id} is flagged ${f}: ${{ 'share-alike': 'the film may have to carry the same CC BY-SA licence; ask the user', people: 'a recognisable person, with no model release; prefer a shot without one, or get the user\'s yes', brand: 'a logo or product that is not the brand\'s; prefer a shot without one' }[f]}`);
  console.log('[find] next: npm run clips, then show it in the scene with GFX.still (a picture) or GFX.clip (footage)');
  process.exit(0);
}

const query = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--kind', '--from', '--count'].includes(all[i - 1])).join(' ').trim();
if (!query) { console.error('usage: npm run find -- "<what the shot shows>" [--kind image|video] [--from wikimedia,openverse,unsplash,pexels,pixabay] [--count 8]'); process.exit(1); }
const kind = opt('--kind') ?? 'image';
const count = Number(opt('--count') ?? 8);
const from = (opt('--from') ?? Object.keys(PROVIDERS).join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const settled = await Promise.allSettled(from.map((p) => search(p, query, { kind, count })));
const lists = [];
settled.forEach((s, i) => {
  const p = from[i];
  if (s.status === 'rejected') console.warn(`[find] ${p}: ${s.reason.message}`);
  else if (!s.value.length && PROVIDERS[p]?.key && !apiKey(p)) console.log(`[find] ${p}: no key (npm run find -- --keys)`);
  else if (!PROVIDERS[p]?.kinds.includes(kind)) console.log(`[find] ${p}: no ${kind}s`);
  else lists.push(s.value);
});
// Interleave the libraries, so the first results aren't all from one.
const results = [];
for (let k = 0; lists.some((l) => l[k]); k++) for (const l of lists) if (l[k]) results.push(l[k]);
results.forEach((r, i) => { r.n = i + 1; });
const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const record = { query, kind, searchedAt: new Date().toISOString(), results };
writeFileSync(join(dir, 'last.json'), JSON.stringify(record, null, 2) + '\n');
writeFileSync(join(dir, `${slug}.${kind}.json`), JSON.stringify(record, null, 2) + '\n');

for (const r of results) {
  const size = r.width ? `${r.width}×${r.height}` : '';
  console.log(`${String(r.n).padStart(3)}  ${r.provider.padEnd(9)} ${r.licenceName.padEnd(16)} ${size.padEnd(10)}${r.duration ? ` ${Math.round(r.duration)}s` : ''}  ${r.title.slice(0, 60)}${r.flags.length ? `  [${r.flags.join(', ')}]` : ''}`);
}
if (!results.length) { console.log(`[find] nothing for "${query}"`); process.exit(0); }
try {
  const browser = await chromium.launch({ executablePath: chromePath() });
  const sheet = join(here, 'preview', `find-${slug}.${kind}.jpg`);
  mkdirSync(join(here, 'preview'), { recursive: true });
  await contactSheet(browser, results.filter((r) => r.thumb).map((r) => ({ src: r.thumb, label: `#${r.n} ${r.provider} · ${r.licenceName}${r.flags.length ? ` · ${r.flags.join(', ')}` : ''}` })), sheet);
  await browser.close();
  console.log(`\n[find] ${results.length} result(s); contact sheet -> ${sheet}`);
} catch (e) {
  console.warn(`\n[find] ${results.length} result(s); no contact sheet (${e.message.split('\n')[0]})`);
}
console.log('[find] add one: npm run find -- --add <n> --id <name>');
