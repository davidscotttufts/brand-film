#!/usr/bin/env bash
# Copies the brand-film template into a new film folder and installs it.
#
#   scaffold.sh <target-dir> [basename]
#
# The folder starts in the neutral default identity (default-tokens.json; the
# logos are a placeholder mark), so it renders before any brand work. Refuses a
# target that already has a scene.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="${1:?usage: scaffold.sh <target-dir> [basename]}"
base="${2:-$(basename "$target")}"
if [ -e "$target/scene.html" ] || [ -e "$target/film.json" ]; then
  echo "scaffold: $target already holds a film; not overwriting" >&2
  exit 1
fi
mkdir -p "$target"
cp -R "$here/../template/." "$target/"
# Name the outputs after the film.
node -e '
  const fs = require("fs"), p = process.argv[1] + "/film.json";
  const f = JSON.parse(fs.readFileSync(p, "utf8")); f.basename = process.argv[2];
  fs.writeFileSync(p, JSON.stringify(f, null, 2) + "\n");' "$target" "$base"
if ! (cd "$target" && npm install --silent); then
  echo "scaffold: npm install failed in $target. Run it there without --silent to see why;" >&2
  echo "  ffmpeg-static downloads ffmpeg from GitHub at install, so a 5xx from GitHub is usually temporary: try again." >&2
  exit 1
fi
(cd "$target" && node tokens.mjs && node sfx.mjs)
echo
echo "scaffolded $target (outputs: out/$base.*)"
echo "next: build the brand (references/brand-system.md), write narration.json, then npm run narrate"
