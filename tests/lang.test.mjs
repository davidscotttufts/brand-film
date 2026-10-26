import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunk, distributedCues, rulesFor, sourceHash } from '../plugins/brand-film/skills/brand-film/template/lib/lang.mjs';
import { checkTranscript } from '../plugins/brand-film/skills/brand-film/template/lib/verify.mjs';
import { lintLexicon } from '../plugins/brand-film/skills/brand-film/template/lib/lexicon.mjs';

test('long sentences split at commas into short caption chunks', () => {
  const c = chunk('Los videos explicativos tardan semanas de ediciones, y la marca se desvía con cada una de ellas, una y otra vez sin parar nunca.');
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.split(' ').length <= 14));
});

test('captions-only cues are laid over the span the original take was spoken, in proportion', () => {
  const cues = distributedCues(new Map([['a', 'Uno dos tres. Cuatro cinco seis siete ocho nueve.']]),
    [{ id: 'a', at: 1, until: 9, words: [{ start: 1.5, end: 1.8 }, { start: 6.9, end: 7.5 }] }]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0][0], 1.5, 'starts on the first spoken word, not the window');
  const [a, b] = ['Uno dos tres.', 'Cuatro cinco seis siete ocho nueve.'].map((x) => x.length);
  assert.ok(Math.abs(cues[1][0] - (1.5 + 6 * a / (a + b))) < 1e-9, 'second chunk starts in proportion to length');
  assert.ok(cues[0][1] <= cues[1][0], 'cues never overlap');
});

test('a take with no voice is timed on its window', () => {
  const [cue] = distributedCues(new Map([['a', 'Hola.']]), [{ id: 'a', at: 2, until: 5 }]);
  assert.deepEqual(cue.slice(0, 2), [2, 5.25]);
});

test('per-language lexicon: own rules override the general ones', () => {
  const rules = [{ written: 'API', spoken: 'A P I' }, { written: 'API', spoken: 'a pe i', lang: 'es' }, { written: 'nginx', spoken: 'engine x' }];
  assert.deepEqual(rulesFor(rules, 'es').map((r) => r.spoken), ['a pe i', 'engine x']);
  assert.deepEqual(rulesFor(rules, 'en').map((r) => r.spoken), ['A P I', 'engine x']);
  assert.deepEqual(lintLexicon(rules), [], 'the same term in two languages is not a duplicate');
});

test('source hash ignores surrounding whitespace only', () => {
  assert.equal(sourceHash(' Ship faster. '), sourceHash('Ship faster.'));
  assert.notEqual(sourceHash('Ship faster.'), sourceHash('Ship fast.'));
});

test('the listening check in another language: digits match spelled-out numbers', () => {
  assert.equal(checkTranscript({ lang: 'es', transcript: 'Lo enviamos en 17 semanas.', spoken: 'Lo enviamos en diecisiete semanas.' }).pass, true);
  assert.equal(checkTranscript({ lang: 'es', transcript: 'Lo enviamos en semanas.', spoken: 'Lo enviamos en diecisiete semanas, sin falta.' }).pass, false);
});
