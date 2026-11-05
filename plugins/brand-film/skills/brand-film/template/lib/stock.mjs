// Stock pictures and footage: search five libraries and bring back each
// result with its licence READ FROM THE LIBRARY, its author, its page and the
// attribution it needs, in one shape:
//
//   { provider, id, kind: 'image'|'video', title, author, authorUrl, page,
//     file, thumb, width, height, duration, licence, licenceName, licenceUrl,
//     track, flags }
//
// | provider  | key  | pictures | video | licence                                   |
// |-----------|------|----------|-------|-------------------------------------------|
// | wikimedia | none | yes      | yes   | per file: CC0, CC BY, CC BY-SA, public domain |
// | openverse | none | yes      | no    | per file: CC0, CC BY, CC BY-SA, public domain |
// | unsplash  | yes  | yes      | no    | the Unsplash Licence                      |
// | pexels    | yes  | yes      | yes   | the Pexels Licence                        |
// | pixabay   | yes  | yes      | yes   | the Pixabay Content Licence               |
//
// Results a brand film may not use are dropped here, never offered:
// NonCommercial (a brand film is commercial), NoDerivatives (cutting,
// cropping and captioning are changes), and anything whose licence can't be
// read. `flags` marks what a person should look at before it goes in:
// 'share-alike' (the film may have to carry the same licence), 'people'
// (a recognisable person: stock libraries hold no model releases, and a face
// in a brand film reads as an endorsement), 'brand' (a logo or product).
//
// Each provider's parse() is a pure function of its API's JSON, tested with
// sample responses; search() adds the request.
import { apiKey } from './keys.mjs';

export const UA = 'brand-film-find/1.3 (+https://github.com/davidscotttufts/brand-film)';
const strip = (html = '') => String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/**
 * A licence as brand-film names it, from what a library calls it
 * ("CC BY-SA 4.0", "cc-by-sa-4.0", "by-sa", "pdm", "Public domain").
 * Returns { licence, name } or { licence: null, why } for one a film can't use.
 */
export function normalizeLicence(raw, version = '') {
  const s = String(raw ?? '').toLowerCase().trim().replace(/_/g, '-');
  if (!s) return { licence: null, why: 'no licence given' };
  if (/\bnc\b|non-?commercial/.test(s.replace(/-/g, ' '))) return { licence: null, why: 'NonCommercial: a brand film is commercial use' };
  if (/\bnd\b|no-?deriv/.test(s.replace(/-/g, ' '))) return { licence: null, why: 'NoDerivatives: cutting and captioning are changes' };
  if (/^(cc0|cc-zero|cc0-1\.0|cc-0)/.test(s)) return { licence: 'cc0', name: 'CC0' };
  if (/^(pdm|pd\b|pd-|public[- ]domain)/.test(s)) return { licence: 'public-domain', name: 'Public domain' };
  const m = /(?:^cc[- ]?)?(by(?:-sa)?)(?:[- ]?(\d(?:\.\d)?))?/.exec(s.replace(/\s+/g, '-'));
  if (m && /^(cc-?)?by/.test(s.replace(/\s+/g, '-'))) {
    const v = m[2] || version;
    return { licence: m[1] === 'by-sa' ? 'cc-by-sa' : 'cc-by', name: `CC ${m[1].toUpperCase()}${v ? ` ${v}` : ''}` };
  }
  return { licence: null, why: `unrecognised licence "${raw}"` };
}

const PEOPLE = /\b(person|people|man|men|woman|women|girl|boy|child|children|kid|kids|portrait|face|selfie|crowd|team|couple|family|businessman|businesswoman|model|worker|student|smiling)\b/i;
const BRAND = /\b(logo|brand|trademark|iphone|apple|google|microsoft|samsung|nike|coca[- ]?cola|tesla|amazon|meta|facebook|nvidia)\b/i;
/** Flags a person should check before using a result. */
export function flagsFor({ licence, text = '' }) {
  const f = [];
  if (licence === 'cc-by-sa') f.push('share-alike');
  if (PEOPLE.test(text)) f.push('people');
  if (BRAND.test(text)) f.push('brand');
  return f;
}

const result = (r) => ({ ...r, flags: flagsFor({ licence: r.licence, text: `${r.title} ${r.tags ?? ''}` }) });

