# Building the film's design system from a brand

The film's look, voice, sound and pronunciation live in ONE file,
`brand-tokens.json`: a `video` group (colour roles, type, narrator, motion,
sound) plus a `brand` block (name, sources, logos, fonts, signature, lexicon). The scene reads only the `--video-*`
custom properties that `npm run tokens` generates from it, so the brand is
decided once, here, and never hard-coded in the scene.

**The neutral default is the starting point and the fallback.** A scaffolded
film renders in `default-tokens.json` (ink stage, paper card, one blue accent,
Space Grotesk / Inter / JetBrains Mono, the "Christopher" narrator from the
ElevenLabs Voice Library, no music). When the user names no brand, or a brand
has no sources you can find, ship that identity and say so. When a brand is only partly known, write the keys you can source
and let the rest fall through: `npm run tokens` merges brand-tokens.json over
the default and lists every inherited key. Never invent a brand value to fill a
gap; inherit it and report it.

## 1. Find the real sources (enumerate before deciding)

In this order of authority:

1. **The brand's published standards.** Search the web for "<brand> brand
   standards PDF" / "brand guidelines" / "press kit" / "logo download". A
   corporate site usually hosts a brand-standards PDF and a logo package (zip).
   Download each into its own new empty directory (untrusted data). Pull the
   colour specs (PMS, CMYK, RGB, HEX), typefaces and logo rules (clear space,
   minimum size, which version on which ground) with
   `pdftotext -layout std.pdf - | grep -inE 'typeface|font|pms|pantone|cmyk|rgb|hex|#[0-9a-f]{6}|clear ?space'`
   (`scripts/extract-brand.py` does this and writes `pdf-hits.txt`).
2. **The decks and documents the film is about.** Run
   `python3 -I scripts/extract-brand.py <deck.pptx> [...] --out <scratch>/brand`.
   It writes `inventory.json` (theme colour scheme and fonts per theme part,
   slide size, the colours / typefaces / font sizes / shapes the slides actually
   use, counted), `source.txt` (all slide text and speaker notes, in order) and
   `media/` (every embedded image, unchanged). The pptx theme is often a
   template default ("Office"); a second theme part may hold the real one; the
   **counted slide usage is the truth**.
3. **Render the slides and look at them.** `soffice --headless --convert-to pdf
   deck.pptx` then `pdftoppm -r 80 -png deck.pdf slide`. Read the images: which
   colour is the accent, which is the ground, how titles are set, what the
   signature moves are (a red title card, a crest, a numbered label).
