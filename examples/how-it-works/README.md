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
npm run narrate && npm run music && npm run render
```

A new voicing is a new performance, so the timings in `narration/manifest.json`
may move by a fraction of a second; `npm run narrate` reports any anchor that
falls off its cue.

Every fact on screen is in `SOURCE.md`, and `npm run render` checks the
load-bearing ones.
