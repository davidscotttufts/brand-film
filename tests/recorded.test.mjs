// A recorded voice-over: finding each take among retakes, dropping stumbles,
// shortening pauses, and cutting where the sound ends. Pure, no audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignTake, findTake, planTake, threshold, tokens } from '../plugins/brand-film/skills/brand-film/template/lib/recorded.mjs';

/** Timed words from "text@start-end" with a default 0.3 s word and 0.1 s gap. */
function said(text, t0 = 0, gaps = {}) {
  let t = t0;
  return text.split(/\s+/).map((w, i) => { t += gaps[i] ?? 0; const r = { text: w, start: +t.toFixed(3), end: +(t + 0.3).toFixed(3) }; t += 0.4; return r; });
}
const levelOf = (words, tailExtra = 0) => (t) => (words.some((w) => t >= w.start - 0.02 && t <= w.end + tailExtra) ? -20 : -70);

test('the free-start alignment finds the take and prefers the last clean attempt', () => {
  const ref = 'a b c'.split(' ');
  assert.deepEqual(alignTake(ref, 'x a b c y a b c'.split(' ')), { cost: 0, start: 5, end: 8, ops: [{ op: 'match', r: 0, h: 5 }, { op: 'match', r: 1, h: 6 }, { op: 'match', r: 2, h: 7 }] });
  // A better attempt earlier still wins over a worse later one.
  assert.equal(alignTake(ref, 'a b c a x c'.split(' ')).start, 0);
});

test('retakes: "Look at it. Walk, jog." twice, then the full line; the full line is the take', () => {
  const words = said('Look at it. Walk, jog. Look at it. Walk, jog, and then run. Look at it walk, jog, and then break into a full run.');
  const hyp = tokens(words);
  const m = findTake(['Look at it walk, jog, and then break into a full run.'], hyp, 0);
  assert.equal(m.cost, 0);
  assert.equal(words[hyp[m.start].w].text, 'Look');
  assert.equal(hyp[m.start].w, 13, 'the third "Look"');
});

test('a stumble inside the take is dropped, a long pause is shortened, and the words are re-timed', () => {
  // "Shipped in in seventeen weeks" with a 1.5 s pause before "weeks".
  const words = said('Shipped in in seventeen weeks.', 1, { 4: 1.5 });
  const hyp = tokens(words);
  const m = findTake(['Shipped in seventeen weeks.'], hyp, 0);
  const lv = levelOf(words, 0.12);
  const plan = planTake({ words, hyp, match: m, level: lv, thr: threshold([-70, -70, -70, -20]), maxPause: 0.3 });
  assert.deepEqual(plan.dropped, ['in']);
  assert.deepEqual(plan.words.map((w) => w.text), ['Shipped', 'in', 'seventeen', 'weeks.']);
  // The cut take is far shorter than the 3.9 s the line took to record.
  assert.ok(plan.duration < 2.4, `duration ${plan.duration}`);
  // No segment boundary lands inside a kept word's sound, and every word stays in order.
  for (let i = 1; i < plan.words.length; i++) assert.ok(plan.words[i].start >= plan.words[i - 1].end - 1e-6);
  // The tail of each word (sound past the transcript's end time) is kept: the
  // last segment ends after the last word's sound, not at its transcript end.
  const last = plan.segments.at(-1);
  assert.ok(last.to >= words.at(-1).end + 0.1, `ends at ${last.to}`);
});

test('a word the speaker skipped is timed between its neighbours; the check sees the gap', () => {
  const words = said('One team learned to ship.');
  const hyp = tokens(words);
  const m = findTake(['One team learned to ship faster.'], hyp, 0);
  assert.equal(m.cost, 1);
  const plan = planTake({ words, hyp, match: m, level: levelOf(words), thr: -60 });
  assert.equal(plan.words.at(-1).text, 'faster.');
  assert.ok(plan.words.at(-1).start >= plan.words.at(-2).end - 1e-6);
});
