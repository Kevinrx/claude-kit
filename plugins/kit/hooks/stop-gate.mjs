// Stop: opt-in per repo. If the repo has a `.claude/gate` shell script and the
// working tree has uncommitted changes, Claude can't end its turn while the
// gate fails. Gives up after MAX_BLOCKS consecutive blocks so it can't loop forever.
// A tree state that already passed isn't re-run (keyed on every tracked and untracked byte
// plus the gate file; ignored files and submodule contents aren't part of the key).
//
// Enable in a repo:  printf 'bin/rspec && npx eslint app/javascript\n' > .claude/gate
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { git, main } from './lib.mjs';

const MAX_BLOCKS = 3;
const sha1 = (...parts) => parts.reduce((h, p) => h.update(p), createHash('sha1')).digest('hex');

// Hash of the working tree as it would be committed (tracked + untracked, minus ignored),
// built in a throwaway copy of the index so the real one is never touched.
function treeKey(root, gate) {
  const tmpIndex = join(tmpdir(), `kit-stop-gate-index-${process.pid}`);
  try {
    const indexPath = git(root, ['rev-parse', '--git-path', 'index']);
    const realIndex = indexPath && (isAbsolute(indexPath) ? indexPath : join(root, indexPath));
    if (realIndex && existsSync(realIndex)) copyFileSync(realIndex, tmpIndex);
    const env = { GIT_INDEX_FILE: tmpIndex };
    if (git(root, ['add', '-A'], env) === null) return null;
    const tree = git(root, ['write-tree'], env);
    return tree ? sha1(tree, readFileSync(gate)) : null;
  } finally {
    rmSync(tmpIndex, { force: true });
  }
}

// `sh` is on PATH on macOS/Linux and usually in Git Bash on Windows; fall back to Git's bash.
function runGate(gate, root) {
  const options = { cwd: root, encoding: 'utf8', timeout: 540_000 };
  const run = spawnSync('sh', [gate], options);
  if (run.error?.code !== 'ENOENT' || process.platform !== 'win32') return run;
  const bash = [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Program Files\\Git\\bin\\bash.exe'].find((p) => p && existsSync(p));
  return bash ? spawnSync(bash, [gate], options) : run;
}

main((input) => {
  const root = git(input.cwd || process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!root) return;
  const gate = join(root, '.claude', 'gate');
  if (!existsSync(gate)) return;
  if (!git(root, ['status', '--porcelain', '--', '.', ':!.claude/gate'])) return;

  const passFile = join(tmpdir(), `kit-stop-gate-pass-${sha1(root)}`);
  const key = treeKey(root, gate);
  if (key && existsSync(passFile) && readFileSync(passFile, 'utf8') === key) return;

  const counterFile = join(tmpdir(), `kit-stop-gate-${String(input.session_id || 'none').replace(/[^\w-]/g, '')}`);
  const blocks = existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) || 0 : 0;

  const run = runGate(gate, root);
  if (run.error) {
    process.stdout.write(JSON.stringify({ systemMessage: `kit stop-gate: could not run .claude/gate (${run.error.message}).` }));
    return;
  }
  if (run.status === 0) {
    rmSync(counterFile, { force: true });
    if (key) writeFileSync(passFile, key);
    return;
  }
  if (blocks >= MAX_BLOCKS) {
    rmSync(counterFile, { force: true });
    process.stdout.write(JSON.stringify({ systemMessage: `kit stop-gate: .claude/gate still failing after ${MAX_BLOCKS} attempts — letting Claude stop. Check it yourself.` }));
    return;
  }
  writeFileSync(counterFile, String(blocks + 1));
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n');
  process.stderr.write(
    `kit stop-gate: .claude/gate exited ${run.status} (block ${blocks + 1}/${MAX_BLOCKS}). ` +
    'Fix the failure before finishing. If it was already failing before your changes, prove it ' +
    '(run the gate on a clean checkout or with your changes stashed) and say so.\n\n' +
    `${output}\n`,
  );
  process.exit(2);
});
