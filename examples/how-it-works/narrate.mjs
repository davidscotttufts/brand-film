// Voices narration.json with the ElevenLabs CLI, one continuous take per scene,
// and checks every take by listening to it.
//
//   npm run narrate                  # voice changed takes, check them, check every window
//   npm run audition                 # voice take 1 with each voice in narration.json `auditions`
//   npm run audition -- <voiceId>…   # …or with the voices you name
//   npm run narrate -- --lang es     # the Spanish voice-over (narration.es.json, mode voice)
//   npm run audition -- --lang es <voiceId>…   # audition Spanish narrators
//
// A take is written with its WRITTEN forms (`text`: "nginx shipped in
// 17 weeks"); the brand's pronunciation lexicon (brand-tokens.json
// `brand.pronunciations`) turns it into what the voice is sent ("engine x
// shipped in seventeen weeks"), and the captions turn the spoken words back.
// An older take that has only `speak` is sent as written.
//
// Each take is voiced in ONE request, so it flows as speech, with character
// timestamps, so captions and the anchor report follow what was actually said.
// Then it is TRANSCRIBED (ElevenLabs speech-to-text) and compared with what it
// was meant to say: the word error rate must be at or under `verify.maxWer`
// and every lexicon term the take uses must be heard, or the take is voiced
// again, up to `verify.attempts` times. A take that never passes fails the run.
//
// A take that runs past `until` into the next scene FAILS the run rather than
// being clipped: tighten its wording (or widen the scene), then re-run.
// Anchors are words that should land while their picture is on screen; they are
// reported, not enforced. Move the picture to the word.
//
// Spending: before voicing, the run adds up the characters it is about to send
// and stops if that is more than FILM_MAX_CHARS (when set) or more than the
// account has left. Cached takes cost nothing.
//
// A RECORDED voice-over (narration.json `recording`, or --recorded <file>):
// a person reads the script into one file, retakes and all. The recording is
// transcribed once with word times (cached as narration/recording.<hash>.words.json,
// or given with --transcript <words.json>), each take is found in it, its
// stumbles dropped, its long pauses shortened and its edges cut where the sound
// ends (lib/recorded.mjs), and the cut take goes through the same listening
// check, window and anchor checks as a voiced one. No ElevenLabs voice, no
// characters spent.
//
//   npm run narrate -- --recorded recordings/vo.m4a
//   npm run narrate -- --recorded recordings/vo.m4a --transcript recordings/vo.words.json
//
// Outputs: narration/<take>.<hash>.mp3 and its alignment (cached and
// committed: a re-voice is a different read), narration/manifest.json (word timings; render.mjs reads it
// and the scene's cue times are copied from it) and takes.lock.json, the
// committed record of how every take was made: model, voice, settings, the
// exact text sent, the check's result, and the plan it was generated under.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLexicon, lintLexicon } from './lib/lexicon.mjs';
import { checkTranscript } from './lib/verify.mjs';
import { account, el, elJson, hasCli } from './lib/elevenlabs.mjs';
import { filmLanguages, langPaths, rulesFor, translatedTakes } from './lib/lang.mjs';
import { scoreScript } from './lib/script.mjs';
import { transcribe as hear } from './lib/transcribe.mjs';
import { findTake, planTake, segmentFilter, threshold, tokens as wordTokens } from './lib/recorded.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'narration.json'), 'utf8'));
const baseLang = cfg.language ?? 'en';
const langArg = process.argv.indexOf('--lang');
const lang = langArg > -1 ? process.argv[langArg + 1] : null;
const P = langPaths(here, lang, baseLang);
const argv = process.argv.slice(2).filter((a, i, all) => a !== '--lang' && all[i - 1] !== '--lang');
const flag = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const tokensPath = join(here, 'brand-tokens.resolved.json');
if (!existsSync(tokensPath)) { console.error('no brand-tokens.resolved.json: run npm run tokens first'); process.exit(1); }
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
const narrator = tokens.video?.voice?.narrator;
if (narrator?.model && narrator?.voiceId) {
  if (!lang && !process.argv.includes('--recorded') && !cfg.recording && (cfg.model !== narrator.model || cfg.voice?.id !== narrator.voiceId)) {
    console.log(`narrator from the design system: ${narrator.model}, ${narrator.voiceName || narrator.voiceId}`);
  }
  cfg.model = narrator.model;
  cfg.voice = { id: narrator.voiceId, name: narrator.voiceName || cfg.voice?.name };
}
const lexProblems = lintLexicon(tokens.brand?.pronunciations ?? []);
if (lexProblems.length) { for (const p of lexProblems) console.error(`[lexicon] ${p}`); process.exit(1); }
const lex = compileLexicon(rulesFor(tokens.brand?.pronunciations ?? [], P.code, baseLang));
if (P.own && !process.argv.includes('--audition')) {
  const film = existsSync(join(here, 'film.json')) ? JSON.parse(readFileSync(join(here, 'film.json'), 'utf8')) : {};
  const sc = scoreScript({ takes: cfg.takes, facts: film.facts ?? [] });
  const misses = sc.items.filter((i) => i.points < i.max).map((i) => i.name);
  console.log(`[score] the script scores ${sc.score}/${sc.outOf}${misses.length ? ` (short on: ${misses.join(', ')}; npm run score)` : ''}`);
}

