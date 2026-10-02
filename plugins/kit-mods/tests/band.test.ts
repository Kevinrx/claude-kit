import type { On, SessionRateLimit } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const SURFACES = ['terminal', 'desktop'] as const
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

type World = {
  rateLimits?: SessionRateLimit[]
  tokens?: number
  agents?: { id: string; description: string; type: string; status: string }[]
  files?: Record<string, string>
  gitStdout?: string
  stored?: Record<string, unknown>
}

// The world beneath the plugin, answered from memory: session state, limits,
// subagents, a flat file map (directories are implied by the paths) and git.
function world(on: On, { rateLimits = [], tokens, agents = [], files = {}, gitStdout = '', stored = {} }: World): void {
  mock.store(on, stored)
  const values = new Map<string, { value: unknown; version: number }>()
  on('state.get', ($, e) => ({ value: values.get(`${e.plugin}/${e.key}`) ?? { value: undefined, version: 0 } }))
  on('state.set', ($, e) => {
    const version = (values.get(`${e.plugin}/${e.key}`)?.version ?? 0) + 1
    values.set(`${e.plugin}/${e.key}`, { value: e.value, version })
    return { value: { isSet: true, version } }
  })

  // The engine hands fs hooks absolute, OS-spelled paths; the map is keyed relative.
  const rel = (path: string) => path.replace(/\\/g, '/').replace(/^.*?(?=\.claude\/|\.claude$)/, '')
  const paths = Object.keys(files)
  const isDir = (path: string) => paths.some(file => file.startsWith(`${rel(path)}/`))
  mock.clock(on, { now: Date.parse('2026-10-02T12:00:00Z') })
  // What the engine draws in the band when no plugin does.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, tokens }, rateLimits } }))
  on('agent.list', () => ({ value: agents }))
  on('fs.exists', ($, e) => ({ value: rel(e.path) in files || isDir(e.path) }))
  on('fs.read', ($, e) => ({ value: files[rel(e.path)] ?? '' }))
  on('fs.stat', ($, e) => ({ value: { kind: isDir(e.path) ? 'dir' : 'file', size: 1, mtimeMs: 5, isLink: false } }))
  on('fs.list', ($, e) => {
    const dir = rel(e.path)
    const names = new Set(paths.filter(file => file.startsWith(`${dir}/`)).map(file => file.slice(dir.length + 1).split('/')[0] ?? ''))
    return { value: [...names].map(name => ({ name, kind: isDir(`${dir}/${name}`) ? 'dir' : 'file', size: 1, mtimeMs: 5, isLink: false })) }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: gitStdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
}

test('draws limits, plan and agents on every surface that has the band', async ($, on) => {
  world(on, {
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-02T14:10:00Z' },
      { kind: 'seven_day', percentUsed: 91 },
    ],
    tokens: 110_000,
    agents: [
      { id: 'a1', description: 'scan', type: 'kit:researcher', status: 'running' },
      { id: 'a2', description: 'old', type: 'Explore', status: 'completed' },
    ],
    files: {
      '.claude/kit-plans/refresh/PLAN.md': '# Refresh tokens\n### 1. a\n### 2. b\n',
      '.claude/kit-plans/refresh/PROGRESS.md': 'status: in progress\n## Log\n- 1. a — done — ok\n',
    },
  })
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'kit-mods', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Session' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '91%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↻ 2h 10m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Context' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '110k/1M' })).toBeDefined()
    // Desktop draws the bars as SVG (context in its own blue); the terminal has no Svg and draws a line.
    // Five bars: context, session, week, plan, agents; plan purple and agents orange.
    const bars = await ui.findAll({ type: 'Svg' })
    expect(bars.length).toBe(surface === 'desktop' ? 5 : 0)
    if (surface === 'desktop') {
      expect(bars[0]?.props).toEqual(expect.objectContaining({ source: expect.stringContaining('#58a6ff') }))
      expect(bars[3]?.props).toEqual(expect.objectContaining({ source: expect.stringContaining('#a371f7') }))
      expect(bars[4]?.props).toEqual(expect.objectContaining({ source: expect.stringContaining('#db6d28') }))
    }
    expect((await ui.findAll({ type: 'Text', text: /^━+$/ })).length > 0).toBe(surface === 'terminal')
    expect(await ui.find({ type: 'Text', text: 'Plan' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1/2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Refresh tokens' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '· in progress' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Agents' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1/3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /kit:researcher/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Explore/ })).toBe(undefined)
    // One row for every meter, wrapping to the next line when the band is too narrow.
    const row = await ui.find({ type: 'Box', key: 'meters' })
    expect(row?.props).toEqual(expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap' }))
    expect(row?.text).toMatch(/Context.*Session.*Week.*Plan.*Agents/s)
    await ui.unmount()
  }
})

test('stays out of the way when there is nothing to show', async ($, on) => {
  world(on, {})
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'kit-mods', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /context|session|week|plan|agents/i })).toBe(undefined)
    await ui.unmount()
  }
})

