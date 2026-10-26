# Pronunciation and the listening check

A film that says the brand's name wrong is worse than no film. Two pieces stop
that: a **lexicon** that says how each term is spoken, and a **listening check**
that transcribes every voiced take and refuses one that wasn't said as written.

## The lexicon (`brand.pronunciations`)

A list of rules in `brand-tokens.json`, one per term:

```json
"pronunciations": [
  { "written": "Kestrel", "spoken": "Kess-trel" },
  { "written": "nginx", "spoken": "engine x" },
  { "written": "API", "spoken": "A P I", "caseSensitive": true },
  { "written": "17 weeks", "spoken": "seventeen weeks" },
  { "written": "example.com", "spoken": "example dot com" }
]
```

- **`written`** is how the term appears in the script, on screen and in the
  captions. **`spoken`** is the text the voice is sent.
- Matching is whole-word and case-insensitive unless `caseSensitive` is set
  (use it when the lower-case form is an ordinary word: "US" and "us").
- Rules are applied in ONE pass, longest first, so a spoken form never
  triggers another rule.
- Write the narration's `text` with the written forms. `narrate.mjs` sends the
  spoken forms; the captions turn them back into the written ones.
- `npm run tokens` fails on an empty, duplicate or no-op rule. `npm run lint`
  warns about digits that still reach the voice.

**Why aliases and not phoneme tags.** ElevenLabs pronunciation dictionaries can
also hold IPA/CMU phoneme rules, but those work only on some models and are
skipped silently on others. A spoken spelling ("Kess-trel", "engine x") works on
every model, can be tested without an API call, and lives in the repo beside
the film. When a spelling can't get a sound right, ask the user to try a
phonetic respelling by ear with `npm run audition`, then record the winner.

**What belongs in it:** the company and product names, people's names the film
says, every acronym (decide per acronym: spelled "A P I" or said as a word
"NASA"), a URL, and any number the film repeats. Find the brand's own guidance
first (a "how to say it" line in the press kit, the founders in a recorded
talk); ask the user when nothing says. Never guess at a person's name.

**Acronyms at the start of a sentence** are read letter by letter with pauses
("A. P. I. keys…"). Rephrase so the sentence doesn't open with one;
`npm run lint` fails on it.

## The listening check

After a take is voiced, `narrate.mjs` transcribes it with ElevenLabs
speech-to-text (`scribe_v1`) and compares the transcript with the take:

- **Word error rate** against the take, counting the transcriber's legitimate
  differences as matches (case, punctuation, "17" for "seventeen", a term
  written either way). It must be at or under `verify.maxWer` (0.15).
- **Every lexicon term** the take uses must be heard, in either form.

A take that fails is voiced again (a v3/v4 voice gives a different reading
each time) up to `verify.attempts` (3) times. Each result is printed:

```
heard   b-start  wer 0, terms Kestrel
CHECK   c-proof  heard "Kestrel shipped in seven weeks"  wer 0.111
```

A take that never passes fails the run. That is a script problem, not a check
problem: rephrase the line, add or fix a lexicon rule, and re-run. Do not raise
`maxWer` or switch `verify.enabled` off to get past a real failure. The check
never passes the term list to the transcriber as a hint, because a hint would
make it hear the term whether or not it was said.

Results are cached beside the take (`narration/<take>.<hash>.verify.json`) and
recorded in `takes.lock.json`, so a re-run costs nothing for a take that
already passed.

**What it can't judge:** tone, pace, emphasis, a stress on the wrong syllable
that still transcribes correctly. Ask the user to listen for those.

## Timing

`narration.json` `timing` chooses where the word times come from:

- `"tts"` (default): the voice's own character timestamps, returned with the
  audio. No extra request.
- `"forced-alignment"`: ElevenLabs forced alignment re-times the finished take
  against its text. Use it when the voice's timestamps drift on a long take.

Either way the word times land in `narration/manifest.json`; the scene's cues
and the captions are taken from there.

## The record (`takes.lock.json`)

Written by every `npm run narrate` and committed with the film: the model,
voice, settings and output format, and per take the exact text sent, the
terms it uses, its duration, the listening check's result and transcript, when
it was generated and the ElevenLabs plan it was generated under. It is how a
reviewer knows what was said and checked without the audio, and how you show
which plan (and so which licence) each take was made on.
