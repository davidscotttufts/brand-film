# The scene contract (scene.html)

One HTML file, 1920×1080, is the whole film's picture. It is not a video
editor project and not a CSS animation: **every frame is a pure function of
time**. `render.mjs` loads it in headless Chrome, calls `window.render(t)` for
t = 0, 1/30, 2/30 … and screenshots `#stage`. Nothing may depend on wall-clock
time, `requestAnimationFrame` order, transitions, random numbers or network
timing. Open `scene.html?t=42.5` in a browser to scrub; with no `?t` it loops.

## Globals the renderer reads

| global | what |
|---|---|
| `window.DURATION` | film length in seconds (end card included) |
| `window.FPS` | 30 |
| `window.render(t)` | draws the frame at t; must be idempotent and order-free |
| `window.POSTER_T` | the poster frame (the opening card, ~2 s) |
| `window.CAPTIONS` | `[[a, b, text]]`, fallback captions for a silent render |
| `window.SFX` | `[[t, effectId, gainDb?]]`, sound cues in film seconds |

## Building it

- Build the DOM once at load (`innerHTML` from data arrays); `render(t)` only
  sets opacity, transforms, widths, text and colours.
- The helpers in the template: `ramp(t, a, b)` (eased 0→1), `win(t, a, b, c, d)`
  (in, hold, out), `lerp`, `back` (a single overshoot for a crowd landing),
  `setO(el, o, dy)` (opacity + rise + visibility). Use them for everything.
- Each scene is a `<div class="abs sec">` with its own window: fade in 0.6 s
  after the previous one starts fading out. Every element that appears must
  also disappear (check the frame after each scene).
- **Cue times come from the voice.** After `npm run narrate`, read word start
  times from `narration/manifest.json` and put them in the scene's constants
  (e.g. `PARTNERS = [{t: 41.80, …}, {t: 42.76, …}]`):
  `node -e 'const m=require("./narration/manifest.json");for(const t of m.takes)console.log(t.id,t.words.map(w=>w.text+"@"+w.start).join(" "))'`.
  A picture lands ON its word (± 0.3 s), never long before it.
- Only `var(--video-*)` tokens and their brand extras. No hex in the scene.
- The opening card is **complete from frame 0**: no fade-in of the title.
  Players, Google Slides and Drive use the first frames as the thumbnail; a
  fading title gives an empty card.
- Signature, motion and type follow brand-tokens.json: one primary movement
  at a time, reveals 0.4–0.8 s, holds long enough to read twice, nothing a viewer
  must read under `readableFloor` (20 px), one accent per frame.
- **Pictures that explain.** Each scene's motion should BE the claim: tiles
  that land as teams are counted, a long bar that squeezes into a short one as
  months compress, chips that ride the bar and stack, a counter that climbs on
  the number's word, a chat feed that starts slow and accelerates, a scan line
  that flags two flaws. Avoid decorative motion (spin, bounce, parallax).
- Text fit: when a line doesn't fit, make the type smaller (within the floor)
  before cutting the user's words. Use `white-space: nowrap` where a wrap would
  break a layout, and stack long captions with `<br>` rather than letting them
  overlap a neighbour.
- Real output only: anything shown as a command result or screenshot is real.
  Placeholder UI (gray bars for code, blank cards) is fine when it reads as an
  illustration.

## Inserting scenes later (INSERTS)

The film grows by insertion. To add a scene without re-timing everything after
it, add `{ at, d, f }` to `INSERTS`: at base time `at` the base timeline holds
still for `d` seconds while `f(localTime)` draws the new scene, and every later
scene plays `d` seconds late.

- Base-timeline SFX and CAPTIONS shift automatically through `toFilm()`.
- An insert's own cues go in at `insStart(k) + local` (a `LOCAL_SFX` list keyed
  by insert index).
- Add the insert's root id to `SCENES_IN` so it hides when not playing.
- Narration `at`/`until` are FILM times (after inserts): move every later
  take by `d` and re-run `npm run narrate` (unchanged text is cached, so only
  the timing report changes).
- Raise `DURATION` by `d`, and recompose music if the film has a score.
- A repeated element (a roadmap card before each milestone) is one renderer
  with an index: `{ at, d: 3, f: (l) => renderCard(l, n) }`.

Keep the scenes that already work; extend rather than rebuild.

## Review frames

`npm run preview -- 12.5 40 61.2` writes single frames; `npm run sheet` writes a
labelled contact sheet every 2 s (`npm run sheet -- 40 80 1` for a range). Read
the images. Look for: overlap, clipping, wraps, text under the floor, a ghost
element that never faded, a logo on the wrong ground, a counter that is still
counting when the voice has moved on.
