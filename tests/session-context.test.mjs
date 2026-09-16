import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, runHook, tempDir } from './helpers.mjs';

const context = (dir, extra = {}) => runHook('session-context.mjs', { hook_event_name: 'SessionStart', cwd: dir, ...extra }, { CLAUDE_PROJECT_DIR: dir });

function planRepo() {
  const dir = gitRepo();
  writeFileSync(join(dir, 'Gemfile'), "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\n");
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'gate'), 'exit 0\n');
  mkdirSync(join(dir, '.claude', 'kit-plans', 'discounts'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'kit-plans', 'discounts', 'PLAN.md'), '# Discounts\n');
  writeFileSync(join(dir, '.claude', 'kit-plans', 'discounts', 'PROGRESS.md'), 'status: in progress\n## Log\n- step 1 — done — bin/rspec green\n');
  mkdirSync(join(dir, '.claude', 'kit-plans', 'old'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'kit-plans', 'old', 'PLAN.md'), '# Old\n');
  writeFileSync(join(dir, '.claude', 'kit-plans', 'old', 'PROGRESS.md'), 'status: done\n');
  return dir;
}

test('session-context reports stack, gate and unfinished plans', () => {
  const r = context(planRepo());
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Git: \S+ — /);
  assert.match(r.stdout, /Rails, React \(JavaScript\)/);
  assert.match(r.stdout, /Load kit:stack-rails, kit:stack-react before/);
  assert.doesNotMatch(r.stdout, /stack-node/);
  assert.match(r.stdout, /Stop gate active/);
  assert.match(r.stdout, /\.claude\/kit-plans\/discounts/);
  assert.doesNotMatch(r.stdout, /\.claude\/kit-plans\/old/);
  assert.doesNotMatch(r.stdout, /step 1 — done/, 'progress tail only after compaction');
});

test('session-context repeats plan progress after compaction', () => {
  const r = context(planRepo(), { source: 'compact' });
  assert.match(r.stdout, /\.claude\/kit-plans\/discounts\/PROGRESS\.md \(last lines\)/);
  assert.match(r.stdout, /step 1 — done — bin\/rspec green/);
});

test('session-context warns when ~/.claude/CLAUDE.md has no claude-kit import', () => {
  const home = tempDir();
  const dir = gitRepo();
  const r = runHook('session-context.mjs', { hook_event_name: 'SessionStart', cwd: dir }, { CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home });
  assert.match(r.stdout, /~\/\.claude\/CLAUDE\.md not found — claude-kit's global rules aren't loaded/);
  assert.match(r.stdout, /node setup\/setup\.mjs/);
});

test('session-context warns when the claude-kit import path is broken', () => {
  const home = tempDir();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '<!-- claude-kit:start -->\n@/nonexistent/global/CLAUDE.md\n<!-- claude-kit:end -->\n');
  const dir = gitRepo();
  const r = runHook('session-context.mjs', { hook_event_name: 'SessionStart', cwd: dir }, { CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home });
  assert.match(r.stdout, /imports \/nonexistent\/global\/CLAUDE\.md, which doesn't exist/);
});

test('session-context stays quiet when the claude-kit import resolves', () => {
  const home = tempDir();
  mkdirSync(join(home, '.claude'), { recursive: true });
  const target = join(home, 'global-claude.md');
  writeFileSync(target, '# rules\n');
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), `<!-- claude-kit:start -->\n@${target.replace(/\\/g, '/')}\n<!-- claude-kit:end -->\n`);
  const dir = gitRepo();
  const r = runHook('session-context.mjs', { hook_event_name: 'SessionStart', cwd: dir }, { CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home });
  assert.doesNotMatch(r.stdout, /claude-kit/);
});

test('session-context detects stacks in monorepo subdirectories, once per stack', () => {
  const dir = gitRepo();
  mkdirSync(join(dir, 'frontend'));
  writeFileSync(join(dir, 'frontend', 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  assert.match(context(dir).stdout, /React \(JavaScript\) \(frontend\/\)\. Load kit:stack-react before/);

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const out = context(dir).stdout;
  assert.equal(out.match(/kit:stack-react/g).length, 1);
  assert.doesNotMatch(out, /frontend\//);
});
