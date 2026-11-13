# Changelog

## 1.4.0

- **`npm run find`**: stock pictures and footage from Wikimedia Commons and
  Openverse (Creative Commons and public domain, no key) and Unsplash, Pexels
  and Pixabay (a free key each, from the environment or the macOS Keychain).
  Each result's licence is read from the library; NonCommercial,
  NoDerivatives and unreadable licences are dropped; ShareAlike, people and
  logos are flagged; a contact sheet shows the results. `--add` writes the
  clip with its page, author, licence and credit line.
- **Stills** as clips: one large frame, shown with a slow push-in (`GFX.still`).
- **Credit lines** in each library's own form (TASL for Creative Commons,
  "Photo by … on Unsplash", …) in `media.lock.json`, `publish.json` and
  `window.CLIP_CREDITS` for the end card (`GFX.credits`).
- Unsplash photos are reported to Unsplash when downloaded, as its API terms
  require. Render warns about ShareAlike footage; clips refuses NonCommercial
  and NoDerivatives licences by name. Doctor shows which libraries have keys.

Fixed, found with ffmpeg 7 (ffmpeg-static on Linux):

- A cut-down is encoded at the film's frame rate; ffmpeg 7 encoded it at
  25 fps and dropped a frame in six.
- A film with a voice and no music renders: the ducking key went to
  `anullsink`, which crashes ffmpeg 7 ("best_input >= 0").
- Chrome is found where it is installed on Linux and Windows as well as macOS
  (`CHROME_PATH` still wins), so a render no longer depends on Playwright's own
  browser build matching the playwright-core npm installed. Doctor uses the
  same lookup. The render test prints the ffmpeg, playwright-core and Chrome
  versions it ran with.

## 1.3.0

Short form, footage, a person's own voice, and a house style that learns.
Ideas drawn from a creator's AI short-form editing workflow, rebuilt around
brand-film's rule that everything is checked.

- **House style per brand.** `house-style.md` (or a shared file named by
  `brand.houseStyle`) holds Script, Picture and Sound notes and a Never say
  list; `npm run lesson` adds a dated note; lint fails on a never-say phrase.
- **Script rules and a score.** Lint fails on a take with no `scene` (every
  line has a shot) and warns on a late or long hook, machine-written phrasing,
  a caveat past one clause, more than one idea in a take, and no call to
  action. `npm run score` is a 10-point checklist; narrate prints it.
- **Other shapes.** film.json `aspects` renders the scene as 16:9, 9:16, 1:1
  or 4:5 (`out/<basename>.9x16.mp4`); the template lays out for three.
- **Burned-in captions** (`burnCaptions`): word by word, written forms
  restored, brand caption roles checked for contrast.
- **Cut-downs** (`cuts`): ranges of a finished shape, refused when a cut lands
  inside a word, verified like the film.
- **Graphics kit** (`lib/gfx.js`): counters, bar and line charts, title cards
  with specs, lower thirds, typing, frame-exact clips.
- **A web page as the source** (`npm run source`), its media listed.
- **Footage** (`clips.json`, `npm run clips`): files, URLs (fetch or yt-dlp)
  and Blender renders become frame sequences; every clip needs a licence;
  `media.lock.json` records source, licence, credit and hash; render refuses
  unlicensed footage and mixes a clip's sound when cued (`window.CLIPS`).
- **`npm run shots`** (shot list and contact sheet) and **`npm run study`**
  (a brand's videos measured: pacing, colours, loudness).
- **Recorded voice-over** (`npm run narrate -- --recorded <file>`): each take
  found among retakes, stumbles dropped, pauses shortened, cuts made on the
  waveform, each take checked against the script.
- **Transcription fallback** to whisper.cpp; the lock records the transcriber.
- **Generated sound effects**: an sfx.json entry with a `prompt` is made by
  ElevenLabs, cached, committed and locked in `sfx.lock.json`.
- **The voice is normalized in one gain** (two-pass loudnorm, linear mode);
  the report measures how much the mix flattens it (`voiceProcessing`).
- **`out/<basename>.publish.json`**: titles, description, chapters (YouTube's
  rules checked), footage credits and every file; `posters` adds poster choices.
- **`npm run status`** names the next step; **doctor** checks the network and
  the optional tools.

## 1.2.0

- **A film folder now commits its final audio.** The template's `.gitignore`
  keeps `narration/*.mp3` (with each take's `.verify.json` and
  `.alignment.json`) and `music/*.mp3`. ElevenLabs v3/v4 take no seed, so the
  lock files record how a take was made but cannot reproduce it: a re-voice is
  a different read and costs credits. With the audio committed, a clone
  re-renders for free. A public project can opt out; the `.gitignore` says how.
- **Fix: `lib/` went missing in projects that ignore `lib/`.** Many repositories
  ignore `lib/` as build output, which silently dropped the film's helper
  modules, so a fresh clone could not run `tokens`, `narrate` or `render`
  (`Cannot find module ./lib/lexicon.mjs`). The template's `.gitignore`
  re-includes it with `!lib/`.

## 1.1.0

- **Translations**, per language, in one of two modes:
  - `captions`: translated captions timed onto the film's own speech; no
    credits and no new render (`out/<basename>.<code>.vtt`).
  - `voice`: translated captions and a voice-over by a native narrator, voiced
    and checked by speech-to-text in that language, rendered as its own film
    (`out/<basename>.<code>.mp4`) with translated on-screen text.
- `npm run translate` adds languages and keeps `narration.<code>.json` in step
  with the script: a translation of a line that has since changed is marked
  stale, and lint and render fail until it is re-translated.
- Pronunciation rules can be per language (`"lang": "es"`).
- `npm run narrate -- --lang <code>`, `npm run render -- --lang <code>` and
  `--all`, `npm run sheet -- --lang <code>`, and auditions per language.
- The scene template marks translatable text with `data-i18n`; the render warns
  about any on-screen text a voiced language is missing.
- A captions-only render needs neither Chrome nor ffmpeg.
- The example film gains a Spanish voice-over and French captions.


## 1.0.1

- **Fix: the end of the narration was cut off in films with music.** The voice
  bus was split for the music's ducking key with only the key branch padded,
  and the last ~3 s of loudnorm's look-ahead never reached the mix, so the
  final words of the last take were lost (2.5–3 s of the example film). Every
  bus is now padded and trimmed to the film's length before it is split or
  mixed.
- **New check: every spoken word must be in the finished film.** The render
  compares each word's level in the mix with the same word in its take, and
  fails if any was lost (`lib/audiocheck.mjs`, results in the report).
- CI now renders a film with synthetic narration and a score, so the full mix
  and the word check run on every change without an ElevenLabs account.
- The example film is re-rendered with the fix.

## 1.0.0

First public release.

- The brand-film skill as a Claude Code plugin, installable from this
  repository's marketplace or with `npx skills add`.
- A neutral default identity (`default-tokens.json`); a brand writes only what
  its sources define and inherits the rest, with every inherited key listed.
- A pronunciation lexicon per brand (`brand.pronunciations`): scripts are
  written with written forms, the voice is sent spoken forms, captions show
  the written ones.
- A listening check on every take: ElevenLabs speech-to-text, word error rate
  and required terms, re-voicing a take that fails.
- Optional timing from ElevenLabs forced alignment.
- `takes.lock.json` and `music.lock.json`: how every take and score was made,
  including the plan it was generated on.
- `npm run doctor`, `npm run lint` (no API), a spending cap (`FILM_MAX_CHARS`),
  render verification (frame count, loudness) with a report file, and silent
  rendering when the audio is absent.
- An example film, `examples/how-it-works`.
