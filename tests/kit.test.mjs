// Structure and docs consistency: catches drift between the plugin's files and what the docs claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const PLUGIN = join(ROOT, 'plugins', 'kit');
const read = (...p) => readFileSync(join(...p), 'utf8');

// Minimal frontmatter reader: top-level `key: value` lines only (enough for our files).
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'missing frontmatter');
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const skills = readdirSync(join(PLUGIN, 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const text = read(PLUGIN, 'skills', d.name, 'SKILL.md');
    return { dir: d.name, text, fm: frontmatter(text) };
  });
const agents = readdirSync(join(PLUGIN, 'agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ file: f.replace(/\.md$/, ''), fm: frontmatter(read(PLUGIN, 'agents', f)) }));

test('skills have valid frontmatter and stay small', () => {
  assert.ok(skills.length > 0);
  for (const { dir, text, fm } of skills) {
    assert.equal(fm.name, dir, `${dir}: name must match its directory`);
    assert.ok(fm.description, `${dir}: description required`);
    assert.ok(fm.description.length + (fm.when_to_use ?? '').length <= 1536, `${dir}: description over 1536 chars`);
    assert.ok(text.split('\n').length < 500, `${dir}: SKILL.md must stay under 500 lines`);
  }
});

test('agents have name, description and model', () => {
  assert.ok(agents.length > 0);
  for (const { file, fm } of agents) {
    assert.equal(fm.name, file, `${file}: name must match the file name`);
    assert.ok(fm.description, `${file}: description required`);
    assert.ok(fm.model, `${file}: model required`);
  }
});

test('every hook script referenced in hooks.json exists', () => {
  const { hooks } = JSON.parse(read(PLUGIN, 'hooks', 'hooks.json'));
  const paths = Object.values(hooks).flat().flatMap((m) => m.hooks).flatMap((h) => h.args ?? []);
  assert.ok(paths.length > 0);
  for (const p of paths) {
    const resolved = p.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN);
    assert.ok(existsSync(resolved), `missing hook script: ${p}`);
  }
});

test('README and global CLAUDE.md list every command and agent', () => {
  const readme = read(ROOT, 'README.md');
  const globalLines = read(ROOT, 'global', 'CLAUDE.md').split('\n');
  const commandsLine = globalLines[globalLines.findIndex((l) => /^## Kit commands/.test(l)) + 1] ?? '';
  // Stack skills are reference skills that load by path; they aren't commands.
  const commands = skills.filter(({ dir, fm }) => !dir.startsWith('stack-') && fm['user-invocable'] !== 'false');
  for (const { dir } of commands) {
    assert.ok(readme.includes(`/kit:${dir}`), `README.md doesn't mention /kit:${dir}`);
    assert.ok(commandsLine.includes(`/kit:${dir}`), `global/CLAUDE.md "Kit commands" line doesn't mention /kit:${dir}`);
  }
  for (const { file } of agents) assert.ok(readme.includes(`kit:${file}`), `README.md doesn't mention kit:${file}`);
});

test('plugin.json has no version (updates follow the git commit)', () => {
  const manifest = JSON.parse(read(PLUGIN, '.claude-plugin', 'plugin.json'));
  assert.equal(manifest.version, undefined);
});
