// Renders the scene (film.json `scene`) into the film.
//
//   npm install && npm run tokens && npm run narrate && npm run music && npm run sfx && npm run render
//
// Headless Chrome steps the scene one frame at a time (window.render(t) is a
// pure function of time, so nothing depends on wall-clock speed) and pipes
// JPEG frames into ffmpeg-static. Outputs land in out/: the H.264 MP4, a poster
// frame (the scene's POSTER_T), and WebVTT captions made from the SPOKEN words.
//
// Audio is three buses: narration (loudness-normalized to -16 LUFS, -1.5 dBTP,
// on its own so nothing else changes how loud the voice is), effects at their
// own gains, and the score, which fades in and out and ducks under the voice
// through a sidechain compressor. A limiter guards the sum.
//
// Shapes (film.json `aspects`, lib/stage.mjs): the first is the film
// (out/<basename>.mp4); each other one renders as out/<basename>.<9x16>.mp4
// from the same scene, which lays itself out for it. `--aspect 9:16` renders
// one. film.json `burnCaptions` lists the aspects whose film has the captions
// drawn into the picture (word by word, in the brand's caption tokens), as
// social players need. film.json `cuts` are shorter films made from ranges of
// a finished one (lib/cuts.mjs), each verified like the film.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkSpokenWords } from './lib/audiocheck.mjs';
import { distributedCues, filmLanguages, langPaths, translatedTakes } from './lib/lang.mjs';
import { aspectOf, installCaptions, openStage } from './lib/stage.mjs';
import { burnCues, lineCues, narrationCues, vttText } from './lib/captions.mjs';
import { cutArgs, cutCues, cutManifest, planCut } from './lib/cuts.mjs';
import { chaptersText, publishInfo } from './lib/publish.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const film = JSON.parse(readFileSync(join(here, 'film.json'), 'utf8'));
const scene = join(here, film.scene);
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

