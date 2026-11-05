// Prepares the film's footage: every clip in clips.json, as exact frames.
//
//   npm run clips      # then use them in the scene with GFX.clip, and: npm run render
//
// A clip is footage the scene shows: the brand's own recording, a press-kit
// video, a stock shot, a 3D render. clips.json lists each one with WHERE it
// came from and the LICENCE that lets the film use it (lib/media.mjs LICENCES);
// a clip without one is refused, and so is a cc-by clip without a credit.
//
//   { "id": "walk", "file": "media/walk.mp4", "in": 2.0, "out": 6.5, "licence": "press-kit", "credit": "NVIDIA", "url": "https://…" }
//   { "id": "walk", "url": "https://example.com/walk.mp4", "licence": "press-kit", "credit": "NVIDIA" }   # downloaded to media/
//   { "id": "gpu", "blender": "blender/turntable.py", "frames": 120, "size": [1080, 1080] }               # rendered, licence own
//
// A `url` with no `file` is downloaded into media/ (a direct video link with
// fetch; a page such as YouTube with yt-dlp, when it is installed). `in`/`out`
// trim it (seconds); `audio: true` keeps its sound, which the scene cues with
// window.CLIPS = [[filmSeconds, id, gainDb?]] like an effect.
//
// Each clip becomes a frame sequence at the film's 30 fps in
// clips/<id>.<hash>/ (JPEG; PNG with transparency for a Blender render), so a
// frame is exact at any t, the same way the scene is. clips/manifest.js is what
// the scene loads (window.CLIP_MANIFEST); media.lock.json, committed, records
// each clip's source, licence, credit and a hash of the file it was made from.
// npm run render refuses a clip the scene uses that the lock doesn't cover, and
// puts the credits in out/<basename>.publish.json.
import ffmpegPath from 'ffmpeg-static';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipProblems, probe } from './lib/media.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(here, 'clips.json');
if (!existsSync(cfgPath)) { console.log('no clips.json: this film has no footage.'); process.exit(0); }
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const FPS = cfg.fps ?? 30;
const MAX = cfg.maxSize ?? 1920; // the longest side of an extracted frame
const out = join(here, 'clips');
mkdirSync(out, { recursive: true });

const problems = (cfg.clips ?? []).flatMap(clipProblems);
const ids = (cfg.clips ?? []).map((c) => c.id);
for (const d of ids.filter((x, i) => ids.indexOf(x) !== i)) problems.push(`${d}: duplicate id`);
if (problems.length) { for (const p of problems) console.error(`[clips] FAIL ${p}`); process.exit(1); }

const sha = (file) => new Promise((res, rej) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});
const tokens = existsSync(join(here, 'brand-tokens.resolved.json')) ? JSON.parse(readFileSync(join(here, 'brand-tokens.resolved.json'), 'utf8')) : {};

