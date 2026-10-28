# Example: how brand-film works

A 48-second film that explains brand-film, made with brand-film. Watch it in
the [gallery](https://davidscotttufts.github.io/brand-film/) or download it
from the [release](https://github.com/davidscotttufts/brand-film/releases).

It uses the neutral default identity (`default-tokens.json`) and adds one thing
of its own: a pronunciation lexicon in `brand-tokens.json` for the terms a
voice gets wrong (brand-film, ElevenLabs, ffmpeg, HTML, GitHub). Every take was
heard back by speech-to-text before the render; the record is in
`takes.lock.json`.

| | |
|---|---|
| Length | 48 s, 1,440 frames at 30 fps |
| Narrator | "Christopher" (ElevenLabs Voice Library), `eleven_v4` |
| Listening check | 6 of 6 takes heard as written (word error rate 0); one take was re-voiced after the first reading said "Brandfilm" |
| Mix | -17.4 LUFS integrated, true peak -1.9 dBTP (narration bus normalized to -16 LUFS) |
| Captions | 13 cues from the spoken words, with the written forms restored |
| Score | ElevenLabs music (`music_v2_5`), instrumental, ducked under the voice |
| Made on | an ElevenLabs Creator plan (commercial use permitted) |

## Languages

It shows both translation modes (`references/translation.md`):

| Language | Mode | What it has |
|---|---|---|
| English | the film's own | voice-over by "Christopher", captions |
| Spanish (`es`) | voice | its own film, `how-it-works.es.mp4`: a native narrator ("Enrique Mondragón", es-MX, from the ElevenLabs Voice Library), Spanish on-screen text, captions; 6 of 6 takes heard as written by speech-to-text in Spanish (one line was tightened to fit its scene) |
| French (`fr`) | captions | `how-it-works.fr.vtt`, timed onto the English speech; no voicing, no new render |

The Spanish pronunciation rules are in `brand-tokens.json` with `"lang": "es"`
(letter names said the Spanish way), and its record is `takes.lock.es.json`.
The translations were written by Claude. The Spanish film (narrator, on-screen
text and captions) was reviewed and approved by the author on 2026-10-27; the
French captions have not had a native review.

## Rebuild it

The audio is not in the repository. Without it the film still renders, silent,
with the same captions:

```bash
npm install
npm run tokens && npm run sfx && npm run render     # silent, no account needed
```

To regenerate the voice and score you need an ElevenLabs account (about 450
characters of narration, six short transcriptions and a 49-second composition):

```bash
npm run doctor
npm run narrate && npm run narrate -- --lang es && npm run music
npm run render -- --all     # English film + its en/fr captions, then the Spanish film
```

A new voicing is a new performance, so the timings in `narration/manifest.json`
may move by a fraction of a second; `npm run narrate` reports any anchor that
falls off its cue.

Every fact on screen is in `SOURCE.md`, and `npm run render` checks the
load-bearing ones.