test('starts from the limits an earlier session saved when the engine reports none yet', async ($, on) => {
  world(on, {
    stored: {
      limits: [
        { kind: 'five_hour', percentUsed: 44, resetsAt: '2026-10-02T15:00:00Z' },
        // Already reset at the mocked time: dropped, not shown stale.
        { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-10-01T00:00:00Z' },
      ],
    },
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: 'kit-mods', surface: 'desktop', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'Session' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '44%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Week' })).toBe(undefined)
  await ui.unmount()
})

test('moves the plan bar as soon as a step is logged, before the turn ends', async ($, on) => {
  const files: Record<string, string> = {
    '.claude/kit-plans/demo/PLAN.md': '# Demo\n### 1. One — wave 1\n### 2. Two — wave 1\n### 3. Three — wave 2\n',
    '.claude/kit-plans/demo/PROGRESS.md': 'status: in progress\n## Log\n',
  }
  world(on, { files })
  on('tool.call', { tool: 'Write' }, () => ({ result: { type: 'update', filePath: '', content: '', structuredPatch: [], originalFile: null } }))
  await $.session.start(START)

  const before = await $.ui.mount({ plugin: 'kit-mods', surface: 'desktop', ...BAND })
  expect(await before.find({ type: 'Text', text: '0/3' })).toBeDefined()
  await before.unmount()

  files['.claude/kit-plans/demo/PROGRESS.md'] = 'status: in progress\n## Log\n- 1. One — done — ok\n- 2. Two — done — ok\n'
  await $.tool.call({ tool: 'Write', tool_use_id: 'w1', file_path: 'C:\\repo\\.claude\\kit-plans\\demo\\PROGRESS.md', content: '' })

  const after = await $.ui.mount({ plugin: 'kit-mods', surface: 'desktop', ...BAND })
  expect(await after.find({ type: 'Text', text: '2/3' })).toBeDefined()
  await after.unmount()
})

test('shows the blast radius while a destructive command waits, then clears it', async ($, on) => {
  world(on, { gitStdout: ' a.rb | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n' })
  let seenWhilePending: string | undefined
  on('tool.call', { tool: 'Bash' }, async () => {
    const ui = await $.ui.mount({ plugin: 'kit-mods', surface: 'terminal', ...BAND })
    seenWhilePending = (await ui.find({ type: 'Text', text: /1 file changed/ }))?.text
    await ui.unmount()
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  await $.session.start(START)

  await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'git reset --hard' })
  expect(seenWhilePending).toMatch(/1 file changed/)

  const after = await $.ui.mount({ plugin: 'kit-mods', surface: 'terminal', ...BAND })
  expect(await after.find({ type: 'Text', text: /reset --hard/ })).toBe(undefined)
  await after.unmount()
})
