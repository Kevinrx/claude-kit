// kit-mods: one band above the prompt (limits, active plan, running subagents,
// blast radius of a pending destructive command) plus the delegation guard.
// Everything that touches `$` lives in this file: the engine only follows `$`
// into functions declared here, so the other files hold pure logic.
import type { EngineInterface, Register } from 'claude-code'

import type { KitModsAgent, KitModsLimit } from '../types'
import type { Risk } from './blast'
import { classify, cleanSummary, describeRisk, diffSummary, formatBytes, isUnmeasurable, joinPath, pushSummary } from './blast'
import { MAX_RUNNING, spawnRefusal } from './delegation'
import {
  AGENTS_COLOR,
  barSvg,
  CONTEXT_COLOR,
  filledCells,
  limitHex,
  limitLabel,
  mergeLimits,
  parseStoredLimits,
  pickContext,
  pickLimits,
  PLAN_COLOR,
  shortTokens,
  untilReset,
} from './limits'
import type { ParsedPlan } from './plan'
import { isProgressFile, parsePlan, pickActive, PLANS_DIR } from './plan'

const limitsRef = { plugin: 'kit-mods', key: 'limits' } as const
const contextRef = { plugin: 'kit-mods', key: 'context' } as const
const LIMITS_STORE_KEY = 'limits'
const planRef = { plugin: 'kit-mods', key: 'plan' } as const
const agentsRef = { plugin: 'kit-mods', key: 'agents' } as const
const blastRef = { plugin: 'kit-mods', key: 'blast' } as const

const MAX_WALK = 10_000

// Per Agent call, whether the model asked for a worktree: the Agent tool's
// input carries `isolation`, the agent.spawn event that follows doesn't.
// Lost on a hot reload, which only makes the writer check more lenient.
const isolationByToolUse = new Map<string, boolean>()
const isWorktreeByAgent = new Map<string, boolean>()
// Spawns past the check but not yet listed by `$.agent.list()`, by tool_use_id.
const starting = new Map<string, KitModsAgent>()
// The limits last written to `$.store`, so an unchanged reading isn't rewritten every minute.
let savedLimits = ''

// Work after `next` only redraws the band: a failure there must never fail the
// hook after the tool already ran, so it's dropped (the band is just stale).
async function quietly(work: Promise<unknown>): Promise<void> {
  try {
    await work
  } catch {
    // nothing to do: the next refresh redraws it
  }
}

// `seed` is the last reading saved by an earlier session, used only at session start.
async function refreshUsage($: EngineInterface, seed: readonly KitModsLimit[] = []): Promise<void> {
  const [{ rateLimits, context }, { value: previous = [] }, now] = await Promise.all([
    $.session.usage(),
    $.state.get(limitsRef),
    $.clock.now(),
  ])
  const latest = pickLimits(rateLimits)
  const limits = mergeLimits([...seed, ...previous], latest, now)
  await Promise.all([$.state.set(limitsRef, limits), $.state.set(contextRef, pickContext(context))])
  const serialized = JSON.stringify(limits)
  if (latest.length > 0 && serialized !== savedLimits) {
    await $.store.set(LIMITS_STORE_KEY, limits)
    savedLimits = serialized
  }
}

async function refreshPlan($: EngineInterface): Promise<void> {
  if (!(await $.fs.exists(PLANS_DIR))) {
    await $.state.set(planRef, null)
    return
  }
  const plans: { mtimeMs: number; plan: ParsedPlan }[] = []
  for (const entry of await $.fs.list(PLANS_DIR)) {
    const progressPath = `${PLANS_DIR}/${entry.name}/PROGRESS.md`
    const planPath = `${PLANS_DIR}/${entry.name}/PLAN.md`
    if (entry.kind !== 'dir' || !(await $.fs.exists(progressPath))) continue
    const planText = (await $.fs.exists(planPath)) ? await $.fs.read(planPath) : ''
    const plan = parsePlan(entry.name, planText, await $.fs.read(progressPath))
    plans.push({ mtimeMs: (await $.fs.stat(progressPath)).mtimeMs, plan })
  }
  await $.state.set(planRef, pickActive(plans, await $.clock.now()))
}

async function runningAgents($: EngineInterface): Promise<KitModsAgent[]> {
  const agents = await $.agent.list()
  return agents
    .filter(agent => agent.status === 'running')
    .map(agent => ({ type: agent.type, isWorktree: isWorktreeByAgent.get(agent.id) ?? false }))
}

async function refreshAgents($: EngineInterface): Promise<void> {
  await $.state.set(agentsRef, await runningAgents($))
}

