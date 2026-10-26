---
name: brand-film
description: Make a narrated, on-brand explainer or journey FILM (MP4 + poster + captions) from a deck, a document or a story, and build the brand's film design system first. Researches the brand's real sources (brand-standards PDF, official logo package, the decks themselves), extracts colours, type, logos and a pronunciation lexicon into one brand-tokens.json (a neutral default identity fills anything a brand doesn't define), writes a word-timed voice-over, builds an HTML scene whose every frame is a pure function of time, voices it with ElevenLabs and LISTENS to every take with speech-to-text (re-voicing a take that mispronounces a brand term), adds ffmpeg-synthesized sound effects and an optional ElevenLabs score ducked under the narrator, renders frame by frame in headless Chrome + ffmpeg, verifies the file, and delivers it into a deck's speaker notes, Google Slides or a web page. Use when asked to make a film, video, motion piece, animated explainer, narrated story, "movie about our journey", or video for a presentation, in a company's brand or a neutral one. Not for editing camera footage.
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

Read each reference when you reach its step.

## Prerequisites (check once, fix or report)

Scaffold first (Step 1), then in the film folder:

```bash
npm run doctor     # Node, packages, Chrome, ElevenLabs CLI + sign-in + characters left, PDF tools
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
- **Where the film folder lives.** Beside the sources by default (`<project>/film/`).

## Step 1: The brand's film design system

Follow `references/brand-system.md`:

1. Scaffold: `scripts/scaffold.sh <project>/film <basename>`. It renders in the
   neutral identity before any brand work. Run `npm run doctor`.
2. Find the sources: the brand-standards PDF and official logo package (web),
   the decks (`python3 -I scripts/extract-brand.py <decks/PDFs> --out <scratch>/brand`),
   rendered slides, any existing design system.
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

Follow `references/story-and-script.md`. Write the outline (scene, line, the
picture that proves it), check every fact against the sources and the timeline
documents, and get a yes. Then write `narration.json` (one take per scene with
its WRITTEN `text`, `at`/`until` windows, anchors) and fill `film.json`
(`source`: the sources' text, e.g. `source.txt` from the extractor; `facts`:
the load-bearing strings). `npm run lint` passes (no API, no credits).

## Step 3: Voice it

Pick the narrator by ear if the brand has none (`npm run audition`, see
`references/sound.md`). Say what the run will cost (`npm run narrate` prints the
characters it is about to send and what the account has left; set
`FILM_MAX_CHARS` to cap it). Then `npm run narrate`: every take is heard as
written (the listening check re-voices a take that fails, up to three times),
every take fits its window, and the anchors are on cue. Overruns and takes that
never pass fail the run: tighten the wording, rephrase, or add a lexicon rule,
and re-run. Read the manifest's word times; they drive Step 4.

## Step 4: The scene

Follow `references/scene-contract.md`. Replace the template's example scenes
with yours, one `<div class="abs sec">` per beat, motion that IS the claim,
cue times copied from the voiced words, tokens only, opening card complete
from frame 0, SFX cued on visible changes. Render a contact sheet
(`npm run sheet`) and stills at the key words; read every frame for overlap,
clipping, wraps, ghosts and timing; fix; repeat.

## Step 5: Effects and music

`npm run sfx` (no API). If the film has a score: write the prompt in
`music.json` (`use: true`, `lengthMs` ≈ DURATION + 1 s) and `npm run music`.

## Step 6: Approve in stills, then render

Share the contact sheet and the key stills with each scene's line (SendUserFile,
or a small artifact of frames). On a yes: `npm run render` (minutes; run it in
the background for a long film). It fails on a wrong frame count or on any spoken word missing from the finished mix, and writes `out/<basename>.report.json`. Then finish the review per
`references/review-and-delivery.md`: stereo AAC, about -16 LUFS / peak under
-1 dBTP, frames pulled from the finished MP4, captions spelled right. Ask the
user to listen for tone and the music level; the listening check covers words,
not delivery.

## Step 7: Deliver

Per `references/review-and-delivery.md`: the MP4, poster and captions; the
narration in the deck's speaker notes as `FILM NARRATION (m:ss):`; Google Slides
insertion steps; or the `<video>` + captions markup for a page. Write the film
folder's README (the template's `README.md` is the start). Commit the sources
and the lock files (`takes.lock.json`, `music.lock.json`), not the audio or
`out/`.

## Step 8: Revisions

Collect notes in bursts; edit sources as they come; don't re-voice or re-render
until the user says go; back up before structural changes; add scenes as
INSERTS; re-narrate (only changed takes cost credits), re-sheet, re-render once,
re-verify, and update the speaker-note timestamps.

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
- **Credits are the user's money.** Say what a voicing or composition will cost;
  re-voice only what changed. A free ElevenLabs plan has no commercial licence:
  say so before making a film that will be published.
- **Keys stay out of chat and files.** The CLI sign-in, the environment, or
  the macOS Keychain; never a committed `.env`.

## Report

End with: where the film folder and outputs are; the brand decisions (sources,
substitutions, anything inherited from the default); the lexicon and how every
take scored in the listening check; the verification numbers (duration, frames,
LUFS, peak); what the user should listen for; and the delivery steps still
theirs to do.