// Languages (lib/lang.mjs, translate.mjs). With no --lang this renders the film
// in its own language and writes every captions-only language's captions. With
// --lang <code> it renders that language: a captions-only language gets its
// .vtt; a voice language gets its own film (out/<basename>.<code>.mp4) with its
// voice-over and captions, the scene loaded with ?lang=<code>. --all renders
// the film and then every voice language.
const nar = existsSync(join(here, 'narration.json')) ? JSON.parse(readFileSync(join(here, 'narration.json'), 'utf8')) : { takes: [] };
const baseLang = nar.language ?? 'en';
const langAt = process.argv.indexOf('--lang');
const lang = langAt > -1 ? process.argv[langAt + 1] : null;
const P = langPaths(here, lang, baseLang);
const langs = filmLanguages(nar);
if (!P.own && !langs.some((l) => l.code === lang)) { console.error(`${lang} is not one of the film's languages (npm run translate -- ${lang})`); process.exit(1); }
const aspects = film.aspects?.length ? film.aspects : ['16:9'];
const aspAt = process.argv.indexOf('--aspect');
const ASPECT = aspectOf(aspAt > -1 ? process.argv[aspAt + 1] : aspects[0]);
const MAIN = ASPECT.name === aspects[0]; // the film itself, not another shape of it
const NAME = film.basename + P.suffix + (MAIN ? '' : `.${ASPECT.tag}`);
const BURN = film.burnCaptions === true || (Array.isArray(film.burnCaptions) && film.burnCaptions.includes(ASPECT.name));
const vttName = (code) => `${film.basename}.${code}.vtt`;
const writeVtt = (file, cues) => writeFileSync(join(out, file), vttText(cues));
const tokensPath = join(here, 'brand-tokens.resolved.json');
const tokens = existsSync(tokensPath) ? JSON.parse(readFileSync(tokensPath, 'utf8')) : {};
/** A captions-only language: its translation timed onto the film's own speech. */
function translatedCaptions(code) {
  const { takes, problems } = translatedTakes(here, nar, code);
  if (problems.length) { for (const p of problems) console.error(`[render] ${code} ${p}`); console.error(`[render] FAIL ${code} captions: translate narration.${code}.json (npm run translate), then re-render`); process.exit(1); }
  const basePath = join(here, 'narration', 'manifest.json');
  // Each take's voiced word times when it has them, else its scene window.
  const voiced = new Map((existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')).takes : []).map((t) => [t.id, t]));
  const timed = nar.takes.map((t) => voiced.get(t.id) ?? t);
  const cues = distributedCues(new Map(takes.map((t) => [t.id, t.text])), timed);
  writeVtt(vttName(code), cues);
  console.log(`[render] wrote out/${vttName(code)} (${cues.length} cues, captions only)`);
}
if (!P.own && langs.find((l) => l.code === lang).mode === 'captions') { translatedCaptions(lang); process.exit(0); }

// Loaded only now: a captions-only language needs neither Chrome nor ffmpeg.
const { chromium } = await import('playwright-core');
const ffmpegPath = (await import('ffmpeg-static')).default;

// Facts: every string in film.json `facts` must appear in the source text and
// in the scene, so a film never shows a number its source no longer says.
if (P.own && MAIN && film.facts?.length) {
  const norm = (s) => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const src = film.source && existsSync(join(here, film.source)) ? norm(readFileSync(join(here, film.source), 'utf8')) : null;
  const html = norm(readFileSync(scene, 'utf8'));
  let bad = 0;
  for (const fact of film.facts) {
    if (src !== null && !src.includes(fact)) { console.error(`[facts] "${fact}" is not in ${film.source}`); bad++; }
    if (!html.includes(fact)) { console.error(`[facts] "${fact}" is not in ${film.scene}`); bad++; }
  }
  if (src === null) console.warn(`[facts] no source text at "${film.source}"; checked the scene only`);
  if (bad) { console.error('[facts] fix the scene or the facts list, then re-render'); process.exit(1); }
  console.log(`[facts] ${film.facts.length} facts match`);
}

let stageOpen;
try { stageOpen = await openStage({ chromium, scene, aspect: ASPECT.name, lang: P.own ? null : P.code }); } catch (e) { console.error(`[render] ${e.message}`); process.exit(1); }
const { browser, page, shot } = stageOpen;
if (!MAIN || aspects.length > 1) console.log(`[render] ${ASPECT.name} (${ASPECT.width}×${ASPECT.height})${BURN ? ', captions burned in' : ''}`);
// Each token family's first face must be usable; a missing one silently renders the fallback.
// Ask for each face first: a face the scene hasn't drawn yet isn't loaded,
// and an unloaded face would read as missing.
const missing = await page.evaluate(async () => {
  const css = getComputedStyle(document.documentElement);
  const fams = ['headline', 'body', 'label'].map((k) => css.getPropertyValue(`--video-font-${k}`).split(',')[0].trim())
    .filter((f) => f && !/^(ui-|system-ui|sans-serif|serif|monospace)/.test(f));
  const out = [];
  for (const f of fams) {
    const faces = [...await document.fonts.load(`32px ${f}`), ...await document.fonts.load(`700 32px ${f}`)];
    if (!faces.length) out.push(f);
  }
  return out;
});
if (!P.own) {
  const untranslated = await page.evaluate(() => window.I18N_MISSING ?? []);
  if (untranslated.length) console.warn(`[render] on-screen text not translated into ${P.code}: ${untranslated.join(', ')} (scene.html STRINGS.${P.code})`);
}
if (missing.length) console.warn(`[render] fonts not loaded: ${missing.join(', ')} (offline, or a licensed face with no file? the fallback face will render)`);
const { duration, fps, captions, posterT, sfxCues, usedClips, clipCues } = await page.evaluate(() => ({
  duration: window.DURATION, fps: window.FPS, captions: window.CAPTIONS ?? [], posterT: window.POSTER_T ?? 0,
  sfxCues: window.SFX ?? [], usedClips: [...(window.GFX?.used ?? [])], clipCues: window.CLIPS ?? [],
}));

// Footage (clips.mjs): every clip the scene shows or cues must come from
// media.lock.json with a licence, or the film doesn't render.
const clipLock = existsSync(join(here, 'media.lock.json')) ? JSON.parse(readFileSync(join(here, 'media.lock.json'), 'utf8')).clips ?? [] : [];
const clipManifest = existsSync(join(here, 'clips', 'manifest.json')) ? JSON.parse(readFileSync(join(here, 'clips', 'manifest.json'), 'utf8')) : {};
for (const id of new Set([...usedClips, ...clipCues.map((c) => c[1])])) {
  const l = clipLock.find((c) => c.id === id);
  if (!l || !l.licence || !clipManifest[id]) { console.error(`[render] FAIL clip "${id}" is in the scene but ${!l ? 'not in media.lock.json' : !l.licence ? 'has no licence' : 'not in clips/manifest.json'}: add it to clips.json with its licence and run npm run clips`); process.exit(1); }
}
if (usedClips.length) console.log(`[render] footage: ${usedClips.map((id) => `${id} (${clipLock.find((c) => c.id === id).licence})`).join(', ')}`);
const shareAlike = usedClips.filter((id) => clipLock.find((c) => c.id === id)?.licence === 'cc-by-sa');
if (shareAlike.length && MAIN) console.warn(`[render] ShareAlike footage (${shareAlike.join(', ')}): the film may have to be shared under CC BY-SA; the user decides (references/footage.md)`);
const needCredit = usedClips.filter((id) => clipLock.find((c) => c.id === id)?.attribution);
if (needCredit.length && MAIN) console.log(`[render] credits for ${needCredit.join(', ')} go into publish.json; show them on the end card too (GFX.credits) when the film plays where a description isn't seen`);


// Narration (optional): narrate.mjs writes narration/manifest.json. With it,
// each take is mixed in at its `at`, and the captions are the SPOKEN words,
// timed from the take's word timestamps. Without it the film carries the
// scene's on-screen CAPTIONS.
const manifestPath = join(P.narrationDir, 'manifest.json');
if (!P.own && !existsSync(manifestPath)) { console.error(`[render] no ${P.code} voice-over yet: npm run narrate -- --lang ${P.code}`); process.exit(1); }
const narration = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;

// Captions: the .vtt (one per language, shared by every shape of the film),
// and, for a shape that burns them in, the overlay drawn into each frame.
const cues = narration
  ? narrationCues(narration)
  : captions.map(([a, b, text]) => [a, b, text.replace(/<[^>]+>/g, '')]);
if (MAIN) writeVtt(vttName(P.code), cues);
if (P.own && MAIN) for (const l of langs) if (l.mode === 'captions') translatedCaptions(l.code);
if (BURN) {
  const style = tokens.video?.captions ?? {};
  await installCaptions(page, narration ? burnCues(narration, style.maxWords ?? 5) : lineCues(captions), { mode: style.mode ?? 'word', position: style.position?.[ASPECT.tag] ?? style.position?.default ?? 0.72 });
}

// Poster (after the overlay, so a burned-in film's poster matches its first frames),
// and any other poster choices film.json `posters` lists (seconds).
writeFileSync(join(out, `${NAME}-poster.jpg`), await shot(posterT, { type: 'jpeg', quality: 82 }));
for (const t of film.posters ?? []) writeFileSync(join(out, `${NAME}-poster-${t}.jpg`), await shot(t, { type: 'jpeg', quality: 82 }));

// Sound effects (optional): the scene cues them as window.SFX = [[t, id, gainDb?]].
// An unknown id fails the render rather than leaving a silent hole.
const sfxPath = join(here, 'sfx', 'manifest.json');
const sfxLib = existsSync(sfxPath) ? JSON.parse(readFileSync(sfxPath, 'utf8')).effects : {};
const effects = sfxCues.map(([at, id, gain]) => {
  const e = sfxLib[id];
  if (!e) { console.error(`scene cues sound effect "${id}", which is not in sfx/manifest.json. Run: npm run sfx`); process.exit(1); }
  return { at, file: e.file, gain: gain ?? e.gain };
}).concat(clipCues.map(([at, id, gain]) => {
  // A clip's own sound, cued like an effect: window.CLIPS = [[t, id, gainDb?]].
  const m = clipManifest[id];
  if (!m?.audio) { console.error(`scene cues the sound of clip "${id}", which has none: set "audio": true in clips.json and run npm run clips`); process.exit(1); }
  return { at, file: m.audio, gain: gain ?? m.gainDb };
})).filter((e) => {
  if (existsSync(join(here, e.file))) return true;
  console.warn(`[render] ${e.file} is missing (run npm run sfx); that effect is skipped`);
  return false;
});

// The audio is committed (see .gitignore), but a project may keep it out, and
// a clone may predate it. Missing audio renders silent, with the same
// captions, and says so.
const lines = (narration ? narration.takes : []).filter((l) => {
  if (existsSync(join(here, l.file))) return true;
  console.warn(`[render] ${l.file} is missing (run npm run narrate); that line renders silent`);
  return false;
});
const musicPath = join(here, 'music', 'manifest.json');
let music = existsSync(musicPath) ? JSON.parse(readFileSync(musicPath, 'utf8')) : null;
if (music && !existsSync(join(here, music.file))) { console.warn(`[render] ${music.file} is missing (run npm run music); no score`); music = null; }
const MUSIC_DB = music?.levelDb ?? -10; // before ducking; a raw ElevenLabs score averages about -18 dB

// The voice's loudness, in two passes: measure the voice bus first, then
// normalize it with those numbers in loudnorm's LINEAR mode, which is one gain
// change for the whole voice. One-pass loudnorm is dynamic: it rides the gain
// word by word, which flattens a narrator and, on a recorded voice, sounds like
// heavy compression. Linear needs the peaks to fit under the ceiling after the
// gain; when they don't, loudnorm falls back to dynamic, and the report says so.
function measureVoice() {
  const args = ['-hide_banner', '-nostats'];
  lines.forEach((l) => args.push('-i', join(here, l.file)));
  const g = lines.map((l, i) => `[${i}:a]adelay=${Math.round(l.at * 1000)}:all=1[a${i}]`);
  g.push(`${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`);
  const r = spawnSync(ffmpegPath, [...args, '-filter_complex', g.join(';'), '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr ?? '');
  return m ? JSON.parse(m[0]) : null;
}
const voiceNorm = { filter: 'loudnorm=I=-16:TP=-1.5:LRA=11', mode: 'dynamic' };
if (lines.length) {
  const m = measureVoice();
  if (m && Number.isFinite(+m.input_i) && +m.input_i > -70) {
    const lra = Math.min(50, Math.max(11, Math.ceil(+m.input_lra) + 1));
    voiceNorm.filter = `loudnorm=I=-16:TP=-1.5:LRA=${lra}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    voiceNorm.mode = +m.input_tp + (-16 - +m.input_i) <= -1.5 ? 'linear' : 'dynamic (the peaks would pass -1.5 dBTP at that gain)';
    voiceNorm.measured = { lufs: +m.input_i, truePeak: +m.input_tp, lra: +m.input_lra };
  }
}

const audioIn = [];
let audioOut = ['-an'];
if (lines.length || effects.length || music) {
  [...lines, ...effects].forEach((l) => audioIn.push('-i', join(here, l.file)));
  if (music) audioIn.push('-i', join(here, music.file));
  const graph = [];
  const buses = [];
  if (lines.length) {
    lines.forEach((l, i) => graph.push(`[${i + 1}:a]adelay=${Math.round(l.at * 1000)}:all=1[a${i}]`));
    // Every bus is padded and trimmed to the film's exact length BEFORE it is
    // split or mixed, so all of them end together at DURATION. Splitting the
    // voice first and padding only the ducking key's branch lost the last ~3 s
    // of the last take: loudnorm's look-ahead never flushed into the mix. The
    // spoken-word check after the render fails the film if that ever recurs.
    graph.push(`${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,${voiceNorm.filter},aformat=channel_layouts=stereo,apad,atrim=0:${duration}${music ? ',asplit=2[voice][vsc]' : '[voice]'}`);
    buses.push('[voice]');
  }
  if (effects.length) {
    effects.forEach((e, i) => graph.push(`[${lines.length + i + 1}:a]aresample=44100,volume=${e.gain}dB,adelay=${Math.round(e.at * 1000)}:all=1[s${i}]`));
    graph.push(`${effects.map((_, i) => `[s${i}]`).join('')}amix=inputs=${effects.length}:normalize=0:dropout_transition=0,aformat=channel_layouts=stereo,apad,atrim=0:${duration}[fx]`);
    buses.push('[fx]');
  }
  if (music) {
    const mi = lines.length + effects.length + 1;
    graph.push(`[${mi}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${MUSIC_DB}dB,apad,atrim=0:${duration},afade=t=in:st=0:d=1.5,afade=t=out:st=${duration - 2.5}:d=2.5[mraw]`);
    if (lines.length) {
      graph.push(`[mraw][vsc]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=600[music]`);
    } else {
      graph.push(`[mraw]anull[music]`);
    }
    buses.push('[music]');
  }
  // The voice is split for the ducking key only when there is music to duck:
  // an unused branch into anullsink trips an assertion in ffmpeg 7
  // ("best_input >= 0") and the render writes no file.
  graph.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:dropout_transition=0,alimiter=limit=0.84:level=0,apad,atrim=0:${duration}[aout]`);
  audioOut = ['-filter_complex', graph.join(';'), '-map', '0:v', '-map', '[aout]',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-t', String(duration)];
}
const mp4 = join(out, `${NAME}.mp4`);
const ff = spawn(ffmpegPath, [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  ...audioIn,
  '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '24',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...audioOut,
  mp4,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));

const frames = Math.round(duration * fps);
for (let f = 0; f < frames; f++) {
  const buf = await shot(f / fps, { type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % fps === 0) process.stdout.write(`\r[render] ${f / fps}s / ${duration}s`);
}
ff.stdin.end();
await done;
await browser.close();
console.log(`\n[render] wrote out/${NAME}.mp4${MAIN ? `, out/${vttName(P.code)}` : ''} and the poster (${frames} frames)`);

// Verify the finished file rather than trusting the exit code: a headless
// render once stopped after 435 frames with a clean exit. The frame count must
// equal DURATION × FPS; with sound, the mix should sit near -16 LUFS with the
// true peak under -1 dBTP. The numbers go to out/<basename>.report.json.
// framecrc prints one line per video packet (one per frame here), with no
// decoding, on every ffmpeg build. Progress output is not reliable for this:
// some Linux builds print no frame count for a stream copy at all.
const probe = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', mp4, '-map', '0:v', '-c', 'copy', '-f', 'framecrc', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const counted = probe.status === 0 ? (probe.stdout ?? '').split('\n').filter((l) => /^\d/.test(l)).length : NaN;
const report = { basename: NAME, language: P.code, footage: usedClips, aspect: ASPECT.name, width: ASPECT.width, height: ASPECT.height, duration, fps, frames: counted, expectedFrames: frames, audio: audioOut[0] !== '-an', voice: lines.length > 0, captions: cues.length, burnedCaptions: BURN };
if (report.audio) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', mp4, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const tail = (r.stderr ?? '').split('Summary:').pop();
  report.lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1] ?? NaN);
  report.truePeakDbtp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1] ?? NaN);
  console.log(`[render] mix: ${report.lufs} LUFS integrated, true peak ${report.truePeakDbtp} dBTP`);
}
writeFileSync(join(out, `${NAME}.report.json`), JSON.stringify(report, null, 2) + '\n');
if (counted !== frames) { console.error(`[render] FAIL the file has ${counted} frames, expected ${frames}`); process.exit(1); }
// Every spoken word must be in the finished film (lib/audiocheck.mjs).
if (report.voice) {
  const voiced = { ...narration, takes: narration.takes.filter((t) => lines.includes(t)) };
  const spoken = checkSpokenWords({ ffmpegPath, mp4, manifest: voiced, dir: here });
  report.spokenWords = { checked: spoken.words, medianGainDb: +spoken.medianGainDb.toFixed(1), lost: spoken.lost.map((l) => `${l.take}: "${l.word}" at ${l.at}s`) };
  report.voiceProcessing = { loudnorm: voiceNorm.mode, measured: voiceNorm.measured ?? null, crestLossDb: +spoken.crestLossDb.toFixed(1) };
  writeFileSync(join(out, `${NAME}.report.json`), JSON.stringify(report, null, 2) + '\n');
  if (spoken.lost.length) {
    console.error(`[render] FAIL ${spoken.lost.length} spoken word(s) are missing from the finished film: ${spoken.lost.map((l) => `"${l.word}" at ${l.at}s`).join(', ')}`);
    process.exit(1);
  }
  console.log(`[render] all ${spoken.words} spoken words are in the mix`);
  console.log(`[render] voice: loudness ${voiceNorm.mode}; ${spoken.crestLossDb > 0.5 ? `its peaks ${spoken.crestLossDb.toFixed(1)} dB flatter than the takes` : 'its peaks as the takes had them'}`);
  if (spoken.crestLossDb > 4) console.warn(`[render] the mix flattens the voice by ${spoken.crestLossDb.toFixed(1)} dB (compression or the limiter): it will sound squashed. Lower the music or the effects, or check the takes' own peaks`);
}
if (report.voice && !(report.lufs > -18 && report.lufs < -14)) console.warn(`[render] the mix is ${report.lufs} LUFS; expected about -16`);
if (report.audio && report.truePeakDbtp > -1) console.warn(`[render] true peak ${report.truePeakDbtp} dBTP is over -1`);
console.log(`[render] verified: ${counted} frames, ${cues.length} caption cues${report.audio ? ', stereo AAC' : ', silent'}`);

// The film's other shapes, each from the same scene, then the cut-downs.
const child = (args) => {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (aspAt === -1) {
  for (const a of aspects.slice(1)) { console.log(''); child(['--aspect', a, ...(P.own ? [] : ['--lang', P.code])]); }
  if (P.own) for (const cut of film.cuts ?? []) renderCut(cut);
  if (P.own) writePublish();
}

/** out/<basename>.publish.json and .chapters.txt: titles, description, chapters, credits, files. */
function writePublish() {
  const lockPath = join(here, 'media.lock.json');
  const credits = existsSync(lockPath) ? (JSON.parse(readFileSync(lockPath, 'utf8')).clips ?? []).map((c) => ({ id: c.id, credit: c.credit ?? null, attribution: c.attribution ?? null, licence: c.licence, licenceUrl: c.licenceUrl ?? null, author: c.author ?? null, page: c.page ?? null, source: c.page ?? c.url ?? c.file ?? c.blender ?? null })) : [];
  const exists = (f) => existsSync(join(out, f));
  const films = [film.basename, ...aspects.slice(1).map((a) => `${film.basename}.${aspectOf(a).tag}`), ...(film.cuts ?? []).map((c) => `${film.basename}.${c.id}`)];
  const files = {
    films: films.map((n) => `${n}.mp4`).filter(exists),
    posters: films.flatMap((n) => [`${n}-poster.jpg`, ...(film.posters ?? []).map((t) => `${n}-poster-${t}.jpg`)]).filter(exists),
    captions: [vttName(P.code), ...langs.map((l) => vttName(l.code)), ...(film.cuts ?? []).map((c) => `${film.basename}.${c.id}.${P.code}.vtt`)].filter(exists),
  };
  const info = publishInfo({ film, takes: nar.takes, duration, credits, files });
  writeFileSync(join(out, `${film.basename}.publish.json`), JSON.stringify(info, null, 2) + '\n');
  if (info.chapters.length) writeFileSync(join(out, `${film.basename}.chapters.txt`), chaptersText(info.chapters) + '\n');
  for (const w of info.warnings) console.warn(`[publish] ${w}`);
  console.log(`[publish] wrote out/${film.basename}.publish.json (${info.titles.length} title(s), ${info.chapters.length} chapter(s), ${credits.length} credit(s))`);
}

/** A cut-down: ranges of a finished shape of the film, joined and verified. */
function renderCut(cut) {
  const a = aspectOf(cut.aspect ?? aspects[0]);
  if (!aspects.includes(a.name)) { console.error(`[cut ${cut.id}] ${a.name} is not one of film.json aspects`); process.exit(1); }
  const src = join(out, `${film.basename}${a.name === aspects[0] ? '' : `.${a.tag}`}.mp4`);
  const plan = planCut(cut, { duration, fps, takes: narration?.takes ?? [] });
  const fatal = plan.problems.filter((p) => !/not on the opening card/.test(p));
  for (const p of plan.problems) console[fatal.includes(p) ? 'error' : 'warn'](`[cut ${cut.id}] ${fatal.includes(p) ? 'FAIL ' : ''}${p}`);
  if (fatal.length) process.exit(1);
  const name = `${film.basename}.${cut.id}`;
  const dest = join(out, `${name}.mp4`);
  const r = spawnSync(ffmpegPath, cutArgs(src, dest, plan.ranges, { audio: report.audio, fps }), { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error(`[cut ${cut.id}] ffmpeg failed`); process.exit(1); }
  writeFileSync(join(out, `${name}.${P.code}.vtt`), vttText(cutCues(cues, plan.ranges)));
  const p = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', dest, '-map', '0:v', '-c', 'copy', '-f', 'framecrc', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const n = p.status === 0 ? (p.stdout ?? '').split('\n').filter((l) => /^\d/.test(l)).length : NaN;
  const cr = { basename: name, cut: cut.id, aspect: a.name, ranges: plan.ranges, duration: plan.length, fps, frames: n, expectedFrames: plan.frames };
  if (report.voice) {
    const voiced = cutManifest({ ...narration, takes: narration.takes.filter((t) => lines.includes(t)) }, plan.ranges);
    const spoken = checkSpokenWords({ ffmpegPath, mp4: dest, manifest: voiced, dir: here });
    cr.spokenWords = { checked: spoken.words, lost: spoken.lost.map((l) => `${l.take}: "${l.word}" at ${l.at}s`) };
  }
  writeFileSync(join(out, `${name}.report.json`), JSON.stringify(cr, null, 2) + '\n');
  if (n !== plan.frames) { console.error(`[cut ${cut.id}] FAIL ${n} frames, expected ${plan.frames}`); process.exit(1); }
  if (cr.spokenWords?.lost.length) { console.error(`[cut ${cut.id}] FAIL spoken words missing: ${cr.spokenWords.lost.join(', ')}`); process.exit(1); }
  console.log(`[cut ${cut.id}] wrote out/${name}.mp4 (${a.name}, ${plan.length.toFixed(2)}s, ${n} frames${cr.spokenWords ? `, all ${cr.spokenWords.checked} spoken words heard` : ''})`);
}

// --all: then each voiced language, as its own film.
if (P.own && process.argv.includes('--all')) {
  for (const l of langs.filter((x) => x.mode === 'voice')) {
    console.log(`\n[render] ${l.code}`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--lang', l.code], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
