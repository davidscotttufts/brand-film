// A web page's readable text, title and media, with no dependencies. Good
// enough for the facts check and a media list; not a full HTML parser.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™' };
export const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
};

export function pageTitle(html) {
  const og = /<meta[^>]+property\s*=\s*["']og:title["'][^>]*>/i.exec(html);
  if (og && attr(og[0], 'content')) return attr(og[0], 'content').trim();
  return decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

/** The page's readable text: one block per line, list items marked, chrome removed. */
export function htmlToText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head|nav|footer|aside|form|iframe|button|select)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|section|article|main|header|h[1-6]|ul|ol|table|tr|blockquote|figure|figcaption|pre|dd|dt|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '');
  return decode(s)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l && l !== '-')
    .join('\n');
}

/** Images, videos and embedded players on the page: [{ kind, url, alt }], absolute URLs, no repeats. */
export function pageMedia(html, base) {
  const out = [];
  const seen = new Set();
  const add = (kind, url, alt = '') => {
    if (!url || /^(data|blob|javascript):/i.test(url)) return;
    let abs;
    try { abs = new URL(url, base).href; } catch { return; }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ kind, url: abs, alt: alt.replace(/\s+/g, ' ').trim() });
  };
  const body = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of body.matchAll(/<meta[^>]+>/gi)) {
    const p = (attr(m[0], 'property') ?? attr(m[0], 'name') ?? '').toLowerCase();
    if (p === 'og:video' || p === 'og:video:url' || p === 'og:video:secure_url') add('video', attr(m[0], 'content'));
    if (p === 'og:image') add('image', attr(m[0], 'content'), 'og:image');
  }
  for (const m of body.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/gi)) {
    const open = /<video\b[^>]*>/i.exec(m[0])[0];
    add('video', attr(open, 'src'), attr(open, 'aria-label') ?? attr(open, 'title') ?? '');
    for (const s of m[1].matchAll(/<source\b[^>]*>/gi)) add('video', attr(s[0], 'src'));
  }
  for (const m of body.matchAll(/<iframe\b[^>]*>/gi)) {
    const src = attr(m[0], 'src') ?? '';
    if (/youtube\.com|youtu\.be|vimeo\.com|wistia|loom\.com/i.test(src)) add('player', src, attr(m[0], 'title') ?? '');
  }
  for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], 'href') ?? '';
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(href)) add('video', href);
  }
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(m[0], 'src') ?? attr(m[0], 'data-src') ?? (attr(m[0], 'srcset') ?? '').split(/\s+/)[0];
    const w = Number(attr(m[0], 'width') ?? 0);
    if (w && w < 64) continue; // icons and spacers
    add('image', src, attr(m[0], 'alt') ?? '');
  }
  return out;
}
