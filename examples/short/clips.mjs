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
//   { "id": "racks", "kind": "image", "url": "https://…", "page": "https://…", "licence": "unsplash", "author": "…" }  # from npm run find -- --add
//
// A still (`kind: "image"`, or an image file) becomes ONE frame, kept large
// (3840 px on its long side) so the scene can push in on it with GFX.still.
// Stock and Creative Commons clips (npm run find) carry their page, author and
// licence; each one's credit line, in its library's own form, goes into
// media.lock.json, clips/manifest.js (window.CLIP_CREDITS, for an end card)
// and the publish record. An Unsplash photo is reported to Unsplash when it is
// downloaded, as its API terms require.
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
import { attribution, UA } from './lib/stock.mjs';
import { apiKey } from './lib/keys.mjs';

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

const MEDIA = /\.(mp4|webm|mov|m4v|ogv|gif|jpe?g|png|webp|tiff?)(\?|#|$)/i;
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/tiff': '.tif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogv', 'video/quicktime': '.mov' };
const isImage = (c, file = '') => c.kind === 'image' || /\.(jpe?g|png|webp|tiff?)$/i.test(file);

/** Download a clip's url into media/; returns the relative path. */
async function download(c) {
  mkdirSync(join(here, 'media'), { recursive: true });
  const have = readdirSync(join(here, 'media')).find((f) => f.startsWith(`${c.id}.`) && !f.endsWith('.json'));
  if (have) return `media/${have}`;
  // A file a library hands out (it has a page), an image, or a link to a video file: fetch it.
  if (c.page || c.kind === 'image' || MEDIA.test(c.url)) {
    const r = await fetch(c.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`${c.url} answered ${r.status}`);
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    const ext = EXT[type] ?? (extname(new URL(c.url).pathname).toLowerCase() || '.bin');
    const rel = `media/${c.id}${ext}`;
    writeFileSync(join(here, rel), Buffer.from(await r.arrayBuffer()));
    if (c.track) await reportUse(c);
    return rel;
  }
  if (spawnSync('yt-dlp', ['--version']).status !== 0) throw new Error(`${c.url} is a page, not a video file: install yt-dlp, or download the video yourself and set "file"`);
  const r = spawnSync('yt-dlp', ['-q', '--no-playlist', '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4', '-o', join(here, 'media', `${c.id}.%(ext)s`), c.url], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`yt-dlp could not download ${c.url}`);
  return `media/${readdirSync(join(here, 'media')).find((f) => f.startsWith(`${c.id}.`))}`;
}

/** Unsplash's API terms: tell Unsplash when one of its photos is used (its download_location). */
async function reportUse(c) {
  if (c.licence !== 'unsplash') return;
  const key = apiKey('unsplash');
  if (!key) throw new Error(`${c.id}: Unsplash asks that each photo used is reported with the app's key; set UNSPLASH_ACCESS_KEY (lib/keys.mjs)`);
  const r = await fetch(c.track, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1', 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${c.id}: Unsplash download report answered ${r.status}`);
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
    const still = isImage(c, file);
    const key = createHash('sha256').update(JSON.stringify([srcHash, c.in ?? null, c.out ?? null, FPS, MAX, Boolean(c.audio), still])).digest('hex').slice(0, 12);
    dir = `${c.id}.${key}`; ext = still && /\.png$/i.test(file) ? 'png' : 'jpg';
    source = { file, url: c.url ?? null };
    if (still && !existsSync(join(out, dir, `00001.${ext}`))) {
      // One frame, large enough to push in on: 3840 px on its long side at most.
      mkdirSync(join(out, dir), { recursive: true });
      const v = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', join(here, file), '-frames:v', '1', '-vf', "scale='if(gt(iw,ih),min(3840,iw),-2)':'if(gt(iw,ih),-2,min(3840,ih))'", ...(ext === 'jpg' ? ['-q:v', '2'] : []), join(out, dir, `00001.${ext}`)], { stdio: ['ignore', 'inherit', 'inherit'] });
      if (v.status !== 0) { rmSync(join(out, dir), { recursive: true, force: true }); console.error(`[clips] FAIL ${c.id}: ffmpeg could not read ${file}`); process.exit(1); }
      console.log(`made     ${c.id} (still)`);
    } else if (still) console.log(`cached   ${c.id}`);
    else if (!existsSync(join(out, dir, '00001.jpg'))) {
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
  manifest[c.id] = { dir: `clips/${dir}`, ext, kind: frames === 1 && !c.blender ? 'image' : 'video', frames, fps: FPS, width: size.width, height: size.height, duration: +(frames / FPS).toFixed(3), audio: existsSync(join(out, dir, 'audio.wav')) ? `clips/${dir}/audio.wav` : null, gainDb: c.gainDb ?? -8 };
  const licence = c.blender ? (c.licence ?? 'own') : c.licence;
  const meta = Object.fromEntries(['kind', 'provider', 'title', 'author', 'authorUrl', 'page', 'licenceName', 'licenceUrl', 'via'].filter((k) => c[k] != null).map((k) => [k, c[k]]));
  lock.push({ id: c.id, ...source, ...meta, in: c.in ?? null, out: c.out ?? null, sha256: srcHash, licence, credit: c.credit ?? null, attribution: attribution({ ...c, licence, kind: manifest[c.id].kind }) || null, frames });
}
for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(join(out, f), { recursive: true, force: true });
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const credits = [...new Set(lock.map((c) => c.attribution).filter(Boolean))];
writeFileSync(join(out, 'manifest.js'), `// Generated by npm run clips. The scene loads this before using GFX.clip.\nwindow.CLIP_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n// The credit each clip needs, for an end card (GFX.credits).\nwindow.CLIP_CREDITS = ${JSON.stringify(credits, null, 2)};\n`);
writeFileSync(join(here, 'media.lock.json'), JSON.stringify({ $comment: 'Where every clip came from and the licence that lets the film use it. Committed; written by npm run clips.', clips: lock }, null, 2) + '\n');
const sa = lock.filter((c) => c.licence === 'cc-by-sa');
if (sa.length) console.warn(`\n[clips] ShareAlike: ${sa.map((c) => c.id).join(', ')} ${sa.length > 1 ? 'are' : 'is'} CC BY-SA. A film that adapts a ShareAlike work may have to be shared under the same licence: fine for a public explainer, not for a film the brand needs to keep under its own terms. Ask the user, or swap it.`);
for (const c of lock.filter((x) => x.attribution)) console.log(`[clips] credit ${c.id}: ${c.attribution}`);
console.log(`\n${lock.length} clip(s) ready: ${lock.map((c) => `${c.id} (${c.licence}${c.credit ? `, ${c.credit}` : ''})`).join(', ')}`);
