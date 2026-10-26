// Copies the template's shared scripts into examples/*, so every example runs
// exactly the template's code. Its own scene, narration, brand, music, film and
// sources are left alone. tests/repo.test.mjs fails when they drift.
import { cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED = ['narrate.mjs', 'render.mjs', 'preview.mjs', 'tokens.mjs', 'lint.mjs', 'doctor.mjs', 'music.mjs', 'sfx.mjs',
  'sfx.json', 'default-tokens.json', 'package.json', '.gitignore', 'lib/lexicon.mjs', 'lib/verify.mjs', 'lib/elevenlabs.mjs', 'lib/audiocheck.mjs'];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE = join(root, 'plugins/brand-film/skills/brand-film/template');
export const examples = () => readdirSync(join(root, 'examples'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(root, 'examples', d.name));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const ex of examples()) {
    for (const f of SHARED) cpSync(join(TEMPLATE, f), join(ex, f));
    console.log(`synced ${ex}`);
  }
}
