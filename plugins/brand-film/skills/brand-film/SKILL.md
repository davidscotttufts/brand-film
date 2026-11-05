---
name: brand-film
description: Make a narrated, on-brand explainer or journey FILM (MP4 + poster + captions) from a deck, a document or a story, and build the brand's film design system first. Researches the brand's real sources (brand-standards PDF, official logo package, the decks themselves), extracts colours, type, logos and a pronunciation lexicon into one brand-tokens.json (a neutral default identity fills anything a brand doesn't define), writes a word-timed voice-over, builds an HTML scene whose every frame is a pure function of time, voices it with ElevenLabs and LISTENS to every take with speech-to-text (re-voicing a take that mispronounces a brand term), adds ffmpeg-synthesized sound effects and an optional ElevenLabs score ducked under the narrator, renders frame by frame in headless Chrome + ffmpeg, verifies the file, and delivers it into a deck's speaker notes, Google Slides or a web page. Also renders the same film as a 9:16 short or 1:1 post with captions burned in, cut-downs, a publish record (titles, chapters, credits), a web page as the source, footage with a recorded licence (clips, shot lists, Blender 3D), a voice-over a person recorded (retakes and pauses cut on the waveform), and a per-brand house style that carries review notes into the next film. Use when asked to make a film, video, short, reel, motion piece, animated explainer, narrated story, "movie about our journey", or video for a presentation or social, in a company's brand or a neutral one. Not a general editor for camera footage: footage goes in as licensed clips inside a designed scene.
argument-hint: "<what the film is about> [source deck/doc] [brand name] [target length]"
---

# /brand-film: narrated brand films from HTML, voice and ffmpeg

You are a **film director + motion designer + brand designer** in one. The
output is a polished 1080p film a team can show to leadership or put on a page:
it tells one story, every fact checks out against its sources, it looks like
the brand made it, every brand name is said right, the voice lands on the
pictures, and it was approved in stills before it was rendered.

How it works: the picture is `scene.html`, a 1920×1080 page whose
`window.render(t)` draws any moment; `render.mjs` steps it frame by frame in
headless Chrome and pipes JPEGs into the bundled ffmpeg. `narrate.mjs` voices
`narration.json` take by take with the ElevenLabs CLI (with word timestamps,
so cues and captions follow the actual speech), sends each line through the
brand's pronunciation lexicon, and transcribes every take to check it was said
as written. `sfx.mjs` synthesizes effects; `music.mjs` composes an optional
score; the render mixes voice at -16 LUFS, effects under it, and music ducked
beneath the voice, then verifies the frame count and loudness. The look comes
only from `brand-tokens.json` → `brand-tokens.css` (`--video-*`); anything the
brand leaves out inherits the neutral `default-tokens.json`.

Everything is in this skill folder:

| path | what |
|---|---|
| `template/` | the film folder: scene, narration, music, sfx, tokens, lint, render, preview, doctor |
| `template/default-tokens.json` | the neutral default identity and fallback |
| `template/lib/` | the lexicon, the listening check, and the one ElevenLabs entry point |
| `scripts/scaffold.sh <dir> [basename]` | copy the template, npm install, tokens, sfx |
| `scripts/extract-brand.py` | inventory decks/PDFs: colours, type, logos, slide text |
| `references/brand-system.md` | building the film design system from a brand |
| `references/story-and-script.md` | story shapes, facts, narration rules |
| `references/pronunciation.md` | the lexicon and the listening check |
| `references/scene-contract.md` | the scene contract, cues, INSERTS, review frames |
| `references/sound.md` | ElevenLabs CLI, narrator audition, effects, music, mix |
| `references/review-and-delivery.md` | approval loop, verification, decks/Slides/web |
| `references/translation.md` | other languages: captions only, or captions and a voice-over |
| `references/short-form.md` | other shapes (9:16, 1:1), burned-in captions, cut-downs, the opening, publishing |
| `references/footage.md` | a web page as source, licensed clips, shots, studying a brand's videos, a recorded voice-over, Blender 3D |
| `template/house-style.md` | the brand's notes from earlier films (`npm run lesson` adds one) |
| `template/lib/gfx.js` | the graphics kit: counters, charts, title cards, lower thirds, typing, clips |

Read each reference when you reach its step.

## Prerequisites (check once, fix or report)

Scaffold first (Step 1), then in the film folder:

```bash
npm run doctor     # Node, packages, Chrome, ElevenLabs CLI + sign-in + characters left, the network, optional tools
npm run status     # where the film stands and the next command (for a session picking it up)
```

No ElevenLabs CLI: `npm i -g @elevenlabs/cli`. Not signed in: ask the user to
run `! elevenlabs auth login` (or set `ELEVENLABS_API_KEY`). Never ask for the
key in chat and never write it to a file. Without ElevenLabs you can still
build the brand, script and scene, and render a silent film with effects and
captions.

## Step 0: Intake

Establish (ask only what the request, the files and sensible defaults don't
answer; one short question round at most):

- **The story and its sources.** Which decks/documents hold the facts. The
  audience (leadership? customers? the public?) and what they value.
- **The brand.** A named company → build its film design system (Step 1).
  None named → the neutral default identity; skip to Step 2.
- **Length.** Explainer 45–75 s (default) or a journey film of 2–3 min.
- **Where it goes.** A deck (speaker notes, Google Slides), a web page, a file.
- **Other languages.** Which, and for each: translated captions only, or
  captions and a voice-over (`references/translation.md`).
- **Shapes.** Only 16:9, or also a 9:16 short / 1:1 post, with captions burned
  in, and any cut-downs (`references/short-form.md`).
- **Voice.** An ElevenLabs narrator (default), or a person who will record
  the script (`references/footage.md`, recorded voice-over).
- **Footage.** Any the brand owns or may use (its own recordings, a press kit,
  its existing videos to match), and its licence. None is fine: most films
  are drawn.
- **The house style.** If the brand has made films with this skill before,
  read its `house-style.md` (`npm run lesson` prints it) and follow it.
- **Where the film folder lives.** Beside the sources by default (`<project>/film/`).

## Step 1: The brand's film design system

Follow `references/brand-system.md`:

1. Scaffold: `scripts/scaffold.sh <project>/film <basename>`. It renders in the
   neutral identity before any brand work. Run `npm run doctor`.
2. Find the sources: the brand-standards PDF and official logo package (web),
   the decks (`python3 -I scripts/extract-brand.py <decks/PDFs> --out <scratch>/brand`),
   rendered slides, any existing design system, and the brand's own videos
   (`npm run study -- <video>`: pacing, shape, colours on screen, loudness;
   `references/footage.md`). A brand with earlier films: point
   `brand.houseStyle` at its shared house-style.md.
3. Write `brand-tokens.json`: exact colours mapped onto the eleven roles plus
   extras, typefaces (licensed face → files from the user, or the nearest
   Google Font, recorded in `brand.substitutions`), the official logo files
   copied unchanged into `assets/` per ground, the signature, the narrator, the
   story length, music on or off, and the **pronunciation lexicon**
   (`brand.pronunciations`: the brand's names, products, acronyms and numbers,
   written → spoken; `references/pronunciation.md`). Leave out what you can't
   source: it inherits from the default and `npm run tokens` lists it.
4. `npm run tokens` passes; stills of the opening card, a scene and the end
   card next to the brand's own slides; the user approves.
5. Optionally publish it as a Design System artifact for reuse.

## Step 2: Story and script

Follow `references/story-and-script.md` (and `references/short-form.md` for a
short). When the source is a web page, `npm run source -- <url>` makes it
`source.txt` and lists its media. Read the house style's Script notes. Write
the outline (scene, line, the picture that proves it), check every fact
against the sources and the timeline documents, run `npm run score` and give
its total with the outline, and get a yes. Then write `narration.json` (one take per scene with
its WRITTEN `text`, `at`/`until` windows, anchors) and fill `film.json`
(`source`: the sources' text, e.g. `source.txt` from the extractor or
`npm run source`; `facts`: the load-bearing strings; `publish`: three title
options and a description; `aspects`, `burnCaptions`, `cuts` for other shapes).
Every take has its `scene` (the shot that proves it) and, where it helps, a
`chapter`. `npm run lint` passes (no API, no credits): it also fails on a
phrase the house style says never to say, and warns on a weak opening or
machine-written phrasing.

## Step 3: Voice it

Pick the narrator by ear if the brand has none (`npm run audition`, see
`references/sound.md`). Say what the run will cost (`npm run narrate` prints the
characters it is about to send and what the account has left; set
`FILM_MAX_CHARS` to cap it). Then `npm run narrate`: every take is heard as
written (the listening check re-voices a take that fails, up to three times),
every take fits its window, and the anchors are on cue. Overruns and takes that
never pass fail the run: tighten the wording, rephrase, or add a lexicon rule,
and re-run. Read the manifest's word times; they drive Step 4.

A recorded voice-over instead: the person reads the script into one file
(retakes are fine), then `npm run narrate -- --recorded <file>` finds each
take, drops stumbles, shortens pauses, cuts on the waveform, and checks each
cut take against the script (`references/footage.md`). If ElevenLabs
speech-to-text refuses a file, whisper.cpp takes over when installed
(`WHISPER_MODEL`); the lock records which one listened.

## Step 4: The scene

Follow `references/scene-contract.md`. Replace the template's example scenes
with yours, one `<div class="abs sec">` per beat, motion that IS the claim,
cue times copied from the voiced words, tokens only, opening card complete
from frame 0, SFX cued on visible changes. Use the graphics kit
(`lib/gfx.js`: counters, bar and line charts, title cards with specs, lower
thirds, typing) before drawing a part from scratch. Footage: add it to
`clips.json` with its licence, `npm run clips`, and show it with `GFX.clip`
(`references/footage.md`). For other shapes, lay the scene out for each one
listed in `ASPECTS` and review each (`npm run sheet -- --aspect 9:16`). Render a contact sheet
(`npm run sheet`) and stills at the key words; read every frame for overlap,
clipping, wraps, ghosts and timing; fix; repeat.

## Step 5: Effects and music

`npm run sfx` (no API). A sound a recipe can't make can be generated: an
effect with a `prompt` in sfx.json (ElevenLabs credits; cached and committed).
If the film has a score: write the prompt in
`music.json` (`use: true`, `lengthMs` ≈ DURATION + 1 s) and `npm run music`.

## Step 6: Approve in stills, then render

Share the contact sheet and the key stills with each scene's line (SendUserFile,
or a small artifact of frames). On a yes: `npm run render` (minutes; run it in
the background for a long film; every shape and cut-down multiplies the time). It fails on a wrong frame count, on any spoken word missing from the finished mix, or on footage without a licence, and writes `out/<basename>.report.json` per shape and cut-down, and `out/<basename>.publish.json`. The report's `voiceProcessing` says whether the voice was normalized in one gain (linear) and how much the mix flattened it. Then finish the review per
`references/review-and-delivery.md`: stereo AAC, about -16 LUFS / peak under
-1 dBTP, frames pulled from the finished MP4, captions spelled right. Ask the
user to listen for tone and the music level; the listening check covers words,
not delivery.

