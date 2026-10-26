# Attribution and third-party terms

brand-film's own code, skill text and example sources are MIT-licensed
(`LICENSE`). Nothing below is bundled in this repository; each piece is
installed or generated on your machine, under its own terms.

## Installed by a film folder (`npm install`)

| Package | Licence | Notes |
|---|---|---|
| [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) | GPL-3.0-or-later (the ffmpeg binary it downloads is GPL, with libx264) | Run as a separate program to encode the film. It is not linked into or distributed with brand-film. Films you encode are your own work and are not covered by the GPL. |
| [`playwright-core`](https://github.com/microsoft/playwright) | Apache-2.0 | Drives headless Chrome to draw each frame. |

## Used through their own sign-in

| Service | Terms |
|---|---|
| [ElevenLabs](https://elevenlabs.io) CLI (`@elevenlabs/cli`): text to speech, speech to text, forced alignment, music | Output made on a **paid** plan may be used commercially, also after the subscription ends, except for beta features. The **free** plan has no commercial licence and requires attribution. See the [ElevenLabs terms](https://elevenlabs.io/terms-of-use) and [commercial-use help article](https://help.elevenlabs.io/hc/en-us/articles/13313564601361). `takes.lock.json` and `music.lock.json` record the plan each piece was made on. |
| "Christopher", the default narrator | A professional voice in the ElevenLabs Voice Library, used under the Voice Library terms of the account that adds it. |

## Fonts

The default identity loads **Space Grotesk**, **Inter** and **JetBrains Mono**
from Google Fonts (all SIL Open Font License 1.1). A brand's own licensed
typefaces are supplied by the user and are never committed by the skill.

## The example film

`examples/how-it-works` was voiced and scored with ElevenLabs on a Creator
(paid) plan. Its sources are MIT; the rendered film is published as a release
asset under the same licence, subject to the ElevenLabs terms above for its
audio. The placeholder mark in `template/assets/` is original to this project.
