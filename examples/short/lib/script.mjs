// Script rules and the script score, with no API: what npm run lint warns
// about beyond the hard checks, and what npm run score adds up before any
// credits are spent.
//
// The rules come from what keeps viewers watching a short explainer:
// - The voice starts in the first second, and the first sentence is short:
//   the opening is the hook.
// - One idea per take; sentences a listener can hold.
// - Caveats in one clause, or cut.
// - No machine-written tics ("it's not just X, it's Y", "game-changer",
//   "seamless"); they make a script sound generated.
// - An ending that tells the viewer where to go next.

/** Phrasings that read as machine-written. [label, regex]. */
export const AI_ISMS = [
  ['"not just X, it\'s Y"', /\bnot just\b[^.!?]{1,60}?\b(it'?s|but)\b/i],
  ['"in today\'s fast-paced…"', /\bin today'?s\b[^.!?]{0,30}\b(world|landscape|age)\b/i],
  ['"game-changer"', /\bgame[- ]?chang(er|ing)\b/i],
  ['"revolutionize"', /\brevolutioni[sz]e/i],
  ['"seamless"', /\bseamless(ly)?\b/i],
  ['"unlock"', /\bunlock(s|ing)?\b/i],
  ['"leverage"', /\bleverag(e|es|ing)\b/i],
  ['"delve"', /\bdelv(e|es|ing)\b/i],
  ['"elevate"', /\belevat(e|es|ing)\b/i],
  ['"cutting-edge"', /\bcutting[- ]edge\b/i],
  ['"harness the power"', /\bharness(es|ing)? the power\b/i],
  ['"the future of"', /\bthe future of\b/i],
  ['"imagine a world"', /\bimagine a world\b/i],
  ['"let that sink in"', /\blet that sink in\b/i],
  ['"buckle up"', /\bbuckle up\b/i],
];

const HEDGES = /\b(may|might|could|possibly|potentially|in some cases|subject to|depending on|results vary|not guaranteed|typically|generally)\b/gi;
const CTA_VERBS = /^(find|visit|try|start|get|join|see|learn|book|talk|watch|read|download|sign up|ask|go|come|meet|call|ship|build|make|bring)\b/i;

export const sentences = (text) => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
export const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

/** Machine-written phrasings in a text: [label]. */
export const aiIsms = (text) => AI_ISMS.filter(([, re]) => re.test(text)).map(([label]) => label);

/** Sentences with more than one hedge: a caveat that runs past one clause. */
export function longCaveats(text) {
  return sentences(text).filter((s) => (s.match(HEDGES) ?? []).length >= 2 || (/\b(however|although|though)\b/i.test(s) && (s.match(HEDGES) ?? []).length >= 1 && wordCount(s) > 12));
}

/** Does the last take tell the viewer where to go next: a web address, or a sentence that opens with a verb of action? */
export const hasCallToAction = (text) => /\b[\w-]+\.(com|org|net|io|ai|dev|app|co|gov|edu)\b/i.test(text) || sentences(text).some((s) => CTA_VERBS.test(s.trim()));

/** Warnings on the whole script: [{ id, message }]. */
export function scriptWarnings(takes) {
  const out = [];
  const first = takes[0];
  if (first) {
    if (first.at > 1.0) out.push({ id: first.id, message: `the voice starts at ${first.at}s; the hook should start within the first second` });
    const s1 = sentences(first.text ?? first.speak ?? '')[0] ?? '';
    if (wordCount(s1) > 12) out.push({ id: first.id, message: `the opening sentence has ${wordCount(s1)} words; a hook of 12 or fewer lands faster` });
  }
  for (const t of takes) {
    const text = t.text ?? t.speak ?? '';
    for (const label of aiIsms(text)) out.push({ id: t.id, message: `${label} reads as machine-written; say it plainly` });
    for (const s of longCaveats(text)) out.push({ id: t.id, message: `a caveat runs past one clause; keep it to one or cut it: "${s}"` });
    if (sentences(text).length > 3) out.push({ id: t.id, message: `${sentences(text).length} sentences in one take; one idea per scene` });
  }
  const last = takes.at(-1);
  if (last && !hasCallToAction(last.text ?? last.speak ?? '')) out.push({ id: last.id, message: 'the last take has no call to action (a web address, or a line that tells the viewer what to do)' });
  return out;
}

/**
 * The script's score out of 10, from what the script and film.json say alone.
 * It is a checklist, not a prediction: each item names what would raise it.
 *   takes: narration.json takes; facts: film.json facts
 */
export function scoreScript({ takes, facts = [] }) {
  const items = [];
  const add = (name, points, max, note) => items.push({ name, points, max, note });
  const texts = takes.map((t) => t.text ?? t.speak ?? '');
  const all = texts.join(' ');

  const first = takes[0];
  const s1 = sentences(texts[0] ?? '')[0] ?? '';
  add('hook starts at once', first && first.at <= 1.0 ? 1 : 0, 1, first ? `voice at ${first.at}s (want 1.0s or sooner)` : 'no takes');
  add('hook is short', wordCount(s1) <= 12 ? 1 : 0, 1, `opening sentence ${wordCount(s1)} words (want 12 or fewer)`);

  // Pace: words per second of each take's window. A narrator reads about 2.5.
  const words = texts.reduce((s, t) => s + wordCount(t), 0);
  const seconds = takes.reduce((s, t) => s + Math.max(0, (t.until ?? 0) - (t.at ?? 0)), 0);
  const wps = seconds ? words / seconds : 0;
  add('pace', wps >= 2.0 && wps <= 2.9 ? 2 : wps >= 1.6 && wps <= 3.3 ? 1 : 0, 2, `${wps.toFixed(2)} words per second of window (want 2.0 to 2.9)`);

  const ss = takes.flatMap((t, i) => sentences(texts[i]));
  const avg = ss.length ? ss.reduce((s, x) => s + wordCount(x), 0) / ss.length : 0;
  add('sentences a listener can hold', avg <= 14 ? 1 : 0, 1, `${avg.toFixed(1)} words a sentence on average (want 14 or fewer)`);
  const crowded = takes.filter((t, i) => sentences(texts[i]).length > 3).map((t) => t.id);
  add('one idea per take', crowded.length ? 0 : 1, 1, crowded.length ? `more than three sentences in ${crowded.join(', ')}` : 'every take has three sentences or fewer');

  const isms = [...new Set(aiIsms(all))];
  add('plain words', isms.length ? 0 : 1, 1, isms.length ? `machine-written phrasing: ${isms.join(', ')}` : 'no machine-written phrasing');
  const caveats = longCaveats(all);
  add('short caveats', caveats.length ? 0 : 1, 1, caveats.length ? `${caveats.length} caveat(s) run past one clause` : 'caveats stay in one clause');

  add('call to action', hasCallToAction(texts.at(-1) ?? '') ? 1 : 0, 1, 'the last take tells the viewer where to go');
  add('facts listed', facts.length ? 1 : 0, 1, facts.length ? `${facts.length} load-bearing fact(s) checked against the source` : 'film.json lists no facts to check against the source');

  const score = items.reduce((s, i) => s + i.points, 0);
  return { score, outOf: items.reduce((s, i) => s + i.max, 0), items };
}
