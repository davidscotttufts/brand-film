// Brand colours as linear sRGB: for the contrast check (tokens.mjs) and for
// renders that need exact colour values, such as a Blender clip (clips.mjs).

/** Colour to linear sRGB [r, g, b] (0 to 1), for #hex, rgb() and oklch(); null for anything else. */
export function linear(c) {
  const lin = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  let m;
  if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c))) {
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
    return [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  }
  if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(c))) return [m[1], m[2], m[3]].map((x) => lin(+x / 255));
  if ((m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i.exec(c))) {
    const L = m[2] ? +m[1] / 100 : +m[1], C = +m[3], H = (+m[4] * Math.PI) / 180;
    const a = C * Math.cos(H), b = C * Math.sin(H);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s].map((x) => Math.max(0, Math.min(1, x)));
  }
  return null;
}
