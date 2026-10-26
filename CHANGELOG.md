# Changelog

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
