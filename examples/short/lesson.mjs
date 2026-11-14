// Adds a note to the brand's house style, so the next film starts from it.
//
//   npm run lesson -- script  "Say what is on screen in the second line."
//   npm run lesson -- picture "Hold the end card two seconds after the last word."
//   npm run lesson -- sound   "Music 2 dB lower under the narrator."
//   npm run lesson -- never   "game-changer"            # npm run lint then fails on it
//   npm run lesson                                       # print the house style
//
// The file is house-style.md, or the path in brand-tokens.json `brand.houseStyle`
// (a shared file, e.g. ../brand/house-style.md, for every film of one brand).
// See lib/housestyle.mjs for the format.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY, SECTIONS, addLesson, parseHouseStyle } from './lib/housestyle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const own = existsSync(join(here, 'brand-tokens.json')) ? JSON.parse(readFileSync(join(here, 'brand-tokens.json'), 'utf8')) : {};
const file = resolve(here, own.brand?.houseStyle ?? 'house-style.md');
const md = existsSync(file) ? readFileSync(file, 'utf8') : EMPTY;
const [section, ...rest] = process.argv.slice(2);

if (!section) {
  const hs = parseHouseStyle(md);
  console.log(`house style: ${file}`);
  for (const [k, title] of Object.entries(SECTIONS)) {
    console.log(`\n${title}${hs[k].length ? '' : ' (none yet)'}`);
    for (const n of hs[k]) console.log(`  - ${n}`);
  }
  process.exit(0);
}
try {
  writeFileSync(file, addLesson(md, section, rest.join(' ')));
} catch (e) {
  console.error(`[lesson] ${e.message}\nusage: npm run lesson -- <${Object.keys(SECTIONS).join('|')}> "<note>"`);
  process.exit(1);
}
console.log(`[lesson] added to ${SECTIONS[section]} in ${file}`);
