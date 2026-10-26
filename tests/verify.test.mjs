import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTranscript, normalize, numberWords, wer } from '../plugins/brand-film/skills/brand-film/template/lib/verify.mjs';

const T = { film: { written: 'brand-film', spoken: 'brand film' }, html: { written: 'HTML', spoken: 'H T M L' }, gh: { written: 'GitHub', spoken: 'Git Hub' } };

test('numbers and punctuation normalize', () => {
  assert.equal(numberWords(1204), 'one thousand two hundred four');
  assert.deepEqual(normalize('It took 17 weeks, 40% faster!'), ['it', 'took', 'seventeen', 'weeks', 'forty', 'percent', 'faster']);
});

test('word error rate', () => {
  assert.equal(wer(['a', 'b', 'c'], ['a', 'b', 'c']), 0);
  assert.equal(wer(['a', 'b', 'c'], ['a', 'x', 'c']), 1 / 3);
});

// Transcripts below are what ElevenLabs scribe_v1 returned for the example film.
test('a term heard as one word ("Brandfilm") is not a word error', () => {
  const r = checkTranscript({
    transcript: 'Brandfilm writes the film as an HTML scene where every frame is a function of time.',
    spoken: 'brand film writes the film as an H T M L scene, where every frame is a function of time.',
    written: 'brand-film writes the film as an HTML scene, where every frame is a function of time.',
    terms: [T.film, T.html],
  });
  assert.deepEqual(r, { wer: 0, missingTerms: [], pass: true });
});

test('a mispronounced term fails and is named', () => {
  const r = checkTranscript({
    transcript: 'Your brand, your story made in code. Find brand films on GitHub',
    spoken: 'Your brand, your story, made in code. Find brand film on Git Hub.',
    written: 'Your brand, your story, made in code. Find brand-film on GitHub.',
    terms: [T.film, T.gh],
  });
  assert.equal(r.pass, false);
  assert.deepEqual(r.missingTerms, ['brand-film']);
});

test('a dropped phrase fails on word error rate even when every term is heard', () => {
  const r = checkTranscript({
    transcript: 'Find brand film on GitHub.',
    spoken: 'Your brand, your story, made in code. Find brand film on Git Hub.',
    terms: [T.film, T.gh],
  });
  assert.equal(r.missingTerms.length, 0);
  assert.equal(r.pass, false);
  assert.ok(r.wer > 0.15);
});

test('digits for spoken numbers are not errors', () => {
  const r = checkTranscript({ transcript: 'Shipped in 17 weeks.', spoken: 'Shipped in seventeen weeks.' });
  assert.equal(r.pass, true);
});
