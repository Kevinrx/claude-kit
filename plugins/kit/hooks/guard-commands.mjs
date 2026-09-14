// PreToolUse (Bash|PowerShell): deny catastrophic commands, ask before destructive ones.
// "ask" puts the decision in the user's permission prompt instead of silently blocking,
// so legitimate uses stay one click away. This is a seatbelt against accidents, not a
// sandbox: interpreter one-liners (node -e, python -c), indirect reads and write-then-run
// (a heredoc saved to a script, then executed) aren't parsed.
import { posix } from 'node:path';
import { main, preToolDecision } from './lib.mjs';

const HOME = String.raw`(?:~[\w.-]*|\$HOME|\$\{HOME\}|\$USERPROFILE|\$\{USERPROFILE\}|\$env:USERPROFILE|\$env:HOME|\$env:HOMEPATH|%USERPROFILE%|%HOMEPATH%|/(?:Users|home)/[^/]+|/[a-z]/Users/[^/]+|[a-z]:/Users/[^/]+)`;
const SYSTEM_DIRS = 'etc|usr|bin|sbin|lib|lib64|var|opt|boot|System|Library|private';
const WINDOWS_DIRS = String.raw`(?:Windows|Program Files(?: \(x86\))?|ProgramData)`;
const DRIVE = String.raw`(?:\/[a-z]\/|[a-z]:\/)`; // C:/ or Git Bash /c/

// Recursive deletes of these are never what an agent should do.
const CATASTROPHIC = [
  new RegExp(`^${HOME}/?\\*?$`, 'i'), // the home directory itself
  /^\/\*?$/, // filesystem root
  /^[a-z]:\/?\*?$/i, // drive root
  /^\/[a-z]\/?\*?$/i, // Git Bash drive root (/c/)
  new RegExp(`^(?:${DRIVE}|/)Users/?\\*?$`, 'i'),
  new RegExp(`^${DRIVE}${WINDOWS_DIRS}(?:/[^/]+)?/?\\*?$`, 'i'), // C:/Windows, C:/Windows/System32
  new RegExp(`^/(?:${SYSTEM_DIRS})(?:/[^/]+)?/?\\*?$`), // a system dir, or one level below it (/var/log, /usr/lib)
  /^\/Applications\/?\*?$/,
  new RegExp(`^${HOME}/\\.(?:ssh|gnupg|aws|kube|docker|config)(?:/.*)?$`, 'i'),
  new RegExp(`^${HOME}/\\.claude/?\\*?$`, 'i'), // ~/.claude itself; below it (plugin cache…) only asks
];
const TEMP_ROOT = new RegExp(String.raw`^(?:/(?:tmp|var/tmp|var/folders|private/tmp|private/var/folders)/|${DRIVE}Users/[^/]+/AppData/Local/Temp/|(?:\$env:TEMP|\$env:TMP|%TEMP%|%TMP%|\$TMPDIR|\$\{TMPDIR\})/)`, 'i');
const SYSTEM_PATH = new RegExp(`^(?:/(?:${SYSTEM_DIRS}|Applications)/|${DRIVE}${WINDOWS_DIRS}/)`, 'i');
const INSIDE_HOME = new RegExp(`^${HOME}/`, 'i');
const WIPES_CWD = /^(?:\.|\.\.|\*|\.\/\*|\.\.\/\*|\.git)\/?$/;
const SAFE_LEAF = /(?:^|\/)(?:node_modules|dist|build|out|tmp|log|coverage|target|\.next|\.nuxt|\.cache|\.turbo|\.parcel-cache|\.venv|venv|__pycache__|\.pytest_cache|public\/packs(?:-test)?|public\/assets)\/?\*?$/;

// Files holding real secrets; templates (.env.example…) are fine to read.
const SECRET_FILE = [
  /(?:^|\/)\.env(?:\.[\w.-]+)?$/i,
  /(?:^|\/)master\.key$/i,
  /(?:^|\/)credentials\/[^/]+\.key$/i,
  /\.(?:pem|p12|pfx)$/i,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /(?:^|\/)\.aws\/credentials$/i,
];
const SECRET_TEMPLATE = /\.(?:example|sample|template|dist)$/i;
const READERS = /^(?:cat|type|less|more|head|tail|bat|batcat|nl|strings|xxd|od|base64|get-content|gc)$/i;
const COPIERS = /^(?:cp|copy|copy-item|scp)$/i;
const DB_CLIENT = /^(?:psql|mysql|mariadb|sqlite3|sqlcmd|pgcli|mycli|duckdb|mongosh)$/i;
const DESTRUCTIVE_SQL = /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+(?:TABLE\s+)?\w)/i;
const SHELL = /^(?:bash|sh|zsh|dash|ksh)$/i;
const RUNS_STDIN = /^(?:bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)$/i; // a heredoc fed to these is code, not data
const PIPE_TO_SHELL = /\|\s*(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|pwsh|powershell)\b/;

