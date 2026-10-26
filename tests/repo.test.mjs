// Repository integrity: manifests, the example kept in step with the template,
// no media and no keys in git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARED, TEMPLATE, examples } from '../scripts/sync-example.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

test('the marketplace lists the plugin, and the names agree', () => {
  const m = json('.claude-plugin/marketplace.json');
  assert.ok(m.name && m.owner?.name && m.plugins?.length);
  for (const p of m.plugins) {
    assert.ok(p.source.startsWith('./') && !p.source.includes('..'), 'source is relative to the marketplace root');
    const plugin = json(join(p.source, '.claude-plugin/plugin.json'));
    assert.equal(plugin.name, p.name);
    assert.equal(plugin.version, p.version);
  }
});

test('the skill has frontmatter with its name and a description', () => {
  const skill = readFileSync(join(root, 'plugins/brand-film/skills/brand-film/SKILL.md'), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? '';
  assert.match(fm, /^name: brand-film$/m);
  assert.match(fm, /^description: .{100,}/m);
  for (const ref of skill.match(/references\/[a-z-]+\.md/g) ?? []) {
    assert.ok(existsSync(join(root, 'plugins/brand-film/skills/brand-film', ref)), `${ref} exists`);
  }
});

test('every example runs exactly the template\'s scripts (npm run sync-example)', () => {
  for (const ex of examples()) {
    for (const f of SHARED) {
      assert.equal(readFileSync(join(ex, f), 'utf8'), readFileSync(join(TEMPLATE, f), 'utf8'), `${ex}/${f} differs from the template`);
    }
  }
});

const tracked = () => execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

test('no generated media is committed', () => {
  const media = tracked().filter((f) => /\.(mp3|wav|mp4|mov|webm|m4a)$/i.test(f));
  assert.deepEqual(media, []);
});

test('no API keys are committed', () => {
  for (const f of tracked()) {
    if (/\.(png|jpe?g|svg|ico)$/i.test(f)) continue;
    const text = readFileSync(join(root, f), 'utf8');
    assert.doesNotMatch(text, /\bsk_[0-9a-f]{32,}\b/, `${f} contains what looks like an ElevenLabs key`);
    assert.doesNotMatch(text, /xi-api-key\s*[:=]\s*['"]?\w{20,}/i, f);
  }
});
