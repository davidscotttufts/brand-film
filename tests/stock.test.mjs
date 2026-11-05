// Stock libraries: licences read from each library, parsed from sample API
// responses (the shapes their documentation and live answers give), and the
// credit line each one needs. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, attribution, flagsFor, normalizeLicence, search } from '../plugins/brand-film/skills/brand-film/template/lib/stock.mjs';
import { clipProblems } from '../plugins/brand-film/skills/brand-film/template/lib/media.mjs';

test('licences are named the same way whatever the library calls them; NC and ND are refused with a reason', () => {
  assert.deepEqual(normalizeLicence('CC BY-SA 4.0'), { licence: 'cc-by-sa', name: 'CC BY-SA 4.0' });
  assert.deepEqual(normalizeLicence('cc-by-sa-3.0'), { licence: 'cc-by-sa', name: 'CC BY-SA 3.0' });
  assert.deepEqual(normalizeLicence('by', '2.0'), { licence: 'cc-by', name: 'CC BY 2.0' });
  assert.deepEqual(normalizeLicence('cc0'), { licence: 'cc0', name: 'CC0' });
  assert.deepEqual(normalizeLicence('pdm'), { licence: 'public-domain', name: 'Public domain' });
  assert.deepEqual(normalizeLicence('Public domain'), { licence: 'public-domain', name: 'Public domain' });
  assert.match(normalizeLicence('by-nc-sa', '2.0').why, /NonCommercial/);
  assert.match(normalizeLicence('CC BY-ND 4.0').why, /NoDerivatives/);
  assert.match(normalizeLicence('GFDL').why, /unrecognised/);
  assert.match(normalizeLicence('').why, /no licence/);
});

test('flags: share-alike, people, brands', () => {
  assert.deepEqual(flagsFor({ licence: 'cc-by-sa', text: 'A woman smiling at an iPhone' }), ['share-alike', 'people', 'brand']);
  assert.deepEqual(flagsFor({ licence: 'cc-by', text: 'Server racks in a data centre' }), []);
});

test('Wikimedia Commons: licence and author from extmetadata, kind from the MIME type', () => {
  const json = { query: { pages: {
    1: { pageid: 1, index: 1, title: 'File:139 Server Room 01.jpg', imageinfo: [{ width: 3264, height: 2448, mime: 'image/jpeg', thumburl: 'https://t/1.jpg',
      url: 'https://upload.wikimedia.org/a/139.jpg?utm_source=x', descriptionurl: 'https://commons.wikimedia.org/wiki/File:139.jpg',
      extmetadata: { ObjectName: { value: '139 Server Room 01' }, Artist: { value: '<bdi><a href="https://www.wikidata.org/wiki/Q5">Indrajit Das</a></bdi>' },
        LicenseShortName: { value: 'CC BY-SA 3.0' }, License: { value: 'cc-by-sa-3.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0' } } }] },
    2: { pageid: 2, index: 2, title: 'File:Nc.jpg', imageinfo: [{ mime: 'image/jpeg', url: 'u', extmetadata: { License: { value: 'cc-by-nc-2.0' } } }] },
    3: { pageid: 3, index: 3, title: 'File:Clip.webm', imageinfo: [{ mime: 'video/webm', url: 'v', duration: 30.1, extmetadata: { License: { value: 'cc0' } } }] },
  } } };
  const imgs = PROVIDERS.wikimedia.parse(json, 'image');
  assert.equal(imgs.length, 1, 'the NonCommercial file and the video are left out of a picture search');
  assert.deepEqual({ ...imgs[0], thumb: undefined }, {
    provider: 'wikimedia', id: '1', kind: 'image', title: '139 Server Room 01', author: 'Indrajit Das', authorUrl: 'https://www.wikidata.org/wiki/Q5',
    page: 'https://commons.wikimedia.org/wiki/File:139.jpg', file: 'https://upload.wikimedia.org/a/139.jpg', thumb: undefined, width: 3264, height: 2448,
    duration: null, licence: 'cc-by-sa', licenceName: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', track: null,
    via: 'Wikimedia Commons', tags: '', flags: ['share-alike'],
  });
  const vids = PROVIDERS.wikimedia.parse(json, 'video');
  assert.deepEqual(vids.map((v) => [v.title, v.licence, v.duration]), [['Clip', 'cc0', 30.1]]);
});

