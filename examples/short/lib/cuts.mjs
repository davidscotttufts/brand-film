// Cut-downs: a shorter film made from ranges of the finished one.
//
// film.json `cuts` lists them:
//   { "id": "short", "aspect": "9:16", "ranges": [[0, 5.9], [14.2, 26]] }
// out/<basename>.short.mp4 is those ranges of the 9:16 film, joined, with a
// 30 ms audio fade at each join so a cut never clicks, and its own captions,
// report and spoken-word check. Ranges are FILM seconds, in order, inside the
// film, and land on frame boundaries. A range may not start or end inside a
// spoken word: cut in the gaps between takes, or between sentences.

/** Ranges snapped to frames, checked against the film and the voice. Returns { ranges, frames, length, problems }. */
export function planCut(cut, { duration, fps, takes = [] }) {
  const problems = [];
  const snap = (s) => Math.round(s * fps) / fps;
  const ranges = (cut.ranges ?? []).map(([a, b]) => [snap(a), snap(b)]);
  if (!ranges.length) problems.push('no ranges');
  ranges.forEach(([a, b], i) => {
    if (!(b > a)) problems.push(`range ${i + 1} (${a}-${b}s) is empty`);
    if (a < 0 || b > duration + 1e-6) problems.push(`range ${i + 1} (${a}-${b}s) runs outside the film (0-${duration}s)`);
    if (i && a < ranges[i - 1][1]) problems.push(`range ${i + 1} starts before range ${i} ends`);
  });
  for (const take of takes) {
    for (const w of take.words ?? []) {
      for (const edge of ranges.flat()) {
        if (edge > w.start + 0.02 && edge < w.end - 0.02) problems.push(`a cut at ${edge}s falls inside "${w.text}" (${w.start}-${w.end}s, take ${take.id})`);
      }
    }
  }
  if (ranges.length && ranges[0][0] > 0) problems.push(`the cut starts at ${ranges[0][0]}s, not on the opening card (players use the first frames as the thumbnail)`);
  const frames = ranges.reduce((s, [a, b]) => s + Math.round(b * fps) - Math.round(a * fps), 0);
  return { ranges, frames, length: frames / fps, problems };
}

/** Where film time t lands in the cut, or null when the cut leaves it out. */
export function toCut(ranges, t) {
  let off = 0;
  for (const [a, b] of ranges) {
    if (t >= a && t < b) return off + (t - a);
    off += b - a;
  }
  return null;
}

/** .vtt cues [[a, b, text]] for the cut: cues in a kept range, shifted and clipped to it. */
export function cutCues(cues, ranges) {
  const out = [];
  let off = 0;
  for (const [a, b] of ranges) {
    for (const [s, e, text] of cues) {
      if (e <= a || s >= b) continue;
      out.push([off + Math.max(s, a) - a, off + Math.min(e, b) - a, text]);
    }
    off += b - a;
  }
  return out;
}

/**
 * The narration manifest as the cut hears it, for the spoken-word check: each
 * kept word at its cut time. A take is split into one piece per range, each
 * with its own `at`, so a word is still measured against its own take's audio.
 */
export function cutManifest(manifest, ranges) {
  const takes = [];
  let off = 0;
  for (const [a, b] of ranges) {
    const shift = off - a;
    for (const t of manifest.takes ?? []) {
      const words = (t.words ?? []).filter((w) => w.start >= a && w.end <= b);
      if (!words.length) continue;
      takes.push({ ...t, at: t.at + shift, words: words.map((w) => ({ ...w, start: w.start + shift, end: w.end + shift })) });
    }
    off += b - a;
  }
  return { ...manifest, takes };
}

/** ffmpeg arguments that cut `src` to the ranges into `dest`, re-encoded with the film's settings. */
export function cutArgs(src, dest, ranges, { audio = true, fps = 30 } = {}) {
  const g = [];
  ranges.forEach(([a, b], i) => {
    g.push(`[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}]`);
    if (audio) {
      const d = Math.min(0.03, (b - a) / 4);
      g.push(`[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${d},afade=t=out:st=${(b - a - d).toFixed(4)}:d=${d}[a${i}]`);
    }
  });
  g.push(`${ranges.map((_, i) => `[v${i}]${audio ? `[a${i}]` : ''}`).join('')}concat=n=${ranges.length}:v=1:a=${audio ? 1 : 0}${audio ? '[v][a]' : '[v]'}`);
  return ['-y', '-loglevel', 'error', '-i', src, '-filter_complex', g.join(';'), '-map', '[v]', ...(audio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'] : []),
    // The film's rate, said outright: ffmpeg 7 gives a concat output no rate and
    // encodes it at 25 fps, dropping a frame in six.
    '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest];
}
