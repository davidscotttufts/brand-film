// Synthesizes the shared sound effects in sfx.json with the bundled ffmpeg.
//
//   npm run sfx    # then: npm run render
//
// No API and no credits: every effect is a few sine partials or filtered
// noise, so it is the same on every machine. Effects are cached in sfx/ keyed
// by a hash of their recipe, so re-running only rebuilds what changed; the
// clips are rebuilt rather than committed. sfx/manifest.json records each effect's file and gain;
// render.mjs reads it and mixes the cues a scene lists in window.SFX.
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'sfx.json'), 'utf8'));
const out = join(here, 'sfx');
mkdirSync(out, { recursive: true });

const manifest = { effects: {} };
const keep = new Set(['manifest.json']);
for (const [id, e] of Object.entries(cfg.effects)) {
  const key = createHash('sha256').update(JSON.stringify([e.source, e.filter ?? ''])).digest('hex').slice(0, 12);
  const file = `${id}.${key}.wav`;
  keep.add(file);
  if (!existsSync(join(out, file))) {
    execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', e.source,
      ...(e.filter ? ['-af', e.filter] : []), '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', join(out, file)],
    { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`made    ${id}`);
  } else {
    console.log(`cached  ${id}`);
  }
  manifest.effects[id] = { file: `sfx/${file}`, gain: e.gain };
}
for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(join(out, f));
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${Object.keys(manifest.effects).length} effects ready.`);
