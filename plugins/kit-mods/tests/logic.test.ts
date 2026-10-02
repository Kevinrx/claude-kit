import { describe, expect, test } from 'claude-code/testing'

import { classify, cleanSummary, diffSummary, pushSummary } from '../hooks/blast'
import { isWriter, spawnRefusal } from '../hooks/delegation'
import { barSvg, filledCells, limitHex, mergeLimits, parseStoredLimits, pickContext, pickLimits, shortTokens, untilReset } from '../hooks/limits'
import { isProgressFile, parsePlan, pickActive } from '../hooks/plan'

describe('blast radius', () => {
  test('recognizes the destructive commands guard-commands asks about', () => {
    expect(classify('git reset --hard HEAD~1')).toEqual({ kind: 'reset-hard', cwd: undefined })
    expect(classify('git checkout -- .')).toEqual({ kind: 'discard', cwd: undefined })
    expect(classify('git restore .')).toEqual({ kind: 'discard', cwd: undefined })
    expect(classify('git clean -fdx')).toEqual({ kind: 'clean', cwd: undefined, flags: ['d', 'x'] })
    expect(classify('git push --force-with-lease origin main')).toEqual({ kind: 'force-push', cwd: undefined })
    expect(classify('git push origin +main')).toEqual({ kind: 'force-push', cwd: undefined })
    expect(classify('rm -rf dist "build out"')).toEqual({ kind: 'rm', cwd: undefined, paths: ['dist', '"build', 'out"'] })
  })

  test('follows cd and git -C into the directory it measures', () => {
    expect(classify('cd app && git reset --hard')).toEqual({ kind: 'reset-hard', cwd: 'app' })
    expect(classify('git -C /repo clean -f')).toEqual({ kind: 'clean', cwd: '/repo', flags: [] })
    expect(classify('cd app; rm -r tmp')).toEqual({ kind: 'rm', cwd: 'app', paths: ['tmp'] })
  })

  test('leaves safe commands alone', () => {
    for (const command of ['git status', 'git reset HEAD file', 'git clean -n', 'git push origin main', 'rm file.txt', 'git checkout main', 'ls -rf']) {
      expect(classify(command)).toBe(undefined)
    }
  })

  test('summarizes git output', () => {
    expect(diffSummary('')).toEqual(['nothing to discard'])
    expect(diffSummary(' a.rb | 2 +-\n b.rb | 1 +\n 2 files changed, 2 insertions(+), 1 deletion(-)\n')).toEqual([
      '2 files changed, 2 insertions(+), 1 deletion(-)',
      '  a.rb | 2 +-',
      '  b.rb | 1 +',
    ])
    expect(cleanSummary('Would remove tmp/\nWould remove x.log\n')).toEqual(['2 untracked path(s)', '  tmp/', '  x.log'])
    expect(pushSummary('origin/main', '')).toEqual(['drops no commits from origin/main (as of the last fetch)'])
    const many = Array.from({ length: 7 }, (_, i) => `abc${i} commit ${i}`).join('\n')
    expect(pushSummary('origin/main', many)).toHaveLength(7)
  })
})

describe('delegation rules', () => {
  const reader = { type: 'kit:researcher', isWorktree: false }
  const writer = { type: 'kit:implementer', isWorktree: false }

  test('allows up to three running subagents', () => {
    expect(spawnRefusal('kit:researcher', false, [reader, reader])).toBe(undefined)
    expect(spawnRefusal('kit:researcher', false, [reader, reader, reader])).toMatch(/at most 3/)
  })

  test('a second writer needs a worktree', () => {
    expect(spawnRefusal('kit:implementer', false, [writer])).toMatch(/isolation: "worktree"/)
    expect(spawnRefusal('general-purpose', false, [writer])).toMatch(/own worktree/)
    expect(spawnRefusal('kit:implementer', true, [writer])).toBe(undefined)
    expect(spawnRefusal('kit:implementer', false, [reader])).toBe(undefined)
    expect(spawnRefusal('kit:reviewer', false, [writer])).toBe(undefined)
  })

  test('only known read-only agents count as readers', () => {
    expect(isWriter('Explore')).toBe(false)
    expect(isWriter('kit:security-reviewer')).toBe(false)
    expect(isWriter('fork')).toBe(true)
    expect(isWriter('some-plugin:agent')).toBe(true)
  })
})