export const PROVIDERS = {
  wikimedia: {
    key: false, kinds: ['image', 'video'],
    url: (q, kind, n) => `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:${kind === 'video' ? 'video' : 'bitmap'}`,
      gsrnamespace: '6', gsrlimit: String(n), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '480',
      iiextmetadatafilter: 'LicenseShortName|License|LicenseUrl|Artist|ObjectName|ImageDescription|Categories',
    })}`,
    headers: () => ({}),
    parse(json, kind) {
      const pages = Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const out = [];
      for (const p of pages) {
        const i = p.imageinfo?.[0];
        if (!i) continue;
        const m = i.extmetadata ?? {};
        const lic = normalizeLicence(m.License?.value ?? m.LicenseShortName?.value);
        const isVideo = /^video\//.test(i.mime ?? '');
        if (!lic.licence || (kind === 'video') !== isVideo) continue;
        const artist = strip(m.Artist?.value) || 'Unknown author';
        const href = /href="([^"]+)"/.exec(m.Artist?.value ?? '')?.[1];
        out.push(result({
          provider: 'wikimedia', id: String(p.pageid), kind: isVideo ? 'video' : 'image',
          title: strip(m.ObjectName?.value) || p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
          author: artist, authorUrl: href ? new URL(href, 'https://commons.wikimedia.org').href : null,
          page: i.descriptionurl, file: i.url.split('?')[0], thumb: i.thumburl, width: i.width, height: i.height,
          duration: i.duration ?? null, licence: lic.licence, licenceName: lic.name ?? m.LicenseShortName?.value,
          licenceUrl: m.LicenseUrl?.value ?? null, track: null, via: 'Wikimedia Commons', tags: strip(m.Categories?.value),
        }));
      }
      return out;
    },
  },
  openverse: {
    key: false, kinds: ['image'],
    url: (q, kind, n) => `https://api.openverse.org/v1/images/?${new URLSearchParams({ q, page_size: String(Math.min(n, 20)), mature: 'false' })}`,
    headers: () => ({}),
    parse(json) {
      return (json.results ?? []).flatMap((r) => {
        const lic = normalizeLicence(r.license, r.license_version);
        if (!lic.licence || r.mature) return [];
        return [result({
          provider: 'openverse', id: r.id, kind: 'image', title: r.title || 'Untitled', author: r.creator || 'Unknown author',
          authorUrl: r.creator_url ?? null, page: r.foreign_landing_url, file: r.url, thumb: r.thumbnail, width: r.width, height: r.height,
          duration: null, licence: lic.licence, licenceName: lic.name, licenceUrl: r.license_url ?? null, track: null,
          via: r.source ? `${r.source[0].toUpperCase()}${r.source.slice(1)} via Openverse` : 'Openverse', tags: (r.tags ?? []).map((t) => t.name).join(' '),
        })];
      });
    },
  },
  unsplash: {
    key: true, kinds: ['image'],
    url: (q, kind, n) => `https://api.unsplash.com/search/photos?${new URLSearchParams({ query: q, per_page: String(Math.min(n, 30)), content_filter: 'high' })}`,
    headers: (key) => ({ Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }),
    parse(json) {
      const utm = 'utm_source=brand-film&utm_medium=referral';
      return (json.results ?? []).map((r) => result({
        provider: 'unsplash', id: r.id, kind: 'image', title: r.alt_description || r.description || 'Untitled',
        author: r.user?.name ?? 'Unknown', authorUrl: r.user?.links?.html ? `${r.user.links.html}?${utm}` : null,
        page: `${r.links?.html}?${utm}`, file: `${r.urls?.raw}${r.urls?.raw?.includes('?') ? '&' : '?'}w=3840&fm=jpg&q=85`, thumb: r.urls?.small,
        width: r.width, height: r.height, duration: null, licence: 'unsplash', licenceName: 'Unsplash Licence', licenceUrl: 'https://unsplash.com/license',
        // Unsplash's API terms: call this when the photo is used (clips.mjs does, once).
        track: r.links?.download_location ?? null, via: 'Unsplash', tags: [r.description, ...(r.tags ?? []).map((t) => t.title)].filter(Boolean).join(' '),
      }));
    },
  },
  pexels: {
    key: true, kinds: ['image', 'video'],
    url: (q, kind, n) => (kind === 'video'
      ? `https://api.pexels.com/videos/search?${new URLSearchParams({ query: q, per_page: String(Math.min(n, 80)) })}`
      : `https://api.pexels.com/v1/search?${new URLSearchParams({ query: q, per_page: String(Math.min(n, 80)) })}`),
    headers: (key) => ({ Authorization: key }),
    parse(json, kind) {
      const base = { provider: 'pexels', licence: 'pexels', licenceName: 'Pexels Licence', licenceUrl: 'https://www.pexels.com/license/', track: null, via: 'Pexels' };
      if (kind === 'video') {
        return (json.videos ?? []).map((v) => {
          // The largest file up to 4K, mp4 first.
          const files = (v.video_files ?? []).filter((f) => f.link && (f.width ?? 0) <= 3840).sort((a, b) => (b.file_type === 'video/mp4') - (a.file_type === 'video/mp4') || (b.width ?? 0) - (a.width ?? 0));
          const title = (v.url ?? '').replace(/\/$/, '').split('/').pop().replace(/-\d+$/, '').replace(/-/g, ' ') || 'Untitled';
          return result({ ...base, id: String(v.id), kind: 'video', title, author: v.user?.name ?? 'Unknown', authorUrl: v.user?.url ?? null, page: v.url,
            file: files[0]?.link ?? null, thumb: v.image, width: files[0]?.width ?? v.width, height: files[0]?.height ?? v.height, duration: v.duration ?? null });
        }).filter((r) => r.file);
      }
      return (json.photos ?? []).map((p) => result({ ...base, id: String(p.id), kind: 'image', title: p.alt || 'Untitled', author: p.photographer ?? 'Unknown',
        authorUrl: p.photographer_url ?? null, page: p.url, file: p.src?.original, thumb: p.src?.medium, width: p.width, height: p.height, duration: null }));
    },
  },
  pixabay: {
    key: true, kinds: ['image', 'video'],
    url: (q, kind, n, key) => `https://pixabay.com/api/${kind === 'video' ? 'videos/' : ''}?${new URLSearchParams({ key, q, per_page: String(Math.max(3, Math.min(n, 200))), safesearch: 'true', ...(kind === 'video' ? {} : { image_type: 'photo' }) })}`,
    headers: () => ({}),
    parse(json, kind) {
      const base = { provider: 'pixabay', licence: 'pixabay', licenceName: 'Pixabay Content Licence', licenceUrl: 'https://pixabay.com/service/license-summary/', track: null, via: 'Pixabay' };
      return (json.hits ?? []).map((h) => {
        const author = h.user ?? 'Unknown';
        const authorUrl = h.user && h.user_id ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : null;
        if (kind === 'video') {
          const v = h.videos?.large?.url ? h.videos.large : h.videos?.medium ?? h.videos?.small;
          return result({ ...base, id: String(h.id), kind: 'video', title: h.tags || 'Untitled', author, authorUrl, page: h.pageURL, file: v?.url ?? null,
            thumb: v?.thumbnail ?? null, width: v?.width, height: v?.height, duration: h.duration ?? null, tags: h.tags });
        }
        return result({ ...base, id: String(h.id), kind: 'image', title: h.tags || 'Untitled', author, authorUrl, page: h.pageURL,
          file: h.largeImageURL ?? h.webformatURL, thumb: h.webformatURL ?? h.previewURL, width: h.imageWidth, height: h.imageHeight, duration: null, tags: h.tags });
      }).filter((r) => r.file);
    },
  },
};

