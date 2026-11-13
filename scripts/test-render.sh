#!/usr/bin/env bash
# shellcheck disable=SC2016  # the single-quoted node -e blocks are JavaScript, not shell
# The full render test: scaffold the template into a temporary folder, render
# it silent (no ElevenLabs account), and check the report. Then render the
# example from its committed sources (audio absent, so silent with captions).
# Needs Chrome (CHROME_PATH) or Playwright's Chromium.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

check() { # <film dir> <output name> <expected frames> [captions file, default <output name>.en.vtt]
  local r="$1/out/$2.report.json"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const want = Number(process.argv[2]);
    if (r.frames !== want) { console.error(`frames ${r.frames}, want ${want}`); process.exit(1); }
    if (!(r.captions > 0)) { console.error("no captions"); process.exit(1); }
    console.log(`ok ${process.argv[1]}: ${r.frames} frames, ${r.captions} captions`);' "$r" "$3"
  test -s "$1/out/$2.mp4" && test -s "$1/out/${4:-$2.en.vtt}" && test -s "$1/out/$2-poster.jpg"
}

bash "$root/plugins/brand-film/skills/brand-film/scripts/scaffold.sh" "$tmp/film" fixture
# Which tools this run used: a version gap between CI and a laptop (ffmpeg 7 on
# Linux, 6 on a Mac) is the first thing to rule out when only one fails.
(cd "$tmp/film" && node --input-type=module -e '
  import ff from "ffmpeg-static"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module";
  import { chromePath } from "./lib/stage.mjs";
  const pw = createRequire(import.meta.url)("playwright-core/package.json").version;
  const first = (f, a) => { try { return execFileSync(f, a, { encoding: "utf8" }).split("\n")[0]; } catch { return "?"; } };
  const c = chromePath();
  console.log(`tools: ${first(ff, ["-version"])} | playwright-core ${pw} | ${c ? first(c, ["--version"]) : "Playwright Chromium"}`);')
(cd "$tmp/film" && node lint.mjs && node render.mjs)
check "$tmp/film" fixture 780

# Footage: a synthetic three-shot video, split into shots, made into a clip
# (refused without a licence), its frames and lock written.
(cd "$tmp/film" && node -e '
  const { execFileSync } = require("child_process"); const ff = require("ffmpeg-static");
  require("fs").mkdirSync("media", { recursive: true });
  execFileSync(ff, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x1f6feb:s=640x360:d=2", "-f", "lavfi", "-i", "color=c=0xf6f5f2:s=640x360:d=1.5",
    "-f", "lavfi", "-i", "color=c=0x101010:s=640x360:d=2.5", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "media/demo.mp4"]);
  execFileSync(ff, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1600x900", "-frames:v", "1", "media/photo.png"]);
  require("fs").writeFileSync("clips.json", JSON.stringify({ clips: [{ id: "demo", file: "media/demo.mp4", in: 0.5, out: 4 },
    { id: "photo", kind: "image", file: "media/photo.png", licence: "cc-by", title: "Test card", author: "A. Tester", licenceName: "CC BY 4.0", via: "Wikimedia Commons" }] }));' \
  && ! node clips.mjs 2>/dev/null \
  && node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("clips.json")); c.clips[0].licence = "own"; fs.writeFileSync("clips.json", JSON.stringify(c));' \
  && node clips.mjs && node shots.mjs media/demo.mp4 && node -e '
  const fs = require("fs");
  const s = JSON.parse(fs.readFileSync("media/demo.shots.json", "utf8")); const m = JSON.parse(fs.readFileSync("clips/manifest.json", "utf8")).demo;
  const lock = JSON.parse(fs.readFileSync("media.lock.json", "utf8")).clips[0];
  if (s.shotCount !== 3 || Math.abs(m.frames - 105) > 1 || lock.licence !== "own" || !lock.sha256) { console.error(JSON.stringify({ s, m, lock })); process.exit(1); }
  const p = JSON.parse(fs.readFileSync("clips/manifest.json", "utf8")).photo;
  const pl = JSON.parse(fs.readFileSync("media.lock.json", "utf8")).clips[1];
  if (p.kind !== "image" || p.frames !== 1 || pl.attribution !== "\"Test card\" by A. Tester, CC BY 4.0, via Wikimedia Commons" || !fs.readFileSync("clips/manifest.js", "utf8").includes("CLIP_CREDITS")) { console.error(JSON.stringify({ p, pl })); process.exit(1); }
  console.log(`ok footage: ${s.shotCount} shots, clip of ${m.frames} frames, licence ${lock.licence}; a still with its credit line`);' && rm -rf clips clips.json media media.lock.json)

# The full mix with no account: synthetic takes (the last ending just before
# the film does) and a score, so the ducking and the spoken-word check run.
bash "$root/plugins/brand-film/skills/brand-film/scripts/scaffold.sh" "$tmp/voiced" voiced
node "$root/scripts/fake-narration.mjs" "$tmp/voiced"
# …in two shapes, the second with burned-in captions, and a cut-down of it.
(cd "$tmp/voiced" && node -e '
  const fs = require("fs"); const f = JSON.parse(fs.readFileSync("film.json", "utf8"));
  f.aspects = ["16:9", "9:16"]; f.burnCaptions = ["9:16"]; f.cuts = [{ id: "short", aspect: "9:16", ranges: [[0, 5.9], [14.2, 26]] }];
  fs.writeFileSync("film.json", JSON.stringify(f));' && node render.mjs)
check "$tmp/voiced" voiced 780
check "$tmp/voiced" voiced.9x16 780 voiced.en.vtt
node -e '
  const fs = require("fs");
  const v = JSON.parse(fs.readFileSync(process.argv[1] + "/voiced.9x16.report.json", "utf8"));
  if (v.width !== 1080 || v.height !== 1920 || !v.burnedCaptions || v.spokenWords.lost.length) { console.error(JSON.stringify(v)); process.exit(1); }
  const c = JSON.parse(fs.readFileSync(process.argv[1] + "/voiced.short.report.json", "utf8"));
  if (c.frames !== c.expectedFrames || c.spokenWords.lost.length) { console.error(JSON.stringify(c)); process.exit(1); }
  console.log(`ok 9:16 with burned-in captions; cut-down ${c.frames} frames`);' "$tmp/voiced/out"
test -s "$tmp/voiced/out/voiced.short.mp4" && test -s "$tmp/voiced/out/voiced.short.en.vtt"

node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!r.voice || !r.spokenWords || r.spokenWords.lost.length) { console.error("spoken-word check did not pass:", JSON.stringify(r.spokenWords)); process.exit(1); }
  console.log(`ok all ${r.spokenWords.checked} synthetic words are in the mix`);' "$tmp/voiced/out/voiced.report.json"

# A voiced translation, also with synthetic narration: its own film, captions
# and spoken-word check.
(cd "$tmp/voiced" && node translate.mjs es:voice >/dev/null && node -e '
  const fs = require("fs"); const p = "narration.es.json"; const t = JSON.parse(fs.readFileSync(p, "utf8"));
  t.takes.forEach((x, i) => { x.text = `Frase ${i + 1}.`; }); t.voice = { id: "synthetic", name: "synthetic" };
  fs.writeFileSync(p, JSON.stringify(t));')
node "$root/scripts/fake-narration.mjs" "$tmp/voiced" --lang es
(cd "$tmp/voiced" && node render.mjs --lang es)
check "$tmp/voiced" voiced.es 780 voiced.es.vtt

# A recorded voice-over: a synthetic read with a false start, a stumble and a
# long pause, cut into takes with no transcriber or account, then rendered.
bash "$root/plugins/brand-film/skills/brand-film/scripts/scaffold.sh" "$tmp/recorded" recorded
node "$root/scripts/fake-recording.mjs" "$tmp/recorded"
(cd "$tmp/recorded" && node narrate.mjs --recorded recordings/vo.wav --transcript recordings/vo.words.json && node render.mjs)
check "$tmp/recorded" recorded 780
node -e '
  const fs = require("fs"); const dir = process.argv[1];
  const r = JSON.parse(fs.readFileSync(dir + "/out/recorded.report.json", "utf8"));
  const lock = JSON.parse(fs.readFileSync(dir + "/takes.lock.json", "utf8"));
  const c = lock.takes.find((t) => t.id === "c-result");
  if (!r.voice || r.spokenWords.lost.length || r.voiceProcessing.loudnorm !== "linear") { console.error(JSON.stringify(r)); process.exit(1); }
  if (lock.model !== "recorded" || c.recorded.dropped.join() !== "in" || !lock.takes.every((t) => t.verify.pass)) { console.error(JSON.stringify(lock)); process.exit(1); }
  console.log(`ok recorded voice-over: ${r.spokenWords.checked} words heard; dropped "${c.recorded.dropped}" from c-result`);' "$tmp/recorded"

ex="$root/examples/how-it-works"
(cd "$ex" && npm install --silent && node tokens.mjs --check && node lint.mjs && node sfx.mjs && node render.mjs)
check "$ex" how-it-works 1440
test -s "$ex/out/how-it-works.fr.vtt"   # the captions-only language, written by the base render