describe('limits', () => {
  test('keeps the session and weekly windows only', () => {
    const limits = pickLimits([
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-02T14:00:00Z' },
      { kind: 'seven_day', percentUsed: 12.5 },
      { kind: 'spend_limit', percentUsed: 3 },
    ])
    expect(limits.map(limit => limit.kind)).toEqual(['five_hour', 'seven_day'])
  })

  test('keeps the last reading of each window until it resets', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    const session = { kind: 'five_hour', percentUsed: 44, resetsAt: '2026-10-02T15:00:00Z' }
    const week = { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-10-08T00:00:00Z' }
    // A response without rate-limit headers reports nothing: keep both.
    expect(mergeLimits([session, week], [], now)).toEqual([session, week])
    // A new reading replaces the old one, the other window is kept.
    expect(mergeLimits([session, week], [{ ...session, percentUsed: 50 }], now)).toEqual([{ ...session, percentUsed: 50 }, week])
    // A window past its reset is dropped rather than shown stale.
    expect(mergeLimits([{ ...session, resetsAt: '2026-10-02T11:00:00Z' }, week], [], now)).toEqual([week])
    // A reading with no reset time can't be aged: shown while reported, never carried.
    expect(mergeLimits([{ kind: 'seven_day', percentUsed: 9 }], [], now)).toEqual([])
    expect(mergeLimits([{ ...week, resetsAt: 'soon' }], [], now)).toEqual([])
    // Order is always session, then week.
    expect(mergeLimits([], [week, session], now)).toEqual([session, week])
  })

  test('reads stored limits defensively', () => {
    expect(parseStoredLimits([{ kind: 'five_hour', percentUsed: 44, resetsAt: '2026-10-02T15:00:00Z' }])).toEqual([
      { kind: 'five_hour', percentUsed: 44, resetsAt: '2026-10-02T15:00:00Z' },
    ])
    expect(parseStoredLimits([{ kind: 'seven_day', percentUsed: 3, resetsAt: 7 }])).toEqual([{ kind: 'seven_day', percentUsed: 3, resetsAt: undefined }])
    expect(parseStoredLimits([{ kind: 'spend_limit', percentUsed: 1 }, { kind: 'five_hour' }, null, 'x'])).toEqual([])
    expect(parseStoredLimits(undefined)).toEqual([])
    expect(parseStoredLimits({ kind: 'five_hour', percentUsed: 1 })).toEqual([])
  })

  test('reads the context window, computing the percent when the engine leaves it out', () => {
    expect(pickContext({ tokens: 110_000, window: 1_000_000, percent: 11 })).toEqual({ tokens: 110_000, window: 1_000_000, percent: 11 })
    expect(pickContext({ tokens: 50_000, window: 200_000 })).toEqual({ tokens: 50_000, window: 200_000, percent: 25 })
    expect(pickContext({ window: 200_000 })).toBe(null)
    expect(shortTokens(110_000)).toBe('110k')
    expect(shortTokens(1_000_000)).toBe('1M')
    expect(shortTokens(8_640)).toBe('8.6k')
  })

  test('formats bars and countdowns', () => {
    expect(filledCells(42, 10)).toBe(4)
    expect(filledCells(130, 6)).toBe(6)
    expect(filledCells(-5, 6)).toBe(0)
    expect(barSvg(44, 96, limitHex(44))).toMatch(/<rect width="42\.2" height="6" rx="3" fill="#3fb950"\/>/)
    expect(barSvg(95, 96, limitHex(95))).toMatch(/fill="#f85149"/)
    expect(barSvg(0, 96, '#58a6ff')).toMatch(/<rect width="0\.0"/)
    const now = Date.parse('2026-10-02T12:00:00Z')
    expect(untilReset('2026-10-02T14:10:00Z', now)).toBe('2h 10m')
    expect(untilReset('2026-10-05T16:00:00Z', now)).toBe('3d 4h')
    expect(untilReset('2026-10-02T12:00:30Z', now)).toBe('1m')
    expect(untilReset('2026-10-02T11:00:00Z', now)).toBe('now')
    expect(untilReset(undefined, now)).toBe(undefined)
  })
})

