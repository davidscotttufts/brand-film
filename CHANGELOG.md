# Changelog

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
