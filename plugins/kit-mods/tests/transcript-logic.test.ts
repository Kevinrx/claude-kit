import { describe, expect, test } from 'claude-code/testing'

import { callLabel, callStatus, editDiff, formatDuration, outputTail, shortPath, truncate } from '../hooks/transcript'

describe('call labels', () => {
  test('names what each tool worked on', () => {
    expect(callLabel('Bash', { command: 'npm test\necho done' })).toBe('npm test')
    expect(callLabel('PowerShell', { command: 'Get-ChildItem' })).toBe('Get-ChildItem')
    expect(callLabel('Read', { file_path: 'C:\\repo\\hooks\\register.tsx' })).toBe('Read hooks/register.tsx')
    expect(callLabel('Edit', { file_path: '/repo/a.ts' })).toBe('Edit repo/a.ts')
    expect(callLabel('Grep', { pattern: 'ToolGroup' })).toBe('Grep ToolGroup')
    expect(callLabel('WebFetch', { url: 'https://example.com' })).toBe('WebFetch https://example.com')
    expect(callLabel('Agent', { description: 'scan repo' })).toBe('Agent scan repo')
    expect(callLabel('mcp__github__get_issue', {})).toBe('github: get_issue')
    expect(callLabel('TodoWrite', { todos: [] })).toBe('TodoWrite')
  })

  test('never throws on malformed input', () => {
    for (const input of [undefined, null, 'x', 3, { command: 5 }, { file_path: '' }]) {
      expect(callLabel('Bash', input)).toBe('Bash')
      expect(callLabel('Read', input)).toBe('Read')
    }
  })

  test('cuts a long command', () => {
    const label = callLabel('Bash', { command: 'x'.repeat(200) })
    expect(label.length).toBe(80)
    expect(label.endsWith('…')).toBe(true)
  })

  test('truncate and shortPath', () => {
    expect(truncate('abcdef', 4)).toBe('abc…')
    expect(truncate('abc', 4)).toBe('abc')
    expect(shortPath('a.ts')).toBe('a.ts')
  })
})

describe('call status and duration', () => {
  test('status by precedence', () => {
    expect(callStatus({ isRunning: true, isErrored: false, isInterrupted: false })).toBe('running')
    expect(callStatus({ isRunning: false, isErrored: true, isInterrupted: false })).toBe('error')
    expect(callStatus({ isRunning: false, isErrored: true, isInterrupted: true })).toBe('interrupted')
    expect(callStatus({ isRunning: false, isErrored: false, isInterrupted: false })).toBe('ok')
  })

  test('durations', () => {
    expect(formatDuration(850)).toBe('850ms')
    expect(formatDuration(4200)).toBe('4.2s')
    expect(formatDuration(65_000)).toBe('1m 05s')
  })
})

describe('output tail', () => {
  test('last non-empty lines of the text the model read', () => {
    expect(outputTail('a\nb\n\nc\nd\n')).toEqual(['b', 'c', 'd'])
    expect(outputTail('Exit code 1\r\nfailed\r\n')).toEqual(['Exit code 1', 'failed'])
  })

  test('stderr then stdout of a record', () => {
    expect(outputTail({ stderr: 'boom', stdout: 'one\ntwo' })).toEqual(['boom', 'one', 'two'])
    expect(outputTail({ stdout: '' })).toEqual([])
    expect(outputTail(undefined)).toEqual([])
  })
})

describe('edit diff', () => {
  const patch = (lines: string[], oldStart = 10) => [{ oldStart, oldLines: 0, newStart: oldStart, newLines: 0, lines }]

  test('stat and hunks from an Edit', () => {
    const diff = editDiff('Edit', { filePath: '/r/a.ts', structuredPatch: patch([' keep', '-old', '+new', '+more']) })
    expect(diff).toEqual({ path: '/r/a.ts', added: 2, removed: 1, hunks: '@@ -10,2 +10,3 @@\n keep\n-old\n+new\n+more', hiddenLines: 0 })
  })

  test('prefers git counts when present', () => {
    const diff = editDiff('Edit', { filePath: 'a', structuredPatch: patch(['+x']), gitDiff: { additions: 7, deletions: 3 } })
    expect([diff?.added, diff?.removed]).toEqual([7, 3])
  })

  test('caps the body and recounts the cut hunk header', () => {
    const lines = [...Array.from({ length: 15 }, (_, i) => `-old${i}`), ...Array.from({ length: 15 }, (_, i) => `+new${i}`)]
    const diff = editDiff('Edit', { filePath: 'a', structuredPatch: [...patch(lines, 1), ...patch([' x', '+y'], 90)] })
    expect(diff?.hiddenLines).toBe(12)
    const text = diff?.hunks.split('\n') ?? []
    expect(text[0]).toBe('@@ -1,15 +1,5 @@')
    expect(text.length).toBe(21)
    expect(diff?.added).toBe(16)
    expect(diff?.removed).toBe(15)
  })

  test('a created file is one added hunk, CRLF folded', () => {
    const diff = editDiff('Write', { type: 'create', filePath: 'n.ts', content: 'a\r\nb\r\n', structuredPatch: [] })
    expect(diff?.hunks).toBe('@@ -0,0 +1,2 @@\n+a\n+b')
    expect([diff?.added, diff?.removed]).toEqual([2, 0])
  })

  test('a Write update uses its patch', () => {
    const diff = editDiff('Write', { type: 'update', filePath: 'n.ts', content: '', structuredPatch: patch(['-a', '+b']) })
    expect(diff?.hunks).toBe('@@ -10,1 +10,1 @@\n-a\n+b')
  })

  test('nothing to draw', () => {
    expect(editDiff('Edit', { filePath: 'a', structuredPatch: [] })).toBe(undefined)
    expect(editDiff('Edit', { filePath: 'a', structuredPatch: patch(['+x']), staged: true })).toBe(undefined)
    expect(editDiff('Edit', 'Error: old_string not found')).toBe(undefined)
    expect(editDiff('Read', { filePath: 'a', structuredPatch: patch(['+x']) })).toBe(undefined)
    expect(editDiff('Write', { type: 'update', filePath: 'a', content: 'x', structuredPatch: [] })).toBe(undefined)
  })
})
