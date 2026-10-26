import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileLexicon, lintLexicon } from '../plugins/brand-film/skills/brand-film/template/lib/lexicon.mjs';

const rules = [
  { written: 'brand-film', spoken: 'brand film' },
  { written: 'API', spoken: 'A P I', caseSensitive: true },
  { written: '17 weeks', spoken: 'seventeen weeks' },
  { written: 'nginx', spoken: 'engine x' },
];

test('written forms become spoken forms, whole words only', () => {
  const lex = compileLexicon(rules);
  assert.equal(lex.toSpoken('brand-film shipped the API in 17 weeks.'), 'brand film shipped the A P I in seventeen weeks.');
  assert.equal(lex.toSpoken('rapid APIs and api keys'), 'rapid APIs and api keys', 'no partial words; case-sensitive rule ignores "api"');
  assert.equal(lex.toSpoken('NGINX'), 'engine x', 'case-insensitive by default');
});

test('captions get the written forms back', () => {
  const lex = compileLexicon(rules);
  assert.equal(lex.toWritten(lex.toSpoken('Run nginx for 17 weeks.')), 'Run nginx for 17 weeks.');
});

test('one pass: a spoken form never triggers another rule', () => {
  const lex = compileLexicon([{ written: 'A', spoken: 'B' }, { written: 'B', spoken: 'C' }]);
  assert.equal(lex.toSpoken('A B'), 'B C');
});

test('termsIn lists the rules a line uses', () => {
  const lex = compileLexicon(rules);
  assert.deepEqual(lex.termsIn('nginx and the API').map((r) => r.written).sort(), ['API', 'nginx']);
});

test('lint catches empty, duplicate and no-op rules', () => {
  assert.deepEqual(lintLexicon(rules), []);
  const p = lintLexicon([{ written: 'X', spoken: '' }, { written: 'y', spoken: 'why' }, { written: 'Y', spoken: 'why' }, { written: 'z', spoken: 'z' }]);
  assert.equal(p.length, 3, p.join('\n'));
  assert.match(lintLexicon({})[0], /must be a list/);
});
