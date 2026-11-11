// Footage: licences, shots, pacing and colours. Pure functions, no ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipProblems, pacing, palette, shotsFromCuts } from '../plugins/brand-film/skills/brand-film/template/lib/media.mjs';

test('a clip needs a source and a licence; cc-by needs a credit; a render is the brand\'s own', () => {
  assert.deepEqual(clipProblems({ id: 'walk', file: 'media/walk.mp4', licence: 'press-kit' }), []);
  assert.match(clipProblems({ id: 'walk', file: 'media/walk.mp4' })[0], /no "licence"/);
  assert.match(clipProblems({ id: 'walk', url: 'https://x/y.mp4', licence: 'found-it' })[0], /not one of/);
  assert.match(clipProblems({ id: 'walk', file: 'a.mp4', licence: 'cc-by' })[0], /requires a "credit"/);
  assert.deepEqual(clipProblems({ id: 'gpu', blender: 'blender/turntable.py', frames: 90 }), []);
  assert.ok(clipProblems({ id: 'Bad Id', licence: 'own' }).some((p) => /lower-case/.test(p)));
  assert.ok(clipProblems({ id: 'x', file: 'a.mp4', licence: 'own', in: 4, out: 2 }).some((p) => /must be after/.test(p)));
});

test('cuts become shots; a flash shorter than minShot is merged', () => {
  const shots = shotsFromCuts([2, 2.1, 3.5], 6);
  assert.deepEqual(shots, [{ start: 0, end: 2 }, { start: 2, end: 3.5 }, { start: 3.5, end: 6 }]);
  assert.deepEqual(pacing(shots), { shotCount: 3, medianShot: 2, meanShot: 2, cutsPerMinute: 20 });
});

test('the palette finds the main colours and their shares, the same on every run', () => {
  const px = [];
  for (let i = 0; i < 300; i++) px.push(16, 16, 16);
  for (let i = 0; i < 100; i++) px.push(31, 111, 235);
  const p = palette(new Uint8Array(px), 2);
  assert.deepEqual(p, [{ hex: '#101010', share: 0.75 }, { hex: '#1f6feb', share: 0.25 }]);
  assert.deepEqual(palette(new Uint8Array(px), 2), p);
});
