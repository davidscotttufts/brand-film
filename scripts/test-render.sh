#!/usr/bin/env bash
# The full render test: scaffold the template into a temporary folder, render
# it silent (no ElevenLabs account), and check the report. Then render the
# example from its committed sources (audio absent, so silent with captions).
# Needs Chrome (CHROME_PATH) or Playwright's Chromium.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

check() { # <film dir> <basename> <expected frames>
  local r="$1/out/$2.report.json"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const want = Number(process.argv[2]);
    if (r.frames !== want) { console.error(`frames ${r.frames}, want ${want}`); process.exit(1); }
    if (!(r.captions > 0)) { console.error("no captions"); process.exit(1); }
    console.log(`ok ${process.argv[1]}: ${r.frames} frames, ${r.captions} captions`);' "$r" "$3"
  test -s "$1/out/$2.mp4" && test -s "$1/out/$2.en.vtt" && test -s "$1/out/$2-poster.jpg"
}

bash "$root/plugins/brand-film/skills/brand-film/scripts/scaffold.sh" "$tmp/film" fixture
(cd "$tmp/film" && node lint.mjs && node render.mjs)
check "$tmp/film" fixture 780

ex="$root/examples/how-it-works"
(cd "$ex" && npm install --silent && node tokens.mjs --check && node lint.mjs && node sfx.mjs && node render.mjs)
check "$ex" how-it-works 1440
