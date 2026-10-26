// Gives a film folder synthetic narration and a score, with no ElevenLabs
// account: each take is a tone with word-like bursts, and the manifest lists a
// "word" per burst. Used by test-render.sh so CI renders the full mix (voice,
// ducked music, effects) and runs the spoken-word check on it. The last take
// ends 0.6 s before the film does, where a mix that drops a bus's tail would
// lose it.
//
//   node fake-narration.mjs <film dir>
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
// The film's own ffmpeg-static (scaffold.sh installs it).
const ffmpegPath = createRequire(join(dir, 'package.json'))('ffmpeg-static');
const html = readFileSync(join(dir, 'scene.html'), 'utf8');
const duration = Number(/const DURATION = ([\d.]+)/.exec(html)[1]);
mkdirSync(join(dir, 'narration'), { recursive: true });
mkdirSync(join(dir, 'music'), { recursive: true });
const takes = [];
const plan = [[0.8, 3.4], [6.2, 4.2], [14.6, 4.0], [duration - 4.6, 4.0]]; // [at, length]
plan.forEach(([at, len], k) => {
  const words = [];
  for (let t = 0.1; t + 0.32 <= len; t += 0.45) words.push({ text: `w${k}_${words.length}`, start: +(at + t).toFixed(3), end: +(at + t + 0.32).toFixed(3) });
  const file = `narration/t${k}.mp3`;
  // Bursts of a voiced-band tone at every word, silence between them.
  const expr = `0.5*sin(2*PI*220*t)*lt(mod(t-0.1\\,0.45)\\,0.32)*gte(t\\,0.1)`;
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc=${expr}:d=${len}:s=44100`, '-ac', '1', join(dir, file)]);
  takes.push({ id: `t${k}`, at, until: at + len + 0.2, speak: words.map((w) => w.text).join(' '), file, duration: len, words });
});
writeFileSync(join(dir, 'narration', 'manifest.json'), JSON.stringify({ model: 'synthetic', voice: { id: 'tone' }, captionReplace: {}, takes }, null, 2));
execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc=0.3*sin(2*PI*110*t)+0.2*sin(2*PI*165*t):d=${duration + 1}:s=44100`, '-ac', '2', join(dir, 'music', 'score.mp3')]);
writeFileSync(join(dir, 'music', 'manifest.json'), JSON.stringify({ file: 'music/score.mp3', lengthMs: (duration + 1) * 1000, levelDb: -10 }));
console.log(`fake narration: ${takes.length} takes, ${takes.reduce((s, t) => s + t.words.length, 0)} words, score ${duration + 1}s`);