// A translated voice-over: the base takes' timing with the translation's text,
// that language's narrator, and its own folder and lock file.
if (!P.own) {
  const entry = filmLanguages(cfg).find((l) => l.code === lang);
  if (!entry) { console.error(`${lang} is not one of the film's languages: npm run translate -- ${lang}:voice`); process.exit(1); }
  if (entry.mode !== 'voice') { console.error(`${lang} is captions-only; its captions come from npm run render. For a voice-over: npm run translate -- ${lang}:voice`); process.exit(1); }
  const { translation, takes, problems } = translatedTakes(here, cfg, lang);
  if (problems.length) { for (const p of problems) console.error(`[${lang}] ${p}`); console.error(`Translate narration.${lang}.json, then re-run.`); process.exit(1); }
  cfg.takes = takes;
  if (translation.voice?.id) cfg.voice = { id: translation.voice.id, name: translation.voice.name || translation.voice.id };
  if (translation.voice?.id) console.log(`${lang} narrator: ${cfg.model}, ${cfg.voice.name}`);
  else console.warn(`[${lang}] no narrator in narration.${lang}.json "voice"; using ${cfg.voice?.name ?? cfg.voice?.id}, which may not be a native ${lang} voice`);
  if (translation.model) cfg.model = translation.model;
}
const verifyCfg = { enabled: true, model: 'scribe_v1', maxWer: 0.15, attempts: 3, ...(cfg.verify ?? {}) };
const timing = cfg.timing ?? 'tts'; // 'tts': the voice's own timestamps; 'forced-alignment': re-aligned against the text
const recCfg = { maxPause: 0.3, ...(typeof cfg.recording === 'string' ? { file: cfg.recording } : cfg.recording ?? {}) };
const RECORDED = flag('--recorded') ?? recCfg.file ?? null;
const iso = P.code.split('-')[0];
let recSha = null;
if (RECORDED) {
  const f = resolve(here, RECORDED);
  if (!existsSync(f)) { console.error(`no recording at ${RECORDED}`); process.exit(1); }
  recSha = createHash('sha256').update(readFileSync(f)).digest('hex');
  cfg.model = 'recorded';
  cfg.voice = { id: 'recorded', name: recCfg.speaker ?? 'recorded voice' };
  console.log(`recorded voice-over: ${RECORDED} (pauses over ${recCfg.maxPause}s are shortened)`);
}

/** What a take is meant to say: written and spoken forms, and the lexicon terms it uses. */
function lines(take) {
  const written = take.text ?? take.speak;
  const spoken = take.text != null ? lex.toSpoken(take.text) : take.speak;
  return { written, spoken, terms: lex.termsIn(written) };
}

if (!RECORDED && !hasCli()) {
  console.error('The ElevenLabs CLI is not installed: npm i -g @elevenlabs/cli, then elevenlabs auth login.\nWithout it the film still renders, silent, with on-screen captions.');
  process.exit(1);
}

