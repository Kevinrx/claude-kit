import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, runHook, tempDir } from './helpers.mjs';

test('stop-gate blocks while the gate fails on a dirty tree, then gives up', () => {
  const dir = gitRepo();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'gate'), 'echo "2 examples, 1 failure"\nexit 1\n');
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  const payload = { hook_event_name: 'Stop', session_id: `test-${Date.now()}`, cwd: dir };
  for (let i = 0; i < 3; i++) {
    const r = runHook('stop-gate.mjs', payload);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /1 failure/);
  }
  const last = runHook('stop-gate.mjs', payload);
  assert.equal(last.code, 0);
  assert.match(last.json?.systemMessage ?? '', /still failing/);
});

test('stop-gate allows stopping when the gate passes or the tree is clean', () => {
  const dir = gitRepo();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'gate'), 'exit 1\n');
  assert.equal(runHook('stop-gate.mjs', { session_id: `c-${Date.now()}`, cwd: dir }).code, 0, 'clean tree');
  writeFileSync(join(dir, '.claude', 'gate'), 'exit 0\n');
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  assert.equal(runHook('stop-gate.mjs', { session_id: `p-${Date.now()}`, cwd: dir }).code, 0, 'green gate');
  assert.equal(runHook('stop-gate.mjs', { session_id: 'x', cwd: tempDir() }).code, 0, 'not a repo');
});

test('stop-gate does not re-run a passing gate until the tree changes', () => {
  const dir = gitRepo();
  const counter = join(tempDir(), 'runs.txt').replace(/\\/g, '/');
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'gate'), `echo run >> "${counter}"\nexit 0\n`);
  const stop = () => runHook('stop-gate.mjs', { session_id: `k-${Date.now()}`, cwd: dir }).code;
  const runs = () => (existsSync(counter) ? readFileSync(counter, 'utf8').trim().split('\n').length : 0);

  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  assert.equal(stop(), 0);
  assert.equal(stop(), 0);
  assert.equal(runs(), 1, 'unchanged tree: gate not re-run');
  writeFileSync(join(dir, 'a.txt'), 'changed again\n');
  stop();
  assert.equal(runs(), 2, 'tracked edit re-runs the gate');
  writeFileSync(join(dir, 'new.txt'), 'untracked\n');
  stop();
  assert.equal(runs(), 3, 'new untracked file re-runs the gate');
  writeFileSync(join(dir, 'new.txt'), 'untracked, edited\n');
  stop();
  assert.equal(runs(), 4, 'edit to an untracked file re-runs the gate');
  writeFileSync(join(dir, '.claude', 'gate'), `echo run >> "${counter}"\ntrue\nexit 0\n`);
  stop();
  assert.equal(runs(), 5, 'editing the gate itself re-runs it');
});
