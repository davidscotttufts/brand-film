// The one way this folder talks to ElevenLabs: the official CLI
// (`npm i -g @elevenlabs/cli`). The key is never written anywhere by these
// scripts. The CLI finds it in this order: ELEVENLABS_API_KEY in the
// environment, then its own sign-in (`elevenlabs auth login`). On macOS a key
// kept in the login Keychain is also used when neither is set:
//
//   security add-generic-password -a "$USER" -s elevenlabs-api-key -w   # paste the key at the prompt
import { execFileSync, spawnSync } from 'node:child_process';

let env = process.env;
if (!env.ELEVENLABS_API_KEY && process.platform === 'darwin') {
  const r = spawnSync('security', ['find-generic-password', '-s', 'elevenlabs-api-key', '-w'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) env = { ...process.env, ELEVENLABS_API_KEY: r.stdout.trim() };
}

/** True when the CLI is installed. */
export function hasCli() {
  return spawnSync('elevenlabs', ['--version'], { encoding: 'utf8', env }).status === 0;
}

/** Run the CLI and return stdout. Throws with the CLI's own message on failure. */
export function el(args) {
  try {
    return execFileSync('elevenlabs', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch (err) {
    const msg = String(err.stderr || err.message).trim().split('\n').slice(-3).join('\n');
    throw new Error(`elevenlabs ${args.slice(0, 2).join(' ')} failed: ${msg}\n(signed in? run: elevenlabs auth login, or set ELEVENLABS_API_KEY)`);
  }
}

/** Run the CLI and parse JSON output. */
export const elJson = (args) => JSON.parse(el([...args, '--format', 'json']));

/** The account's plan and remaining characters, or null when it can't be read. */
export function account() {
  try {
    const u = elJson(['user', 'get']);
    const s = u.subscription ?? u;
    return {
      tier: s.tier ?? null,
      used: s.character_count ?? null,
      limit: s.character_limit ?? null,
      remaining: s.character_limit != null && s.character_count != null ? s.character_limit - s.character_count : null,
    };
  } catch {
    return null;
  }
}