/** Search one provider. Throws with the provider's name on a failure; returns [] when it has no key. */
export async function search(provider, q, { kind = 'image', count = 12, fetchFn = fetch } = {}) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`unknown provider "${provider}"; use ${Object.keys(PROVIDERS).join(', ')}`);
  if (!p.kinds.includes(kind)) return [];
  const key = p.key ? apiKey(provider) : null;
  if (p.key && !key) return [];
  const r = await fetchFn(p.url(q, kind, count, key), { headers: { 'user-agent': UA, accept: 'application/json', ...p.headers(key) }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${provider} answered ${r.status}`);
  return p.parse(await r.json(), kind).slice(0, count);
}

/**
 * The credit line a result or a clip needs, in its library's own form:
 *   CC (TASL): "Server room" by Ada Example, CC BY-SA 4.0, via Wikimedia Commons
 *   Unsplash:  Photo by Ada Example on Unsplash
 *   Pexels:    Video by Ada Example from Pexels
 *   Pixabay:   Image by Ada Example from Pixabay
 * Empty for a clip that needs none (the brand's own, a licensed stock shot).
 */
export function attribution(c) {
  const what = c.kind === 'video' ? 'Video' : 'Photo';
  const author = c.author ?? c.credit;
  switch (c.licence) {
    case 'unsplash': return `Photo by ${author} on Unsplash`;
    case 'pexels': return `${what} by ${author} from Pexels`;
    case 'pixabay': return `${c.kind === 'video' ? 'Video' : 'Image'} by ${author} from Pixabay`;
    case 'cc-by': case 'cc-by-sa': case 'cc0': case 'public-domain': {
      if (!author && !c.title) return c.credit ?? '';
      const name = c.licenceName ?? { 'cc-by': 'CC BY', 'cc-by-sa': 'CC BY-SA', cc0: 'CC0', 'public-domain': 'Public domain' }[c.licence];
      return `${c.title ? `"${c.title}"` : 'Untitled'}${author ? ` by ${author}` : ''}, ${name}${c.via ? `, via ${c.via}` : ''}`;
    }
    default: return c.credit ?? '';
  }
}