test('Openverse: CC fields, mature results dropped', () => {
  const r = PROVIDERS.openverse.parse({ results: [
    { id: 'a', title: 'Robots', foreign_landing_url: 'https://flickr.com/p/1', url: 'https://live.staticflickr.com/1.jpg', creator: 'ralph', creator_url: 'https://flickr.com/u',
      license: 'by-sa', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by-sa/2.0/', source: 'flickr', thumbnail: 'https://t', width: 500, height: 375, tags: [{ name: 'robot' }], mature: false },
    { id: 'b', title: 'x', license: 'by-nc', license_version: '2.0', url: 'u' },
    { id: 'c', title: 'y', license: 'cc0', url: 'u', mature: true },
  ] });
  assert.equal(r.length, 1);
  assert.equal(attribution(r[0]), '"Robots" by ralph, CC BY-SA 2.0, via Flickr via Openverse');
});

test('Unsplash: the photo, its photographer with referral links, and the download to report', () => {
  const [p] = PROVIDERS.unsplash.parse({ results: [{ id: 'Xy1', width: 6000, height: 4000, alt_description: 'server racks in blue light',
    urls: { raw: 'https://images.unsplash.com/photo-1?ixid=abc', small: 'https://images.unsplash.com/photo-1?w=400' },
    links: { html: 'https://unsplash.com/photos/Xy1', download_location: 'https://api.unsplash.com/photos/Xy1/download?ixid=abc' },
    user: { name: 'Ada Example', links: { html: 'https://unsplash.com/@ada' } } }] });
  assert.equal(p.licence, 'unsplash');
  assert.equal(p.file, 'https://images.unsplash.com/photo-1?ixid=abc&w=3840&fm=jpg&q=85');
  assert.equal(p.page, 'https://unsplash.com/photos/Xy1?utm_source=brand-film&utm_medium=referral');
  assert.equal(p.track, 'https://api.unsplash.com/photos/Xy1/download?ixid=abc');
  assert.equal(attribution(p), 'Photo by Ada Example on Unsplash');
});

test('Pexels: photos, and videos with the largest mp4 up to 4K', () => {
  const [ph] = PROVIDERS.pexels.parse({ photos: [{ id: 1, width: 4000, height: 3000, url: 'https://www.pexels.com/photo/racks-1/', photographer: 'Bo', photographer_url: 'https://www.pexels.com/@bo', alt: 'Racks', src: { original: 'https://images.pexels.com/1.jpeg', medium: 'm' } }] }, 'image');
  assert.equal(attribution(ph), 'Photo by Bo from Pexels');
  const [v] = PROVIDERS.pexels.parse({ videos: [{ id: 9, width: 3840, height: 2160, duration: 12, url: 'https://www.pexels.com/video/robot-arm-welding-9/', image: 'th', user: { name: 'Cy', url: 'https://www.pexels.com/@cy' },
    video_files: [{ link: 'https://v/sd.mp4', file_type: 'video/mp4', width: 960 }, { link: 'https://v/8k.mp4', file_type: 'video/mp4', width: 7680 }, { link: 'https://v/uhd.mp4', file_type: 'video/mp4', width: 3840 }, { link: 'https://v/hd.webm', file_type: 'video/webm', width: 1920 }] }] }, 'video');
  assert.equal(v.file, 'https://v/uhd.mp4');
  assert.equal(v.title, 'robot arm welding');
  assert.equal(attribution(v), 'Video by Cy from Pexels');
});

test('Pixabay: images and videos', () => {
  const [i] = PROVIDERS.pixabay.parse({ hits: [{ id: 5, pageURL: 'https://pixabay.com/photos/server-5/', tags: 'server, data, network', webformatURL: 'w', largeImageURL: 'https://pixabay.com/get/5.jpg', imageWidth: 5000, imageHeight: 3000, user: 'dee', user_id: 77 }] }, 'image');
  assert.equal(i.authorUrl, 'https://pixabay.com/users/dee-77/');
  assert.equal(attribution(i), 'Image by dee from Pixabay');
  const [v] = PROVIDERS.pixabay.parse({ hits: [{ id: 6, pageURL: 'https://pixabay.com/videos/arm-6/', tags: 'robot, arm', duration: 20, user: 'ed', user_id: 8, videos: { large: { url: 'https://cdn.pixabay.com/6.mp4', width: 3840, height: 2160, thumbnail: 't' } } }] }, 'video');
  assert.equal(v.file, 'https://cdn.pixabay.com/6.mp4');
  assert.equal(attribution(v), 'Video by ed from Pixabay');
});

test('search sends each library its own auth, and skips a library with no key', async () => {
  const seen = [];
  const fetchFn = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ photos: [] }) }; };
  process.env.PEXELS_API_KEY = 'test-key';
  await search('pexels', 'racks', { fetchFn });
  delete process.env.PEXELS_API_KEY;
  assert.equal(seen[0].init.headers.Authorization, 'test-key');
  assert.match(seen[0].url, /^https:\/\/api\.pexels\.com\/v1\/search\?query=racks/);
  delete process.env.UNSPLASH_ACCESS_KEY;
  if (!process.env.CI && process.platform === 'darwin') return; // a developer's Keychain may hold a key
  assert.deepEqual(await search('unsplash', 'racks', { fetchFn }), []);
});

test('a stock clip needs its page and author; NC and ND licences are refused by name', () => {
  assert.deepEqual(clipProblems({ id: 'r', kind: 'image', url: 'u', page: 'p', author: 'Ada', licence: 'unsplash' }), []);
  assert.match(clipProblems({ id: 'r', url: 'u', licence: 'pexels' })[0], /needs its "page" and "author"/);
  assert.match(clipProblems({ id: 'r', url: 'u', licence: 'cc-by-nc' })[0], /NonCommercial/);
  assert.match(clipProblems({ id: 'r', url: 'u', licence: 'cc-by-nd' })[0], /NoDerivatives/);
  assert.deepEqual(clipProblems({ id: 'r', url: 'u', page: 'p', author: 'A', licence: 'cc-by' }), []);
});
