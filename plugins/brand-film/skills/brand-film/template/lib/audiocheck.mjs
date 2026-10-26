// Is every spoken word in the finished film? A check on the MIX, not the takes.
//
// For each word in narration/manifest.json it measures the word's level in the
// finished film and in its take's own audio file. The difference is the gain
// the mix applied to that word (loudness normalization, the limiter, music
// under it), and it is about the same for every word in a film. A word whose
// gain is far below the film's typical gain was lost by the mix: cut off,
// dropped or swamped.
//
// This is what caught the end-of-film cutoff: the voice bus was split for the
// music's ducking key with an endlessly padded branch, loudnorm held its last
// ~3 s of look-ahead, and the final words of the last take never reached the
// mix. Every take was fine on its own; only the finished film was missing them.
//
// Each file is decoded once (mono, 16 kHz) and measured in memory.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const RATE = 16000;

function decode(ffmpegPath, file) {
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`could not decode ${file}: ${String(r.stderr).trim()}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
}

/** RMS level of [a, b) seconds, in dBFS; -Infinity for silence or an empty window. */
function level(pcm, a, b) {
  const i0 = Math.max(0, Math.floor(a * RATE)), i1 = Math.min(pcm.length, Math.ceil(b * RATE));
  if (i1 <= i0) return -Infinity;
  let sum = 0;
  for (let i = i0; i < i1; i++) sum += pcm[i] * pcm[i];
  return 10 * Math.log10(sum / (i1 - i0) || 1e-12);
}

/**
 * Words the mix lost. `maxDropDb`: how far under the film's median mix gain a
 * word may sit before it counts as lost.
 * Returns { words, medianGainDb, lost: [{ take, word, at, gainDb }] }.
 */
export function checkSpokenWords({ ffmpegPath, mp4, manifest, dir, maxDropDb = 10 }) {
  const mix = decode(ffmpegPath, mp4);
  const measured = [];
  for (const take of manifest.takes) {
    const src = decode(ffmpegPath, join(dir, take.file));
    for (const w of take.words ?? []) {
      const end = Math.max(w.end, w.start + 0.12); // a very short word is measured over 120 ms
      const inMix = level(mix, w.start, end);
      const inTake = level(src, w.start - take.at, end - take.at);
      if (inTake === -Infinity || inTake < -60) continue; // nothing to compare against
      measured.push({ take: take.id, word: w.text, at: w.start, gainDb: inMix - inTake });
    }
  }
  const sorted = measured.map((m) => m.gainDb).sort((a, b) => a - b);
  const medianGainDb = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const lost = measured.filter((m) => m.gainDb < medianGainDb - maxDropDb);
  return { words: measured.length, medianGainDb, lost };
}
