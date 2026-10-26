# Contributing

Thanks for helping. A few things keep this project dependable.

- **Run the checks:** `npm test` at the repository root. It runs the unit tests
  (lexicon, listening check, lint, tokens), checks that the example's copied
  scripts match the template, and validates the plugin manifests. The full
  render test is `npm run test:render` (needs Chrome or `npx playwright install chromium`).
- **The template is the source of truth.** `examples/how-it-works` holds copies
  of the template's scripts; after changing one, run `npm run sync-example`.
- **No media in git.** Audio, video and rendered frames are generated. Commit
  sources and the lock files (`takes.lock.json`, `music.lock.json`), never
  `*.mp3`, `*.wav` or `*.mp4`. CI fails on them.
- **No keys, no private names.** CI runs a secret scan.
- **Sign off your commits** (`git commit -s`, the Developer Certificate of Origin).
- **A change to behaviour gets a test** that fails without the change.
