// Checks narration.json without calling anything: no key, no credits.
//
//   npm run lint
//
// Fails on: a take window that is empty, overlaps the next take or runs past
// the film's end; a sentence over the brand's word limit; a sentence that OPENS
// with a spelled-out acronym ("A P I keys…" is read "A. P. I. keys"); a take
// with neither `text` nor `speak`; an anchor outside its take's window.
// Warns on: numbers written as digits that the lexicon does not cover (a voice
// may read "2025" as "two zero two five"); a gap under 0.4 s between takes.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLexicon } from './lib/lexicon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'narration.json'), 'utf8'));
const resolved = join(here, 'brand-tokens.resolved.json');
const tokens = existsSync(resolved) ? JSON.parse(readFileSync(resolved, 'utf8')) : {};
const lex = compileLexicon(tokens.brand?.pronunciations ?? []);
const maxWords = tokens.video?.voice?.maxWordsPerSentence ?? 18;
const sceneHtml = existsSync(join(here, 'scene.html')) ? readFileSync(join(here, 'scene.html'), 'utf8') : '';
const duration = Number(/const DURATION = ([\d.]+)/.exec(sceneHtml)?.[1] ?? NaN);

let errors = 0, warnings = 0;
const err = (m) => { errors++; console.error(`[lint] FAIL ${m}`); };
const warn = (m) => { warnings++; console.log(`[lint] warn ${m}`); };

const ids = new Set();
cfg.takes.forEach((take, i) => {
  const id = take.id ?? `#${i}`;
  if (ids.has(id)) err(`${id}: duplicate take id`);
  ids.add(id);
  const written = take.text ?? take.speak;
  if (typeof written !== 'string' || !written.trim()) { err(`${id}: no text`); return; }
  const spoken = take.text != null ? lex.toSpoken(take.text) : take.speak;
  if (!(take.until > take.at)) err(`${id}: window ${take.at}-${take.until}s is empty`);
  const next = cfg.takes[i + 1];
  if (next && next.at < take.until) err(`${id}: window ends at ${take.until}s, after ${next.id} starts (${next.at}s)`);
  if (next && next.at - take.until < 0.4 && next.at >= take.until) warn(`${id}: only ${(next.at - take.until).toFixed(2)}s before ${next.id}`);
  if (Number.isFinite(duration) && take.until > duration) err(`${id}: window ends at ${take.until}s, after the film ends (${duration}s)`);
  // Length is counted on the WRITTEN sentence (a spelled "A P I" is one word to
  // a listener); the acronym check reads the SPOKEN one, which is what is voiced.
  for (const sentence of written.split(/(?<=[.!?])\s+/)) {
    const n = sentence.split(/\s+/).filter(Boolean).length;
    if (n > maxWords) err(`${id}: a sentence has ${n} words (limit ${maxWords}): "${sentence}"`);
  }
  for (const sentence of spoken.split(/(?<=[.!?])\s+/)) {
    if (/^([A-Z]\s){1,}[A-Z]\b/.test(sentence.trim())) err(`${id}: a sentence opens with a spelled acronym: "${sentence.slice(0, 40)}…" (rephrase so it doesn't lead)`);
  }
  for (const m of spoken.match(/\d+(?:[,.]\d+)*/g) ?? []) warn(`${id}: "${m}" is sent as digits; write it out, or add a pronunciation rule`);
  for (const a of take.anchors ?? []) {
    if (a.from > a.to) err(`${id}: anchor "${a.word}" window is reversed`);
    if (a.to < take.at || a.from > take.until) err(`${id}: anchor "${a.word}" (${a.from}-${a.to}s) is outside the take's window`);
    if (!written.toLowerCase().includes(a.word.toLowerCase()) && !spoken.toLowerCase().includes(a.word.toLowerCase())) err(`${id}: anchor "${a.word}" is not in the take`);
  }
});
console.log(`[lint] ${cfg.takes.length} takes, ${errors} failure(s), ${warnings} warning(s)`);
if (errors) process.exit(1);
