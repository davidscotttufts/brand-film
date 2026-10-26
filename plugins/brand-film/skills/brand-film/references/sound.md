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

## Effects (sfx.json)

Six synthesized effects, no API: tick (counting, typing), sweep (scene
change), chime (a result lands), refuse (a flaw, a no), wait (pending), pop
(one thing appears). Cue them in `window.SFX`. Every cue has something visible
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

- Voice: each take delayed to its `at`, mixed, `loudnorm I=-16:TP=-1.5:LRA=11`
  on its own bus, forced stereo.
- Effects: each at its gain and time, mixed, stereo.
- Music: `levelDb` (about -10 dB; a raw score averages near -18 dB, so -18 was
  inaudible under the voice), 1.5 s fade in, 2.5 s fade out, ducked by
  `sidechaincompress` keyed on the voice. The sidechain key is padded with
  `apad`: without it the compressor stops when the last line ends and the score
  is cut off under the end card.
- Sum through `alimiter`, AAC 192k, 44.1 kHz stereo.
- Force stereo on every bus (`aformat=channel_layouts=stereo`); one mono input
  made a mono film once.

`npm run render` prints the finished mix's integrated loudness and true peak:
expect about -16 LUFS and a peak under -1 dBTP. To check ducking or a level in a
window: `ffmpeg -ss 120 -t 4 -i out/x.mp4 -af volumedetect -f null -`.
