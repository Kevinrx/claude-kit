// PreToolUse (Bash|PowerShell): deny catastrophic commands, ask before destructive ones.
// "ask" puts the decision in the user's permission prompt instead of silently blocking,
// so legitimate uses stay one click away.
import { main, preToolDecision } from './lib.mjs';

const HOME = String.raw`(?:~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|%USERPROFILE%|/(?:Users|home)/[^/]+|/c/Users/[^/]+|[a-z]:/Users/[^/]+)`;

// Recursive deletes of these are never what an agent should do.
const CATASTROPHIC = [
  new RegExp(`^${HOME}/?\\*?$`, 'i'), // the home directory itself
  /^\/\*?$/, // filesystem root
  /^[a-z]:\/?\*?$/i, // drive root
  /^(?:\/c\/|[a-z]:\/|\/)(?:Users|Windows|Program Files)\/?\*?$/i,
  /^\/(?:etc|usr|bin|sbin|var|opt|System|Library|Applications)(?:\/.*)?$/,
  new RegExp(`^${HOME}/\\.(?:ssh|gnupg|aws|config|claude|kube|docker)(?:/.*)?$`, 'i'),
];
const INSIDE_HOME = new RegExp(`^${HOME}/`, 'i');
const WIPES_CWD = /^(?:\.|\.\.|\*|\.\/\*|\.\.\/\*|\.git)\/?$/;
const SAFE_LEAF = /(?:^|\/)(?:node_modules|dist|build|out|tmp|log|coverage|target|\.next|\.nuxt|\.cache|\.turbo|\.parcel-cache|\.venv|venv|__pycache__|\.pytest_cache|public\/packs(?:-test)?|public\/assets)\/?\*?$/;

// Checked against each command segment, after sudo/env prefixes are stripped.
const SEGMENT_ASK = [
  [/^git push\b.*(?:\s--force(?:\s|$)|\s-f(?:\s|$)|\s\+\S)/, 'force push rewrites remote history'],
  [/^git push\b.*\s(?:--delete|-d)\s/, 'deletes a remote branch'],
  [/^git reset\b.*--hard/, 'git reset --hard discards uncommitted work'],
  [/^git clean\b.*\s-\w*f/, 'git clean deletes untracked files'],
  [/^git (?:checkout|restore)\s+(?:--\s+)?\.$/, 'discards all uncommitted changes'],
  [/^git branch\s+.*-D\b/, 'force-deletes a local branch'],
  [/^git stash\s+(?:drop|clear)\b/, 'drops stashed work'],
  [/^git (?:filter-branch|filter-repo)\b/, 'rewrites git history'],
  [/\b(?:rails|rake)\s+db:(?:drop|reset|purge|schema:load|structure:load|truncate_all|seed:replant)\b/, 'destructive database task'],
  [/\b(?:npm|pnpm|yarn|bun)\s+publish\b|\bgem\s+push\b/, 'publishes a package'],
  [/\bchmod\b.*\s(?:0?777|a\+rwx)\b/, 'makes files world-writable'],
];

// Checked against the whole command (they span pipes).
const COMMAND_ASK = [
  [/\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|iex|Invoke-Expression)\b/i, 'pipes a download straight into a shell'],
  [/\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+(?:TABLE\s+)?\w)/i, 'destructive SQL'],
];
const COMMAND_DENY = [
  [/\bmkfs(?:\.\w+)?\b|\bdiskpart\b|\bformat\s+[a-z]:/i, 'formats a disk'],
  [/\bdd\b.*\bof=\/dev\/|>\s*\/dev\/(?:sd|disk|nvme|hd)/, 'writes to a raw disk device'],
];

// Split on ; & | and newlines, but not inside quotes.
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote && command[i - 1] !== '\\') quote = null;
      current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      current += c;
    } else if (';&|\n'.includes(c)) {
      if (current.trim()) segments.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenize(segment) {
  const tokens = (segment.match(/"(?:\\.|[^"])*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2'));
  let i = 0;
  while (i < tokens.length && (/^(?:sudo|command|exec|nohup|time|env)$/.test(tokens[i]) || /^[A-Za-z_]\w*=/.test(tokens[i]))) i++;
  return tokens.slice(i);
}

function checkDelete(tokens, powershell, found) {
  const [cmd, ...rest] = tokens;
  if (!/^(?:rm|remove-item|ri|rd|rmdir|del|erase)$/i.test(cmd ?? '')) return;
  const psStyle = powershell || !/^rm$/.test(cmd);
  const isFlag = (t) => t.startsWith('-') || (psStyle && /^\/[sq]$/i.test(t));
  const flags = rest.filter(isFlag);
  const targets = rest.filter((t) => !isFlag(t)).map((t) => t.replace(/\\/g, '/'));
  const recursive = psStyle
    ? flags.some((f) => /^-r(?:ecurse)?$/i.test(f) || /^\/s$/i.test(f))
    : flags.some((f) => f === '--recursive' || /^-[a-zA-Z]*[rR]/.test(f) && !f.startsWith('--'));
  if (!recursive) return;
  for (const target of targets) {
    if (SAFE_LEAF.test(target)) continue;
    if (CATASTROPHIC.some((re) => re.test(target))) found.deny.push(`recursive delete of ${target}`);
    else if (INSIDE_HOME.test(target) || WIPES_CWD.test(target) || (target.startsWith('/') && !target.startsWith('/tmp/'))) {
      found.ask.push(`recursive delete of ${target}`);
    }
  }
}

function analyze(command, powershell, found, depth = 0) {
  for (const [re, why] of COMMAND_DENY) if (re.test(command)) found.deny.push(why);
  for (const [re, why] of COMMAND_ASK) if (re.test(command)) found.ask.push(why);
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    if (!tokens.length) continue;
    // bash -c "…", pwsh -Command "…": check the inner command too.
    if (depth < 2 && /^(?:bash|sh|zsh|pwsh|powershell)(?:\.exe)?$/i.test(tokens[0])) {
      const flag = tokens.findIndex((t) => /^-(?:c|command)$/i.test(t));
      if (flag !== -1 && tokens[flag + 1]) analyze(tokens[flag + 1], /pwsh|powershell/i.test(tokens[0]), found, depth + 1);
    }
    checkDelete(tokens, powershell, found);
    const normalized = tokens.join(' ');
    for (const [re, why] of SEGMENT_ASK) {
      if (!re.test(normalized)) continue;
      if (why === 'destructive database task' && /RAILS_ENV=test\b/.test(segment)) continue;
      found.ask.push(why);
    }
  }
}

main((input) => {
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return;
  const found = { deny: [], ask: [] };
  analyze(command, input.tool_name === 'PowerShell', found);
  if (found.deny.length) {
    preToolDecision('deny', `Blocked by kit guard: ${[...new Set(found.deny)].join('; ')}. If this is really intended, the user should run it themselves.`);
  } else if (found.ask.length) {
    preToolDecision('ask', `kit guard: ${[...new Set(found.ask)].join('; ')}.`);
  }
});