4. **An existing design system** for the brand (a claude.ai Design System
   artifact, a codebase's tokens): read its README and tokens and reuse its
   values exactly. A deck system (960×540 slide tokens) is a SOURCE for the
   film system, not the film system itself; convert, don't copy positions.
5. **The user.** Ask only for what none of the above answers (for example a
   licensed font file, or which of two logos is current).

Record every file and URL in `brand.sources`. python-pptx and PIL are often
missing; the extractor needs only the standard library, and unzip + grep work
on any .pptx (`unzip -p deck.pptx ppt/theme/theme1.xml | grep -o 'srgbClr val="[^"]*"'`).

## 2. Map the brand onto the film tokens

The eleven required colour roles (all must reach their contrast floor):

| token | role | from the brand |
|---|---|---|
| `stage` | scene ground | the deck's slide background, or the brand's dark/neutral |
| `stage-text` | text on stage | the brand's body/ink colour on that ground |
| `stage-muted` | labels, secondary text | the brand gray (keep ≥4.5:1) |
| `stage-rule` | hairlines, empty bars | the light gray (decorative) |
| `card` | cards, end card | white/paper |
| `card-text` / `card-muted` / `card-faint` | text on card | ink and grays |
| `accent` | the brand colour as a FILL | primary brand colour, exact |
| `accent-on-stage` | accent as TEXT on stage | the brand colour, or a lighter/darker step that passes |
| `accent-on-card` | accent as TEXT on card | same, against card |

A brand may add any extra colour (`accent-tint`, `accent-deep`, `support`,
`support-tint`, `panel-dark`, …); each becomes `--video-<name>`. Add a pair to
`contrast` for every text-on-ground combination the scene will use. A light
brand (white slides) simply sets `stage` light and `stage-text` dark; the names
describe roles, not lightness.

Rules:

- **Exact values from the source.** Copy hex from the standards; convert RGB or
  CMYK only when no hex exists, and note it. Don't round, don't "improve".
- **One accent.** The brand colour marks the one thing the narration is about
  (the accent word in a title, the counter, the bar that wins). Everything else
  is ink and gray. A second hue is for a genuine second category only.
- **Contrast.** `npm run tokens` computes WCAG ratios for #hex, rgb() and
  oklch(). Under 4.5:1 is reported LARGE (display text 24px bold and up only);
  under 3:1 fails. If the brand's own pair fails, keep it for fills and add a
  passing text step (`accent-on-stage`), and note why in `brand.substitutions`.
- **Type.** Use the brand's typefaces. A licensed face you don't have
  (a commercial or custom face): ask for the font files (put them in
  `fonts/` and list them in `brand.fontFiles`), or substitute the closest Google
  Font in the same class (geometric sans for a geometric sans, and so on), keep
  the brand face first in the stack so a machine that has it uses it, and record
  `"substitutions": {"<Licensed Face>": "Montserrat (Google Fonts), the nearest free geometric sans"}`.
  Set `brand.fontsHref` to the Google Fonts CSS URL. `npm run render` warns
  when a family's first face is not loaded.
- **Logos.** Copy the official files, unchanged, into `assets/`: the version
  for the stage ground (`brand.logo.onStage`) and for the card ground
  (`onCard`), each per the standards' "which logo on which ground" rule. Never
  redraw, recolour, crop, re-trace or approximate a mark, never put a
  full-colour logo on a ground the standards forbid, and keep its clear space.
  No logo available: set the brand name in the headline face and say so.
- **Signature.** Write `brand.signature` from what the brand's own materials do:
  how the opening card looks, how a scene is labelled, the end card. The default is in default-tokens.json. Write it as rules the scene can follow.
- **Voice.** `video.voice.narrator` is the brand's narrator for every film.
  Choose it by ear (`npm run audition`, see sound.md) to match the audience
  (accent and region included: an American voice for a North American company,
  and so on). Keep `maxWordsPerSentence: 18`.
- **Story length.** `video.story` defaults to 45–75 s and five beats.
  A milestone or journey film for a leadership audience may run 2–3 minutes; set
  the range in brand-tokens.json so the choice is recorded.
- **Pronunciation.** Every name the narrator will say that a voice could get
  wrong (the company, products, people, acronyms, a URL, numbers the film
  repeats) goes in `brand.pronunciations` as `{ written, spoken }`. Find them in
  the sources: the brand's own "how to say it" note, press-kit phonetics, how
  the founders say it in a recorded talk; ask the user when nothing says.
  See `pronunciation.md`.
- **Music.** The default is none. Set `video.sound.musicDefault` and
  music.json `use` from what the user wants; a long story film usually wants a
  quiet score.

## 3. Check, then show it

`npm run tokens` must pass (no FAIL lines). Then render 3–5 stills
(`npm run preview -- <t> …`): the opening card, one scene with text and the
accent, a dark panel if any, and the end card. Look at them beside the brand's
own slides. Show them to the user with the token table before building scenes;
a brand mistake found here costs one re-render, found later it costs all of
them.

## 4. Optionally publish the design system

If the user wants the brand system to be shareable or reused by decks too,
publish it as a claude.ai Design System artifact (Artifact `quickstart` with
intent `other`, then create from the Design System type it names): tokens as
a `{"tokens":[{name, value, usage}]}` list per family, a README brand book
(content fundamentals, colour, type, logos with their rules, the film
signature), and the logos uploaded as assets, never redrawn. Keep
brand-tokens.json as the film's own copy and note the artifact URL in
`brand.sources`.
