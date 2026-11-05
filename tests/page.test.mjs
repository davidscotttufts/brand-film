// Reading a web page as the film's source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, pageMedia, pageTitle } from '../plugins/brand-film/skills/brand-film/template/lib/page.mjs';

const HTML = `<!doctype html><html><head><title>Ignored &amp; title</title>
<meta property="og:title" content="Motion Bricks &mdash; NVIDIA"><meta property="og:video" content="/media/hero.mp4">
<style>.x{}</style><script>var a = "<p>not text</p>";</script></head>
<body><nav><a href="/">Home</a></nav>
<main><h1>Motion Bricks</h1><p>Every move is generated live, in <b>17&nbsp;ms</b>.</p>
<ul><li>Walk</li><li>Run &amp; vault</li></ul>
<video src="clips/walk.mp4" title="Walk cycle"><source src="clips/walk.webm"></video>
<img src="/img/hero.jpg" alt="A character mid-vault"><img src="/icon.png" width="16">
<iframe src="https://www.youtube.com/embed/abc" title="Overview"></iframe>
<a href="/downloads/demo.mov?x=1">Download</a></main>
<footer>© 2026</footer></body></html>`;

test('the readable text keeps blocks and lists, and drops scripts, styles, nav and footer', () => {
  const t = htmlToText(HTML);
  assert.equal(t, 'Motion Bricks\nEvery move is generated live, in 17 ms.\n- Walk\n- Run & vault\nDownload');
  assert.equal(pageTitle(HTML), 'Motion Bricks — NVIDIA');
});

test('media: videos, sources, players, linked files and images, absolute and once each, icons skipped', () => {
  const m = pageMedia(HTML, 'https://example.com/research/page');
  assert.deepEqual(m.map((x) => `${x.kind} ${x.url}`), [
    'video https://example.com/media/hero.mp4',
    'video https://example.com/research/clips/walk.mp4',
    'video https://example.com/research/clips/walk.webm',
    'player https://www.youtube.com/embed/abc',
    'video https://example.com/downloads/demo.mov?x=1',
    'image https://example.com/img/hero.jpg',
  ]);
  assert.equal(m.find((x) => x.kind === 'image').alt, 'A character mid-vault');
});
