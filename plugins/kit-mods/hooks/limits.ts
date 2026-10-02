// Context window and session (5-hour) / weekly (7-day) plan limits: pure helpers for the band.
import type { SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { KitModsContext, KitModsLimit } from '../types'

// Fixed colors for the meters that aren't limits, so they never read as a warning.
export const CONTEXT_COLOR = '#58a6ff'
export const PLAN_COLOR = '#a371f7'
export const AGENTS_COLOR = '#db6d28'

export function pickContext(context: SessionContextUsage): KitModsContext | null {
  if (!context.window || context.tokens === undefined) return null
  const percent = context.percent ?? Math.round((context.tokens / context.window) * 100)
  return { tokens: context.tokens, window: context.window, percent }
}

export function shortTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

const LABELS: Record<string, string> = { five_hour: 'Session', seven_day: 'Week' }

export const pickLimits = (rateLimits: readonly SessionRateLimit[]): KitModsLimit[] =>
  rateLimits
    .filter(limit => limit.kind in LABELS)
    .map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))

// Whether an old reading can still stand: only while its window hasn't reset. A
// reading with no (or an unreadable) reset time can't be aged, so it isn't carried.
const isCurrent = (limit: KitModsLimit, now: number): boolean =>
  limit.resetsAt !== undefined && Date.parse(limit.resetsAt) > now

// The engine reports only what the *last* API response carried, so a response
// without rate-limit headers (a side call, a fresh or resumed session) reads as
// no limits at all. Keep each window's last reading until it resets.
export function mergeLimits(previous: readonly KitModsLimit[], latest: readonly KitModsLimit[], now: number): KitModsLimit[] {
  const byKind = new Map(previous.filter(limit => isCurrent(limit, now)).map(limit => [limit.kind, limit]))
  for (const limit of latest) byKind.set(limit.kind, limit)
  return Object.keys(LABELS).flatMap(kind => byKind.get(kind) ?? [])
}

// What `$.store` hands back is unchecked JSON from disk.
export function parseStoredLimits(value: unknown): KitModsLimit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const { kind, percentUsed, resetsAt } = item as Record<string, unknown>
    if (typeof kind !== 'string' || !(kind in LABELS) || typeof percentUsed !== 'number') return []
    return [{ kind, percentUsed, resetsAt: typeof resetsAt === 'string' ? resetsAt : undefined }]
  })
}

export const limitLabel = (kind: string): string => LABELS[kind] ?? kind

const clamp = (percent: number): number => Math.max(0, Math.min(100, percent))

// Terminal bar: how many of `width` cells are filled.
export const filledCells = (percent: number, width: number): number => Math.round((clamp(percent) / 100) * width)

export const limitColor = (percent: number): string => (percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : 'green')

const HEX: Record<string, string> = { green: '#3fb950', yellow: '#d29922', red: '#f85149' }

export const limitHex = (percent: number): string => HEX[limitColor(percent)] ?? '#3fb950'

// Desktop bar: a rounded track with a rounded fill in `color`, drawn at `width` x 6 px.
export function barSvg(percent: number, width: number, color: string): string {
  const fill = clamp(percent) === 0 ? 0 : Math.max(6, (clamp(percent) / 100) * width)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="6" viewBox="0 0 ${width} 6">` +
    `<rect width="${width}" height="6" rx="3" fill="#8b949e" fill-opacity="0.25"/>` +
    `<rect width="${fill.toFixed(1)}" height="6" rx="3" fill="${color}"/>` +
    '</svg>'
  )
}

// "2h 10m", "3d 4h", "12m"; undefined when the window has no reset time.
export function untilReset(resetsAt: string | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const ms = Date.parse(resetsAt) - now
  if (Number.isNaN(ms)) return undefined
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}
