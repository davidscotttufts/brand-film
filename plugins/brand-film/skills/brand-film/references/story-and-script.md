# Story and script

Write the story before any scene. The narration is the spine: scenes are timed
to the voiced words, never the other way round.

## Choose the shape

**Explainer (default).** One idea, 45–75 s, five beats:
problem, stakes, turn, proof, payoff, then the end card. "Why should I care?"
before "how does it work?".

**Journey / milestone film** (a team's year, a transformation story, an award
submission). 2–3 minutes. The arc that worked:

1. Opening card: who and what ("Our journey to ...").
2. Where we started: the ordinary world, concrete and a little dull.
3. The first proof: a pilot, with one number.
4. The comfortable new normal, and the challenge to leave it: "We could have
   stopped there. Instead, we…". This turn is what makes it a story.
5. The milestones, each one: a short roadmap card (the step's name, its dates,
   a marker that fills on a shared timeline; earlier steps lit, later ones
   waiting), then the scene that proves it with a number.
6. The people and partners: who made it possible. Keep humans in the loop.
7. What's next.
8. The payoff in three short lines, then the end card.

Use a classic arc (call, threshold, allies, trial, return) to ORDER the story,
but don't name the framework on screen or in narration, and avoid its jargon
("ordeal", "elixir", "hero's journey"). Name the story the way the user does.

## Facts

- Every fact on screen and in the narration comes from the source documents
  (film.json `source`; `extract-brand.py` writes `source.txt` from decks). List
  the load-bearing ones in film.json `facts`; `npm run render` fails if one goes
  missing from the source or the scene.
- Read the project's timeline documents before writing cause and effect. A
  project that started after an event is not "from" that event; "Meanwhile, in
  May" is not "So". Ask when the order is unclear.
- No numbers that change daily (active users, open tickets). Use durable
  wording: "launched in time for the sales kickoff", "hundreds of new users every
  week".
- Survey-based or estimated figures say what they are, or stay out.
- Credit partners as partners. Don't boast about speed in a way that implies a
  reviewing team cut corners ("cleared in one day"); say "built with our
  partners, every step".
- Value over cool factor. Leadership audiences want what was delivered, for
  whom, and how much faster, not the technology's novelty.
- Present a team as a team when the user asks; no individual names unless the
  user puts them in.
- No version numbers, no ticket ids, nothing that dates the film on a re-cut.

## Narration rules (narration.json)

- One take per scene, voiced in one request so it flows as speech.
- Plain spoken sentences of 18 words or fewer. First person plural for a team
  ("we"), "you" for a product explainer.
- Write each take's `text` the way it should READ ("$4.20", "17 weeks", "API",
  "example.com"), and put how it should SOUND in the brand's lexicon
  (`brand.pronunciations`: "four dollars and twenty cents", "seventeen weeks",
  "A P I", "example dot com"; see `pronunciation.md`). The voice gets the
  spoken forms; the captions keep the written ones. `npm run lint` warns about
  any digits that would still reach the voice, and fails on a sentence over
  the word limit or one that opens with a spelled acronym.
- **Never open a sentence with a spelled acronym** ("AI didn't…" is read
  "A. I. didn't…"); rephrase ("The agents didn't…", "Back then, AI tools…").
  Likewise a name that starts with "A" (A2A).
- Use the user's own words for the key line when they give one; tighten
  around it, don't rewrite it.
- Each take has `at`/`until` in FILM seconds. Leave 0.4–0.8 s between takes and
  about 0.6 s after the scene starts before the voice.
- `anchors`: the words that must land while their picture shows ("four" as the
  four tiles land). The report says on cue or OFF CUE; move the picture to the
  word rather than bending the sentence.
- A take that overruns its window fails `npm run narrate`. Tighten a word or two,
  or widen the scene. Don't speed up the voice.

## Captions

Captions come from the SPOKEN words (word timestamps), split per sentence or
clause, with `captionReplace` spellings. The scene's own `CAPTIONS` array is
only the fallback for a silent render. Every film ships its `.en.vtt`.