async function git($: EngineInterface, cwd: string | undefined, args: string[]): Promise<string> {
  const run = await $.process.run(['git', ...args], { cwd, timeoutMs: 10_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim().split('\n')[0] || `git ${args[0] ?? ''} failed`)
  return run.stdout
}

async function walk($: EngineInterface, root: string): Promise<{ files: number; bytes: number; isCapped: boolean }> {
  const stat = await $.fs.stat(root)
  if (stat.kind !== 'dir') return { files: 1, bytes: stat.size, isCapped: false }
  let files = 0
  let bytes = 0
  const queue = [root]
  for (let dir = queue.pop(); dir !== undefined; dir = queue.pop()) {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind === 'dir') {
        queue.push(`${dir}/${entry.name}`)
        continue
      }
      files += 1
      bytes += entry.size
      if (files >= MAX_WALK) return { files, bytes, isCapped: true }
    }
  }
  return { files, bytes, isCapped: false }
}

async function measurePaths($: EngineInterface, cwd: string | undefined, paths: readonly string[]): Promise<string[]> {
  const lines: string[] = []
  for (const given of paths) {
    const path = joinPath(cwd, given)
    if (isUnmeasurable(path)) lines.push(`${given}: couldn't measure (glob, variable or ~)`)
    else if (!(await $.fs.exists(path))) lines.push(`${given}: doesn't exist`)
    else {
      const { files, bytes, isCapped } = await walk($, path)
      lines.push(`${given}: ${isCapped ? 'over ' : ''}${files} file(s), ${formatBytes(bytes)}`)
    }
  }
  return lines
}

