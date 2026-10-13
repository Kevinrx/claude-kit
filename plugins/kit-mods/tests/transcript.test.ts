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
  on('ui.render', { component: 'ToolUse' }, ($, e) => $.ui.resolve(e).Text({ children: 'engine row ' + e.props.tool }))
  on('ui.render', { component: 'ToolResult' }, ($, e) => $.ui.resolve(e).Text({ children: 'engine result' }))
  return clock
}

const group = (calls: ToolGroupCall[], isExpanded = false) =>
  ({ component: 'ToolGroup', requestId: 'g1', props: { calls, isActive: false, isExpanded } }) as const

const row = (id: string, extra: Partial<ToolGroupCall> & { tool: string }) =>
  ({
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, input: {}, isRunning: false, isErrored: false, isInterrupted: false, ...extra },
  }) as const

test('a folded group is the engine’s own line', async ($, on) => {
  engine(on)
  await $.session.start(START)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'kit-mods', surface, ...group([call('Bash', { command: 'ls' }, { tool_use_id: 'f1' })]) })
    expect(await ui.find({ type: 'Text', text: 'engine group' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓' })).toBe(undefined)
    await ui.unmount()
  }
})

test('rows of an expanded group add status, duration, a failed tail and a capped diff', async ($, on) => {
  const clock = engine(on)
  on('tool.call', { tool: 'Bash' }, async () => {
    await clock.advance(4200)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'git status' })
  const failed = 'Exit code 1\nfirst\nsecond\nthird\nfourth'
  const edit = editOutput(Array.from({ length: 30 }, (_, i) => `+line ${i}`))
  const calls = [
    call('Bash', { command: 'git status' }, { tool_use_id: 't1' }),
    call('Bash', { command: 'npm test' }, { tool_use_id: 't2', isErrored: true, output: failed }),
    call('Edit', {}, { tool_use_id: 't3', output: edit }),
    call('Read', {}, { tool_use_id: 't4', isRunning: true }),
  ]

  for (const surface of SURFACES) {
    const card = await $.ui.mount({ plugin: 'kit-mods', surface, ...group(calls, true) })
    expect(await card.find({ type: 'Text', text: 'engine group' })).toBeDefined()
    await card.unmount()

    const ok = await $.ui.mount({ plugin: 'kit-mods', surface, ...row('t1', { tool: 'Bash' }) })
    expect(await ok.find({ type: 'Text', text: 'engine row Bash' })).toBeDefined()
    expect(await ok.find({ type: 'Text', text: '✓' })).toBeDefined()
    expect(await ok.find({ type: 'Text', text: '4.2s' })).toBeDefined()
    await ok.unmount()

    // The failed command's last three lines, not the fourth from the end.
    const bad = await $.ui.mount({ plugin: 'kit-mods', surface, ...row('t2', { tool: 'Bash', isErrored: true, output: failed }) })
    expect(await bad.find({ type: 'Text', text: '✗' })).toBeDefined()
    expect(await bad.find({ type: 'Text', text: /fourth/ })).toBeDefined()
    expect(await bad.find({ type: 'Text', text: /second/ })).toBeDefined()
    expect(await bad.find({ type: 'Text', text: /first/ })).toBe(undefined)
    await bad.unmount()

    const edited = await $.ui.mount({ plugin: 'kit-mods', surface, ...row('t3', { tool: 'Edit', output: edit }) })
    const code = await edited.find({ type: 'Code' })
    expect(code?.props).toEqual(expect.objectContaining({ format: 'diff', path: 'C:\\repo\\src\\app.ts' }))
    expect(String((code?.props as { source?: string } | undefined)?.source).split('\n').length).toBe(21)
    expect(await edited.find({ type: 'Text', text: '… 10 more lines' })).toBeDefined()
    await edited.unmount()

    const running = await $.ui.mount({ plugin: 'kit-mods', surface, ...row('t4', { tool: 'Read', isRunning: true }) })
    expect(await running.find({ type: 'Text', text: 'running' })).toBeDefined()
    await running.unmount()
  }
})

test('a standalone row gets its mark but leaves the detail to its result block', async ($, on) => {
  engine(on)
  await $.session.start(START)
  for (const surface of SURFACES) {
    const bad = await $.ui.mount({ plugin: 'kit-mods', surface, ...row('s1', { tool: 'Bash', isErrored: true, output: 'boom' }) })
    expect(await bad.find({ type: 'Text', text: '✗' })).toBeDefined()
    expect(await bad.find({ type: 'Text', text: /boom/ })).toBe(undefined)
    await bad.unmount()

    const edited = await $.ui.mount({ plugin: 'kit-mods', surface, ...row('s2', { tool: 'Edit', output: editOutput(['+x']) }) })
    expect(await edited.find({ type: 'Code' })).toBe(undefined)
    await edited.unmount()
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
