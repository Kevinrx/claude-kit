#!/usr/bin/env node
// Proves a new/changed test is load-bearing: it must PASS on HEAD and FAIL when the
// implementation it covers is reverted to the base branch. The files are restored
// afterwards — also on Ctrl-C/SIGTERM.
//
// Usage: node red-proof.mjs --test-cmd "<command>" [--base <ref>] <impl-file>...
//        (paths are relative to the current directory; on Windows the command runs in cmd.exe,
//        so quote with double quotes)
// Exit:  0 RED-PROOF OK   test passes on HEAD and fails without the implementation
//        1 NOT RED        test still passes without it (not load-bearing)
//        2 refused        dirty working tree, untracked/unknown file, or bad usage
//        3 error          base didn't resolve, test not green on HEAD, test didn't run,
//                         or reverting/restoring failed (not a verdict)
import { execFileSync, spawn } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';

const argv = process.argv.slice(2);
let testCmd = '';
let base = process.env.BASE_REF || '';
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--test-cmd') testCmd = argv[++i] ?? '';
  else if (argv[i] === '--base') base = argv[++i] ?? '';
  else files.push(argv[i].replace(/\\/g, '/'));
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
// Every argument must be one tracked file, or it couldn't be put back afterwards.
// repoPath: its name from the repo root, for looking it up at the base commit.
const repoPath = new Map();
for (const file of files) {
  if (statSync(file, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Refusing to run: ${file} is a directory — list the implementation files.`);
    process.exit(2);
  }
  const name = tryGit('ls-files', '--full-name', '--error-unmatch', '--', file);
  if (!name || name.includes('\n')) {
    console.error(`Refusing to run: ${file} is not tracked at HEAD (typo, or not committed yet).`);
    process.exit(2);
  }
  repoPath.set(file, name);
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

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  const failed = files.filter((file) => tryGit('checkout', 'HEAD', '--', file) === null);
  if (failed.length) {
    console.error(`RESTORE FAILED — run: git checkout HEAD -- ${failed.join(' ')}`);
    process.exitCode = 3;
  }
}

let child;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    child?.kill(signal);
    restore();
    process.exit(3);
  });
}

const runTest = () => new Promise((resolve) => {
  child = spawn(testCmd, { shell: true, stdio: 'inherit' });
  child.on('error', (error) => resolve({ error }));
  child.on('exit', (code, signal) => resolve({ code, signal }));
});
// 126/127: the shell couldn't run the command; null: killed by a signal. Neither is a verdict.
const didNotRun = (r) => r.error || r.code === null || r.code === 126 || r.code === 127;

const green = await runTest();
if (didNotRun(green) || green.code !== 0) {
  console.error(`The test command isn't green on HEAD (${green.error?.message ?? `exit ${green.code ?? green.signal}`}) — red-proof needs a passing baseline.`);
  process.exit(3);
}

process.on('exit', restore);
try {
  for (const file of files) {
    if (tryGit('cat-file', '-e', `${mergeBase}:${repoPath.get(file)}`) !== null) {
      git('checkout', mergeBase, '--', file);
    } else {
      rmSync(file, { force: true });
      console.log(`${file}: new since base — removed for the test run`);
    }
  }
} catch (err) {
  restore();
  console.error(`Error reverting files to base: ${err.message}`);
  process.exit(3);
}

const red = await runTest();
restore();

if (process.exitCode === 3) process.exit(3);
if (didNotRun(red)) {
  console.error(`The test command didn't run properly without the implementation (${red.error?.message ?? `exit ${red.code ?? red.signal}`}) — not a verdict.`);
  process.exit(3);
}
if (red.code === 0) {
  console.log('NOT RED: the tests pass without the implementation — they are not load-bearing.');
  process.exit(1);
}
console.log('RED-PROOF OK');
process.exit(0);
