// SessionStart: add a few lines of context — git state, detected stack (so the
// right kit:stack-* skills get loaded), stop gate status and unfinished plans.
// After a compaction it also repeats where each unfinished plan stands.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, main } from './lib.mjs';

const MAX_SUBDIRS = 20;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function stacksIn(dir) {
  const stacks = [];
  const gemfile = existsSync(join(dir, 'Gemfile')) ? readFileSync(join(dir, 'Gemfile'), 'utf8') : '';
  const rails = /^\s*gem\s+['"]rails['"]/m.test(gemfile);
  if (rails) stacks.push(['rails', 'Rails']);
  const pkg = readJson(join(dir, 'package.json'));
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  const ts = 'typescript' in deps || existsSync(join(dir, 'tsconfig.json'));
  const react = 'react' in deps;
  if (react) stacks.push(['react', ts ? 'React' : 'React (JavaScript)']);
  if (ts) stacks.push(['typescript', 'TypeScript']);
  const server = ['express', 'fastify', 'koa', 'hono', '@nestjs/core', '@hapi/hapi', 'next'].some((d) => d in deps);
  if (pkg && !rails && (server || !react)) stacks.push(['node', 'Node.js']);
  return stacks;
}

// The repo root plus immediate subdirectories with their own manifest (monorepos: frontend/, api/…).
function detectStacks(root) {
  const found = new Map();
  const add = (stacks, where) => {
    for (const [id, label] of stacks) if (!found.has(id)) found.set(id, where ? `${label} (${where}/)` : label);
  };
  add(stacksIn(root));
  const subdirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !['node_modules', 'vendor'].includes(d.name))
    .filter((d) => existsSync(join(root, d.name, 'package.json')) || existsSync(join(root, d.name, 'Gemfile')))
    .slice(0, MAX_SUBDIRS);
  for (const d of subdirs) add(stacksIn(join(root, d.name)), d.name);
  return [...found];
}

function activePlans(root) {
  const dir = join(root, '.claude', 'plans');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'PLAN.md')))
    .filter((d) => {
      const progress = join(dir, d.name, 'PROGRESS.md');
      return !existsSync(progress) || !/^status:\s*done\b/im.test(readFileSync(progress, 'utf8'));
    })
    .map((d) => `.claude/plans/${d.name}`);
}

function progressTail(root, plan) {
  const file = join(root, plan, 'PROGRESS.md');
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  return [`${plan}/PROGRESS.md (last lines):`, ...lines.slice(-15).map((l) => `  ${l}`)];
}

main((input) => {
  const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const root = git(cwd, ['rev-parse', '--show-toplevel']) ?? cwd;
  const lines = [];

  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch) {
    const files = (git(cwd, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean);
    const untracked = files.filter((l) => l.startsWith('??')).length;
    const counts = git(cwd, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [];
    const sync = counts ? `ahead ${ahead}, behind ${behind}` : 'no upstream';
    lines.push(`Git: ${branch} — ${files.length - untracked} changed, ${untracked} untracked, ${sync}.`);
    const log = git(cwd, ['log', '--oneline', '-3']);
    if (log) lines.push(...log.split('\n').map((l) => `  ${l}`));
  }

  const stacks = detectStacks(root);
  if (stacks.length) {
    lines.push(`Stack: ${stacks.map(([, label]) => label).join(', ')}. Load ${stacks.map(([id]) => `kit:stack-${id}`).join(', ')} before writing or reviewing code.`);
  }
  if (existsSync(join(root, '.claude', 'gate'))) {
    lines.push('Stop gate active: .claude/gate must pass before you finish with uncommitted changes.');
  }
  const plans = activePlans(root);
  if (plans.length) lines.push(`Unfinished plans: ${plans.join(', ')} — resume with /kit:implement <slug>.`);
  if (input.source === 'compact') for (const plan of plans.slice(0, 2)) lines.push(...progressTail(root, plan));

  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
});
