// Shared helpers for the hook tests.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HOOKS = join(ROOT, 'plugins', 'kit', 'hooks');

export function runHook(name, payload, env = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, name)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json, decision: json?.hookSpecificOutput?.permissionDecision ?? null };
}

export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'kit-test-'));
}

export function gitRepo() {
  const dir = tempDir();
  const g = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'ignore' });
  g('init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  return dir;
}
