// The brand's house style: what one film taught that the next should know.
//
// house-style.md (brand-tokens.json `brand.houseStyle` names another path, so
// several films of one brand can share one file) holds four sections:
//
//   ## Script     notes on wording, hooks, pacing        (read when writing the script)
//   ## Picture    notes on layout, motion, footage       (read when building the scene)
//   ## Sound      notes on voice, effects, music, mix    (read when voicing and mixing)
//   ## Never say  words and phrases the brand never uses (npm run lint FAILS on them)
//
// Each note is one "- " list item. `npm run lesson -- <section> "<note>"` adds
// one, dated, so a correction made in one film's review is not made again in
// the next. Anything else in the file (an intro, sub-headings) is kept as is.
export const SECTIONS = { script: 'Script', picture: 'Picture', sound: 'Sound', never: 'Never say' };

export const EMPTY = `# House style

What earlier films taught. Claude reads this before writing a script, building a
scene or mixing, and adds to it after each round of review (\`npm run lesson\`),
so a note given once applies to every film after it.

## Script

## Picture

## Sound

## Never say

<!-- One word or phrase per item. npm run lint fails on any take that uses one. -->
`;

/** { script: [notes], picture: [], sound: [], never: [phrases] } from the markdown. */
export function parseHouseStyle(md) {
  const out = Object.fromEntries(Object.keys(SECTIONS).map((k) => [k, []]));
  const byTitle = new Map(Object.entries(SECTIONS).map(([k, v]) => [v.toLowerCase(), k]));
  let cur = null;
  for (const line of md.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = byTitle.get(h[1].toLowerCase()) ?? null; continue; }
    const item = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (cur && item) out[cur].push(item[1].replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, '').replace(/^["“](.+)["”]$/, '$1'));
  }
  return out;
}

/** The markdown with one note added at the end of its section (the section is created if missing). */
export function addLesson(md, section, note, date = new Date().toISOString().slice(0, 10)) {
  const title = SECTIONS[section];
  if (!title) throw new Error(`unknown section "${section}"; use one of ${Object.keys(SECTIONS).join(', ')}`);
  const text = note.trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('the note is empty');
  const item = section === 'never' ? `- ${text}` : `- ${text} (${date})`;
  const lines = (md || EMPTY).split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`, 'i').test(l));
  if (start === -1) return `${(md || EMPTY).replace(/\s*$/, '')}\n\n## ${title}\n\n${item}\n`;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end === -1) end = lines.length;
  // After the section's last list item, or right under its heading.
  let at = start + 1;
  for (let i = start + 1; i < end; i++) if (/^\s*[-*]\s+/.test(lines[i])) at = i + 1;
  if (at === start + 1) { lines.splice(at, 0, '', item); } else lines.splice(at, 0, item);
  return lines.join('\n');
}

/** Never-say phrases a text uses: [{ phrase, index }]. Whole-word, case-insensitive. */
export function neverSaid(text, phrases) {
  const hits = [];
  for (const phrase of phrases) {
    const p = phrase.trim();
    if (!p) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
    const m = re.exec(text);
    if (m) hits.push({ phrase: p, index: m.index });
  }
  return hits;
}