if (!RECORDED) {
  const models = elJson(['models', 'list']);
  const model = models.find((m) => m.model_id === cfg.model);
  if (!model || !model.can_do_text_to_speech) {
    console.error(`model "${cfg.model}" is not a text-to-speech model on this account. Available:`);
    for (const m of models.filter((x) => x.can_do_text_to_speech)) console.error(`  ${m.model_id}  (${m.name})`);
    process.exit(1);
  }
  if (model.languages?.length && !model.languages.some((l) => l.language_id === iso || l.language_id === P.code)) {
    console.error(`${cfg.model} does not speak ${P.code}. Models that do: ${models.filter((m) => m.can_do_text_to_speech && m.languages?.some((l) => l.language_id === iso)).map((m) => m.model_id).join(', ')}`);
    process.exit(1);
  }
}

function voice(voiceId, text) {
  const args = ['text-to-speech', 'convert_with_timestamps',
    '--voice-id', voiceId, '--model-id', cfg.model,
    '--output-format', cfg.outputFormat,
    '--voice-settings', JSON.stringify(cfg.voiceSettings),
    '--text', text];
  // eleven_v3 and v4 reject `seed`; null in narration.json leaves it out.
  if (cfg.seed != null) args.push('--seed', String(cfg.seed));
  return elJson(args);
}

/** Words with start/end times, from a character alignment. */
function words(alignment) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = alignment;
  const list = [];
  let cur = null;
  ch.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) list.push(cur); cur = null; return; }
    if (!cur) cur = { text: '', start: st[i], end: en[i] };
    cur.text += c; cur.end = en[i];
  });
  if (cur) list.push(cur);
  return list;
}

/** Word timings from ElevenLabs forced alignment of the finished take against its text. */
function forcedWords(mp3, text) {
  const r = elJson(['forced-alignment', 'create', '--file', mp3, '--text', text]);
  return (r.words ?? []).filter((w) => w.text.trim()).map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
}

// ElevenLabs speech-to-text, or whisper.cpp when ElevenLabs refuses the file
// (lib/transcribe.mjs); the result records which one heard the take.
let ffmpegForStt = null;
try { ffmpegForStt = (await import('ffmpeg-static')).default; } catch { /* only the fallback needs it */ }
function transcribe(mp3) {
  try {
    const r = hear(mp3, { model: verifyCfg.model, lang: iso, ffmpegPath: ffmpegForStt });
    return { text: r.text, transcriber: r.transcriber };
  } catch (e) { console.error(`\n${e.message}`); process.exit(1); }
}

// Audition: the same line in several voices, to choose the narrator by ear.
if (process.argv.includes('--audition')) {
  const ids = argv.filter((a) => !a.startsWith('--'));
  const cands = ids.length ? ids.map((id) => ({ id, name: id })) : (cfg.auditions ?? []);
  if (!cands.length) {
    console.error('No voices to audition. Add "auditions": [{"id","name"}] to narration.json, or pass ids.\nFind some with: elevenlabs voices search --format json');
    process.exit(1);
  }
  const line = lines(cfg.takes[0]).spoken;
  const dir = join(here, 'auditions');
  mkdirSync(dir, { recursive: true });
  for (const c of cands) {
    const res = voice(c.id, line);
    const file = join(dir, `${c.name.replace(/[^A-Za-z0-9-]+/g, '-')}.mp3`);
    writeFileSync(file, Buffer.from(res.audio_base64, 'base64'));
    const ws = words(res.alignment);
    console.log(`auditioned ${c.name}  ${ws.at(-1)?.end.toFixed(2)}s  ${file}`);
  }
  console.log('\nListen, pick one, and set video.voice.narrator in brand-tokens.json (model, voiceName, voiceId), then npm run tokens.');
  process.exit(0);
}

if (!cfg.voice?.id) {
  console.error('No narrator. Set video.voice.narrator in brand-tokens.json and run npm run tokens (or set voice.id in narration.json).\nList voices with: elevenlabs voices search --format json, then: npm run audition');
  process.exit(1);
}

