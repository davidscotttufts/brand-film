// A recorded voice-over: a person reads the script, mistakes, retakes and
// pauses included, and this turns the recording into the film's takes.
//
// 1. FIND each take in the transcript (timed words from speech-to-text): the
//    stretch of the recording that best matches the take's text, searching
//    after the previous take. Several attempts at a line: the closest one
//    wins, and of equally close ones the LAST, since a speaker repeats a line
//    to get it right.
// 2. DROP what isn't in the script inside that stretch (a stumble, "um", a
//    repeated word), and SHORTEN every pause longer than maxPause.
// 3. CUT on the waveform, not just the transcript: a transcriber's word ends
//    are often early, so each kept word is extended until its sound actually
//    falls to the room's noise floor, and never into a neighbouring word. A
//    cut made on the transcript alone clips the ends of words.
// 4. The take's words keep the SCRIPT's spelling, timed from what was heard,
//    so the captions, anchors and the spoken-word check work as for a voiced
//    take.
//
// Everything here is pure (arrays in, plans out); narrate.mjs runs ffmpeg.
import { normalize } from './verify.mjs';

/** Normalized tokens of words, each pointing back at its word: [{ tok, w }]. */
export function tokens(words, lang = 'en') {
  const out = [];
  words.forEach((w, i) => { for (const tok of normalize(typeof w === 'string' ? w : w.text, lang)) out.push({ tok, w: i }); });
  return out;
}

/**
 * Best match of ref (tokens) inside hyp (tokens) from index `from`: free start
 * and end in hyp, every ref token aligned. Ties go to the latest end.
 * Returns { cost, start, end, ops: [{ op: 'match'|'sub'|'ins'|'del', r?, h? }] }.
 */
export function alignTake(ref, hyp, from = 0) {
  const n = ref.length, m = hyp.length - from;
  if (!n || m <= 0) return { cost: n || Infinity, start: from, end: from, ops: [] };
  const W = m + 1;
  const D = new Int32Array((n + 1) * W);
  for (let i = 1; i <= n; i++) D[i * W] = i;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = ref[i - 1] === hyp[from + j - 1];
      D[i * W + j] = Math.min(D[(i - 1) * W + j - 1] + (same ? 0 : 1), D[(i - 1) * W + j] + 1, D[i * W + j - 1] + 1);
    }
  }
  let best = 1;
  for (let j = 1; j <= m; j++) if (D[n * W + j] <= D[n * W + best]) best = j;
  const ops = [];
  let i = n, j = best;
  // Walk back: an exact match first, then an extra word in the recording (a
  // stumble), then a word said differently, then a word not said at all.
  while (i > 0) {
    const here = D[i * W + j];
    const same = j > 0 && ref[i - 1] === hyp[from + j - 1];
    if (same && here === D[(i - 1) * W + j - 1]) { ops.push({ op: 'match', r: i - 1, h: from + j - 1 }); i--; j--; }
    else if (j > 0 && here === D[i * W + j - 1] + 1) { ops.push({ op: 'ins', h: from + j - 1 }); j--; }
    else if (j > 0 && here === D[(i - 1) * W + j - 1] + 1) { ops.push({ op: 'sub', r: i - 1, h: from + j - 1 }); i--; j--; }
    else { ops.push({ op: 'del', r: i - 1 }); i--; }
  }
  ops.reverse();
  return { cost: D[n * W + best], start: from + j, end: from + best, ops };
}

/** The best of several ways to write a take (spoken and written forms): lowest cost, then latest. */
export function findTake(refs, hypTokens, from, lang = 'en') {
  let best = null;
  for (const text of refs) {
    const refWords = text.split(/\s+/).filter(Boolean);
    const rt = tokens(refWords, lang);
    const a = alignTake(rt.map((t) => t.tok), hypTokens.map((t) => t.tok), from);
    const cand = { ...a, refWords, refTokens: rt, wer: rt.length ? a.cost / rt.length : 1 };
    if (!best || cand.cost < best.cost || (cand.cost === best.cost && cand.end > best.end)) best = cand;
  }
  return best;
}

/** Room noise and a speech threshold from 10 ms frame levels (dB): the 10th percentile, plus `above` dB. */
export function threshold(levels, above = 10) {
  const s = [...levels].filter(Number.isFinite).sort((a, b) => a - b);
  const floor = s[Math.floor(s.length * 0.1)] ?? -90;
  return Math.min(floor + above, -30);
}

/**
 * Where a take's audio comes from in the recording: [{ from, to }] segments,
 * and its words re-timed onto the cut take.
 *   words:  the transcript's timed words; hyp: tokens(words)
 *   match:  findTake's result
 *   level:  (t) => the recording's level in dB at t (10 ms frames)
 *   opts:   maxPause (s), lead (s before the first word), tail (s after the last)
 */