/** Download a clip's url into media/; returns the relative path. */
async function download(c) {
  mkdirSync(join(here, 'media'), { recursive: true });
  const direct = /\.(mp4|webm|mov|m4v|gif)(\?|#|$)/i.exec(c.url);
  if (direct) {
    const rel = `media/${c.id}${extname(new URL(c.url).pathname).toLowerCase() || '.mp4'}`;
    if (existsSync(join(here, rel))) return rel;
    const r = await fetch(c.url, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`${c.url} answered ${r.status}`);
    writeFileSync(join(here, rel), Buffer.from(await r.arrayBuffer()));
    return rel;
  }
  const have = readdirSync(join(here, 'media')).find((f) => f.startsWith(`${c.id}.`));
  if (have) return `media/${have}`;
  if (spawnSync('yt-dlp', ['--version']).status !== 0) throw new Error(`${c.url} is a page, not a video file: install yt-dlp, or download the video yourself and set "file"`);
  const r = spawnSync('yt-dlp', ['-q', '--no-playlist', '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4', '-o', join(here, 'media', `${c.id}.%(ext)s`), c.url], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`yt-dlp could not download ${c.url}`);
  return `media/${readdirSync(join(here, 'media')).find((f) => f.startsWith(`${c.id}.`))}`;
}

/** Linear RGB of a brand colour role, for Blender: "0.12,0.45,0.80". */
async function roleRgb(role) {
  const { linear } = await import('./lib/color.mjs');
  let v = tokens.video?.color?.[role] ?? '';
  for (let i = 0; i < 4; i++) { const ref = /^var\(--video-([\w-]+)\)$/.exec(v.trim()); if (!ref) break; v = tokens.video.color[ref[1]] ?? ''; }
  const rgb = linear(v);
  return rgb ? rgb.map((x) => x.toFixed(4)).join(',') : null;
}

const blenderBin = () => process.env.BLENDER_PATH
  || (process.platform === 'darwin' && existsSync('/Applications/Blender.app/Contents/MacOS/Blender') ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');

const manifest = {};
const lock = [];
const keep = new Set(['manifest.js', 'manifest.json']);
for (const c of cfg.clips ?? []) {
  let dir, ext, srcHash, source;
  if (c.blender) {
    const script = resolve(here, c.blender);
    if (!existsSync(script)) { console.error(`[clips] FAIL ${c.id}: no such script ${c.blender}`); process.exit(1); }
    const [w, h] = c.size ?? [1080, 1080];
    const colours = { accent: await roleRgb(c.colour ?? 'accent'), ground: await roleRgb('stage') };
    srcHash = createHash('sha256').update(readFileSync(script)).update(JSON.stringify([c.frames, w, h, colours, c.args ?? {}])).digest('hex');
    dir = `${c.id}.${srcHash.slice(0, 12)}`; ext = 'png';
    source = { blender: c.blender };
    if (!existsSync(join(out, dir, '00001.png'))) {
      mkdirSync(join(out, dir), { recursive: true });
      const args = ['-b', '--factory-startup', '-noaudio', '-P', script, '--', '--out', join(out, dir), '--frames', String(c.frames), '--fps', String(FPS), '--width', String(w), '--height', String(h),
        ...(colours.accent ? ['--accent', colours.accent] : []), ...(colours.ground ? ['--ground', colours.ground] : []), '--args', JSON.stringify(c.args ?? {})];
      const r = spawnSync(blenderBin(), args, { stdio: ['ignore', 'ignore', 'inherit'] });
      if (r.error || r.status !== 0) { rmSync(join(out, dir), { recursive: true, force: true }); console.error(`[clips] FAIL ${c.id}: blender ${r.error ? 'is not installed (set BLENDER_PATH)' : `exited ${r.status}`}`); process.exit(1); }
      console.log(`rendered ${c.id} (Blender, ${c.frames} frames)`);
    } else console.log(`cached   ${c.id}`);
  } else {
    let file = c.file;
    try { if (!file || !existsSync(join(here, file))) file = c.url ? await download(c) : file; } catch (e) { console.error(`[clips] FAIL ${c.id}: ${e.message}`); process.exit(1); }
    if (!file || !existsSync(join(here, file))) { console.error(`[clips] FAIL ${c.id}: ${file} is not on disk`); process.exit(1); }
    srcHash = await sha(join(here, file));
    const key = createHash('sha256').update(JSON.stringify([srcHash, c.in ?? null, c.out ?? null, FPS, MAX, Boolean(c.audio)])).digest('hex').slice(0, 12);
    dir = `${c.id}.${key}`; ext = 'jpg';
    source = { file, url: c.url ?? null };
    if (!existsSync(join(out, dir, '00001.jpg'))) {
      mkdirSync(join(out, dir), { recursive: true });
      const trim = [...(c.in != null ? ['-ss', String(c.in)] : []), ...(c.out != null ? ['-to', String(c.out)] : [])];
      const v = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...trim, '-i', join(here, file), '-vf', `fps=${FPS},scale='if(gt(iw,ih),min(${MAX},iw),-2)':'if(gt(iw,ih),-2,min(${MAX},ih))'`, '-q:v', '3', join(out, dir, '%05d.jpg')], { stdio: ['ignore', 'inherit', 'inherit'] });
      if (v.status !== 0) { rmSync(join(out, dir), { recursive: true, force: true }); console.error(`[clips] FAIL ${c.id}: ffmpeg could not read ${file}`); process.exit(1); }
      if (c.audio) {
        const a = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...trim, '-i', join(here, file), '-vn', '-ac', '2', '-ar', '44100', join(out, dir, 'audio.wav')], { stdio: ['ignore', 'inherit', 'inherit'] });
        if (a.status !== 0) console.warn(`[clips] ${c.id}: no audio track to keep`);
      }
      console.log(`made     ${c.id}`);
    } else console.log(`cached   ${c.id}`);
  }
  keep.add(dir);
  const frames = readdirSync(join(out, dir)).filter((f) => f.endsWith(`.${ext}`)).length;
  const size = probe(ffmpegPath, join(out, dir, `00001.${ext}`));
  manifest[c.id] = { dir: `clips/${dir}`, ext, frames, fps: FPS, width: size.width, height: size.height, duration: +(frames / FPS).toFixed(3), audio: existsSync(join(out, dir, 'audio.wav')) ? `clips/${dir}/audio.wav` : null, gainDb: c.gainDb ?? -8 };
  lock.push({ id: c.id, ...source, in: c.in ?? null, out: c.out ?? null, sha256: srcHash, licence: c.blender ? (c.licence ?? 'own') : c.licence, credit: c.credit ?? null, frames });
}
for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(join(out, f), { recursive: true, force: true });
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(out, 'manifest.js'), `// Generated by npm run clips. The scene loads this before using GFX.clip.\nwindow.CLIP_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`);
writeFileSync(join(here, 'media.lock.json'), JSON.stringify({ $comment: 'Where every clip came from and the licence that lets the film use it. Committed; written by npm run clips.', clips: lock }, null, 2) + '\n');
console.log(`\n${lock.length} clip(s) ready: ${lock.map((c) => `${c.id} (${c.licence}${c.credit ? `, ${c.credit}` : ''})`).join(', ')}`);
