// A synthetic recorded voice-over for the template's script, with no
// microphone and no transcriber: a tone burst for every word, and the timed
// transcript a speech-to-text would return. It has what a real read has: a
// filler before the first line, a false start ("Two years ago, four product…")
// before a full second line, a doubled word ("in in") and a 1.6 s pause in the
// third, and transcript word ends 80 ms EARLY, as a transcriber's often are,
// so a cut on the transcript alone would clip every word.
//
//   node fake-recording.mjs <film dir>   # writes recordings/vo.wav and recordings/vo.words.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const RATE = 44100;
const WORD = 0.26, GAP = 0.07, TAIL = 0.08;
const script = [
  ['um', 0.5],
  'This is the story of how one team learned to ship faster.', ['', 1.2],
  'Two years ago, four product', ['', 0.8],
  'Two years ago, four product teams each worked their own backlog.', ['', 1.0],
  'This year, our first builder pod shipped in in 17', ['', 1.6], 'weeks.', ['', 1.1],
  'Ship faster. Find out how at example.com.', ['', 0.8],
];
const words = [];
let t = 0.4;
for (const part of script) {
  if (Array.isArray(part)) {
    if (part[0]) { words.push({ text: part[0], start: t, end: t + WORD - TAIL }); t += WORD + GAP; }
    t += part[1];
    continue;
  }
  for (const w of part.split(' ')) { words.push({ text: w, start: +t.toFixed(3), end: +(t + WORD - TAIL).toFixed(3) }); t += WORD + GAP; }
}
const total = t + 0.6;
const pcm = new Int16Array(Math.ceil(total * RATE));
let seed = 7;
for (let i = 0; i < pcm.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; pcm[i] = ((seed / 0x7fffffff) - 0.5) * 60; } // room noise, about -60 dBFS
for (const w of words) {
  const a = Math.floor(w.start * RATE), b = Math.floor((w.end + TAIL) * RATE); // the sound runs past the transcript's end
  for (let i = a; i < b; i++) {
    const k = (i - a) / (b - a);
    pcm[i] += Math.round(9000 * Math.sin(Math.PI * k) ** 0.5 * Math.sin(2 * Math.PI * 180 * (i / RATE)));
  }
}
const wav = Buffer.alloc(44 + pcm.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
Buffer.from(pcm.buffer).copy(wav, 44);
mkdirSync(join(dir, 'recordings'), { recursive: true });
writeFileSync(join(dir, 'recordings', 'vo.wav'), wav);
writeFileSync(join(dir, 'recordings', 'vo.words.json'), JSON.stringify({ transcriber: 'synthetic', words }, null, 1));
console.log(`fake recording: ${total.toFixed(1)}s, ${words.length} words`);
