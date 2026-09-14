#!/usr/bin/env node
// Sets up claude-kit on this machine. Safe to re-run (after a `git pull`, for example).
//   1. ~/.claude/CLAUDE.md imports global/CLAUDE.md from this repo, so edits here apply everywhere
//   2. merges global/settings.json into ~/.claude/settings.json
//   3. adds this repo as a plugin marketplace and installs `kit` plus the recommended plugins
// Everything it overwrites is backed up to ~/.claude/backups/claude-kit-<timestamp>/ first.
//
// Usage: node setup/setup.mjs [--dry-run] [--disable-omc] [--skip-plugins]
//   --disable-omc   disable oh-my-claudecode, remove its CLAUDE.md block and its status line
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const DISABLE_OMC = args.has('--disable-omc');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = homedir();
const CLAUDE_DIR = join(HOME, '.claude');
const MARKETPLACE = 'claude-kit';
const RECOMMENDED = [
  'context7@claude-plugins-official',
  'typescript-lsp@claude-plugins-official',
  'ruby-lsp@claude-plugins-official',
  'frontend-design@claude-plugins-official',
  'code-review@claude-plugins-official',
];
const BACKUP_DIR = join(CLAUDE_DIR, 'backups', `claude-kit-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
const IS_WINDOWS = process.platform === 'win32';

const log = (msg) => console.log(msg);

function write(file, content, label) {
  if (DRY) return log(`[dry-run] would update ${label}`);
  if (existsSync(file)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    copyFileSync(file, join(BACKUP_DIR, basename(file)));
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  log(`✓ ${label}`);
}

// 1. ~/.claude/CLAUDE.md → @import of global/CLAUDE.md
function importLine() {
  const target = join(REPO, 'global', 'CLAUDE.md');
  const rel = relative(HOME, target);
  const inHome = rel && !rel.startsWith('..') && !isAbsolute(rel);
  return inHome ? `@~/${rel.replace(/\\/g, '/')}` : `@${target.replace(/\\/g, '/')}`;
}

function setupClaudeMd() {
  const file = join(CLAUDE_DIR, 'CLAUDE.md');
  const original = existsSync(file) ? readFileSync(file, 'utf8') : '';
  let rest = original.replace(/<!-- claude-kit:start -->[\s\S]*?<!-- claude-kit:end -->\n*/g, '');
  if (/<!-- OMC:START -->/.test(rest)) {
    if (DISABLE_OMC) rest = rest.replace(/<!-- OMC:START -->[\s\S]*?<!-- OMC:END -->\n*/g, '');
    else log('! ~/.claude/CLAUDE.md still has the oh-my-claudecode block — re-run with --disable-omc to remove it.');
  }
  rest = rest.trim() || '<!-- Machine-specific notes go below this line. -->';
  const next = `<!-- claude-kit:start -->\n${importLine()}\n<!-- claude-kit:end -->\n\n${rest}\n`;
  if (next === original) return log('✓ ~/.claude/CLAUDE.md already up to date');
  write(file, next, `~/.claude/CLAUDE.md → ${importLine().slice(1)}`);
}

// 2. settings.json: deep merge, arrays are unioned
function merge(base, extra) {
  if (Array.isArray(base) && Array.isArray(extra)) return [...new Set([...base, ...extra])];
  if (base && extra && typeof base === 'object' && typeof extra === 'object' && !Array.isArray(base)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(extra)) out[key] = key in base ? merge(base[key], value) : value;
    return out;
  }
  return extra;
}

function setupSettings() {
  const file = join(CLAUDE_DIR, 'settings.json');
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const next = merge(current, JSON.parse(readFileSync(join(REPO, 'global', 'settings.json'), 'utf8')));
  if (DISABLE_OMC) {
    if (next.enabledPlugins?.['oh-my-claudecode@omc']) next.enabledPlugins['oh-my-claudecode@omc'] = false;
    if (/omc-hud/.test(next.statusLine?.command ?? '')) delete next.statusLine;
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return log('✓ settings.json already up to date');
  write(file, `${JSON.stringify(next, null, 2)}\n`, 'settings.json merged');
}

// 3. plugins, through the claude CLI
function claude(...cliArgs) {
  log(`$ claude ${cliArgs.join(' ')}`);
  if (DRY) return true;
  const env = { ...process.env };
  delete env.CLAUDECODE; // allow running from inside a Claude Code session
  const argv = IS_WINDOWS ? cliArgs.map((a) => (/[\s&|<>^]/.test(a) ? `"${a}"` : a)) : cliArgs;
  return spawnSync('claude', argv, { stdio: 'inherit', env, shell: IS_WINDOWS }).status === 0;
}

function hasCommand(cmd) {
  return spawnSync(IS_WINDOWS ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}

function marketplaceSource() {
  try {
    const url = execFileSync('git', ['-C', REPO, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {}
  return REPO; // no GitHub remote yet: use the local clone
}

function setupPlugins() {
  if (!hasCommand('claude')) return log('! claude CLI not found on PATH — skipping plugin install.');
  const source = marketplaceSource();
  if (!claude('plugin', 'marketplace', 'add', source)) claude('plugin', 'marketplace', 'update', MARKETPLACE);
  claude('plugin', 'install', `kit@${MARKETPLACE}`);
  for (const plugin of RECOMMENDED) claude('plugin', 'install', plugin);
  if (hasCommand('codex')) {
    claude('plugin', 'marketplace', 'add', 'openai/codex-plugin-cc');
    claude('plugin', 'install', 'codex@openai-codex');
  } else {
    log('! codex CLI not found — skipping the codex plugin (/kit:second-opinion falls back to a Claude reviewer).');
  }
}

log(`claude-kit setup${DRY ? ' (dry run)' : ''} — repo: ${REPO}\n`);
setupClaudeMd();
setupSettings();
if (!args.has('--skip-plugins')) setupPlugins();
log(`\nDone.${existsSync(BACKUP_DIR) ? ` Backups: ${BACKUP_DIR}` : ''} Restart Claude Code to load everything.`);
