// Makes the sound effects in sfx.json.
//
//   npm run sfx    # then: npm run render
//
// Two kinds:
// - SYNTHESIZED (`source`, an ffmpeg lavfi recipe): no API and no credits, the
//   same bytes on every machine, rebuilt rather than committed (sfx/*.wav).
// - GENERATED (`prompt`): ElevenLabs sound effects from a description, for a
//   sound a recipe can't make (a door, a crowd, a camera shutter). Costs
//   credits; made once, cached and COMMITTED (sfx/*.mp3), since a re-generation
//   is a different sound. sfx.lock.json records the prompt, model, length and
//   the plan it was made on. `durationSeconds` (0.5 to 30) and
//   `promptInfluence` (0 to 1) are optional.
// Effects are cached in sfx/ keyed by a hash of their recipe or prompt, so
// re-running only makes what changed. sfx/manifest.json records each effect's
// file and gain; render.mjs reads it and mixes the cues a scene lists in window.SFX.
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
const lockPath = join(here, 'sfx.lock.json');
const prevLock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')).effects ?? {} : {};
const lock = {};
let eleven = null; // loaded only when a generated effect has to be made
for (const [id, e] of Object.entries(cfg.effects)) {
  if (e.prompt) {
    const body = { text: e.prompt, model_id: e.model ?? 'eleven_text_to_sound_v2', ...(e.durationSeconds != null ? { duration_seconds: e.durationSeconds } : {}), ...(e.promptInfluence != null ? { prompt_influence: e.promptInfluence } : {}) };
    const key = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    const file = `${id}.${key}.mp3`;
    keep.add(file);
    if (!existsSync(join(out, file))) {
      eleven ??= await import('./lib/elevenlabs.mjs');
      if (!eleven.hasCli()) { console.error(`${id}: a generated effect needs the ElevenLabs CLI (npm i -g @elevenlabs/cli, then elevenlabs auth login)`); process.exit(1); }
      eleven.el(['text-to-sound-effects', 'convert', '--json', JSON.stringify(body), '--output', join(out, file)]);
      lock[id] = { key, prompt: e.prompt, model: body.model_id, durationSeconds: e.durationSeconds ?? null, promptInfluence: e.promptInfluence ?? null, generatedAt: new Date().toISOString(), plan: eleven.account()?.tier ?? null };
      console.log(`made    ${id} (ElevenLabs)`);
    } else {
      lock[id] = prevLock[id]?.key === key ? prevLock[id] : { key, prompt: e.prompt, model: body.model_id, durationSeconds: e.durationSeconds ?? null, promptInfluence: e.promptInfluence ?? null, generatedAt: null, plan: null };
      console.log(`cached  ${id}`);
    }
    manifest.effects[id] = { file: `sfx/${file}`, gain: e.gain };
    continue;
  }
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
if (Object.keys(lock).length) writeFileSync(lockPath, JSON.stringify({ $comment: 'How each generated effect was made. Committed with sfx/*.mp3; written by npm run sfx.', effects: lock }, null, 2) + '\n');
console.log(`\n${Object.keys(manifest.effects).length} effects ready.`);
