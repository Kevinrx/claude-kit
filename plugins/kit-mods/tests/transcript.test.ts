import type { On, ToolGroupCall } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

const patch = (lines: string[]) => [{ oldStart: 3, oldLines: 0, newStart: 3, newLines: 0, lines }]
const editOutput = (lines: string[], extra: Record<string, unknown> = {}) => ({
  filePath: 'C:\\repo\\src\\app.ts',
  oldString: 'a',
  newString: 'b',
  originalFile: null,
  structuredPatch: patch(lines),
  userModified: false,
  replaceAll: false,
  ...extra,
})
const call = (tool: string, input: unknown, extra: Partial<ToolGroupCall> = {}): ToolGroupCall => ({
  tool,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...extra,
})

// What the engine draws when no plugin does.
function engine(on: On) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-02T12:00:00Z') })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('agent.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('ui.render', { component: 'ToolGroup' }, ($, e) => $.ui.resolve(e).Text({ children: 'engine group' }))
  on('ui.render', { component: 'ToolResult' }, ($, e) => $.ui.resolve(e).Text({ children: 'engine result' }))
  return clock
}

const group = (calls: ToolGroupCall[], isExpanded = false) =>
  ({ component: 'ToolGroup', requestId: 'g1', props: { calls, isActive: false, isExpanded } }) as const

test('an expanded group is the engine’s own rows', async ($, on) => {
  engine(on)
  await $.session.start(START)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'kit-mods', surface, ...group([call('Bash', { command: 'ls' })], true) })
    expect(await ui.find({ type: 'Text', text: 'engine group' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'ls' })).toBe(undefined)
    await ui.unmount()
  }
})

test('a folded group lists each call under the engine’s count line', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const longEdit = Array.from({ length: 30 }, (_, i) => `+line ${i}`)
  const calls = [
    call('Bash', { command: 'git status' }, { tool_use_id: 't1', output: { stdout: 'clean', stderr: '', interrupted: false } }),
    call('Bash', { command: 'npm test' }, { tool_use_id: 't2', isErrored: true, output: 'Exit code 1\nfirst\nsecond\nthird\nfourth' }),
    call('Edit', { file_path: 'C:\\repo\\src\\app.ts' }, { tool_use_id: 't3', output: editOutput(longEdit) }),
    call('Read', { file_path: '/repo/README.md' }, { isRunning: true }),
  ]

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'kit-mods', surface, ...group(calls) })
    expect(await ui.find({ type: 'Text', text: 'engine group' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'git status' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'npm test' })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: '✓' })).length).toBe(2)
    expect(await ui.find({ type: 'Text', text: '✗' })).toBeDefined()
    // The failed command's last three lines, not the fourth from the end.
    expect(await ui.find({ type: 'Text', text: /fourth/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /second/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /first/ })).toBe(undefined)
    // The edit: stat and a diff capped at 20 lines.
    expect(await ui.find({ type: 'Text', text: 'src/app.ts' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+30' })).toBeDefined()
    const code = await ui.find({ type: 'Code' })
    expect(code?.props).toEqual(expect.objectContaining({ format: 'diff', path: 'C:\\repo\\src\\app.ts' }))
    expect(String((code?.props as { source?: string } | undefined)?.source).split('\n').length).toBe(21)
    expect(await ui.find({ type: 'Text', text: '… 10 more lines' })).toBeDefined()
    // The read still running.
    expect(await ui.find({ type: 'Text', text: 'Read repo/README.md' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'running' })).toBeDefined()
    await ui.unmount()
  }
})

test('durations come from the tool calls the mod saw', async ($, on) => {
  const clock = engine(on)
  on('tool.call', { tool: 'Bash' }, async () => {
    await clock.advance(4200)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm run build' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'kit-mods',
      surface,
      ...group([call('Bash', { command: 'npm run build' }, { tool_use_id: 'b1' }), call('Bash', { command: 'ls' })]),
    })
    expect(await ui.find({ type: 'Text', text: '4.2s' })).toBeDefined()
    // A call without an id (an older desktop host) still draws, without a duration.
    expect(await ui.find({ type: 'Text', text: 'ls' })).toBeDefined()
    await ui.unmount()
  }
})

test('an edit’s result block is a stat and a capped diff', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const result = (tool: string, output: unknown, isErrored = false) =>
    ({ component: 'ToolResult', requestId: 'r1', props: { tool_use_id: 'r1', tool, output, isErrored } }) as const

  for (const surface of SURFACES) {
    const edit = await $.ui.mount({ plugin: 'kit-mods', surface, ...result('Edit', editOutput([' keep', '-old', '+new'])) })
    expect(await edit.find({ type: 'Text', text: 'src/app.ts' })).toBeDefined()
    expect(await edit.find({ type: 'Text', text: '+1' })).toBeDefined()
    expect(await edit.find({ type: 'Text', text: '−1' })).toBeDefined()
    expect((await edit.find({ type: 'Code' }))?.props).toEqual(expect.objectContaining({ source: '@@ -3,2 +3,2 @@\n keep\n-old\n+new' }))
    await edit.unmount()

    const created = await $.ui.mount({
      plugin: 'kit-mods',
      surface,
      ...result('Write', { type: 'create', filePath: '/repo/new.ts', content: 'x\ny\n', structuredPatch: [], originalFile: null }),
    })
    expect(await created.find({ type: 'Text', text: '+2' })).toBeDefined()
    await created.unmount()

    for (const [tool, output] of [
      ['Read', { file: {} }],
      ['Edit', editOutput(['+x'], { staged: true })],
    ] as const) {
      const other = await $.ui.mount({ plugin: 'kit-mods', surface, ...result(tool, output) })
      expect(await other.find({ type: 'Text', text: 'engine result' })).toBeDefined()
      await other.unmount()
    }
  }
})
