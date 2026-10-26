// Translations: which languages a film has, where each one's files live, and
// how a captions-only language is timed.
//
// narration.json lists them:
//   "language": "en",                                  the film's own language
//   "languages": [{ "code": "es", "mode": "voice" },   captions AND a voice-over
//                 { "code": "fr", "mode": "captions" }] captions only
//
// Each translation is narration.<code>.json: one entry per take with the
// translated `text`, the English it was translated from (`source`) and a hash
// of it (`sourceHash`), so a translation whose English has since changed is
// caught as stale (`npm run lint`). `npm run translate` writes and refreshes the
// skeleton; the translating itself is done by a person or by Claude.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const sourceHash = (text) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 12);

/** Paths for a language; `code` null or the film's own language means the base film. */
export function langPaths(here, code, base = 'en') {
  const own = !code || code === base;
  return {
    own,
    code: own ? base : code,
    narrationFile: join(here, own ? 'narration.json' : `narration.${code}.json`),
    narrationDir: join(here, own ? 'narration' : join('narration', code)),
    lockFile: join(here, own ? 'takes.lock.json' : `takes.lock.${code}.json`),
    suffix: own ? '' : `.${code}`,
  };
}

/** The film's languages from narration.json: [{ code, mode }]. */
export function filmLanguages(cfg) {
  return (cfg.languages ?? []).map((l) => (typeof l === 'string' ? { code: l, mode: 'captions' } : { mode: 'captions', ...l }));
}

/**
 * The takes for a language: the base takes' timing (at, until, scene) with the
 * translation's text. Throws on a missing, empty or stale translation.
 */
export function translatedTakes(here, cfg, code) {
  const p = join(here, `narration.${code}.json`);
  if (!existsSync(p)) throw new Error(`no narration.${code}.json: run npm run translate -- ${code}`);
  const tr = JSON.parse(readFileSync(p, 'utf8'));
  const byId = new Map((tr.takes ?? []).map((t) => [t.id, t]));
  const problems = [];
  const takes = cfg.takes.map((base) => {
    const t = byId.get(base.id);
    const english = base.text ?? base.speak;
    if (!t || !t.text?.trim()) problems.push(`${base.id}: not translated`);
    else if (t.stale || t.sourceHash !== sourceHash(english)) problems.push(`${base.id}: stale (the ${cfg.language ?? 'en'} line changed since it was translated; re-translate it and remove "stale")`);
    return { id: base.id, at: base.at, until: base.until, scene: base.scene, text: t?.text ?? '', anchors: [] };
  });
  return { translation: tr, takes, problems };
}

/** A language's lexicon: its own rules, plus the general ones (no `lang`) it doesn't override. */
export function rulesFor(rules = [], code, base = 'en') {
  const own = rules.filter((r) => r.lang === code || (code === base && r.lang === base));
  const taken = new Set(own.map((r) => (r.caseSensitive ? r.written : r.written.toLowerCase())));
  return [...own, ...rules.filter((r) => !r.lang && !taken.has(r.caseSensitive ? r.written : r.written.toLowerCase()))];
}

/**
 * Caption cues for a captions-only language, timed onto the film's own speech:
 * each take's translation is split into short chunks and laid over the span the
 * original take was actually spoken (from its word times), in proportion to
 * length. `timed` is narration/manifest.json's takes (with words), or the base
 * takes' windows when the film has no voice.
 */
export function distributedCues(texts, timed, maxWords = 10) {
  const cues = [];
  for (const t of timed) {
    const text = texts.get(t.id);
    if (!text) continue;
    const start = t.words?.length ? t.words[0].start : t.at;
    const end = t.words?.length ? t.words.at(-1).end : t.until;
    const chunks = chunk(text, maxWords);
    const total = chunks.reduce((s, c) => s + c.length, 0) || 1;
    let at = start;
    for (const c of chunks) {
      const d = (end - start) * (c.length / total);
      cues.push([at, at + d + 0.25, c]);
      at += d;
    }
  }
  for (let i = 0; i < cues.length - 1; i++) cues[i][1] = Math.min(cues[i][1], cues[i + 1][0]);
  return cues;
}

/** Split into sentences, and long sentences at commas, keeping each chunk short. */
export function chunk(text, maxWords = 10) {
  const out = [];
  for (const sentence of text.trim().split(/(?<=[.!?。！？])\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords + 4) { out.push(sentence); continue; }
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if ((/[,;:，、]$/.test(w) && cur.length >= maxWords / 2) || cur.length >= maxWords + 4) { out.push(cur.join(' ')); cur = []; }
    }
    if (cur.length) out.push(cur.join(' '));
  }
  return out;
}
