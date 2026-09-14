// PreToolUse (Write|Edit|MultiEdit): ask before an edit that
//  - weakens a test file (fewer assertions, or new skip/only/focus markers), or
//  - writes something that looks like a real secret.
// "ask" lets the user approve legitimate cases (e.g. deleting an obsolete test).
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { main, preToolDecision } from './lib.mjs';

// JS/TS, Ruby (RSpec + Minitest) and Python test files.
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|\/__tests__\/|_spec\.rb$|_test\.rb$|\/test_[^/]+\.py$|_test\.py$/;
const ASSERTION = /\bexpect\s*[({]|\bis_expected\b|\bassert(?:_\w+|[A-Z]\w*|\.\w+)?\s*[(\s]|\.should\b|\bmust_\w+|\brefute(?:_\w+)?\b/g;
const SKIP_MARKER = /\.(?:skip|only|todo)\s*\(|\b(?:xit|xdescribe|xcontext|xtest|fit|fdescribe|fcontext)\s*\(?\s*['"]|^\s*(?:skip|pending)\b|@pytest\.mark\.(?:skip|xfail)|@unittest\.skip/gm;

const SECRETS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, 'private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/, 'GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bsk_live_[A-Za-z0-9]{20,}/, 'Stripe live key'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, 'OpenAI API key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
];
const GENERIC_SECRET = /\b(?:api[_-]?key|secret(?:_key)?|password|passwd|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*(?:=>|[:=])\s*["']([^"'\s]{12,})["']/gi;
const PLACEHOLDER = /^(?:x+|\*+|changeme|change_me|redacted|example|dummy|test|fake|placeholder|your[_-].*|<.*>|\$\{.*\}|%\{.*\})$/i;
const SECRET_OK_PATH = /\.env\.(?:example|sample|template)$|\/(?:test|tests|spec|__tests__|fixtures|mocks?|factories)\//i;

const count = (text, re) => (text.match(re) ?? []).length;

function editsOf(toolInput) {
  return Array.isArray(toolInput.edits) ? toolInput.edits : [toolInput];
}

// Apply Edit/MultiEdit to the on-disk text so counts compare whole files.
function applyEdits(text, edits) {
  for (const e of edits) {
    if (typeof e.old_string !== 'string' || !text.includes(e.old_string)) return null;
    const replacement = e.new_string ?? '';
    text = e.replace_all ? text.split(e.old_string).join(replacement) : text.replace(e.old_string, () => replacement);
  }
  return text;
}

function testWeakening(before, after) {
  const reasons = [];
  const [a0, a1] = [count(before, ASSERTION), count(after, ASSERTION)];
  if (a1 < a0) reasons.push(`assertions drop from ${a0} to ${a1}`);
  const [s0, s1] = [count(before, SKIP_MARKER), count(after, SKIP_MARKER)];
  if (s1 > s0) reasons.push('adds a skip/only/focus marker');
  return reasons;
}

function secretsIn(text, path) {
  const hits = SECRETS.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (!SECRET_OK_PATH.test(path)) {
    for (const m of text.matchAll(GENERIC_SECRET)) {
      if (!PLACEHOLDER.test(m[1])) {
        hits.push('hardcoded credential');
        break;
      }
    }
  }
  return hits;
}

main((input) => {
  const toolInput = input.tool_input ?? {};
  const filePath = toolInput.file_path;
  if (typeof filePath !== 'string' || !filePath) return;
  const abs = isAbsolute(filePath) ? filePath : join(input.cwd ?? process.cwd(), filePath);
  const path = abs.replace(/\\/g, '/');
  const isWrite = input.tool_name === 'Write';
  const reasons = [];

  const added = isWrite ? toolInput.content ?? '' : editsOf(toolInput).map((e) => e.new_string ?? '').join('\n');
  const secrets = secretsIn(added, path);
  if (secrets.length) reasons.push(`content looks like a real secret (${[...new Set(secrets)].join(', ')}) — use an env var or credentials store instead`);

  if (TEST_FILE.test(path) && existsSync(abs)) {
    const before = readFileSync(abs, 'utf8');
    const after = isWrite ? toolInput.content ?? '' : applyEdits(before, editsOf(toolInput));
    if (after !== null) {
      const weakening = testWeakening(before, after);
      if (weakening.length) reasons.push(`this edit weakens a test (${weakening.join(', ')})`);
    }
  }

  if (reasons.length) preToolDecision('ask', `kit guard: ${reasons.join('; ')}.`);
});
