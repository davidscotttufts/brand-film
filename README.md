# brand-film

**Narrated, on-brand explainer films, made in code by Claude Code.**

brand-film is a [Claude Code](https://claude.com/claude-code) skill. Give it a
deck, a document or a story and a brand; it builds the brand's film design
system, writes a word-timed script, draws every scene as HTML, voices it with
[ElevenLabs](https://elevenlabs.io), **listens back to every take** to check the
names were said right, adds sound and music, and renders a 1080p MP4 with a
poster and captions.

[![The example film's opening card](https://davidscotttufts.github.io/brand-film/how-it-works-poster.jpg)](https://davidscotttufts.github.io/brand-film/)

▶ **[Watch the example](https://davidscotttufts.github.io/brand-film/)**: 48
seconds, made with brand-film, explaining brand-film. Its sources are in
[`examples/how-it-works`](examples/how-it-works).

## Why another video skill

Most agent video tools stop at "the TTS call returned audio". A brand film fails
on smaller things: the narrator says the product name wrong, a caption spells it
differently from the slide, a render silently drops frames, the colours are
almost the brand's. brand-film checks each of those:

- **A pronunciation lexicon per brand.** Write the script the way it reads
  ("ffmpeg", "17 weeks", "example.com"); the lexicon sends the voice how it
  sounds ("eff eff em peg", "seventeen weeks", "example dot com"); the captions
  keep the written forms. Text aliases work on every ElevenLabs model and are
  testable without an API call.
- **A listening check on every take.** Each take is transcribed with ElevenLabs
  speech-to-text and compared with the script: word error rate under a
  threshold, and every lexicon term heard. A take that fails is voiced again; one
  that never passes stops the run. (The example's last line was first read as
  "Brandfilm"; the check caught it and re-voiced it.)
- **The voice drives the picture.** Cue times come from word timestamps (or
  ElevenLabs forced alignment), takes must fit their scene, and anchor words are
  reported on or off cue.
- **A record of how it was made.** `takes.lock.json` keeps the model, voice,
  settings, the exact text sent, each check's transcript and score, and the
  ElevenLabs plan each take was generated on, which decides whether you may use
  it commercially. The audio itself is never committed.
- **The brand is copied, never approximated.** One `brand-tokens.json` holds the
  exact colours (with WCAG contrast checked), typefaces, official logo files,
  narrator and lexicon. Scenes use only `var(--video-*)` tokens.
- **Verified, not assumed.** The render counts the frames in the finished file,
  measures loudness and true peak, and checks that every load-bearing fact still
  appears in its source.

## Install

In Claude Code, add this repository as a plugin marketplace and install the
plugin:

```
/plugin marketplace add davidscotttufts/brand-film
/plugin install brand-film@brand-film
```

Or with the [skills CLI](https://github.com/vercel-labs/skills):
`npx skills add davidscotttufts/brand-film`. Or copy
`plugins/brand-film/skills/brand-film` into `~/.claude/skills/`.

You also need:

- **Node 18+** and **Google Chrome** (or set `CHROME_PATH`, or
  `npx playwright install chromium`).
- For narration and music, the **ElevenLabs CLI**, signed in:
  `npm i -g @elevenlabs/cli && elevenlabs auth login`. Without it you still get a
  silent film with effects and captions.
- Optional, for reading a brand's decks and PDFs: `pdftotext`, `pdftoppm`
  (poppler) and `soffice` (LibreOffice).

## Use

Ask Claude Code for a film:

> Make a 60-second film about our Q3 launch from `launch-deck.pptx`, in Acme's brand.

The skill works in steps and stops for your approval at each one: the brand
stills, the outline, the voiced takes, and the contact sheet before the long
render. In the film folder it creates:

```bash
npm run doctor      # 1. what's missing: Node, packages, Chrome, ElevenLabs sign-in and credits
npm run tokens      # 2. check the brand: contrast, logo and font files, lexicon
npm run lint        # 3. check the script with no API: windows, sentence length, acronyms, digits
npm run narrate     # 4. voice changed takes, listen to each, time the words
npm run sfx         # 5. synthesize sound effects (ffmpeg, no API)
npm run music       # 6. compose the optional score
npm run sheet       # 7. a contact sheet of frames to approve
npm run render      # 8. render, mix, caption, verify
```

## How it works

```
deck / doc ─▶ brand-tokens.json ─▶ brand-tokens.css ─┐
                                                      ▼
narration.json ─▶ lexicon ─▶ ElevenLabs TTS ─▶ speech-to-text check ─▶ word times
                                                      │
scene.html: window.render(t), every frame a pure function of time ◀──┘
        │
headless Chrome, frame by frame ─▶ ffmpeg (voice -16 LUFS, effects, ducked score) ─▶ MP4 + poster + .vtt
                                                                                      └▶ report.json
```

A film is a folder you own, not a project file in an editor: `scene.html`,
`narration.json`, `brand-tokens.json`, `music.json`, `film.json`, the scripts,
and the lock files. Rebuild it any time; only changed takes cost credits.

## Costs

ElevenLabs bills narration by character. A 60-second explainer is roughly 900
characters per full voicing; re-runs only re-voice changed takes. Each take's
listening check is a few seconds of speech-to-text. A score is billed per
composition. `npm run narrate` prints the characters it is about to send and
what the account has left, and `FILM_MAX_CHARS` caps a run.

**Licence of the audio:** output made on a paid ElevenLabs plan may be used
commercially; the free plan has no commercial licence and requires attribution.
`npm run doctor` shows your plan.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `not signed in` / 401 | `elevenlabs auth login`, or set `ELEVENLABS_API_KEY` |
| `model "eleven_v4" is not a text-to-speech model` | your account lists others; set `video.voice.narrator.model` |
| A take keeps failing the listening check | read the printed transcript; add or fix a lexicon rule, or rephrase. Don't raise `maxWer` to get past it |
| `OVERRUN` | tighten the line or widen the scene's window |
| `fonts not loaded` | offline, or a licensed face with no file: add it to `brand.fontFiles` |
| Frame count mismatch | Chrome was interrupted (sleep, memory); re-run `npm run render` |
| Chrome not found | set `CHROME_PATH`, or `npx playwright install chromium` |

## Compared with

| | brand-film | [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) | [HyperFrames](https://github.com/heygen-com/hyperframes) | [Remotion skills](https://github.com/remotion-dev/skills) |
|---|---|---|---|---|
| Picture | HTML scene, `render(t)` | Remotion (React) | HTML + GSAP | Remotion (React) |
| Narration | ElevenLabs | ElevenLabs or Qwen3-TTS | HeyGen / local | none |
| Pronunciation lexicon | yes | no | no | no |
| Listening check per take | yes | no | no | no |
| Brand tokens with contrast check | yes | per-brand config | no | no |
| Render licence | MIT + ffmpeg/Chrome | Remotion licence (paid for 4+ employees) | Apache-2.0 | Remotion licence |

"no" means we didn't find it in the project's README or docs (October 2026); corrections welcome.
Each of these is good at something brand-film isn't: HyperFrames and Remotion
have far richer motion libraries and studios, and the video toolkit covers more
of a production. brand-film is narrower: brand fidelity and narration you can
trust.

## Made with brand-film

Films made with brand-film, or the pipeline it grew out of:

- [openwop.dev](https://openwop.dev): the OpenWOP explainer films
- [myndhyve.ai](https://myndhyve.ai): the MyndHyve product film
- [kicktodo.com](https://kicktodo.com): the KickTodo films

## Repository

| Path | What |
|---|---|
| `plugins/brand-film/skills/brand-film/` | the skill: `SKILL.md`, references, scripts, and the film template |
| `examples/how-it-works/` | the example film's sources |
| `tests/` | `npm test`: lexicon, listening check, lint, tokens, repository integrity |
| `scripts/test-render.sh` | `npm run test:render`: a full silent render of the template and the example |

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Security:
[SECURITY.md](SECURITY.md). Third-party terms: [ATTRIBUTION.md](ATTRIBUTION.md).

## Licence

MIT. See [LICENSE](LICENSE).
