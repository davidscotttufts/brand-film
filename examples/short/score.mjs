// Scores the script out of 10 before any credits are spent.
//
//   npm run score            # the checklist, item by item
//   npm run score -- --json  # the same, as JSON
//
// It is a checklist, not a prediction: the opening (voice in the first second,
// a short first sentence), the pace (words per second of each window), sentence
// length, one idea per take, plain words, short caveats, a call to action, and
// facts listed for the source check. Each item says what would raise it.
// npm run narrate prints the total before it voices anything.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreScript } from './lib/script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const nar = JSON.parse(readFileSync(join(here, 'narration.json'), 'utf8'));
const film = JSON.parse(readFileSync(join(here, 'film.json'), 'utf8'));
const r = scoreScript({ takes: nar.takes, facts: film.facts ?? [] });
if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
for (const i of r.items) console.log(`${i.points === i.max ? 'ok  ' : 'miss'}  ${String(i.points).padStart(1)}/${i.max}  ${i.name.padEnd(30)} ${i.note}`);
console.log(`\n[score] ${r.score}/${r.outOf}`);
