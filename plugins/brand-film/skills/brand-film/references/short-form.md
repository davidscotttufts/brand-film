# Short form: other shapes, burned-in captions, cut-downs, publishing

One film can go out as a 16:9 explainer, a 9:16 short and a 1:1 post, from
the same scene, the same voice and the same checks. This is what that takes.

## Shapes (film.json `aspects`)

```json
"aspects": ["16:9", "9:16", "1:1"]
```

The first is the film (`out/<basename>.mp4`); each other shape renders as
`out/<basename>.9x16.mp4` and so on. Shapes: `16:9` (1920×1080), `9:16`
(1080×1920), `1:1` (1080×1080), `4:5` (1080×1350). `npm run render -- --aspect 9:16`
renders one; `npm run sheet -- --aspect 9:16` reviews one.

The scene lays itself out for each shape. It lists the shapes it supports
(`const ASPECTS = ['16:9', '9:16', '1:1']`, exported as `window.ASPECTS`),
reads `?aspect=9x16`, and sets `<html data-aspect="9x16">`. Everything that
moves goes in `[data-aspect]` CSS rules and in the build code (the template's
`tile()` puts four tiles in a row on a wide stage and two by two on a tall
one). The renderer refuses a shape the scene doesn't list rather than squash it.

Laying out for 9:16:

- A narrower margin (72 px), and wrapping titles (`right: var(--video-margin)`).
- Keep text out of the top 12 % and the bottom 20 %: a phone's player draws its
  own buttons, caption and progress bar there.
- One idea per frame, bigger. Rows become columns and grids; a long bar chart
  becomes a short one.
- The opening card is still complete from frame 0: it is the thumbnail.
- Review every shape's contact sheet, not just the first.

## Burned-in captions (film.json `burnCaptions`)

```json
"burnCaptions": ["9:16", "1:1"]
```

Social players mostly play muted and many don't show `.vtt` tracks, so a short
carries its captions in the picture. The shapes listed get an overlay drawn
into every frame, from the voiced word times:

- A few words at a time (`video.captions.maxWords`, default 5), never across a
  sentence, with the word being spoken in `--video-caption-highlight`
  (`mode: "word"`; `"line"` shows plain lines).
- The written forms, as on screen: the lexicon's spoken forms are put back
  ("seventeen weeks" → "17 weeks").
- Colours are brand roles: `caption-text`, `caption-highlight`, `caption-box`
  (by default the stage text, the stage accent and the stage itself), checked
  for contrast by `npm run tokens`. Size is `type.sizesPxAt1080p.caption`.
- Position is `video.captions.position`, the caption's centre as a fraction of
  the stage height, per shape (`9x16: 0.72`). Put it where no scene text is;
  read the sheet.

The `.vtt` is still written for every film; burned-in captions are in addition.

## Cut-downs (film.json `cuts`)

```json
"cuts": [{ "id": "short", "aspect": "9:16", "ranges": [[0, 5.9], [14.2, 26]] }]
```

A cut-down is ranges of a finished shape, joined: `out/<basename>.short.mp4`,
with its own captions and report. Ranges are film seconds, in order, snapped to
frames. A range edge inside a spoken word fails the render: cut in the gaps
between takes (read the word times in `narration/manifest.json`). A cut that
doesn't start at 0 is warned about: it loses the opening card. Each join has a
30 ms audio fade; a score will jump at a join, so cuts suit films whose music
is quiet or absent, or a score composed for the cut. The cut is verified like
the film: frame count, and every spoken word it keeps heard in its mix.

Write a cut-down's story first: the hook, the one proof, the call to action.
If it needs different words, it is a different film (its own folder).

## The opening (lint and score)

`npm run lint` warns, and `npm run score` counts, what keeps a viewer past
the first seconds:

- The voice starts within the first second; the first sentence is 12 words or
  fewer and says what this is.
- The second line says what is on screen, in plain words.
- One idea per take; caveats in one clause, or cut.
- No machine-written phrasing ("not just X, it's Y", "game-changer",
  "seamless", "unlock"…); `lib/script.mjs` lists them.
- The last take tells the viewer where to go.
- Credentials and specs (who made it, the number) go on a title card
  (`GFX.titleCard`), not into the narration.

The score is a checklist, not a prediction of views. Report it with the
outline.

## Publishing (out/<basename>.publish.json)

Write with the script, in film.json:

```json
"publish": { "titles": ["…", "…", "…"], "description": "…", "tags": [] },
"posters": [2.0, 14.8]
```

Three title options: the plain one, the one that names the result, the one
that names the surprise. A take's `"chapter": "The problem"` makes a chapter.
`npm run render` writes `publish.json` (titles, the description with chapters
and footage credits, every file it made) and `.chapters.txt`, and warns when
chapters break YouTube's rules (start at 0:00, three or more, 10 s each).
`posters` adds poster choices at those seconds, per shape.
