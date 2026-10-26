// Adds languages to the film and keeps their translation files in step with
// the script. It does not translate: it writes what needs translating.
//
//   npm run translate -- es:voice fr      # Spanish captions + voice-over, French captions only
//   npm run translate                     # refresh every listed language; report what is left
//
// For each language it writes narration.<code>.json: one entry per take with the
// line to translate (`source`), a hash of it (`sourceHash`) and the translation
// (`text`). An entry whose source line has changed keeps its old text but is
// marked `stale`, and `npm run lint` fails until it is re-translated. The mode
// is recorded in narration.json `languages`:
//   captions  translated captions only, timed onto the film's own speech; no
//             credits, no new video (out/<basename>.<code>.vtt)
//   voice     translated captions AND a voice-over in that language: voiced and
//             checked by npm run narrate -- --lang <code>, rendered as its own
//             film by npm run render -- --lang <code> (out/<basename>.<code>.mp4)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmLanguages, sourceHash } from './lib/lang.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(here, 'narration.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const base = cfg.language ?? 'en';

const langs = filmLanguages(cfg);
for (const arg of process.argv.slice(2)) {
  const [code, mode = 'captions'] = arg.split(':');
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) { console.error(`"${code}" is not a language code (es, fr, pt-BR, ja …)`); process.exit(1); }
  if (code === base) { console.error(`${code} is the film's own language`); process.exit(1); }
  if (!['captions', 'voice'].includes(mode)) { console.error(`mode "${mode}": use captions or voice`); process.exit(1); }
  const cur = langs.find((l) => l.code === code);
  if (cur) cur.mode = mode; else langs.push({ code, mode });
}
if (process.argv.length > 2) {
  cfg.language = base;
  cfg.languages = langs;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 1) + '\n');
}
if (!langs.length) { console.log('No languages yet. Add one: npm run translate -- es:voice  (or es for captions only)'); process.exit(0); }

let todo = 0;
for (const { code, mode } of langs) {
  const p = join(here, `narration.${code}.json`);
  const prev = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  const prevById = new Map((prev.takes ?? []).map((t) => [t.id, t]));
  const takes = cfg.takes.map((t) => {
    const source = t.text ?? t.speak;
    const old = prevById.get(t.id);
    const entry = { id: t.id, source, sourceHash: sourceHash(source), text: old?.text ?? '' };
    if (old?.text && old.sourceHash !== entry.sourceHash) entry.stale = true;
    return entry;
  });
  const out = {
    $comment: `The ${code} translation of narration.json, one entry per take. Translate \`source\` into \`text\`: same meaning and facts, plain spoken sentences, about the same length (a voiced take must fit its scene's window). Keep brand names as the brand writes them; how they are SPOKEN in ${code} goes in brand-tokens.json brand.pronunciations with "lang": "${code}". Never edit \`source\` or \`sourceHash\`: npm run translate keeps them in step, and marks a take \`stale\` when its source line changes. Delete \`stale\` once \`text\` is re-translated.`,
    language: code,
    mode,
    ...(mode === 'voice' ? { voice: prev.voice ?? { id: '', name: '' } } : {}),
    takes,
  };
  writeFileSync(p, JSON.stringify(out, null, 1) + '\n');
  const missing = takes.filter((t) => !t.text.trim()), stale = takes.filter((t) => t.stale);
  todo += missing.length + stale.length;
  console.log(`${code} (${mode}): ${takes.length - missing.length - stale.length} of ${takes.length} translated${missing.length ? `, ${missing.length} to translate` : ''}${stale.length ? `, ${stale.length} stale` : ''}  → narration.${code}.json`);
  if (mode === 'voice' && !out.voice.id) console.log(`  voice-over: choose a native ${code} narrator (npm run audition -- --lang ${code} <voiceId>…) and set "voice" in narration.${code}.json`);
}
if (todo) console.log(`\n${todo} take(s) to translate. Then: npm run lint`);
