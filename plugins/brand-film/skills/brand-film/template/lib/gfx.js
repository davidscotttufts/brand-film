// The graphics kit: parts a scene uses instead of drawing each one again.
// A plain script (it runs in the scene's page over file://), loaded with
//   <script src="lib/gfx.js"></script>
// and used through window.GFX.
//
// Every part follows the scene contract: it builds its DOM ONCE, and returns a
// render(t) that draws film time t as a pure function of time (no clocks, no
// transitions, no randomness). Colours, faces and sizes are only var(--video-*)
// tokens, so a part looks like the brand that renders it. Each part takes the
// film times its motion happens at; copy them from the voiced words.
//
//   const bars = GFX.barChart($('chart'), [{ label: 'Before', value: 52 }, { label: 'After', value: 17, accent: true }], { at: 19.0, unit: ' weeks' });
//   const card = GFX.titleCard($('spec'), { kicker: 'Motion Bricks', title: 'Real-time animation', specs: [['From', 'NVIDIA'], ['Runs', 'live']] }, { at: 4.2, until: 9.6 });
//   const typing = GFX.typing($('prompt'), 'a giant gorilla enters the city', { at: 2.0, cps: 16 });
//   const demo = GFX.clip($('demo'), 'demo', { at: 12.4 });     // a frame sequence from npm run clips
//   function renderBase(t) { bars(t); card(t); typing(t); demo(t); … }
//
// Pure helpers (no DOM) are exported too, and tested in Node: ramp, win, lerp,
// counter, typed, caret, clipFrame.
(function (root) {
  'use strict';
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const easeOut = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ramp = (t, a, b) => ease((t - a) / (b - a));
  const win = (t, a, b, c, d) => Math.min(ramp(t, a, b), 1 - ramp(t, c, d));
  const lerp = (a, b, k) => a + (b - a) * k;

  /** A number counting from `from` to `to` between a and b, formatted: counter(t, 17.2, 18.6, 1204, { separator: ',' }) → "1,204". */
  function counter(t, a, b, to, { from = 0, decimals = 0, prefix = '', suffix = '', separator = ',' } = {}) {
    const v = lerp(from, to, easeOut((t - a) / (b - a)));
    const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
    const grouped = separator ? int.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : int;
    return `${v < 0 ? '-' : ''}${prefix}${grouped}${frac ? `.${frac}` : ''}${suffix}`;
  }

  /** The first characters of `text` typed by time t, from a, at cps characters a second. */
  const typed = (text, t, a, cps = 18) => text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - a) * cps))));
  /** A caret that blinks twice a second: true when it shows. */
  const caret = (t) => Math.floor(t * 2) % 2 === 0;

  /** The frame index of a clip at film time t. Holds the first frame before `at` and the last after the end, unless `loop`. */
  function clipFrame(t, at, frames, fps, { rate = 1, loop = false } = {}) {
    const n = Math.floor(Math.max(0, t - at) * fps * rate + 1e-6);
    return loop ? n % frames : Math.min(n, frames - 1);
  }

  const css = (el, style) => { Object.assign(el.style, style); return el; };
  const make = (tag, style, html) => { const el = css(document.createElement(tag), style ?? {}); if (html != null) el.innerHTML = html; return el; };
  const show = (el, o, dy = 0) => {
    el.style.opacity = o.toFixed(3);
    el.style.transform = dy ? `translateY(${(dy * (1 - o)).toFixed(1)}px)` : '';
    el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
  };

  /**
   * Horizontal bars that grow in turn, each with its label and a value that
   * counts up with it. rows: [{ label, value, accent }]. The container's width
   * is the longest bar's (`max`, default the largest value).
   */
  function barChart(el, rows, { at, stagger = 0.35, grow = 0.7, max, unit = '', decimals = 0, barPx = 56 } = {}) {
    const top = max ?? Math.max(...rows.map((r) => r.value));
    el.innerHTML = '';
    const parts = rows.map((r) => {
      const row = make('div', { position: 'relative', marginBottom: '26px' });
      const label = make('div', { font: '500 var(--video-size-mono-label-max) var(--video-font-label)', color: 'var(--video-stage-muted)', marginBottom: '8px' }, '');
      label.textContent = r.label;
      const track = make('div', { position: 'relative', height: `${barPx}px` });
      const bar = make('div', { height: '100%', width: '0px', borderRadius: '10px', background: r.accent ? 'var(--video-accent)' : 'var(--video-stage-rule)' });
      const value = make('div', { position: 'absolute', top: '50%', transform: 'translateY(-50%)', font: '700 var(--video-size-body-max) var(--video-font-headline)', color: r.accent ? 'var(--video-accent-on-stage)' : 'var(--video-stage-text)', whiteSpace: 'nowrap' });
      track.append(bar, value);
      row.append(label, track);
      el.appendChild(row);
      return { r, bar, value };
    });
    return (t) => {
      const W = el.clientWidth;
      parts.forEach(({ r, bar, value }, i) => {
        const a = at + i * stagger;
        const k = easeOut((t - a) / grow);
        const w = (W - 160) * (r.value / top) * k;
        bar.style.width = `${w.toFixed(1)}px`;
        value.style.left = `${(w + 18).toFixed(1)}px`;
        value.textContent = counter(t, a, a + grow, r.value, { decimals, suffix: unit });
        show(value, clamp((t - a) / 0.2));
      });
    };
  }

  /** A line that draws itself from left to right. points: [[x, y]] in any units; it is scaled to the box. */
  function lineChart(el, points, { at, draw = 1.2, width = 900, height = 420, accent = true, dots = true } = {}) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 12;
    const px = (x) => pad + ((x - x0) / (x1 - x0 || 1)) * (width - 2 * pad);
    const py = (y) => height - pad - ((y - y0) / (y1 - y0 || 1)) * (height - 2 * pad);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ');
    const stroke = accent ? 'var(--video-accent-on-stage)' : 'var(--video-stage-text)';
    el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="var(--video-stage-rule)" stroke-width="3"/>
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      ${dots ? points.map((p) => `<circle cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="11" fill="${stroke}" opacity="0"/>`).join('') : ''}</svg>`;
    const path = el.querySelector('path');
    const circles = [...el.querySelectorAll('circle')];
    return (t) => {
      const k = ramp(t, at, at + draw);
      path.setAttribute('stroke-dashoffset', (1 - k).toFixed(4));
      circles.forEach((c, i) => c.setAttribute('opacity', k >= i / Math.max(1, circles.length - 1) - 1e-6 ? '1' : '0'));
    };
  }

  /** A name and a line under it, sliding in from the left on a rule; out at `until`. */
  function lowerThird(el, { title, sub = '' }, { at, until }) {
    el.innerHTML = '';
    const rule = make('div', { width: '8px', alignSelf: 'stretch', borderRadius: '4px', background: 'var(--video-accent)' });
    const text = make('div', {});
    const h = make('div', { font: '700 var(--video-size-body-max) var(--video-font-headline)', color: 'var(--video-stage-text)' });
    h.textContent = title;
    const s = make('div', { font: '400 var(--video-size-body-min) var(--video-font-body)', color: 'var(--video-stage-muted)', marginTop: '6px' });
    s.textContent = sub;
    text.append(h, s);
    css(el, { display: 'flex', gap: '22px', alignItems: 'center' });
    el.append(rule, text);
    return (t) => {
      const o = win(t, at, at + 0.5, until - 0.4, until);
      show(el, o);
      text.style.transform = `translateX(${(-40 * (1 - ramp(t, at, at + 0.6))).toFixed(1)}px)`;
    };
  }

  /**
   * A title card with credentials or specs (what it is, who made it, the
   * numbers that matter): a kicker, a title, then [label, value] rows landing
   * in turn. Card colours; out at `until`.
   */
  function titleCard(el, { kicker = '', title, specs = [] }, { at, until, stagger = 0.3 }) {
    el.innerHTML = '';
    css(el, { boxSizing: 'border-box', background: 'var(--video-card)', color: 'var(--video-card-text)', borderRadius: '18px', padding: '40px 48px' });
    const k = make('div', { font: '500 var(--video-size-mono-label-max) var(--video-font-label)', color: 'var(--video-accent-on-card)', letterSpacing: '0.04em', marginBottom: '14px' });
    k.textContent = kicker;
    const h = make('div', { font: '700 var(--video-size-scene-title)/1.05 var(--video-font-headline)', letterSpacing: '-0.02em', marginBottom: specs.length ? '28px' : '0' });
    h.textContent = title;
    el.append(k, h);
    const rows = specs.map(([label, value]) => {
      const row = make('div', { display: 'flex', justifyContent: 'space-between', gap: '40px', padding: '14px 0', borderTop: '2px solid var(--video-card-faint)' });
      const l = make('span', { font: '500 var(--video-size-mono-label-max) var(--video-font-label)', color: 'var(--video-card-muted)' });
      const v = make('span', { font: '700 var(--video-size-body-max) var(--video-font-headline)' });
      l.textContent = label; v.textContent = value;
      row.append(l, v);
      el.appendChild(row);
      return row;
    });
    return (t) => {
      show(el, win(t, at, at + 0.5, until - 0.4, until), 30);
      rows.forEach((r, i) => show(r, ramp(t, at + 0.5 + i * stagger, at + 0.9 + i * stagger), 16));
    };
  }

  /** Text typed into a field at cps characters a second from `at`, with a blinking caret. */
  function typing(el, text, { at, cps = 18 } = {}) {
    el.innerHTML = '';
    const span = make('span', {});
    const bar = make('span', { display: 'inline-block', width: '0.08em', height: '1em', marginLeft: '0.06em', verticalAlign: '-0.12em', background: 'var(--video-accent-on-stage)' });
    el.append(span, bar);
    return (t) => {
      span.textContent = typed(text, t, at, cps);
      const typing = t >= at && t < at + text.length / cps;
      bar.style.visibility = typing || caret(t) ? 'visible' : 'hidden';
    };
  }

  /** Clips the scene uses (npm run render checks each has a source and a licence in media.lock.json). */
  const used = new Set();
  /**
   * A clip from npm run clips (clips/manifest.js): a frame sequence shown in an
   * <img>, so a frame is exact at any t. Starts at film time `at`, plays at
   * `rate`, holds its first frame before and its last after (or loops). Size
   * and crop it with CSS (object-fit: cover).
   */
  function clip(img, id, { at = 0, rate = 1, loop = false } = {}) {
    const m = (root.CLIP_MANIFEST ?? {})[id];
    if (!m) throw new Error(`clip "${id}" is not in clips/manifest.js: add it to clips.json and run npm run clips (and load clips/manifest.js before lib/gfx.js's users)`);
    used.add(id);
    let shown = -1;
    return (t) => {
      const n = clipFrame(t, at, m.frames, m.fps, { rate, loop });
      if (n !== shown) { img.src = `${m.dir}/${String(n + 1).padStart(5, '0')}.${m.ext}`; shown = n; }
    };
  }

  const GFX = { clamp, ease, easeOut, ramp, win, lerp, counter, typed, caret, clipFrame, barChart, lineChart, lowerThird, titleCard, typing, clip, used };
  root.GFX = GFX;
})(typeof window !== 'undefined' ? window : globalThis);
