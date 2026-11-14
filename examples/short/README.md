# Example: a 30-second short

A vertical (9:16) short about brand-film, made with the 1.3.0 short-form
features: one scene laid out for a phone, word-by-word captions burned into
the picture, and publish text written beside the film. Its source is a web
page, the [brand-film site](https://davidscotttufts.github.io/brand-film/),
read with `npm run source` (`source.txt`, `source.lock.json`).

It shares the how-it-works example's pronunciation lexicon (`brand-tokens.json`)
and otherwise uses the neutral default identity. Every take was heard back by
speech-to-text before the render; the record is in `takes.lock.json`.

| | |
|---|---|
| Length | 30 s, 900 frames at 30 fps, 1080×1920 |
| Narrator | "Christopher" (ElevenLabs Voice Library) |
| Listening check | 5 of 5 takes heard as written (word error rate 0) |
| Captions | burned in, word by word, written forms restored; also `short.en.vtt` |
| Mix | -15.8 LUFS integrated, true peak -2.0 dBTP; all 64 spoken words found in the mix |
| Sound | effects synthesized with ffmpeg (`sfx.json`); no score |
| Made on | an ElevenLabs Creator plan (commercial use permitted) |

## What it shows

| Time | Scene | On the word |
|---|---|---|
| 0–5 s | "Brand films, made in code." | |
| 5–11 s | the scene's own `window.render(t)`, typed, with a frame counter | "frame" |
| 11–18 s | a waveform, then three names marked as heard | "check" |
| 18–24 s | one frame changing shape: wide, tall, square | "wide", "tall", "square" |
| 24–30 s | end card with the repository address | "GitHub" |

## Rebuild it

The audio is not in the repository. Without it the film still renders, silent,
with the same captions:

```bash
npm install
npm run tokens && npm run sfx && npm run render     # silent, no account needed
```

To regenerate the voice you need an ElevenLabs account (about 330 characters
of narration and five short transcriptions):

```bash
npm run doctor
npm run narrate && npm run render
```

A new voicing is a new performance, so the timings in `narration/manifest.json`
may move by a fraction of a second; `npm run narrate` reports any anchor that
falls off its cue.

The facts on screen ("Brand films", "made in code", "MIT") are checked against
`source.txt` by `npm run render`. Titles, description and chapters for posting
are in `out/short.publish.json`.