describe('plan', () => {
  const planText = '# Refresh tokens\ngoal: x\n\n## Steps\n### 1. Schema — wave 1\n### 2. API — wave 2\n### 3. UI — wave 3\n'
  const progress = 'status: in progress\n\n## Log\n- 1. Schema — done — bin/rspec green\n- 2. API — done — bin/rspec green\n'

  test('reads title, status and step counts', () => {
    expect(parsePlan('refresh', planText, progress)).toEqual({ slug: 'refresh', title: 'Refresh tokens', status: 'in progress', done: 2, total: 3 })
    expect(parsePlan('bare', '', '')).toEqual({ slug: 'bare', title: 'bare', status: 'unknown', done: 0, total: 0 })
  })

  // Real logs from /kit:implement runs: the wording varies, steps get redone after a resume.
  test('counts each done step once, however the log names it', () => {
    const plan = '# Demo\n### 1. Create hello.txt — wave 1 — difficulty: low\n### 2. Create world.txt — wave 1\n### 3. Write README index — wave 2\n'
    const byTitle = [
      'status: done',
      '## Log',
      '- 2026-10-02 — step 1 (Create hello.txt): done (marked done for demo)',
      '- 2026-10-02 — resume: step 1 log entry didn\'t match the tree → redone',
      '- Create hello.txt — done — `Test-Path demo/hello.txt` → True',
      '- Create world.txt — done — `Test-Path demo/world.txt` → True',
      '- Gate: `Test-Path …` → True True True',
    ].join('\n')
    expect(parsePlan('demo', plan, byTitle).done).toBe(2)
    expect(parsePlan('demo', plan, `${byTitle}\n- Write README index — done — lists both`).done).toBe(3)
    expect(parsePlan('demo', plan, 'status: in progress\r\n## Log\r\n- 1. Create hello.txt — done — ok\r\n- 3. Write README index — done — ok\r\n').done).toBe(2)
    expect(parsePlan('demo', plan, 'status: in progress\n## Log\n- 2026-10-02 — step 1 (Create hello.txt): done (marked done for demo)\n').done).toBe(1)
    expect(parsePlan('demo', plan, 'status: in progress\n## Log\n- 1. Create hello.txt — done — a\n- 1. Create hello.txt — done — redone after resume\n').done).toBe(1)
    // A title that is a prefix of another step's title doesn't borrow its done line.
    const similar = '# UI\n### 1. UI — wave 1\n### 2. UI tests — wave 2\n'
    expect(parsePlan('ui', similar, 'status: in progress\n## Log\n- UI tests — done — green\n').done).toBe(1)
    expect(parsePlan('ui', similar, 'status: in progress\n## Log\n- 3. Build UI tests — done — green\n').done).toBe(0)
    // "not done" is a failure, not a completion.
    expect(parsePlan('demo', plan, 'status: blocked\n## Log\n- 2. Create world.txt — not done — gate failing after 3 attempts\n').done).toBe(0)
    // A step that is only mentioned, never marked done, doesn't count.
    expect(parsePlan('demo', plan, 'status: in progress\n## Log\n- 2. Create world.txt — failed — permission denied\n').done).toBe(0)
  })

  test('picks the most recently touched open plan, and a just-finished one for a while', () => {
    const now = 100 * 60_000
    const plan = (slug: string, status: string) => ({ slug, title: slug, status, done: 0, total: 1 })
    const active = pickActive(
      [
        { mtimeMs: now - 30 * 60_000, plan: plan('finished', 'done') },
        { mtimeMs: now - 3 * 60_000, plan: plan('older', 'planned') },
        { mtimeMs: now - 2 * 60_000, plan: plan('newer', 'in progress') },
      ],
      now,
    )
    expect(active).toEqual({ ...plan('newer', 'in progress'), others: 1 })
    expect(pickActive([{ mtimeMs: now - 60_000, plan: plan('just-done', 'done') }], now)).toEqual({ ...plan('just-done', 'done'), others: 0 })
    expect(pickActive([{ mtimeMs: now - 30 * 60_000, plan: plan('finished', 'done') }], now)).toBe(null)
  })

  test('spots a plan progress file in any path spelling', () => {
    expect(isProgressFile('C:\\repo\\.claude\\kit-plans\\demo\\PROGRESS.md')).toBe(true)
    expect(isProgressFile('/repo/.claude/kit-plans/demo/PROGRESS.md')).toBe(true)
    expect(isProgressFile('.claude/kit-plans/demo/PROGRESS.md')).toBe(true)
    expect(isProgressFile('/repo/.claude/kit-plans/demo/PLAN.md')).toBe(false)
    expect(isProgressFile('/repo/docs/PROGRESS.md')).toBe(false)
  })
})
