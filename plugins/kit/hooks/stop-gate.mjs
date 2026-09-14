// Stop: opt-in per repo. If the repo has a `.claude/gate` shell script and the
// working tree has uncommitted changes, Claude can't end its turn while the
// gate fails. Gives up after MAX_BLOCKS consecutive blocks so it can't loop forever.
//
// Enable in a repo:  printf 'bin/rspec && npx eslint app/javascript\n' > .claude/gate
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, main } from './lib.mjs';

const MAX_BLOCKS = 3;

main((input) => {
  const root = git(input.cwd || process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!root) return;
  const gate = join(root, '.claude', 'gate');
  if (!existsSync(gate)) return;
  if (!git(root, ['status', '--porcelain', '--', '.', ':!.claude/gate'])) return;

  const counterFile = join(tmpdir(), `kit-stop-gate-${String(input.session_id || 'none').replace(/[^\w-]/g, '')}`);
  const blocks = existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) || 0 : 0;

  const run = spawnSync('sh', [gate], { cwd: root, encoding: 'utf8', timeout: 540_000 });
  if (run.error) {
    process.stdout.write(JSON.stringify({ systemMessage: `kit stop-gate: could not run .claude/gate (${run.error.message}).` }));
    return;
  }
  if (run.status === 0) {
    rmSync(counterFile, { force: true });
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
