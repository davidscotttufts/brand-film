// Burned-in caption cues and cut-downs: pure functions, no ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burnCues, captionWords, narrationCues } from '../plugins/brand-film/skills/brand-film/template/lib/captions.mjs';
import { cutArgs, cutCues, cutManifest, planCut, toCut } from '../plugins/brand-film/skills/brand-film/template/lib/cuts.mjs';
import { aspectOf } from '../plugins/brand-film/skills/brand-film/template/lib/stage.mjs';

const w = (text, start) => ({ text, start, end: start + 0.3 });
const manifest = {
  captionReplace: { 'seventeen weeks': '17 weeks', 'example dot com': 'example.com' },
  takes: [
    { id: 'a', at: 1, words: [w('Shipped', 1), w('in', 1.4), w('seventeen', 1.8), w('weeks.', 2.2), w('Find', 3), w('us', 3.4), w('at', 3.8), w('example', 4.2), w('dot', 4.6), w('com.', 5)] },
  ],
};

test('caption words put the written forms back, timed across the spoken run', () => {
  const ws = captionWords(manifest.takes[0].words, manifest.captionReplace);
  assert.deepEqual(ws.map((x) => x.text), ['Shipped', 'in', '17 weeks.', 'Find', 'us', 'at', 'example.com.']);
  const seventeen = ws[2];
  assert.equal(seventeen.start, 1.8);
  assert.equal(seventeen.end, 2.5);
});

test('burned-in cues break at sentence ends and at maxWords, and never overlap', () => {
  const cues = burnCues(manifest, 3);
  assert.deepEqual(cues.map((c) => c.text), ['Shipped in 17 weeks.', 'Find us at', 'example.com.']);
  for (let i = 0; i < cues.length - 1; i++) assert.ok(cues[i].end <= cues[i + 1].start);
  // The .vtt keeps a sentence together.
  assert.deepEqual(narrationCues(manifest).map((c) => c[2]), ['Shipped in 17 weeks.', 'Find us at example.com.']);
});

test('a cut snaps to frames, fails inside a word, and warns off the opening card', () => {
  const ok = planCut({ ranges: [[0, 2.7], [2.9, 6]] }, { duration: 6, fps: 30, takes: manifest.takes });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.frames, 81 + 93);
  const bad = planCut({ ranges: [[0.5, 1.5]] }, { duration: 6, fps: 30, takes: manifest.takes });
  assert.ok(bad.problems.some((p) => /falls inside "in"/.test(p)));
  assert.ok(bad.problems.some((p) => /not on the opening card/.test(p)));
  assert.ok(planCut({ ranges: [[0, 7]] }, { duration: 6, fps: 30 }).problems.some((p) => /outside the film/.test(p)));
});

test('a cut shifts captions and the words the spoken-word check hears', () => {
  const ranges = [[0, 1], [3, 6]];
  assert.equal(toCut(ranges, 3.5), 1.5);
  assert.equal(toCut(ranges, 2), null);
  assert.deepEqual(cutCues([[0.2, 0.8, 'a'], [1.5, 2.5, 'gone'], [2.8, 4, 'b']], ranges), [[0.2, 0.8, 'a'], [1, 2, 'b']]);
  const m = cutManifest(manifest, ranges);
  assert.equal(m.takes.length, 1);
  assert.equal(m.takes[0].at, 1 - 2);
  assert.equal(m.takes[0].words[0].text, 'Find');
  assert.equal(m.takes[0].words[0].start, 1);
});

test('aspects', () => {
  assert.deepEqual(aspectOf('9:16'), { name: '9:16', tag: '9x16', width: 1080, height: 1920 });
  assert.throws(() => aspectOf('21:9'), /unknown aspect/);
});

import { chapters, publishInfo } from '../plugins/brand-film/skills/brand-film/template/lib/publish.mjs';

test('chapters start at 0:00 and are held to YouTube\'s rules', () => {
  const takes = [{ at: 0.8, chapter: 'Intro', text: 'One team.' }, { at: 12, chapter: 'Problem' }, { at: 30, chapter: 'Proof' }, { at: 35, chapter: 'End' }];
  const { chapters: ch, warnings } = chapters(takes, 40);
  assert.deepEqual(ch.map((c) => `${c.time} ${c.title}`), ['0:00 Intro', '0:12 Problem', '0:30 Proof', '0:35 End']);
  assert.deepEqual(warnings, ['chapter "Proof" is 5.0s; YouTube needs 10s or more', 'chapter "End" is 5.0s; YouTube needs 10s or more']);
});

test('the publish record carries the description, chapters and footage credits', () => {
  const info = publishInfo({
    film: { publish: { titles: ['A', 'B', 'C'], description: 'How one team shipped faster.' } },
    takes: [{ at: 0.8, chapter: 'Intro' }, { at: 12, chapter: 'Problem' }, { at: 24, chapter: 'Proof' }],
    duration: 40,
    credits: [{ id: 'walk', credit: 'NVIDIA press kit', licence: 'press-kit' }, { id: 'me', credit: 'Our team', licence: 'own' }],
  });
  assert.equal(info.description, 'How one team shipped faster.\n\n0:00 Intro\n0:12 Problem\n0:24 Proof\n\nFootage: NVIDIA press kit (press-kit); Our team');
  assert.deepEqual(info.warnings, []);
});

test('a cut-down is encoded at the film\'s frame rate (ffmpeg 7 would fall back to 25)', () => {
  const a = cutArgs('in.mp4', 'out.mp4', [[0, 5.9], [14.2, 26]], { fps: 30 });
  assert.equal(a[a.indexOf('-r') + 1], '30');
  const b = cutArgs('in.mp4', 'out.mp4', [[0, 2]], { fps: 24, audio: false });
  assert.equal(b[b.indexOf('-r') + 1], '24');
});