const out = P.narrationDir;
mkdirSync(out, { recursive: true });
const rel = (f) => (P.own ? `narration/${f}` : `narration/${P.code}/${f}`);
const plan = cfg.takes.map((take) => {
  const l = lines(take);
  const key = createHash('sha256')
    .update(JSON.stringify(RECORDED ? [recSha, recCfg.maxPause, l.spoken] : [cfg.model, cfg.voice.id, cfg.voiceSettings, cfg.seed, cfg.outputFormat, l.spoken]))
    .digest('hex').slice(0, 12);
  const base = `${take.id}.${key}`;
  return { take, ...l, key, base, mp3: join(out, `${base}.mp3`), align: join(out, `${base}.alignment.json`), check: join(out, `${base}.verify.json`) };
});

// Spending check before any request.
const toVoice = RECORDED ? [] : plan.filter((p) => !existsSync(p.mp3) || !existsSync(p.align));
const chars = toVoice.reduce((s, p) => s + p.spoken.length, 0);
const acct = RECORDED ? null : account();
if (toVoice.length) {
  console.log(`to voice: ${toVoice.length} take(s), ${chars} characters${verifyCfg.enabled ? ` (up to ${verifyCfg.attempts}× if a take fails its check)` : ''}${acct?.remaining != null ? `; the account has ${acct.remaining} left (${acct.tier})` : ''}`);
  const cap = Number(process.env.FILM_MAX_CHARS || 0);
  if (cap && chars > cap) { console.error(`FILM_MAX_CHARS is ${cap}; this run needs ${chars}. Raise it to go ahead.`); process.exit(1); }
  if (acct?.remaining != null && chars > acct.remaining) { console.error(`The account has ${acct.remaining} characters left; this run needs ${chars}.`); process.exit(1); }
}

const lockPath = P.lockFile;
const prevLock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : { takes: [] };
const prevByKey = new Map(prevLock.takes.map((t) => [`${t.id}.${t.key}`, t]));
const manifest = { language: P.code, model: cfg.model, voice: cfg.voice, captionReplace: { ...Object.fromEntries(lex.rules.map((r) => [r.spoken, r.written])), ...(cfg.captionReplace ?? {}) }, takes: [] };
const lock = { $comment: 'How every take was made. Committed with the film; generated by npm run narrate.', language: P.code, model: cfg.model, voice: cfg.voice, voiceSettings: cfg.voiceSettings, seed: cfg.seed ?? null, outputFormat: cfg.outputFormat, timing, verify: { model: verifyCfg.model, maxWer: verifyCfg.maxWer }, takes: [] };
const keep = new Set(['manifest.json']);
const recorded = RECORDED ? prepareRecording() : null;

