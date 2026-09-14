// Shared helpers for kit hooks. Hooks must never break a session: every
// hook runs through main(), which swallows errors and exits 0 (non-blocking).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// PreToolUse decision: 'deny' blocks with a reason shown to Claude,
// 'ask' hands the call to the user's permission prompt.
export function preToolDecision(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

export function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function main(fn) {
  try {
    fn(readInput());
  } catch (err) {
    process.stderr.write(`kit hook error: ${err.message}\n`);
  }
  process.exit(0);
}
