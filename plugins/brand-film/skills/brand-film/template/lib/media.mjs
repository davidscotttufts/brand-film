// Footage: where a clip came from and whether the film may use it, shot
// boundaries, and what a finished video looks and sounds like.
import { spawnSync } from 'node:child_process';

/**
 * The licences a clip may carry. Footage with none of these stays out of the
 * film: a brand film that uses footage it has no right to is worse than one
 * with no footage at all.
 */
export const LICENCES = {
  own: 'made by the brand or for it (its own recording, a render, a screen capture)',
  licensed: 'bought or licensed for this use (stock, an agency)',
  'press-kit': 'from the maker\'s press or media kit, for editorial use',
  permission: 'used with the owner\'s written permission',
  'public-domain': 'no rights reserved',
  cc0: 'Creative Commons Zero',
  'cc-by': 'Creative Commons Attribution: credit required',
  'cc-by-sa': 'Creative Commons Attribution-ShareAlike: credit required',
};

/** Problems with a clips.json entry, as strings; empty when it may be used. */
export function clipProblems(c) {
  const p = [];
  const id = c.id ?? '(no id)';
  if (!c.id || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)) p.push(`${id}: "id" must be lower-case letters, digits and hyphens`);
  const sources = ['file', 'url', 'blender'].filter((k) => c[k]);
  if (!sources.length) p.push(`${id}: give a "file", a "url" or a "blender" script`);
  if (c.blender && (c.file || c.url)) p.push(`${id}: a blender clip is rendered, so it has no "file" or "url"`);
  const lic = c.blender ? (c.licence ?? 'own') : c.licence;
  if (!lic) p.push(`${id}: no "licence"; one of ${Object.keys(LICENCES).join(', ')} (references/footage.md)`);
  else if (!LICENCES[lic]) p.push(`${id}: licence "${lic}" is not one of ${Object.keys(LICENCES).join(', ')}`);
  if (/^cc-by/.test(lic ?? '') && !c.credit) p.push(`${id}: ${lic} requires a "credit" (who to attribute)`);
  if (c.in != null && c.out != null && !(c.out > c.in)) p.push(`${id}: "out" (${c.out}s) must be after "in" (${c.in}s)`);
  if (c.blender && !(c.frames > 0)) p.push(`${id}: a blender clip needs "frames"`);
  return p;
}

/** A video's duration (s), size and frame rate, from ffmpeg's own report. */
export function probe(ffmpegPath, file) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const err = r.stderr ?? '';
  const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(err);
  const v = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})[^\n]*?(?:([\d.]+) fps|([\d.]+) tbr)/.exec(err);
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : NaN,
    width: v ? +v[1] : NaN,
    height: v ? +v[2] : NaN,
    fps: v ? +(v[3] ?? v[4]) : NaN,
    audio: /Stream #[^\n]*Audio:/.test(err),
  };
}

/** Shot boundaries from ffmpeg's scene-change score: [{ start, end }] covering the whole video. */
export function detectShots(ffmpegPath, file, { threshold = 0.3, minShot = 0.4 } = {}) {
  const { duration } = probe(ffmpegPath, file);
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const cuts = [...(r.stderr ?? '').matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]);
  return shotsFromCuts(cuts, duration, minShot);
}

/** Cut times → shots, dropping cuts closer than minShot to the previous one (flashes, fast pans). */
export function shotsFromCuts(cuts, duration, minShot = 0.4) {
  const edges = [0];
  for (const c of [...cuts].sort((a, b) => a - b)) if (c - edges.at(-1) >= minShot && duration - c >= minShot) edges.push(c);
  edges.push(duration);
  return edges.slice(0, -1).map((s, i) => ({ start: +s.toFixed(3), end: +edges[i + 1].toFixed(3) }));
}

/** Median, mean and the cuts a minute of a list of shots. */
export function pacing(shots) {
  const lens = shots.map((s) => s.end - s.start).sort((a, b) => a - b);
  const total = lens.reduce((s, x) => s + x, 0);
  return {
    shotCount: lens.length,
    medianShot: +(lens[Math.floor(lens.length / 2)] ?? 0).toFixed(2),
    meanShot: +(lens.length ? total / lens.length : 0).toFixed(2),
    cutsPerMinute: +(total ? ((lens.length - 1) / total) * 60 : 0).toFixed(1),
  };
}

/**
 * The main colours of RGB pixels (a Uint8Array of r,g,b…): k-means from
 * starting points spread by brightness, so the result is the same on every run.
 * [{ hex, share }], most used first.
 */
export function palette(rgb, k = 6) {
  const n = Math.floor(rgb.length / 3);
  if (!n) return [];
  const px = (i) => [rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]];
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => lum(px(a)) - lum(px(b)));
  let centres = Array.from({ length: k }, (_, j) => px(order[Math.floor(((j + 0.5) / k) * n)]));
  const assign = new Uint16Array(n);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const c = px(i);
      let best = 0, bd = Infinity;
      centres.forEach((m, j) => { const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2; if (d < bd) { bd = d; best = j; } });
      assign[i] = best;
      const s = sums[best]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++;
    }
    centres = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[j]));
  }
  const counts = centres.map(() => 0);
  for (let i = 0; i < n; i++) counts[assign[i]]++;
  const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  return centres.map((c, j) => ({ hex: hex(c), share: +(counts[j] / n).toFixed(3) })).filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}
