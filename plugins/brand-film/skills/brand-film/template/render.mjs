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
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { checkSpokenWords } from './lib/audiocheck.mjs';
import { distributedCues, filmLanguages, langPaths, translatedTakes } from './lib/lang.mjs';

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
const NAME = film.basename + P.suffix;
const vttName = (code) => `${film.basename}.${code}.vtt`;
const ts = (s) => new Date(s * 1000).toISOString().slice(11, 23);
const writeVtt = (file, cues) => {
  const v = ['WEBVTT', ''];
  cues.forEach(([a, b, text], i) => { v.push(String(i + 1), `${ts(a)} --> ${ts(b)}`, text, ''); });
  writeFileSync(join(out, file), v.join('\n'));
};
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
if (P.own && film.facts?.length) {
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

const CHROME = process.env.CHROME_PATH
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(scene).href + '?t=0' + (P.own ? '' : `&lang=${encodeURIComponent(P.code)}`));
await page.evaluate(() => document.fonts.ready);
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
const { duration, fps, captions, posterT, sfxCues } = await page.evaluate(() => ({
  duration: window.DURATION, fps: window.FPS, captions: window.CAPTIONS ?? [], posterT: window.POSTER_T ?? 0,
  sfxCues: window.SFX ?? [],
}));

const stage = page.locator('#stage');
const shot = async (t, opts) => {
  await page.evaluate((t) => window.render(t), t);
  return stage.screenshot(opts);
};

// Poster.
writeFileSync(join(out, `${NAME}-poster.jpg`), await shot(posterT, { type: 'jpeg', quality: 82 }));

// Narration (optional): narrate.mjs writes narration/manifest.json. With it,
// each take is mixed in at its `at`, and the captions are the SPOKEN words,
// timed from the take's word timestamps. Without it the film carries the
// scene's on-screen CAPTIONS.
const manifestPath = join(P.narrationDir, 'manifest.json');
if (!P.own && !existsSync(manifestPath)) { console.error(`[render] no ${P.code} voice-over yet: npm run narrate -- --lang ${P.code}`); process.exit(1); }
const narration = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;

/** Caption cues from word timings: one per sentence, or per clause when a
 *  sentence runs long, with the caption spellings restored. */
const MAX_WORDS = 10;
function narrationCues(n) {
  const fix = (text) => Object.entries(n.captionReplace ?? {}).reduce((t, [from, to]) => t.split(from).join(to), text);
  const cues = [];
  for (const take of n.takes) {
    let chunk = [];
    const flush = () => {
      if (!chunk.length) return;
      cues.push([chunk[0].start, chunk[chunk.length - 1].end + 0.25, fix(chunk.map((w) => w.text).join(' '))]);
      chunk = [];
    };
    for (const w of take.words) {
      chunk.push(w);
      const endsSentence = /[.!?:]$/.test(w.text);
      const endsClause = /,$/.test(w.text) && chunk.length >= 5;
      if (endsSentence || (endsClause && chunk.length >= MAX_WORDS / 2) || chunk.length >= MAX_WORDS + 4) flush();
    }
    flush();
  }
  // A cue never overlaps the next one.
  for (let i = 0; i < cues.length - 1; i++) cues[i][1] = Math.min(cues[i][1], cues[i + 1][0]);
  return cues;
}

// Captions.
const vtt = ['WEBVTT', ''];
const cues = narration
  ? narrationCues(narration)
  : captions.map(([a, b, text]) => [a, b, text.replace(/<[^>]+>/g, '')]);
cues.forEach(([a, b, text], i) => { vtt.push(String(i + 1), `${ts(a)} --> ${ts(b)}`, text, ''); });
writeFileSync(join(out, vttName(P.code)), vtt.join('\n'));
if (P.own) for (const l of langs) if (l.mode === 'captions') translatedCaptions(l.code);

