# Sound: narrator, effects, music, mix

## ElevenLabs CLI

Installed as `elevenlabs` (`npm i -g @elevenlabs/cli`, or `npm i -g --prefix
~/.local @elevenlabs/cli`). Sign in once with `elevenlabs auth login` (the user
types `! elevenlabs auth login`) or set `ELEVENLABS_API_KEY`. Check before
spending credits:

```bash
elevenlabs user get --format json        # tier and characters used / limit
elevenlabs models list --format json     # eleven_v4 should be there
elevenlabs voices search --format json   # candidate voices
elevenlabs voices get --voice-id <id>    # one voice's labels (accent, age, use)
```

A 3-minute film is about 3,000 characters per full voicing; each music
composition costs credits too. Re-voicing is cached by text, so only changed
takes cost anything. Say the cost before a big run on a small plan.

## The narrator

- Model `eleven_v4`; settings `stability 0.5, similarity_boost 0.8`,
  `mp3_44100_128`. v3 and v4 reject `seed` and previous/next text: `seed: null`,
  `continuity: false`.
- The default narrator is "Christopher" (`G17SuINrv2H9FC6nvetn`), a
  professional voice in the ElevenLabs Voice Library (calm, British, made for
  narration). Add it to the account from the library before the first run, or
  pick another. A brand picks its own by ear:
  put 3–5 candidates in narration.json `auditions` (filter `voices search` by
  accent and use case: narration, warm, trustworthy; match the audience's
  region), run `npm run audition`, let the user listen to `auditions/*.mp3`, and
  record the winner in `video.voice.narrator`.
- You can't hear audio, but the listening check can: every take is
  transcribed and compared with what it should say (`pronunciation.md`). Ask
  the user to listen for tone, pace and the music level, which a transcript
  can't judge.
- Licence: output made on a paid plan may be used commercially; the free plan
  has no commercial licence and requires attribution. `npm run doctor` shows
  the plan; `takes.lock.json` records the plan each take was made under.

## The key

The CLI reads `ELEVENLABS_API_KEY`, or its own sign-in. On macOS the scripts
also use a key kept in the login Keychain under the service name
`elevenlabs-api-key` (`security add-generic-password -a "$USER" -s elevenlabs-api-key -w`).
Never put the key in chat, a committed file or a URL.

## A recorded voice-over

A person's own voice instead of a narrator: `npm run narrate -- --recorded <file>`
(footage.md has the whole method). The takes are cut from the recording on
the waveform, checked against the script like a voiced take, and mixed the
same way. No characters are spent; the transcript is one speech-to-text call.

## When speech-to-text fails

ElevenLabs speech-to-text is the listening check's first choice. When it
refuses a file (its size or format, the plan, the network), the check uses
whisper.cpp if it is installed: `brew install whisper-cpp`, download a model
(`ggml-base.en.bin` for English, `ggml-small.bin` for other languages) and set
`WHISPER_MODEL` to it (`WHISPER_CPP` names the binary if it isn't
`whisper-cli`). `takes.lock.json` records the transcriber of each take. If
neither works the run stops and lists both errors; don't switch the check off.

## Effects (sfx.json)

Six synthesized effects, no API: tick (counting, typing), sweep (scene
change), chime (a result lands), refuse (a flaw, a no), wait (pending), pop
(one thing appears). Cue them in `window.SFX`. A sound a recipe can't make (a
door, a crowd, a shutter) can be generated: an effect with `"prompt"` (and
optionally `"durationSeconds"`, `"promptInfluence"`) is made by ElevenLabs
sound effects, costs credits, and is cached and committed as `sfx/<id>.<hash>.mp3`
with its record in `sfx.lock.json`. Say the cost first. Every cue has something visible
changing at that moment; a burst of ticks at -28 to -32 dB for a count; never an
effect on the onset of a spoken word you want heard. Effects sit 12 dB or more
under the voice.

## Music (music.json)

Optional; the default is none. For a journey film, a quiet instrumental
underscore helps: `music_v2_5`, `force_instrumental`, a prompt that names the
mood, instruments, tempo, build and an ending timed to the end card ("resolves
with a confident ending in the final N seconds"). `lengthMs` ≈ DURATION + 1 s.
Recompose every time the film's length changes, or the ending lands in the
wrong place. A composed track may fade itself out before its end; check the
last seconds.

## The mix (render.mjs)

- Voice: each take delayed to its `at`, mixed, normalized to -16 LUFS with a
  -1.5 dBTP ceiling on its own bus, forced stereo. In two passes: the voice
  bus is measured first, then `loudnorm` runs in linear mode with those
  numbers, one gain for the whole voice. One-pass loudnorm is dynamic: it rides
  the gain word by word, which flattens a narrator and makes a recorded voice
  sound compressed. When the peaks wouldn't fit under the ceiling, loudnorm
  falls back to dynamic; the report says which (`voiceProcessing.loudnorm`)
  and how much flatter the voice's peaks are in the film than in the takes
  (`crestLossDb`; over 4 dB is audible: lower the music or effects).
- Effects: each at its gain and time, mixed, stereo.
- Music: `levelDb` (about -10 dB; a raw score averages near -18 dB, so -18 was
  inaudible under the voice), 1.5 s fade in, 2.5 s fade out, ducked by
  `sidechaincompress` keyed on the voice. The sidechain key is padded with
  `apad`: without it the compressor stops when the last line ends and the score
  is cut off under the end card.
- Every bus is padded and trimmed to the film's exact length before it is
  split or mixed, so they all end together. (Splitting the voice for the
  ducking key and padding only that branch once lost the last ~3 s of the last
  take: loudnorm's look-ahead never reached the mix.)
- Sum through `alimiter`, AAC 192k, 44.1 kHz stereo.
- Force stereo on every bus (`aformat=channel_layouts=stereo`); one mono input
  made a mono film once.

`npm run render` prints the finished mix's integrated loudness and true peak:
expect about -16 LUFS and a peak under -1 dBTP. To check ducking or a level in a
window: `ffmpeg -ss 120 -t 4 -i out/x.mp4 -af volumedetect -f null -`.
