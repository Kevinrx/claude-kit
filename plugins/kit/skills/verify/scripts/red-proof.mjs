#!/usr/bin/env node
// Proves a new/changed test is load-bearing: it must FAIL when the implementation
// it covers is reverted to the base branch.
//
// Usage: node red-proof.mjs --test-cmd "<command>" [--base <ref>] <impl-file>...
// Exit:  0 RED-PROOF OK   test fails without the implementation
//        1 NOT RED        test still passes without it (not load-bearing)
//        2 refused        dirty working tree or bad usage
//        3 error          base ref didn't resolve or revert failed (not a verdict)
import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const argv = process.argv.slice(2);
let testCmd = '';
let base = process.env.BASE_REF || '';
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--test-cmd') testCmd = argv[++i] ?? '';
  else if (argv[i] === '--base') base = argv[++i] ?? '';
  else files.push(argv[i]);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

if (!testCmd || !files.length) {
  console.error('Usage: node red-proof.mjs --test-cmd "<command>" [--base <ref>] <impl-file>...');
  process.exit(2);
}
if (tryGit('status', '--porcelain')) {
  console.error('Refusing to run: working tree is dirty. Commit or stash first.');
  process.exit(2);
}
if (!base) {
  base = tryGit('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
    || ['origin/main', 'origin/master', 'main', 'master'].find((ref) => tryGit('rev-parse', '--verify', '--quiet', ref) !== null)
    || '';
}
const mergeBase = base ? tryGit('merge-base', 'HEAD', base) : null;
if (!mergeBase) {
  console.error(`Cannot resolve base (${base || 'none found'}) — pass --base <ref>.`);
  process.exit(3);
}

const restore = () => tryGit('checkout', 'HEAD', '--', ...files);
let result;
try {
  for (const file of files) {
    if (tryGit('cat-file', '-e', `${mergeBase}:${file}`) !== null) {
      git('checkout', mergeBase, '--', file);
    } else {
      rmSync(file, { force: true });
      console.log(`${file}: new since base — removed for the test run`);
    }
  }
  result = spawnSync(testCmd, { shell: true, stdio: 'inherit' });
} catch (err) {
  restore();
  console.error(`Error reverting files to base: ${err.message}`);
  process.exit(3);
}
restore();

if (result.error) {
  console.error(`Could not run test command: ${result.error.message}`);
  process.exit(3);
}
if (result.status === 0) {
  console.log('NOT RED: the tests pass without the implementation — they are not load-bearing.');
  process.exit(1);
}
console.log('RED-PROOF OK');
process.exit(0);
