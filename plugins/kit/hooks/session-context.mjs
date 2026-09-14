// SessionStart: add a few lines of context — git state, detected stack (so the
// right kit:stack-* skills get loaded), stop gate status and unfinished plans.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, main } from './lib.mjs';

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function detectStacks(root) {
  const stacks = [];
  const gemfile = existsSync(join(root, 'Gemfile')) ? readFileSync(join(root, 'Gemfile'), 'utf8') : '';
  const rails = /^\s*gem\s+['"]rails['"]/m.test(gemfile);
  if (rails) stacks.push(['rails', 'Rails']);
  const pkg = readJson(join(root, 'package.json'));
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  const ts = 'typescript' in deps || existsSync(join(root, 'tsconfig.json'));
  const react = 'react' in deps;
  if (react) stacks.push(['react', ts ? 'React' : 'React (JavaScript)']);
  if (ts) stacks.push(['typescript', 'TypeScript']);
  const server = ['express', 'fastify', 'koa', 'hono', '@nestjs/core', '@hapi/hapi', 'next'].some((d) => d in deps);
  if (pkg && !rails && (server || !react)) stacks.push(['node', 'Node.js']);
  return stacks;
}

function activePlans(root) {
  const dir = join(root, 'docs', 'plans');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'PLAN.md')))
    .filter((d) => {
      const progress = join(dir, d.name, 'PROGRESS.md');
      return !existsSync(progress) || !/^status:\s*done\b/im.test(readFileSync(progress, 'utf8'));
    })
    .map((d) => `docs/plans/${d.name}`);
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

  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
});