// Downloaded code run without a pipe: bash -c "$(curl …)", bash <(curl …), iex (irm …).
const DOWNLOAD_EXEC = [
  /\b(?:sh|bash|zsh|source|\.)\s+<\(\s*(?:curl|wget)\b/,
  /\b(?:sh|bash|zsh)\b[^|;&]*\s-[a-zA-Z]*c[a-zA-Z]*\s+["']?(?:\$\(|`)\s*(?:curl|wget)\b/,
  /\b(?:iex|Invoke-Expression)\b[^|;]*\(\s*(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest)\b/i,
];

// Checked against each normalized segment: wrappers (sudo -u x, timeout 60…), runner prefixes
// (npx, bundle exec) and git global options removed, commit/PR message values blanked.
const SEGMENT_DENY = [
  [/^(?:mkfs(?:\.\w+)?|diskpart)(?:\s|$)|^format [a-z]:/i, 'formats a disk'],
  [/^dd\b.*\sof=\/dev\/(?:sd|disk|nvme|hd|mmcblk|xvd)|\s>\s*\/dev\/(?:sd|disk|nvme|hd|mmcblk|xvd)/, 'writes to a raw disk device'],
];
const SEGMENT_ASK = [
  [/^git push\b.*(?:\s--force(?:\s|$)|\s-f(?:\s|$)|\s\+\S)/, 'force push rewrites remote history'],
  [/^git push\b.*(?:\s(?:--delete|-d)\s|\s:\S)/, 'deletes a remote branch'],
  [/^git reset\b.*--hard/, 'git reset --hard discards uncommitted work'],
  [/^git clean\b.*\s-\w*f/, 'git clean deletes untracked files'],
  [/^git (?:checkout|restore)\s+(?:--\s+)?\.$/, 'discards all uncommitted changes'],
  [/^git (?:checkout|switch)\b.*\s(?:-f|--force|--discard-changes)(?:\s|$)/, 'discards local changes'],
  [/^git branch\b.*(?:\s-[a-zA-Z]*D[a-zA-Z]*(?:\s|$)|\s--delete\b.*\s--force(?:\s|$)|\s--force\b.*\s--delete(?:\s|$))/, 'force-deletes a local branch'],
  [/^git stash\s+(?:drop|clear)\b/, 'drops stashed work'],
  [/^git (?:filter-branch|filter-repo)\b/, 'rewrites git history'],
  [/^git worktree remove\b.*\s(?:-f|--force)(?:\s|$)/, 'force-removes a worktree and its changes'],
  [/^git (?:commit|push|merge|rebase|am|cherry-pick|revert)\b.*\s--no-verify(?:\s|$)/, 'skips git hooks (--no-verify)'],
  [/^git commit\b.*\s-[a-zA-Z]*n[a-zA-Z]*(?:\s|$)/, 'skips git hooks (git commit -n)'],
  [/^gh pr merge\b/, 'merges a pull request'],
  [/^gh (?:repo|release) delete\b/, 'deletes a GitHub repo or release'],
  [/^(?:rails|rake) db:(?:drop|reset|purge|schema:load|structure:load|truncate_all|seed:replant)\b/, 'destructive database task'],
  [/^(?:npm|pnpm|yarn|bun) publish\b|^gem push\b/, 'publishes a package'],
  [/^chmod\b.*\s(?:0?777|a\+rwx)(?:\s|$)/, 'makes files world-writable'],
  [/^(?:terraform|tofu) destroy\b/, 'destroys infrastructure'],
  [/^kubectl delete\b/, 'deletes Kubernetes resources'],
  [/^docker (?:system|volume|image|container|builder|network) prune\b/, 'prunes Docker data'],
  [/^(?:docker compose|docker-compose)\b.*\sdown\b.*\s(?:-v|--volumes)(?:\s|$)/, 'deletes Docker volumes'],
  [/^prisma migrate reset\b|^prisma db push\b.*\s--(?:force-reset|accept-data-loss)\b/, 'resets or overwrites the database'],
  [/^supabase db reset\b/, 'resets the database'],
  [/^redis-cli\b.*\sflush(?:all|db)\b/i, 'wipes Redis'],
  [/^find\b.*\s(?:-delete|-exec(?:dir)?\s+rm)(?:\s|$)/, 'find deletes every match'],
  [/^xargs\b.*\srm\s+-[a-zA-Z]*[rR]/, 'xargs rm -r deletes whatever the input lists'],
];

// Wrappers that run the rest of the line: options that take a value, and positional args to skip.
const WRAPPERS = {
  sudo: [/^(?:-[ugCDhpRTU]|--(?:user|group|chdir|prompt|role|type|host|close-from|other-user))$/, 0],
  doas: [/^-[uC]$/, 0],
  env: [/^(?:-[uCS]|--(?:unset|chdir|split-string))$/, 0],
  nice: [/^(?:-n|--adjustment)$/, 0],
  ionice: [/^-[cnp]$/, 0],
  timeout: [/^(?:-[sk]|--(?:signal|kill-after))$/, 1],
  stdbuf: [/^-[ioe]$/, 0],
  exec: [/^-a$/, 0],
  nohup: [null, 0],
  time: [null, 0],
  command: [null, 0],
  busybox: [null, 0],
};
const KEYWORDS = /^(?:then|do|else|elif|!)$/;
const GIT_OPTS_WITH_VALUE = /^(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path)$/;
const MESSAGE_FLAG = /^(?:-[a-zA-Z]*[mF]|--message|--file|--title|--body|--body-file|--notes)$/;
const PS_RECURSE = /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\$true)?$/i;

// Split on ; & | ( ) newlines (and backticks outside PowerShell), respecting quotes, escapes
// and # comments. Subshells, $(…) and `…` end up as their own segments. Heredoc bodies are
// data (a commit message, a file) and are skipped — unless they're fed to a shell.
function splitSegments(command, powershell) {
  const separators = powershell ? ';&|\n()' : ';&|\n()`';
  const segments = [];
  const heredocs = [];
  let current = '';
  let quote = null;
  let escape = null;
  let arith = 0; // inside $(( … )) / (( … )), where << is a shift, not a heredoc
  let inBacktick = false;
  const flush = () => {
    if (current.trim()) segments.push(current.trim());
    current = '';
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      current += c;
      if (escape && c === escape) {
        current += command[i + 1] ?? '';
        i++;
      } else if (c === quote) {
        quote = null;
      }
    } else if (powershell && /^@(['"])\r?\n/.test(command.slice(i, i + 4))) {
      // PowerShell here-string: @'…'@ / @"…"@ with the terminator at a line start.
      const close = command.indexOf(`\n${command[i + 1]}@`, i + 2);
      const end = close === -1 ? command.length : close + 3;
      current += command.slice(i, end);
      i = end - 1;
    } else if (powershell && command.startsWith('<#', i)) {
      const close = command.indexOf('#>', i + 2); // PowerShell block comment
      i = (close === -1 ? command.length : close + 2) - 1;
    } else if (c === '#' && (current === '' || /\s$/.test(current))) {
      // A comment runs to the newline — or, inside `…`, to the closing backtick — which still separates.
      const end = !powershell && inBacktick ? command.indexOf('`', i) : command.indexOf('\n', i);
      i = (end === -1 ? command.length : end) - 1;
    } else if (!powershell && c === '$' && command[i + 1] === "'") {
      quote = "'"; // bash $'…': backslash escapes inside
      escape = '\\';
      current += "$'";
      i++;
    } else if (c === '"' || c === "'") {
      quote = c;
      escape = c === '"' ? (powershell ? '`' : '\\') : null;
      current += c;
    } else if (!powershell && c === '\\') {
      current += c + (command[i + 1] ?? '');
      i++;
    } else if (!powershell && command.startsWith('<<<', i)) {
      current += '<<< '; // herestring: its word is an ordinary token
      i += 2;
    } else if (!powershell && command.startsWith('<<', i)) {
      const m = command.slice(i).match(/^<<[-~]?\s*(["']?)([\w.-]+)\1/);
      const lineEnd = command.indexOf('\n', i);
      const restOfLine = command.slice(i, lineEnd === -1 ? undefined : lineEnd);
      const fedToShell = RUNS_STDIN.test(tokenize(current)[0] ?? '') || PIPE_TO_SHELL.test(restOfLine);
      if (m && !fedToShell && !arith && /^[A-Za-z_]/.test(m[2])) heredocs.push(m[2]);
      const text = m ? m[0] : '<<';
      current += text;
      i += text.length - 1;
    } else if (c === '\n' && heredocs.length) {
      flush();
      let pos = i + 1;
      while (heredocs.length && pos <= command.length) {
        const end = command.indexOf('\n', pos);
        const lineEnd = end === -1 ? command.length : end;
        if (command.slice(pos, lineEnd).trim() === heredocs[0]) heredocs.shift();
        pos = lineEnd + 1;
      }
      i = pos - 2; // the loop's i++ lands on the newline after the terminator
    } else if (!powershell && c === '(' && command[i + 1] === '(') {
      arith++;
      flush();
      i++;
    } else if (!powershell && c === ')' && command[i + 1] === ')' && arith) {
      arith--;
      flush();
      i++;
    } else if (separators.includes(c)) {
      if (c === '`') inBacktick = !inBacktick;
      flush();
    } else {
      current += c;
    }
  }
  flush();
  return segments;
}

const commandName = (token) => posix.basename(token.replace(/^\\/, '').replace(/\\/g, '/')).replace(/\.exe$/i, '');

// Tokens with quotes removed; keywords, VAR=x and wrappers (with their options) dropped;
// the command reduced to its basename (/bin/rm, \rm → rm); runner prefixes removed.
function tokenize(segment) {
  const text = segment.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '"_"'); // PowerShell here-string = one opaque value
  let tokens = (text.match(/"(?:\\.|[^"])*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2'));
  let i = 0;
  while (i < tokens.length) {
    if (KEYWORDS.test(tokens[i]) || /^[A-Za-z_]\w*=/.test(tokens[i])) {
      i++;
      continue;
    }
    const wrapper = WRAPPERS[commandName(tokens[i])];
    if (!wrapper) break;
    const [valueFlag, positional] = wrapper;
    i++;
    while (tokens[i]?.startsWith('-')) {
      const flag = tokens[i];
      i += valueFlag?.test(flag) ? 2 : 1;
      if (flag === '--') break;
    }
    i += positional;
  }
  tokens = tokens.slice(i);
  for (;;) {
    if (!tokens.length) return tokens;
    tokens[0] = commandName(tokens[0]);
    const [a, b] = tokens;
    if (/^(?:npx|bunx)$/.test(a)) {
      tokens = tokens.slice(1);
      while (tokens[0]?.startsWith('-')) tokens = tokens.slice(1);
    } else if (/^(?:bundle|pnpm|yarn)$/.test(a) && /^(?:exec|dlx)$/.test(b ?? '')) {
      tokens = tokens.slice(2);
    } else {
      return tokens;
    }
  }
}

// git: drop global options (-C dir, -c k=v…) so `git -C . reset --hard` matches the rules.
function normalizeGit(tokens, found) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    if (tokens[i] === '-c' && /^core\.hooksPath=/i.test(tokens[i + 1] ?? '')) found.ask.push('overrides the git hooks path');
    i += GIT_OPTS_WITH_VALUE.test(tokens[i]) ? 2 : 1;
  }
  return [tokens[0], ...tokens.slice(i)];
}

// Blank commit/PR message values so their text never matches a rule.
function blankMessages(tokens) {
  return tokens.map((t, i) => {
    if (/^--(?:message|file|title|body|body-file|notes)=/.test(t)) return t.replace(/=.*/, '=_');
    return i > 0 && MESSAGE_FLAG.test(tokens[i - 1]) ? '_' : t;
  });
}

// The command a wrapper runs: bash -lc "…", pwsh -Command …, cmd /c …, eval ….
function innerCommand(tokens) {
  const [cmd, ...rest] = tokens;
  if (SHELL.test(cmd)) {
    const i = rest.findIndex((t) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(t) || t === '<<<');
    if (i !== -1 && rest[i + 1]) return [rest[i + 1], false];
  } else if (/^(?:pwsh|powershell)$/i.test(cmd)) {
    const i = rest.findIndex((t) => /^-(?:c|command)$/i.test(t));
    if (i !== -1 && rest[i + 1]) return [rest.slice(i + 1).join(' '), true];
  } else if (/^cmd$/i.test(cmd)) {
    const i = rest.findIndex((t) => /^\/[ck]$/i.test(t));
    if (i !== -1 && rest[i + 1]) return [rest.slice(i + 1).join(' '), false];
  } else if (cmd === 'eval' && rest.length) {
    return [rest.join(' '), false];
  }
  return null;
}

function checkDelete(tokens, powershell, found) {
  const [cmd, ...rest] = tokens;
  if (!/^(?:rm|remove-item|ri|rd|rmdir|del|erase)$/i.test(cmd ?? '')) return;
  const psStyle = powershell || !/^rm$/.test(cmd);
  const isFlag = (t) => t.startsWith('-') || (psStyle && /^\/[sq]$/i.test(t));
  const flags = rest.filter(isFlag);
  const targets = rest.filter((t) => !isFlag(t)).map((t) => posix.normalize(t.replace(/\\/g, '/')));
  const recursive = psStyle
    ? flags.some((f) => PS_RECURSE.test(f) || /^\/s$/i.test(f))
    : flags.some((f) => f === '--recursive' || /^-[a-zA-Z]*[rR]/.test(f) && !f.startsWith('--'));
  if (!recursive) return;
  for (const target of targets) {
    if (CATASTROPHIC.some((re) => re.test(target))) found.deny.push(`recursive delete of ${target}`);
    else if (TEMP_ROOT.test(target)) continue;
    else if (SAFE_LEAF.test(target) && !SYSTEM_PATH.test(target)) continue;
    else if (INSIDE_HOME.test(target) || WIPES_CWD.test(target) || /^(?:\/|[a-z]:\/)/i.test(target)) {
      found.ask.push(`recursive delete of ${target}`);
    }
  }
}

const isSecretPath = (p) => {
  const path = p.replace(/\\/g, '/');
  return !SECRET_TEMPLATE.test(path) && SECRET_FILE.some((re) => re.test(path));
};

function checkSecretRead(tokens, segment, found) {
  const [cmd, ...rest] = tokens;
  const args = rest.filter((t) => !t.startsWith('-'));
  let candidates = [];
  if (READERS.test(cmd)) candidates = args;
  else if (COPIERS.test(cmd)) candidates = args.slice(0, -1); // only the source, not the destination
  const redirect = segment.match(/<\s*(\S+)/);
  if (redirect) candidates.push(redirect[1].replace(/^["']|["']$/g, ''));
  const hit = candidates.find(isSecretPath);
  if (hit) found.ask.push(`reads a secrets file (${hit}) — the Read deny rules apply to the shell too`);
}

function analyze(command, powershell, found, depth = 0) {
  // Pipes into a shell span segments; quoted text (commit messages, grep patterns) can't trigger it.
  const unquoted = command.replace(/"(?:\\.|[^"])*"|'[^']*'/g, '""');
  if (/\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|iex|Invoke-Expression)\b/i.test(unquoted)
    || DOWNLOAD_EXEC.some((re) => re.test(command))) {
    found.ask.push('runs a downloaded script');
  }
  let dbClient = false;
  for (const segment of splitSegments(command, powershell)) {
    let tokens = tokenize(segment);
    if (!tokens.length) continue;
    const inner = depth < 3 && innerCommand(tokens);
    if (inner) analyze(inner[0], inner[1], found, depth + 1);
    checkDelete(tokens, powershell, found);
    checkSecretRead(tokens, segment, found);
    if (DB_CLIENT.test(tokens[0]) || (tokens[0] === 'rails' && /^(?:db|dbconsole)$/.test(tokens[1] ?? ''))) dbClient = true;
    if (tokens[0] === 'git') {
      tokens = normalizeGit(tokens, found);
      if (/\bHUSKY=0\b/.test(segment)) found.ask.push('skips git hooks (HUSKY=0)');
    }
    if (tokens[0] === 'git' || tokens[0] === 'gh') tokens = blankMessages(tokens);
    if (/^(?:rails|rake)$/.test(tokens[0]) && (/\b(?:RAILS|RACK)_ENV=(?:production|staging)\b/.test(segment) || /(?:^|\s)(?:-e\s+|--environment=)(?:production|staging)\b/.test(tokens.join(' ')))) {
      found.ask.push('runs against a production/staging Rails environment');
    }
    // Tokens may contain spaces (quoted args): keep them one "word" so \s only separates tokens.
    const normalized = tokens.map((t) => t.replace(/\s+/g, '_')).join(' ');
    for (const [re, why] of SEGMENT_DENY) if (re.test(normalized)) found.deny.push(why);
    for (const [re, why] of SEGMENT_ASK) {
      if (!re.test(normalized)) continue;
      if (why === 'destructive database task' && /RAILS_ENV=test\b/.test(segment)) continue;
      found.ask.push(why);
    }
  }
  // SQL piped, heredoc'd or passed with -c to a database client.
  if (dbClient && DESTRUCTIVE_SQL.test(command)) found.ask.push('destructive SQL');
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