// Sound effects (optional): the scene cues them as window.SFX = [[t, id, gainDb?]].
// An unknown id fails the render rather than leaving a silent hole.
const sfxPath = join(here, 'sfx', 'manifest.json');
const sfxLib = existsSync(sfxPath) ? JSON.parse(readFileSync(sfxPath, 'utf8')).effects : {};
const effects = sfxCues.map(([at, id, gain]) => {
  const e = sfxLib[id];
  if (!e) { console.error(`scene cues sound effect "${id}", which is not in sfx/manifest.json. Run: npm run sfx`); process.exit(1); }
  return { at, file: e.file, gain: gain ?? e.gain };
}).filter((e) => {
  if (existsSync(join(here, e.file))) return true;
  console.warn(`[render] ${e.file} is missing (run npm run sfx); that effect is skipped`);
  return false;
});

// A fresh clone has the manifests (word timings, captions) but not the audio,
// which is generated and never committed. Missing audio renders silent, with
// the same captions, and says so.
const lines = (narration ? narration.takes : []).filter((l) => {
  if (existsSync(join(here, l.file))) return true;
  console.warn(`[render] ${l.file} is missing (run npm run narrate); that line renders silent`);
  return false;
});
const musicPath = join(here, 'music', 'manifest.json');
let music = existsSync(musicPath) ? JSON.parse(readFileSync(musicPath, 'utf8')) : null;
if (music && !existsSync(join(here, music.file))) { console.warn(`[render] ${music.file} is missing (run npm run music); no score`); music = null; }
const MUSIC_DB = music?.levelDb ?? -10; // before ducking; a raw ElevenLabs score averages about -18 dB

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
    graph.push(`${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=channel_layouts=stereo,apad,atrim=0:${duration},asplit=2[voice][vsc]`);
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
  } else if (lines.length) {
    graph.push(`[vsc]anullsink`);
  }
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
console.log(`\n[render] wrote out/${NAME}.mp4, out/${vttName(P.code)} and the poster (${frames} frames)`);

// Verify the finished file rather than trusting the exit code: a headless
// render once stopped after 435 frames with a clean exit. The frame count must
// equal DURATION × FPS; with sound, the mix should sit near -16 LUFS with the
// true peak under -1 dBTP. The numbers go to out/<basename>.report.json.
// framecrc prints one line per video packet (one per frame here), with no
// decoding, on every ffmpeg build. Progress output is not reliable for this:
// some Linux builds print no frame count for a stream copy at all.
const probe = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', mp4, '-map', '0:v', '-c', 'copy', '-f', 'framecrc', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const counted = probe.status === 0 ? (probe.stdout ?? '').split('\n').filter((l) => /^\d/.test(l)).length : NaN;
const report = { basename: NAME, language: P.code, duration, fps, frames: counted, expectedFrames: frames, audio: audioOut[0] !== '-an', voice: lines.length > 0, captions: cues.length };
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
  writeFileSync(join(out, `${NAME}.report.json`), JSON.stringify(report, null, 2) + '\n');
  if (spoken.lost.length) {
    console.error(`[render] FAIL ${spoken.lost.length} spoken word(s) are missing from the finished film: ${spoken.lost.map((l) => `"${l.word}" at ${l.at}s`).join(', ')}`);
    process.exit(1);
  }
  console.log(`[render] all ${spoken.words} spoken words are in the mix`);
}
if (report.voice && !(report.lufs > -18 && report.lufs < -14)) console.warn(`[render] the mix is ${report.lufs} LUFS; expected about -16`);
if (report.audio && report.truePeakDbtp > -1) console.warn(`[render] true peak ${report.truePeakDbtp} dBTP is over -1`);
console.log(`[render] verified: ${counted} frames, ${cues.length} caption cues${report.audio ? ', stereo AAC' : ', silent'}`);

// --all: then each voiced language, as its own film.
if (P.own && process.argv.includes('--all')) {
  for (const l of langs.filter((x) => x.mode === 'voice')) {
    console.log(`\n[render] ${l.code}`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--lang', l.code], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
