// The brand's pronunciation lexicon: how written terms are SPOKEN.
//
// brand-tokens.json `brand.pronunciations` is a list of rules:
//   { "written": "nginx", "spoken": "engine x" }
//   { "written": "17 weeks", "spoken": "seventeen weeks" }
//   { "written": "API", "spoken": "A P I", "caseSensitive": true }
//
// narrate.mjs writes each take's text with the written forms and sends the
// spoken forms to the voice; the captions turn the spoken words back into the
// written ones; the speech-to-text check requires every term the take uses to
// be heard. Matching is whole-word and done in ONE pass with one regular
// expression, so a rule's spoken form can never trigger another rule.
//
// Aliases (text substitution) rather than phoneme tags: phoneme rules only
// work on some ElevenLabs models and are silently ignored on others, while an
// alias is honoured by every model and can be tested without an API call.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Problems with a rule list, as strings; an empty array means it is usable. */
export function lintLexicon(rules) {
  const problems = [];
  if (!Array.isArray(rules)) return ['brand.pronunciations must be a list of { written, spoken } rules'];
  const seen = new Map();
  rules.forEach((r, i) => {
    const at = `pronunciations[${i}]`;
    if (!r || typeof r.written !== 'string' || !r.written.trim()) { problems.push(`${at}: "written" is empty`); return; }
    if (typeof r.spoken !== 'string' || !r.spoken.trim()) problems.push(`${at} (${r.written}): "spoken" is empty`);
    if (r.spoken === r.written) problems.push(`${at} (${r.written}): spoken is the same as written; remove the rule`);
    const k = r.caseSensitive ? r.written : r.written.toLowerCase();
    if (seen.has(k)) problems.push(`${at} (${r.written}): duplicates pronunciations[${seen.get(k)}]`);
    else seen.set(k, i);
  });
  return problems;
}

function matcher(rules, from, to) {
  const list = rules.filter((r) => r?.[from] && r?.[to]).sort((a, b) => b[from].length - a[from].length);
  if (!list.length) return (text) => text;
  // Whole-word: not preceded or followed by a letter or digit.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${list.map((r) => escape(r[from])).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return (text) => text.replace(re, (m) => {
    const rule = list.find((r) => (r.caseSensitive ? r[from] === m : r[from].toLowerCase() === m.toLowerCase()));
    return rule ? rule[to] : m;
  });
}

/** Compile rules into the two directions. */
export function compileLexicon(rules = []) {
  const usable = Array.isArray(rules) ? rules.filter((r) => r?.written && r?.spoken) : [];
  return {
    rules: usable,
    toSpoken: matcher(usable, 'written', 'spoken'),
    toWritten: matcher(usable, 'spoken', 'written'),
    /** The rules whose written form appears in `text`. */
    termsIn(text) {
      return usable.filter((r) => matcher([r], 'written', 'spoken')(text) !== text);
    },
  };
}
