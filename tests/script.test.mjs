// The house style and the script rules: pure functions, no API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, addLesson, neverSaid, parseHouseStyle } from '../plugins/brand-film/skills/brand-film/template/lib/housestyle.mjs';
import { aiIsms, hasCallToAction, longCaveats, scoreScript, scriptWarnings } from '../plugins/brand-film/skills/brand-film/template/lib/script.mjs';

test('a lesson lands in its section, dated, and parses back without the date', () => {
  let md = addLesson(EMPTY, 'script', 'Say what is on screen in line two.', '2026-11-05');
  md = addLesson(md, 'script', 'Keep caveats to one clause.', '2026-11-06');
  md = addLesson(md, 'never', 'game-changer');
  assert.match(md, /## Script\n\n- Say what is on screen in line two\. \(2026-11-05\)\n- Keep caveats/);
  const hs = parseHouseStyle(md);
  assert.deepEqual(hs.script, ['Say what is on screen in line two.', 'Keep caveats to one clause.']);
  assert.deepEqual(hs.never, ['game-changer']);
  assert.deepEqual(hs.picture, []);
});

test('a section missing from the file is created; an unknown one is refused', () => {
  const md = addLesson('# House style\n', 'sound', 'Music 2 dB lower.', '2026-11-05');
  assert.deepEqual(parseHouseStyle(md).sound, ['Music 2 dB lower.']);
  assert.throws(() => addLesson(EMPTY, 'colour', 'x'), /unknown section/);
});

test('never-say matches whole words, any case', () => {
  assert.deepEqual(neverSaid('A real Game-Changer.', ['game-changer']).map((h) => h.phrase), ['game-changer']);
  assert.deepEqual(neverSaid('Synergy is a word.', ['syn']), []);
});

test('machine-written phrasing, long caveats and calls to action', () => {
  assert.deepEqual(aiIsms("It's not just a tool, it's a platform."), ['"not just X, it\'s Y"']);
  assert.deepEqual(aiIsms('We shipped in 17 weeks.'), []);
  assert.equal(longCaveats('Results may vary and could potentially differ.').length, 1);
  assert.equal(longCaveats('It may rain.').length, 0);
  assert.ok(hasCallToAction('Find out how at example.com.'));
  assert.ok(hasCallToAction('Ship faster. Try it today.'));
  assert.ok(!hasCallToAction('That was the year.'));
});

test('script warnings: a late, long hook and no call to action', () => {
  const w = scriptWarnings([
    { id: 'a', at: 2.5, until: 9, text: 'This is a very long opening sentence that goes on for far too many words.' },
    { id: 'b', at: 10, until: 14, text: 'That was the year.' },
  ]).map((x) => `${x.id}: ${x.message}`);
  assert.ok(w.some((m) => /starts at 2.5s/.test(m)));
  assert.ok(w.some((m) => /opening sentence has 15 words/.test(m)));
  assert.ok(w.some((m) => /^b: the last take has no call to action/.test(m)));
});

test('the score adds up its checklist', () => {
  const good = scoreScript({
    takes: [
      { id: 'a', at: 0.6, until: 3.6, text: 'One team learned to ship faster.' },
      { id: 'b', at: 4, until: 7.2, text: 'They cut the wait from months to weeks.' },
      { id: 'c', at: 8.4, until: 11, text: 'Find out how at example.com.' },
    ],
    facts: ['17 weeks'],
  });
  assert.equal(good.outOf, 10);
  assert.equal(good.score, 10, JSON.stringify(good.items.filter((i) => i.points < i.max)));
  const weak = scoreScript({ takes: [{ id: 'a', at: 3, until: 30, text: 'It is not just a product, it is a seamless revolution that may possibly change everything.' }] });
  assert.ok(weak.score <= 3, `scored ${weak.score}`);
});