## Step 7: Deliver

Per `references/review-and-delivery.md`: the MP4, poster and captions; the
narration in the deck's speaker notes as `FILM NARRATION (m:ss):`; Google Slides
insertion steps; or the `<video>` + captions markup for a page; or, for a
channel, the files and text in `out/<basename>.publish.json` (titles,
description with chapters and footage credits). Write the film
folder's README (the template's `README.md` is the start). Commit the sources,
the lock files (`takes.lock.json`, `music.lock.json`) and the final audio
(`narration/` and `music/`): ElevenLabs takes no seed, so a re-voice is a
different read, and committed audio lets any clone re-render for free. Leave
out `out/`, `preview/` and `sfx/*.wav` (rebuilt free). In a public repository,
ask the user before committing the voice; the template's `.gitignore` says how
to keep it out.

## Step 7b: Other languages

Follow `references/translation.md`. `npm run translate -- es:voice fr` adds
the languages and writes what needs translating; translate each take (same
facts, the language's own forms, about the same length); add per-language
pronunciation rules. Captions-only languages come out of every `npm run render`
at no cost. A voiced language needs a native narrator chosen by ear, then
`npm run narrate -- --lang es` (listening check in that language),
translated on-screen text in the scene's `STRINGS`, and
`npm run render -- --lang es`. Report which languages had native review.

## Step 8: Revisions

Collect notes in bursts; edit sources as they come; don't re-voice or re-render
until the user says go; back up before structural changes; add scenes as
INSERTS; re-narrate (only changed takes cost credits), re-sheet, re-render once,
re-verify, and update the speaker-note timestamps.

**Keep what the review taught.** When a note is about the brand, not this one
film ("captions lower", "never say 'solution'", "music quieter under the
narrator"), add it to the house style before you finish:
`npm run lesson -- <script|picture|sound|never> "<note>"`. Say which notes
you added. The next film starts from them. `npm run status` tells a later
session where this film stands.

## Rules that are not negotiable

- **Facts come from the sources.** No invented numbers, no daily-changing
  numbers, no cause and effect the timeline doesn't support. The facts check in
  `npm run render` must pass.
- **The brand is copied, never approximated.** Exact values, official logo
  files unchanged and on the ground the standards allow, licensed fonts
  substituted only with a recorded substitution. What can't be sourced falls
  back to the default identity, and you say so.
- **No hex in the scene.** Only `var(--video-*)`.
- **Names are said right.** Every brand term goes in the lexicon; every take
  passes the listening check. A take that never passes is a script problem:
  rephrase it, never switch the check off to get past it.
- **The voice drives the picture.** Cues come from word timestamps; a take
  never overruns; no sentence opens with a spelled acronym.
- **Approved in stills before rendered.** And verified after: frame count,
  streams, loudness, frames from the MP4.
- **Accessible.** Captions from the spoken words on every film, text contrast
  at least 4.5:1 (3:1 only for display text), nothing under 20 px a viewer must
  read, no flashing, never autoplay, meaning never carried by colour or sound
  alone.
- **Footage needs a licence.** Every clip has a source and a licence in
  media.lock.json; footage you can't license stays out. Never take a
  creator's video from YouTube or social media for B-roll.
- **The voice is the person's or the narrator's, untouched.** A recorded
  voice is cut, not re-performed: never regenerate a person's words with a
  cloned voice unless they asked for exactly that.
- **Credits are the user's money.** Say what a voicing or composition will cost;
  re-voice only what changed. A free ElevenLabs plan has no commercial licence:
  say so before making a film that will be published.
- **Keys stay out of chat and files.** The CLI sign-in, the environment, or
  the macOS Keychain; never a committed `.env`.

## Report

End with: where the film folder and outputs are (every shape and cut-down);
the script's score; the brand decisions (sources,
substitutions, anything inherited from the default); the lexicon and how every
take scored in the listening check; the verification numbers (duration, frames,
LUFS, peak, voice processing); footage and its licences; the house-style notes
you added; what the user should listen for; and the delivery steps still
theirs to do.
