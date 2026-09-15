import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';

test('setup --dry-run reports what it would change and touches nothing', () => {
  const home = tempDir();
  const claudeDir = join(home, '.claude');
  mkdirSync(claudeDir);
  const settings = JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } }, null, 2);
  const claudeMd = '<!-- OMC:START -->\nomc rules\n<!-- OMC:END -->\n\nmy notes\n';
  writeFileSync(join(claudeDir, 'settings.json'), settings);
  writeFileSync(join(claudeDir, 'CLAUDE.md'), claudeMd);

  const r = spawnSync(process.execPath, [join(ROOT, 'setup', 'setup.mjs'), '--dry-run', '--skip-plugins'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\] would update ~\/\.claude\/CLAUDE\.md/);
  assert.match(r.stdout, /\[dry-run\] would update settings\.json merged/);
  assert.match(r.stdout, /oh-my-claudecode block/);
  assert.equal(readFileSync(join(claudeDir, 'settings.json'), 'utf8'), settings);
  assert.equal(readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf8'), claudeMd);
});

test('setup disables superpowers and leaves other plugins alone', () => {
  const home = tempDir();
  const claudeDir = join(home, '.claude');
  mkdirSync(claudeDir);
  const enabledPlugins = {
    'superpowers@superpowers-marketplace': true,
    'superpowers@claude-plugins-official': false,
    'context7@claude-plugins-official': true,
  };
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ enabledPlugins }));

  const r = spawnSync(process.execPath, [join(ROOT, 'setup', 'setup.mjs'), '--skip-plugins'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /disabling superpowers@superpowers-marketplace/);
  assert.doesNotMatch(r.stdout, /disabling superpowers@claude-plugins-official/);
  const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'));
  assert.deepEqual(settings.enabledPlugins, {
    'superpowers@superpowers-marketplace': false,
    'superpowers@claude-plugins-official': false,
    'context7@claude-plugins-official': true,
  });
});
