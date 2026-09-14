import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT, tempDir } from './helpers.mjs';

const SCRIPT = join(ROOT, 'plugins', 'kit', 'skills', 'verify', 'scripts', 'red-proof.mjs');

// Code lives in pkg/ (monorepo-style). Base commit: buggy add(). HEAD: fixed add(),
// a new helper, and tests for both.
function repo() {
  const dir = tempDir();
  const pkg = join(dir, 'pkg');
  mkdirSync(pkg);
  const g = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q');
  writeFileSync(join(pkg, 'lib.mjs'), 'export const add = (a, b) => a - b;\n');
  g('add', '.');
  g('commit', '-qm', 'base');
  const base = g('rev-parse', 'HEAD');
  writeFileSync(join(pkg, 'lib.mjs'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(join(pkg, 'helper.mjs'), 'export const two = 2;\n');
  writeFileSync(join(pkg, 'check.mjs'), "import { add } from './lib.mjs';\nprocess.exit(add(2, 2) === 4 ? 0 : 1);\n");
  writeFileSync(join(pkg, 'check-helper.mjs'), "const { two } = await import('./helper.mjs');\nprocess.exit(two === 2 ? 0 : 1);\n");
  g('add', '.');
  g('commit', '-qm', 'fix');
  return { dir, pkg, base, status: () => g('status', '--porcelain') };
}

const redProof = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

test('red-proof: a load-bearing test is RED without the implementation', () => {
  const { dir, base, status } = repo();
  const r = redProof(dir, '--base', base, '--test-cmd', 'node pkg/check.mjs', 'pkg/lib.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /RED-PROOF OK/);
  assert.equal(status(), '', 'files restored');
});

test('red-proof: works from a subdirectory and with Windows-style paths', () => {
  const { dir, pkg, base, status } = repo();
  const fromSub = redProof(pkg, '--base', base, '--test-cmd', 'node check.mjs', 'lib.mjs');
  assert.equal(fromSub.status, 0, fromSub.stdout + fromSub.stderr);
  assert.doesNotMatch(fromSub.stdout, /new since base/, 'lib.mjs existed at base');
  const backslash = redProof(dir, '--base', base, '--test-cmd', 'node pkg/check.mjs', 'pkg\\lib.mjs');
  assert.equal(backslash.status, 0, backslash.stdout + backslash.stderr);
  assert.doesNotMatch(backslash.stdout, /new since base/);
  const absolute = redProof(dir, '--base', base, '--test-cmd', 'node pkg/check.mjs', join(pkg, 'lib.mjs'));
  assert.equal(absolute.status, 0, absolute.stdout + absolute.stderr);
  assert.doesNotMatch(absolute.stdout, /new since base/, 'absolute path resolved at base');
  assert.equal(status(), '');
});

test('red-proof: refuses a directory argument', () => {
  const { dir, base, status } = repo();
  const r = redProof(dir, '--base', base, '--test-cmd', 'node pkg/check.mjs', 'pkg');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /directory/);
  assert.equal(status(), '');
});

test('red-proof: files that are new since base are removed, then restored', () => {
  const { dir, pkg, base, status } = repo();
  const r = redProof(dir, '--base', base, '--test-cmd', 'node pkg/check-helper.mjs', 'pkg/helper.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /new since base/);
  assert.ok(existsSync(join(pkg, 'helper.mjs')));
  assert.equal(status(), '');
});

test('red-proof: a test that passes anyway is NOT RED', () => {
  const { dir, base, status } = repo();
  const r = redProof(dir, '--base', base, '--test-cmd', 'node -e "process.exit(0)"', 'pkg/lib.mjs');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NOT RED/);
  assert.equal(status(), '');
});

test('red-proof: a test that is not green on HEAD, or does not exist, is an error, not a verdict', () => {
  const { dir, base, status } = repo();
  assert.equal(redProof(dir, '--base', base, '--test-cmd', 'node -e "process.exit(1)"', 'pkg/lib.mjs').status, 3);
  assert.equal(redProof(dir, '--base', base, '--test-cmd', 'no-such-command-xyz', 'pkg/lib.mjs').status, 3);
  assert.equal(status(), '');
});

test('red-proof: refuses unknown files, a dirty tree and bad usage; reports an unresolvable base', () => {
  const { dir, pkg, base, status } = repo();
  const typo = redProof(dir, '--base', base, '--test-cmd', 'node pkg/check.mjs', 'pkg/lib.mjs', 'pkg/nope.mjs');
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /pkg\/nope\.mjs/);
  assert.equal(status(), '', 'nothing reverted');
  assert.match(readFileSync(join(pkg, 'lib.mjs'), 'utf8'), /a \+ b/);
  assert.equal(redProof(dir, '--base', 'no-such-ref', '--test-cmd', 'node pkg/check.mjs', 'pkg/lib.mjs').status, 3);
  assert.equal(redProof(dir, '--test-cmd', 'node pkg/check.mjs').status, 2, 'no files');
  writeFileSync(join(pkg, 'lib.mjs'), 'dirty\n');
  assert.equal(redProof(dir, '--base', base, '--test-cmd', 'node pkg/check.mjs', 'pkg/lib.mjs').status, 2);
});

test('red-proof: restores the files when killed mid-run', { skip: process.platform === 'win32' && 'POSIX signals only' }, async () => {
  const { dir, base, status } = repo();
  // Green on HEAD (no marker yet), then the red run creates the marker and hangs.
  const cmd = 'if [ -f pkg/.go ]; then touch started && sleep 30; else touch pkg/.go; fi';
  writeFileSync(join(dir, '.git', 'info', 'exclude'), 'pkg/.go\nstarted\n');
  const child = spawn(process.execPath, [SCRIPT, '--base', base, '--test-cmd', cmd, 'pkg/lib.mjs'], { cwd: dir, stdio: 'ignore' });
  for (let i = 0; i < 200 && !existsSync(join(dir, 'started')); i++) await sleep(50);
  assert.ok(existsSync(join(dir, 'started')), 'red run started');
  const exited = new Promise((resolve) => child.on('exit', resolve));
  child.kill('SIGTERM');
  await exited;
  assert.equal(status(), '', 'lib.mjs is restored');
});