export function planTake({ words, hyp, match, level, thr, maxPause = 0.3, lead = 0.08, tail = 0.15 }) {
  // Which transcript words are kept (any token matched or substituted) and which are dropped.
  const kept = new Set();
  for (const o of match.ops) if (o.op === 'match' || o.op === 'sub') kept.add(hyp[o.h].w);
  const span = [...kept].sort((a, b) => a - b);
  if (!span.length) return { segments: [], words: [], dropped: [] };
  const first = span[0], last = span.at(-1);
  const dropped = [];
  for (let w = first; w <= last; w++) if (!kept.has(w)) dropped.push(w);

  // Waveform-refined edges of each kept word: never into a neighbour, any neighbour.
  const step = 0.01;
  const loud = (t) => level(t) > thr;
  const edge = (w) => {
    const prevEnd = w > 0 ? words[w - 1].end : 0;
    const nextStart = w + 1 < words.length ? words[w + 1].start : Infinity;
    let s = words[w].start, e = words[w].end;
    for (let k = 0; k < 25 && s - step > prevEnd + 0.02 && loud(s - step); k++) s -= step;
    for (let k = 0; k < 40 && e + step < nextStart - 0.02 && loud(e); k++) e += step;
    return { s, e, prevEnd, nextStart };
  };
  const E = new Map(span.map((w) => [w, edge(w)]));

  const segments = [];
  let cur = { from: Math.max(E.get(first).prevEnd + 0.01, E.get(first).s - lead, 0) };
  for (let k = 0; k + 1 < span.length; k++) {
    const a = span[k], b = span[k + 1];
    const between = b - a > 1; // a dropped word sits between them
    const gap = E.get(b).s - E.get(a).e;
    if (!between && gap <= maxPause) continue;
    // Close after a, open before b, keeping at most maxPause of quiet across the join.
    const limitA = between ? words[a + 1].start - 0.02 : E.get(b).s;
    const limitB = between ? words[b - 1].end + 0.02 : E.get(a).e;
    cur.to = Math.min(E.get(a).e + maxPause / 2, Math.max(E.get(a).e, limitA));
    segments.push(cur);
    cur = { from: Math.max(E.get(b).s - maxPause / 2, Math.min(E.get(b).s, limitB)) };
  }
  cur.to = Math.min(E.get(last).e + tail, E.get(last).nextStart - 0.02);
  segments.push(cur);

  // Recording time → cut-take time.
  const offsets = [];
  let acc = 0;
  for (const s of segments) { offsets.push(acc - s.from); acc += s.to - s.from; }
  const toTake = (t) => {
    const i = segments.findIndex((s) => t >= s.from - 1e-6 && t <= s.to + 1e-6);
    return i === -1 ? null : t + offsets[i];
  };

  // The script's words, timed from the transcript words they were heard as.
  const timed = match.refWords.map((text) => ({ text, start: null, end: null }));
  for (const o of match.ops) {
    if (o.op !== 'match' && o.op !== 'sub') continue;
    const rw = match.refTokens[o.r].w, hw = hyp[o.h].w;
    const s = toTake(words[hw].start), e = toTake(Math.min(words[hw].end, E.get(hw)?.e ?? words[hw].end));
    if (s == null || e == null) continue;
    timed[rw].start = timed[rw].start == null ? s : Math.min(timed[rw].start, s);
    timed[rw].end = timed[rw].end == null ? e : Math.max(timed[rw].end, e);
  }
  // A script word that wasn't heard gets the time between its neighbours.
  for (let i = 0; i < timed.length; i++) {
    if (timed[i].start != null) continue;
    const prev = timed.slice(0, i).reverse().find((x) => x.end != null)?.end ?? 0;
    const next = timed.slice(i + 1).find((x) => x.start != null)?.start ?? prev;
    timed[i].start = prev; timed[i].end = Math.max(prev, next);
  }
  return {
    segments: segments.map((s) => ({ from: +s.from.toFixed(3), to: +s.to.toFixed(3) })),
    words: timed.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })),
    kept: span.map((w) => words[w].text),
    dropped: dropped.map((w) => words[w].text),
    duration: +acc.toFixed(3),
  };
}

/** ffmpeg filter that cuts the segments out of input 0 and joins them, with 10 ms fades so no join clicks. */
export function segmentFilter(segments) {
  const g = segments.map((s, i) => {
    const d = Math.min(0.01, (s.to - s.from) / 4);
    return `[0:a]atrim=start=${s.from}:end=${s.to},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${d},afade=t=out:st=${(s.to - s.from - d).toFixed(4)}:d=${d}[s${i}]`;
  });
  g.push(`${segments.map((_, i) => `[s${i}]`).join('')}concat=n=${segments.length}:v=0:a=1,highpass=f=70,aformat=sample_rates=44100:channel_layouts=mono[out]`);
  return g.join(';');
}