/** Cut every take out of the recording (lib/recorded.mjs). Map: base → { words, result }. */
function prepareRecording() {
  if (!ffmpegForStt) { console.error('a recorded voice-over needs ffmpeg-static: npm install'); process.exit(1); }
  const file = resolve(here, RECORDED);
  const wordsFile = `recording.${recSha.slice(0, 12)}.words.json`;
  keep.add(wordsFile);
  let tr;
  const given = flag('--transcript');
  if (given) {
    const j = JSON.parse(readFileSync(resolve(process.cwd(), given), 'utf8'));
    tr = { transcriber: j.transcriber ?? 'given', words: Array.isArray(j) ? j : j.words };
    writeFileSync(join(out, wordsFile), JSON.stringify(tr, null, 1) + '\n');
  } else if (existsSync(join(out, wordsFile))) {
    tr = JSON.parse(readFileSync(join(out, wordsFile), 'utf8'));
  } else {
    console.log('transcribing the recording, with word times…');
    let r;
    try { r = hear(file, { model: verifyCfg.model, lang: iso, words: true, ffmpegPath: ffmpegForStt }); } catch (e) { console.error(`\n${e.message}`); process.exit(1); }
    tr = { transcriber: r.transcriber, words: r.words };
    writeFileSync(join(out, wordsFile), JSON.stringify(tr, null, 1) + '\n');
  }
  if (!tr.words?.length) { console.error('the transcript has no timed words'); process.exit(1); }
  // The recording's level every 10 ms, for cutting where the sound ends.
  const pcmR = spawnSync(ffmpegForStt, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 2 * 1024 * 1024 * 1024 });
  if (pcmR.status !== 0) { console.error(`ffmpeg could not read ${RECORDED}`); process.exit(1); }
  const pcm = new Float32Array(pcmR.stdout.buffer, pcmR.stdout.byteOffset, Math.floor(pcmR.stdout.length / 4));
  const levels = [];
  for (let i = 0; i < pcm.length; i += 160) {
    let sum = 0;
    const end = Math.min(pcm.length, i + 160);
    for (let k = i; k < end; k++) sum += pcm[k] * pcm[k];
    levels.push(10 * Math.log10(sum / (end - i) || 1e-12));
  }
  const level = (t) => levels[Math.floor(t * 100)] ?? -120;
  const thr = threshold(levels);
  const hyp = wordTokens(tr.words, iso);
  const map = new Map();
  let from = 0;
  for (const p of plan) {
    const m = findTake([p.spoken, p.written], hyp, from, iso);
    const t = m && m.end > m.start ? planTake({ words: tr.words, hyp, match: m, level, thr, maxPause: recCfg.maxPause }) : null;
    if (!t || !t.segments.length) { console.error(`${p.take.id}: not found in the recording`); map.set(p.base, null); continue; }
    from = m.end;
    const heard = t.kept.join(' ');
    const result = { ...checkTranscript({ transcript: heard, spoken: p.spoken, written: p.written, terms: p.terms, maxWer: verifyCfg.maxWer, lang: iso }), transcript: heard, transcriber: tr.transcriber, attempt: 1,
      recorded: { from: t.segments[0].from, to: t.segments.at(-1).to, segments: t.segments.length, dropped: t.dropped } };
    if (!existsSync(p.mp3)) {
      const r = spawnSync(ffmpegForStt, ['-y', '-loglevel', 'error', '-i', file, '-filter_complex', segmentFilter(t.segments), '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '160k', p.mp3], { stdio: ['ignore', 'inherit', 'inherit'] });
      if (r.status !== 0) { console.error(`${p.take.id}: ffmpeg could not cut the take`); process.exit(1); }
    }
    writeFileSync(p.align, JSON.stringify(t.words) + '\n');
    writeFileSync(p.check, JSON.stringify(result, null, 2) + '\n');
    console.log(`cut     ${p.take.id}  ${t.segments[0].from.toFixed(2)}-${t.segments.at(-1).to.toFixed(2)}s of the recording, ${t.segments.length} piece(s)${t.dropped.length ? `, dropped "${t.dropped.join(' ')}"` : ''}`);
    map.set(p.base, { words: t.words, result });
  }
  lock.recording = { file: RECORDED, sha256: recSha, transcriber: tr.transcriber, maxPause: recCfg.maxPause };
  return map;
}
let overruns = 0, failed = 0;
let prevEnd = 0;

for (const p of plan) {
  const { take } = p;
  keep.add(`${p.base}.mp3`); keep.add(`${p.base}.alignment.json`); keep.add(`${p.base}.verify.json`);
  let fresh = false;
  let result = existsSync(p.check) ? JSON.parse(readFileSync(p.check, 'utf8')) : null;
  if (recorded) {
    const r = recorded.get(p.base);
    if (!r) { failed++; continue; }
    result = r.result; fresh = true;
    if (!result.pass) { failed++; console.log(`CHECK   ${take.id}  heard "${result.transcript}"  wer ${result.wer}${result.missingTerms.length ? `, missing ${result.missingTerms.join(', ')}` : ''}: re-record this line`); }
  }
  for (let attempt = 1; !recorded; attempt++) {
    if (!existsSync(p.mp3) || !existsSync(p.align)) {
      const res = voice(cfg.voice.id, p.spoken);
      writeFileSync(p.mp3, Buffer.from(res.audio_base64, 'base64'));
      writeFileSync(p.align, JSON.stringify(res.alignment) + '\n');
      result = null; fresh = true;
      console.log(`voiced  ${take.id}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
    }
    if (!verifyCfg.enabled) break;
    if (!result) {
      const { text: transcript, transcriber } = transcribe(p.mp3);
      result = { ...checkTranscript({ transcript, spoken: p.spoken, written: p.written, terms: p.terms, maxWer: verifyCfg.maxWer, lang: iso }), transcript, transcriber, attempt };
      writeFileSync(p.check, JSON.stringify(result, null, 2) + '\n');
    }
    if (result.pass) break;
    console.log(`CHECK   ${take.id}  heard "${result.transcript}"  wer ${result.wer}${result.missingTerms.length ? `, missing ${result.missingTerms.join(', ')}` : ''}`);
    if (attempt >= verifyCfg.attempts) { failed++; break; }
    rmSync(p.mp3, { force: true }); rmSync(p.align, { force: true }); rmSync(p.check, { force: true });
  }
  if (verifyCfg.enabled && result?.pass) console.log(`heard   ${take.id}  wer ${result.wer}${p.terms.length ? `, terms ${p.terms.map((t) => t.written).join(', ')}` : ''}`);

  let ws = recorded ? recorded.get(p.base).words : words(JSON.parse(readFileSync(p.align, 'utf8')));
  if (!recorded && timing === 'forced-alignment') {
    const fa = join(out, `${p.base}.forced.json`);
    keep.add(`${p.base}.forced.json`);
    if (!existsSync(fa)) writeFileSync(fa, JSON.stringify(forcedWords(p.mp3, p.spoken)) + '\n');
    const fw = JSON.parse(readFileSync(fa, 'utf8'));
    if (fw.length) ws = fw;
  }
  const duration = ws.length ? ws[ws.length - 1].end : 0;
  const room = take.until - take.at;
  const fits = duration <= room;
  if (!fits) overruns++;
  if (take.at < prevEnd) console.log(`OVERLAP ${take.id} starts at ${take.at}s, before the previous take ends (${prevEnd.toFixed(2)}s)`);
  prevEnd = take.at + duration;
  console.log(`${fits ? 'ok     ' : 'OVERRUN'} ${take.id}  ${duration.toFixed(2)}s of ${room.toFixed(2)}s  (ends at ${(take.at + duration).toFixed(2)}s)`);
  for (const a of take.anchors ?? []) {
    const spokenAnchor = lex.toSpoken(a.word).toLowerCase().split(/\s+/)[0];
    const w = ws.find((x) => x.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '') === spokenAnchor.replace(/[^\p{L}\p{N}']/gu, ''));
    if (!w) { console.log(`          anchor "${a.word}": not found in the take`); continue; }
    const t = take.at + w.start;
    const onCue = t >= a.from && t <= a.to;
    console.log(`          anchor "${a.word}" at ${t.toFixed(2)}s ${onCue ? 'on cue' : `OFF CUE (wants ${a.from}-${a.to}s)`}`);
  }
  manifest.takes.push({
    id: take.id, at: take.at, until: take.until, speak: p.spoken,
    file: rel(`${p.base}.mp3`), duration: +duration.toFixed(3),
    words: ws.map((w) => ({ text: w.text, start: +(take.at + w.start).toFixed(3), end: +(take.at + w.end).toFixed(3) })),
  });
  const prev = prevByKey.get(p.base);
  lock.takes.push({
    id: take.id, key: p.key, written: p.written, spoken: p.spoken,
    terms: p.terms.map((t) => t.written), duration: +duration.toFixed(3),
    verify: verifyCfg.enabled && result ? { wer: result.wer, missingTerms: result.missingTerms, pass: result.pass, transcript: result.transcript, transcriber: result.transcriber ?? 'elevenlabs', attempts: result.attempt } : null,
    ...(result?.recorded ? { recorded: result.recorded } : {}),
    generatedAt: fresh || !prev ? new Date().toISOString() : prev.generatedAt,
    plan: fresh || !prev ? acct?.tier ?? null : prev.plan,
  });
}

// Keep the folder to exactly what the manifest references.
for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(join(out, f));
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
if (failed) console.error(`\n${failed} take(s) failed the listening check after ${verifyCfg.attempts} attempts. Rephrase the line, or add a pronunciation rule, then re-run.`);
if (overruns) console.error(`\n${overruns} take(s) run past their scene. Tighten the wording, then re-run.`);
if (failed || overruns) process.exit(1);
console.log(`\nall ${manifest.takes.length} takes fit${verifyCfg.enabled ? ' and were heard as written' : ''}. Next: copy word times into the scene's cues, then npm run sheet and npm run render`);
