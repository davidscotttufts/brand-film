# Footage, recorded voice, a brand's existing videos, 3D

brand-film is not a general video editor. It uses footage the way it uses a
fact: from a named source, with the right to use it, recorded in a lock file.

## A web page as the source (npm run source)

```bash
npm run source -- https://example.com/launch   # or a saved page: npm run source -- page.html
```

writes `source.txt` (the page's readable text: the facts check reads it),
`source.media.json` (every image, video and embedded player on the page, each
`"licence": null`) and `source.lock.json` (URL, when it was read, a hash of the
text). film.json `source` and `sourceUrl` point at it. Re-run it before a
re-cut: it says when the page has changed under the film. A site the sandbox
blocks shows up in `npm run doctor`.

## Clips (clips.json, npm run clips)

```json
{
  "clips": [
    { "id": "walk", "file": "media/walk.mp4", "in": 2.0, "out": 6.5, "licence": "press-kit", "credit": "NVIDIA", "url": "https://…" },
    { "id": "demo", "url": "https://example.com/demo.mp4", "licence": "own", "audio": true },
    { "id": "gpu", "blender": "blender/turntable.py", "frames": 120, "size": [1080, 1080], "args": { "shape": "cube" } }
  ]
}
```

**Every clip needs a licence**: `own`, `licensed`, `press-kit`, `permission`,
`public-domain`, `cc0`, `cc-by`, `cc-by-sa` (the last two need a `credit`).
`npm run clips` refuses a clip without one, and `npm run render` refuses a
clip the scene uses that `media.lock.json` doesn't cover. Ask the user where
footage came from when it isn't clear; "it was on their website" is not a
licence (a press kit usually is, for editorial use). Never use a creator's
video from YouTube or social media as B-roll without written permission.

- `file`: footage on disk. `url` with no file: downloaded into `media/`
  (fetch for a direct video link; yt-dlp for a page, when installed, and only
  for footage the brand owns or may use).
- `in` / `out`: the seconds to use (read them off `npm run shots`).
- `audio: true` keeps the clip's sound; the scene cues it like an effect:
  `window.CLIPS = [[filmSeconds, 'demo', gainDb]]`. Sound under the narrator
  stays 12 dB or more below it.
- Frames go to `clips/<id>.<hash>/` at 30 fps (rebuilt, not committed);
  `clips/manifest.js` is what the scene loads; `media.lock.json` (committed)
  records source, licence, credit and the file's hash; render puts the
  credits in `publish.json`.

In the scene, load the manifest before the kit, and show a clip in an `<img>`:

```html
<script src="clips/manifest.js"></script>
<script src="lib/gfx.js"></script>
…
<img id="walk" class="abs" alt="" style="left:0;top:0;width:100%;height:100%;object-fit:cover">
…
const walk = GFX.clip($('walk'), 'walk', { at: 12.4 });  // build once
function renderBase(t) { walk(t); setO($('walk'), win(t, 12.2, 12.6, 18.0, 18.4)); … }
```

A clip is a frame sequence, so frame 0 of the film always shows the same frame
of the clip: the render stays a pure function of time. It holds its first
frame before `at` and its last after the end (`loop: true` loops). A take's
`"clips": ["walk"]` in narration.json records which footage proves the line;
lint fails if the id isn't in clips.json.

Footage rules: the first frame of a scene with footage is the thing itself,
in action. Change the picture every 2 to 4 seconds in a short (the brand's
own pacing, from `npm run study`, overrides this). Brand tokens still frame
everything: footage sits inside the brand's layout, with its captions and
title cards.

## Stock and Creative Commons (npm run find)

When the brand has no picture of the thing, find one whose licence a brand
film can use:

```bash
npm run find -- "server racks in blue light"              # pictures
npm run find -- "robot arm welding" --kind video          # footage
npm run find -- --add 4 --id racks                        # result 4 → clips.json
npm run find -- --add 2 --id arm --in 1.5 --out 5.5       # a video, trimmed
npm run clips
```

| library | key | gives | licence | credit line |
|---|---|---|---|---|
| Wikimedia Commons | none | pictures, video | CC0, CC BY, CC BY-SA, public domain, per file | "Title" by Author, CC BY 4.0, via Wikimedia Commons |
| Openverse | none | pictures (Flickr and others) | the same, per file | "Title" by Author, CC BY 2.0, via Flickr via Openverse |
| Unsplash | free | pictures | Unsplash Licence | Photo by Author on Unsplash |
| Pexels | free | pictures, video | Pexels Licence | Photo/Video by Author from Pexels |
| Pixabay | free | pictures, video | Pixabay Content Licence | Image/Video by Author from Pixabay |

`npm run find -- --keys` says which are ready; `npm run doctor` too. A key goes
in the environment (`UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`)
or the macOS Keychain (`security add-generic-password -a "$USER" -s unsplash-access-key -w`),
never in a file or the chat. Have the user add it (`! security add-generic-password …`).

What the search does for you:

- **The licence is read from the library**, not typed: Commons' file metadata,
  Openverse's licence field, each stock library's own licence. Results that
  are NonCommercial or NoDerivatives, or whose licence can't be read, never
  appear.
- **Flags** on a result: `share-alike` (CC BY-SA: a film that adapts it may
  have to carry the same licence, so ask the user before using it in a film
  the brand keeps under its own terms), `people` (a recognisable person: stock
  libraries hold no model releases, and a face in a brand film reads as an
  endorsement; prefer hands, objects and places), `brand` (someone else's logo
  or product). Flags are word matches on the title and tags, so look at the
  contact sheet as well (`preview/find-<query>.<kind>.jpg`).
- **`--add`** writes the clip with its page, author, licence and credit line.
  `npm run clips` downloads it, reports an Unsplash photo's use to Unsplash
  (its API terms), and records the credit in `media.lock.json`.
- **Credits** go into `publish.json`, and `clips/manifest.js` exposes them as
  `window.CLIP_CREDITS` so the end card can show them: `GFX.credits(el, { prefix: 'Footage: ' })`.
  Show them on screen whenever the film may play where its description isn't
  seen (a deck, a page, a feed).

Pictures are stills: one frame, kept large (3840 px on its long side), shown
with a slow push-in:

```js
const racks = GFX.still($('racks'), 'racks', { at: 6.0, until: 11.0, zoom: [1.0, 1.12], pan: [[0, 0], [-3, -2]] });
// <div class="abs" style="…; overflow: hidden"><img id="racks" alt=""></div>
```

3 to 6 seconds, 10 to 15 per cent of zoom, one direction. A still that holds
longer needs a second still, not more zoom.

Choosing well: search for what the shot must SHOW, not the topic ("hands
typing on a laptop at night", not "productivity"). Prefer a picture that
proves the line over one that decorates it, and the brand's own footage over
any stock.

## Shots (npm run shots)

```bash
npm run shots -- media/walk.mp4      # media/walk.shots.json + preview/walk.shots.jpg
```

Finds each cut, then writes the shot list and a contact sheet (a frame from
each shot, labelled with its times). Look at the sheet, pick the shots, and
put their seconds in clips.json `in`/`out`.

## A brand's existing videos (npm run study)

```bash
npm run study -- media/brand-reel.mp4 media/launch-2025.mp4
```

For each: shape, length, shots, median shot, cuts a minute, main colours,
loudness, and a contact sheet. Use it in Step 1: colours the brand really uses
on screen (check them against the standards before they become tokens), the
pacing and shape its films have, how loud they are. Write what holds into the
house style (`npm run lesson -- picture "A new shot every 2 to 3 seconds"`).

## A recorded voice-over

When the brand wants a person's voice (the founder, the presenter) instead of
an ElevenLabs narrator, they read the script into one file, retakes and all:

```bash
npm run narrate -- --recorded recordings/vo.m4a
```

or set it in narration.json: `"recording": { "file": "recordings/vo.m4a", "maxPause": 0.3, "speaker": "Ada" }`.

1. The recording is transcribed once with word times (ElevenLabs, or
   whisper.cpp; cached as `narration/recording.<hash>.words.json`). A transcript
   from elsewhere: `--transcript words.json` (`[{ text, start, end }]`).
2. Each take is found in it after the previous one. Several attempts at a
   line: the closest wins, and of equally close ones the last.
3. Inside the take, words that aren't in the script (a stumble, "um", a doubled
   word) are cut out, and every pause over `maxPause` is shortened.
4. Every cut is made on the waveform: each word is extended until its sound
   falls to the room's noise, never into a neighbour. Cutting on the
   transcript's word ends clips the ends of words.
5. The cut take goes through the same listening check (it must match the
   script), window and anchor checks as a voiced one. A take that fails says
   what was heard: record that line again, or fix the script to what was said.

The voice is high-passed at 70 Hz and nothing else: no compression, no EQ.
The render normalizes loudness in linear mode (one gain for the whole voice)
and reports `voiceProcessing.crestLossDb`: over 4 dB means the mix is
squashing the voice; lower the music. Ask the user to listen to the cut takes:
a join can land on a breath.

Recording advice for the user: a quiet room, the phone or mic a hand's width
away, one file, and after a mistake pause and read the whole sentence again.

## 3D (Blender)

When there is no footage of the thing (a chip, a device, an idea), a Blender
script can render it: `blender/turntable.py` turns an object in the brand's
exact accent colour (clips.mjs passes the colour roles as linear RGB) on a
transparent background, as PNG frames the scene layers over its own stage.
Copy the script and change `make_object()` for another object. Needs Blender
3.6+ (`BLENDER_PATH`, or on PATH; `npm run doctor` says). A Blender clip is
the brand's own (`licence` defaults to `own`) and is cached by a hash of the
script, frames, size and colours.