async function measureRisk($: EngineInterface, risk: Risk): Promise<string[]> {
  switch (risk.kind) {
    case 'reset-hard':
      return diffSummary(await git($, risk.cwd, ['diff', '--stat', 'HEAD']))
    case 'discard':
      return diffSummary(await git($, risk.cwd, ['diff', '--stat']))
    case 'clean':
      return cleanSummary(await git($, risk.cwd, ['clean', '-n', ...risk.flags.map(flag => `-${flag}`)]))
    case 'force-push': {
      const upstream = (await git($, risk.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')).trim()
      if (!upstream) return ["no upstream branch: can't tell which remote commits would be dropped"]
      return pushSummary(upstream, await git($, risk.cwd, ['log', '--oneline', 'HEAD..@{u}']))
    }
    case 'rm':
      return measurePaths($, risk.cwd, risk.paths)
    default: {
      const unreachable: never = risk
      return unreachable
    }
  }
}

// Shows what the command would destroy for as long as it's pending, which
// covers guard-commands' permission ask beneath this hook.
// shortcut: measures in the session's directory (or a `cd` / `git -C` inside the
// command); a mod can't see the Bash tool's remembered cwd from earlier calls, so
// after a bare `cd` in a previous call it may measure the wrong place. Upgrade if
// the engine ever puts the shell's cwd on the tool.call event.
async function withBlastRadius<T>($: EngineInterface, command: string, run: () => Promise<T>): Promise<T> {
  const risk = classify(command)
  if (risk === undefined) return run()
  const lines = await measureRisk($, risk).catch((error: unknown) => [
    `couldn't measure it: ${error instanceof Error ? error.message : String(error)}`,
  ])
  await $.state.set(blastRef, { command: `${describeRisk(risk)}: ${command.slice(0, 60)}`, lines })
  try {
    return await run()
  } finally {
    await quietly($.state.set(blastRef, null))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const seed = parseStoredLimits(await $.store.get(LIMITS_STORE_KEY))
    await Promise.all([refreshUsage($, seed), refreshPlan($), refreshAgents($)])
    // Keeps the reset countdowns current between turns, and catches subagents
    // whose status flipped to done after their own turn.complete refresh.
    $.clock.every(60_000, () => void quietly(Promise.all([refreshUsage($), refreshAgents($)])))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await quietly(Promise.all([refreshUsage($), refreshPlan($)]))
    await quietly(refreshAgents($))
    return result
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    isolationByToolUse.set(e.tool_use_id, e.isolation === 'worktree')
    try {
      return await next(e)
    } finally {
      isolationByToolUse.delete(e.tool_use_id)
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const isWorktree = isolationByToolUse.get(e.tool_use_id)
    // Only the model's own Agent calls are held to the rules, not a plugin's spawns.
    if (isWorktree === undefined) return next(e)

    const refusal = spawnRefusal(e.subagentType, isWorktree, [...(await runningAgents($)), ...starting.values()])
    if (refusal !== undefined) return { deny: refusal }

    starting.set(e.tool_use_id, { type: e.subagentType, isWorktree })
    try {
      const started = await next(e)
      if (started.agentId !== undefined) isWorktreeByAgent.set(started.agentId, isWorktree)
      return started
    } finally {
      starting.delete(e.tool_use_id)
      await quietly(refreshAgents($))
    }
  })

  // /kit:implement logs each step to PROGRESS.md mid-turn: redraw the plan row
  // right away instead of waiting for the turn to end.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)
    if (isProgressFile(e.file_path)) await quietly(refreshPlan($))
    return result
  })
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)
    if (isProgressFile(e.file_path)) await quietly(refreshPlan($))
    return result
  })

  on('tool.call', { tool: 'Bash' }, ($, e, next) => withBlastRadius($, e.command, () => next(e)))
  on('tool.call', { tool: 'PowerShell' }, ($, e, next) => withBlastRadius($, e.command, () => next(e)))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const [{ value: limits = [] }, { value: context = null }, { value: plan = null }, { value: agents = [] }, { value: blast = null }] =
      await Promise.all([
        $.state.get(limitsRef),
        $.state.get(contextRef),
        $.state.get(planRef),
        $.state.get(agentsRef),
        $.state.get(blastRef),
      ])
    if (limits.length === 0 && context === null && plan === null && agents.length === 0 && blast === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined
    const now = await $.clock.now()
    const cells = e.props.bodyColumns >= 100 ? 12 : 6

    const meters: { label: string; percent: number; color: string; detail?: string }[] = [
      ...(context === null
        ? []
        : [{ label: 'Context', percent: context.percent, color: CONTEXT_COLOR, detail: `${shortTokens(context.tokens)}/${shortTokens(context.window)}` }]),
      ...limits.map(limit => {
        const reset = untilReset(limit.resetsAt, now)
        return {
          label: limitLabel(limit.kind),
          percent: limit.percentUsed,
          color: limitHex(limit.percentUsed),
          detail: reset === undefined ? undefined : `↻ ${reset}`,
        }
      }),
    ]

    // A rounded SVG bar where the surface draws SVG (desktop), a line of ━ on the terminal.
    const meterBar = (percent: number, color: string) =>
      Svg !== undefined ? (
        <Svg source={barSvg(percent, cells * 8, color)} alt={`${Math.round(percent)}% used`} width={cells * 8} height={6} />
      ) : (
        <Text>
          <Text color={color}>{'━'.repeat(filledCells(percent, cells))}</Text>
          <Text dimColor>{'━'.repeat(cells - filledCells(percent, cells))}</Text>
        </Text>
      )

    return (
      <Box flexDirection="column" paddingX={1}>
        {blast !== null && (
          <Box key="blast" flexDirection="column">
            <Text color="red" bold>
              ⚠ {blast.command}
            </Text>
            {blast.lines.map(line => (
              <Text color="red">{line}</Text>
            ))}
          </Box>
        )}
        {/* Every meter in one row that wraps when the band runs out of width.
            Each group keeps its own width, so a meter never splits across lines;
            the gap stands in for separators, which would dangle at a line start. */}
        {(meters.length > 0 || plan !== null || agents.length > 0) && (
          <Box key="meters" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={3}>
            {meters.map(meter => (
              <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
                <Text>{meter.label}</Text>
                {meterBar(meter.percent, meter.color)}
                <Text bold color={meter.color}>{`${Math.round(meter.percent)}%`}</Text>
                {meter.detail !== undefined && <Text dimColor>{meter.detail}</Text>}
              </Box>
            ))}
            {plan !== null && (
              <Box key="plan" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
                <Text>Plan</Text>
                {meterBar(plan.total === 0 ? 0 : (plan.done / plan.total) * 100, PLAN_COLOR)}
                <Text bold color={PLAN_COLOR}>{`${plan.done}/${plan.total}`}</Text>
                <Text>{plan.title}</Text>
                {plan.status === 'done' ? (
                  <Text color={limitHex(0)}>✓ done</Text>
                ) : (
                  <Text dimColor>{`· ${plan.status}`}</Text>
                )}
                {plan.others > 0 && <Text dimColor>{`· +${plan.others} open`}</Text>}
              </Box>
            )}
            {agents.length > 0 && (
              <Box key="agents" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
                <Text>Agents</Text>
                {meterBar((agents.length / MAX_RUNNING) * 100, AGENTS_COLOR)}
                <Text bold color={agents.length >= MAX_RUNNING ? limitHex(100) : AGENTS_COLOR}>{`${agents.length}/${MAX_RUNNING}`}</Text>
                <Text dimColor>{agents.map(agent => (agent.isWorktree ? `${agent.type} (worktree)` : agent.type)).join(', ')}</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
