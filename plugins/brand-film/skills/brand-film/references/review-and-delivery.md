# Review, approval and delivery

## Before the first full render

1. Outline: the scene list with each take's text and the picture that proves
   it. Get a yes.
2. Brand stills (brand-system.md §3). Get a yes.
3. Voice the takes (`npm run narrate`): all fit, anchors on cue.
4. Contact sheet (`npm run sheet`) and stills at the key words. Share them
   (SendUserFile, or a small artifact page of frames with their times, lines and
   open questions) and get a yes. A full render takes minutes; a sheet takes
   seconds.

## The change loop

Users review a film in bursts: "there are more changes, don't re-render yet".

- Edit the sources (narration.json, scene.html) as each note arrives. Don't
  re-voice or re-render until the user says go. Keep a running list of pending
  changes and read it back before the render.
- Before a structural change (new scenes, a new arc), copy the folder's
  narration.json, scene.html, render.mjs and out/ into `backup-YYYY-MM-DD/`.
  Keep the parts that work; add scenes as INSERTS.
- Re-voice: only changed takes cost anything. Re-render once.

## After every render: verify, don't trust the exit code

- Frame count: `npm run render` counts the frames in the finished file and
  fails unless they equal DURATION × 30 (a headless Chrome render once stopped
  after 435 frames with a clean exit). The numbers are in
  `out/<basename>.report.json`.
- Streams and duration: `ffmpeg -i out/x.mp4` (stereo AAC, the right length).
- Loudness: printed by render (≈ -16 LUFS, peak < -1 dBTP).
- Frames from the FINISHED file at the moments that changed:
  `ffmpeg -ss 61.2 -i out/x.mp4 -frames:v 1 check.jpg`; read them.
- Captions: read `out/x.en.vtt` for spelling (captionReplace) and timing.
- A background render's progress looks frozen through a pipe; check
  `pgrep -fl "render.mjs|ffmpeg"` rather than waiting on output.

## Delivery

Outputs in `out/`: `<basename>.mp4` (H.264, 30 fps, +faststart), the poster jpg
and `<basename>.en.vtt`.

**Into a deck's speaker notes.** When the film accompanies a deck, put each
take on the slide it belongs to: a bold `FILM NARRATION (m:ss):` paragraph with
the quoted line, then the presenter's own points. Keep the timestamps current
after every re-cut. Edit `ppt/notesSlides/*.xml` directly (unzip, edit, re-zip
with `zip -Xqr`) when python-pptx isn't available; a slide without notes needs a
new notesSlide part, its relationship and a `[Content_Types].xml` override.
Before overwriting any deck, compare it with your last saved copy
(`cmp -s` / mtime): the user may have edited or renamed it meanwhile. Save to the
name the user uses. Keep internal caveats out of speaker notes; put them in a
separate open-items file.

**Google Slides** (the user inserts the video; give these steps):
1. Upload the MP4 to Drive and wait until it plays there. Inserting while Drive
   is still processing gives a black box and a 4:3 frame.
2. Insert → Video → Google Drive.
3. Format options → Size & Rotation: lock aspect ratio, full slide
   (13.33 × 7.5 in at 0,0).
4. Video playback → "Play (manually)". The automatic modes add an animation
   entry (a play icon in the filmstrip); delete it under Insert → Animation.
5. Share the Drive file with everyone who will present or view.
The thumbnail is the film's first frames, which is why the opening card is
complete from frame 0.

**PowerPoint / Keynote**: Insert → Video from file; set the poster frame to the
poster jpg; play on click.

**A web page**: `<video controls preload="metadata" poster=…>` with a `<track
kind="captions" srclang="en" src=….en.vtt default>`; never autoplay. When the
host caches assets as immutable, bump a `?v=` on all three URLs after every
re-render.

Write a short README in the film folder (what each file does, how to re-voice
and re-render, the mix, where the facts come from) so the next change doesn't
need this skill to be understood.
