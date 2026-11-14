// API keys for the stock libraries, never written to a file by these scripts.
// Each is read from the environment, or on macOS from the login Keychain:
//
//   security add-generic-password -a "$USER" -s unsplash-access-key -w   # paste the key at the prompt
//
// | provider | environment          | Keychain service     | get one at                                  |
// |----------|----------------------|----------------------|---------------------------------------------|
// | unsplash | UNSPLASH_ACCESS_KEY  | unsplash-access-key  | https://unsplash.com/oauth/applications     |
// | pexels   | PEXELS_API_KEY       | pexels-api-key       | https://www.pexels.com/api/                 |
// | pixabay  | PIXABAY_API_KEY      | pixabay-api-key      | https://pixabay.com/api/docs/               |
import { spawnSync } from 'node:child_process';

export const KEYS = {
  unsplash: { env: 'UNSPLASH_ACCESS_KEY', service: 'unsplash-access-key', url: 'https://unsplash.com/oauth/applications' },
  pexels: { env: 'PEXELS_API_KEY', service: 'pexels-api-key', url: 'https://www.pexels.com/api/' },
  pixabay: { env: 'PIXABAY_API_KEY', service: 'pixabay-api-key', url: 'https://pixabay.com/api/docs/' },
};

const cache = new Map();
/** The key for a provider, or null. */
export function apiKey(provider) {
  const k = KEYS[provider];
  if (!k) return null;
  if (process.env[k.env]) return process.env[k.env];
  if (cache.has(provider)) return cache.get(provider);
  let v = null;
  if (process.platform === 'darwin') {
    const r = spawnSync('security', ['find-generic-password', '-s', k.service, '-w'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) v = r.stdout.trim();
  }
  cache.set(provider, v);
  return v;
}
