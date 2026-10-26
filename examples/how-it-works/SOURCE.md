# Sources for the example film

Every fact on screen comes from this repository, and `npm run render` checks
the two load-bearing ones (film.json `facts`) against this file and the scene.

- The film is 48 seconds at 30 frames per second: 1,440 frames
  (scene.html `DURATION` × `FPS`; the render fails unless the finished file has
  exactly that many).
- The narration is normalized to -16 LUFS with a -1.5 dBTP ceiling
  (render.mjs; the measured mix is in out/how-it-works.report.json).
- Every frame is a pure function of time: `window.render(t)` (references/scene-contract.md).
- Every take is transcribed with ElevenLabs speech-to-text and checked against
  the script and the pronunciation lexicon (narrate.mjs, references/pronunciation.md).
- Headless Chrome renders the frames; ffmpeg mixes voice, effects and music
  and writes captions from the spoken words (render.mjs).
