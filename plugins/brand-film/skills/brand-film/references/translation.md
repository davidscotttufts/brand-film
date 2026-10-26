# Translations: captions only, or captions and a voice-over

A film can carry other languages in two ways. Choose per language:

| Mode | What the viewer gets | Cost | Output |
|---|---|---|---|
| `captions` | the film in its own language, with translated captions | none (no voicing, no new render) | `out/<basename>.<code>.vtt` |
| `voice` | a separate film narrated in that language, with its captions and (optionally) translated on-screen text | voicing + listening checks for that language | `out/<basename>.<code>.mp4`, `.<code>.vtt`, poster, report |

## 1. Add the languages

```bash
npm run translate -- es:voice fr de       # Spanish voice-over; French and German captions only
```

This records them in `narration.json` (`"languages"`) and writes
`narration.<code>.json` for each: one entry per take with the line to translate
(`source`), a hash of it (`sourceHash`) and an empty `text`. Re-run
`npm run translate` (no arguments) any time the script changes: translations of
unchanged lines are kept; a take whose line changed keeps its old text and is
marked `stale`, and `npm run lint` and `npm run render` fail until it is
re-translated.

## 2. Translate

Fill each `text`. Rules:

- **Same meaning and the same facts.** Every number and claim must match the
  original; no additions, no softening.
- **Plain spoken sentences** for a voice-over, short enough to say in the take's
  window. Spanish, French and German run 15–30 % longer than English: tighten
  the wording rather than widening the window, because the picture is timed to
  the original.
- **Write the language's own forms**: its punctuation (¿…?, « … »), its number
  and date formats. Write numbers that will be voiced the way they should read,
  and put how they sound in the lexicon (below).
- **Brand names stay as the brand writes them.** Product and company names are
  usually not translated; check the brand's own localized materials first.
- Native review is worth asking for on anything published. Say so in the report
  when a language has had none.

## 3. Pronunciation per language

Rules in `brand.pronunciations` with no `lang` apply in every language; a rule
with `"lang": "es"` applies only to Spanish and overrides a general rule for
the same term:

```json
{ "written": "API", "spoken": "A P I" },
{ "written": "API", "spoken": "a pe i", "lang": "es" },
{ "written": "17 semanas", "spoken": "diecisiete semanas", "lang": "es" }
```

## 4. Captions-only languages

Nothing else to do: `npm run render` writes every captions-only language's
`.vtt` with the film. (`npm run render -- --lang fr` writes just that one, with
no Chrome or account needed.) Each take's translation is split into short
chunks and laid over the time the original take is actually spoken, in
proportion to length, so the captions follow the voice the viewer hears.

## 5. Voiced languages

1. **The narrator.** The default narrator is an English voice; a voice-over
   needs a native speaker. Search the Voice Library for the language and use
   (`elevenlabs voices search --format json`, then filter by `labels.language`
   and `labels.accent`), audition 3–5 with
   `npm run audition -- --lang es <voiceId> <voiceId>…`, have the user pick by
   ear, and set `"voice": { "id", "name" }` in `narration.es.json`. Match the
   region of the audience (es-ES and es-MX sound different).
2. **Voice it:** `npm run narrate -- --lang es`. The same rules as the
   original: each take must fit its window, and each take is transcribed (in
   Spanish) and must be heard as written, every lexicon term included, or it is
   re-voiced. The record goes to `takes.lock.es.json`; the audio to
   `narration/es/`. The model must speak the language (`eleven_v4` covers 90+).
3. **On-screen text.** The scene marks translatable text with
   `data-i18n="key"` and holds translations in `STRINGS[code]`. The render
   loads the scene with `?lang=es` and warns about every key a language is
   missing. Translate everything a viewer must read; names, URLs and numbers
   usually stay. `npm run sheet -- --lang es` shows the stills.
4. **Render it:** `npm run render -- --lang es` (or `npm run render -- --all`
   for the film and every voiced language). The same verification runs:
   frame count, loudness, and every spoken word present in the mix.

## Delivering several languages

- **A web page:** one `<video>` per voiced language (a language picker swaps
  the `src`), and every captions file as a `<track>` on each:
  ```html
  <video controls preload="metadata" poster="film-poster.jpg">
    <source src="film.mp4" type="video/mp4">
    <track kind="captions" srclang="en" label="English" src="film.en.vtt" default>
    <track kind="captions" srclang="fr" label="Français" src="film.fr.vtt">
    <track kind="captions" srclang="es" label="Español" src="film.es.vtt">
  </video>
  ```
- **A deck:** insert the language's MP4; for captions-only languages, most
  players (and YouTube, Vimeo, Wistia) accept the `.vtt` as a subtitle track.
