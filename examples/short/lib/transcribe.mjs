// Speech-to-text, with a fallback: ElevenLabs first, then a local whisper.cpp.
//
// The listening check (narrate.mjs) and a recorded voice-over (lib/recorded.mjs)
// both need a transcript. When ElevenLabs refuses a file (its size, its format,
// the plan, the network) the run should not stop there: if whisper.cpp is
// installed, the same file is transcribed locally, and the result says which
// transcriber heard it, so takes.lock.json records it.
//
// whisper.cpp: install it (brew install whisper-cpp) and point WHISPER_MODEL at
// a model file (e.g. ggml-base.en.bin; a multilingual model for other
// languages). WHISPER_CPP names the binary when it isn't `whisper-cli`.
//
// transcribe(file, { model, lang, words }) → { text, words: [{ text, start, end }], transcriber, errors }
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { elJson, hasCli } from './elevenlabs.mjs';

const whisperBin = () => process.env.WHISPER_CPP || 'whisper-cli';

/** The transcribers this machine has, in the order they are tried. */
export function engines({ ffmpegPath } = {}) {
  return [
    {
      name: 'elevenlabs',
      available: () => hasCli(),
      run(file, { model = 'scribe_v1', lang = 'en', words = false }) {
        const args = ['speech-to-text', 'convert', '--model-id', model, '--file', file, '--tag-audio-events', 'false', '--language-code', lang];
        if (words) args.push('--timestamps-granularity', 'word');
        const r = elJson(args);
        return { text: r.text ?? '', words: (r.words ?? []).filter((w) => (w.type ?? 'word') === 'word' && w.text?.trim()).map((w) => ({ text: w.text.trim(), start: w.start, end: w.end })) };
      },
    },
    {
      name: 'whisper.cpp',
      available: () => Boolean(process.env.WHISPER_MODEL && existsSync(process.env.WHISPER_MODEL) && ffmpegPath)
        && spawnSync(whisperBin(), ['--help'], { encoding: 'utf8' }).status === 0,
      run(file, { lang = 'en' }) {
        const dir = mkdtempSync(join(tmpdir(), 'bf-whisper-'));
        try {
          const wav = join(dir, 'in.wav');
          const c = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
          if (c.status !== 0) throw new Error(`ffmpeg could not convert ${file}: ${String(c.stderr).trim()}`);
          const r = spawnSync(whisperBin(), ['-m', process.env.WHISPER_MODEL, '-f', wav, '-l', lang.split('-')[0], '-oj', '-of', join(dir, 'out'), '-ml', '1', '-sow', '-np'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
          if (r.status !== 0) throw new Error(`whisper.cpp failed: ${String(r.stderr).trim().split('\n').slice(-2).join(' ')}`);
          return parseWhisperJson(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')));
        } finally { rmSync(dir, { recursive: true, force: true }); }
      },
    },
  ];
}

/** whisper.cpp -oj -ml 1 output (one segment a word) → { text, words }. */
export function parseWhisperJson(j) {
  const words = (j.transcription ?? [])
    .map((s) => ({ text: String(s.text ?? '').trim(), start: (s.offsets?.from ?? 0) / 1000, end: (s.offsets?.to ?? 0) / 1000 }))
    .filter((w) => w.text && !/^\[.*\]$/.test(w.text));
  return { text: words.map((w) => w.text).join(' '), words };
}

/**
 * Transcribe with the first transcriber that works. Throws, listing every
 * transcriber's error, when none does.
 */
export function transcribe(file, opts = {}, list = engines(opts)) {
  const errors = [];
  for (const e of list) {
    if (!e.available()) { errors.push(`${e.name}: not available`); continue; }
    try {
      const r = e.run(file, opts);
      if (errors.length) console.warn(`[transcribe] ${errors.join('; ')}; used ${e.name}`);
      return { ...r, transcriber: e.name, errors };
    } catch (err) {
      errors.push(`${e.name}: ${String(err.message).split('\n')[0]}`);
    }
  }
  throw new Error(`no transcriber could hear ${file}:\n  ${errors.join('\n  ')}\nSign in to ElevenLabs (elevenlabs auth login), or install whisper.cpp and set WHISPER_MODEL (references/sound.md).`);
}
