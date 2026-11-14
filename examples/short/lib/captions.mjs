// Captions from the spoken words: the .vtt cues (a sentence, or a clause when
// a sentence runs long) and the burned-in cues (a few words at a time, each
// word with its own time, for captions drawn into the picture).
//
// Both put the WRITTEN forms back: narration/manifest.json `captionReplace`
// maps each lexicon rule's spoken form to its written one ("seventeen weeks"
// → "17 weeks"), so a caption never spells a name differently from the screen.

const MAX_WORDS = 10;

/** .vtt cues [[start, end, text]] from a narration manifest's word timings. */
export function narrationCues(n) {
  const fix = (text) => Object.entries(n.captionReplace ?? {}).reduce((t, [from, to]) => t.split(from).join(to), text);
  const cues = [];
  for (const take of n.takes) {
    let chunk = [];
    const flush = () => {
      if (!chunk.length) return;
      cues.push([chunk[0].start, chunk[chunk.length - 1].end + 0.25, fix(chunk.map((w) => w.text).join(' '))]);
      chunk = [];
    };
    for (const w of take.words) {
      chunk.push(w);
      const endsSentence = /[.!?:]$/.test(w.text);
      const endsClause = /,$/.test(w.text) && chunk.length >= 5;
      if (endsSentence || (endsClause && chunk.length >= MAX_WORDS / 2) || chunk.length >= MAX_WORDS + 4) flush();
    }
    flush();
  }
  // A cue never overlaps the next one.
  for (let i = 0; i < cues.length - 1; i++) cues[i][1] = Math.min(cues[i][1], cues[i + 1][0]);
  return cues;
}

const ts = (s) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23);
/** WebVTT text for [[start, end, text]] cues. */
export function vttText(cues) {
  const v = ['WEBVTT', ''];
  cues.forEach(([a, b, text], i) => { v.push(String(i + 1), `${ts(a)} --> ${ts(b)}`, text, ''); });
  return v.join('\n');
}

const bare = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/**
 * A take's words with the written forms put back: a run of spoken words that
 * matches a captionReplace entry becomes ONE word with the written text
 * (keeping the last word's trailing punctuation), timed from the first word's
 * start to the last word's end.
 */
export function captionWords(words, captionReplace = {}) {
  const rules = Object.entries(captionReplace)
    .map(([spoken, written]) => ({ parts: spoken.split(/\s+/).map(bare).filter(Boolean), written }))
    .filter((r) => r.parts.length)
    .sort((a, b) => b.parts.length - a.parts.length);
  const out = [];
  for (let i = 0; i < words.length;) {
    const rule = rules.find((r) => r.parts.every((p, k) => words[i + k] && bare(words[i + k].text) === p));
    if (!rule) { out.push({ ...words[i] }); i++; continue; }
    const last = words[i + rule.parts.length - 1];
    const trail = /[^\p{L}\p{N}]*$/u.exec(last.text)[0];
    out.push({ text: rule.written + (rule.written.endsWith(trail) ? '' : trail), start: words[i].start, end: last.end });
    i += rule.parts.length;
  }
  return out;
}

/**
 * Burned-in cues: at most `maxWords` words each, never across a sentence end,
 * each shown from its first word until the next cue (or 0.4 s after its last
 * word). [{ start, end, text, words }]
 */
export function burnCues(manifest, maxWords = 5) {
  const cues = [];
  for (const take of manifest.takes ?? []) {
    const ws = captionWords(take.words ?? [], manifest.captionReplace);
    let chunk = [];
    const flush = () => {
      if (!chunk.length) return;
      cues.push({ start: chunk[0].start, end: chunk.at(-1).end + 0.4, words: chunk, text: chunk.map((w) => w.text).join(' ') });
      chunk = [];
    };
    for (const w of ws) {
      chunk.push(w);
      if (/[.!?:]$/.test(w.text) || chunk.length >= maxWords || (/[,;]$/.test(w.text) && chunk.length >= 3)) flush();
    }
    flush();
  }
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i].end, cues[i + 1].start);
  return cues;
}

/** Burned-in cues for a silent film: the scene's CAPTIONS lines, shown whole. */
export const lineCues = (captions) => captions.map(([a, b, text]) => ({ start: a, end: b, text: text.replace(/<[^>]+>/g, ''), words: [] }));
