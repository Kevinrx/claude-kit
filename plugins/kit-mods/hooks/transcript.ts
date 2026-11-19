// Pure logic for the transcript rows: what each call in a folded tool group
// says about itself, and the capped diff an Edit or Write draws.

export const DIFF_CAP = 20
export const TAIL_LINES = 3

export type CallStatus = 'running' | 'ok' | 'error' | 'interrupted'
export type EditDiff = { path: string; added: number; removed: number; hunks: string; hiddenLines: number }
type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const field = (value: unknown, key: string): string | undefined => {
  const found = isRecord(value) ? value[key] : undefined
  return typeof found === 'string' && found !== '' ? found : undefined
}

const TAB = '    '
// CSI (colours, cursor moves) and OSC (titles, hyperlinks) escape sequences.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu

// One line made safe to draw: a tree holding a control character is refused
// (the engine then draws its own row), and invisible characters (bidi
// overrides, zero-width spaces) could reorder or hide what a line says. Escape
// sequences go whole, tabs become spaces, every other such character is dropped.
export function drawable(line: string): string {
  return line.replace(ESCAPES, '').replaceAll('\t', TAB).replace(INVISIBLE, '')
}

export function truncate(text: string, max: number): string {
  if (max < 2 || text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

// The last two segments of a path, either separator: `hooks/register.tsx`.
export function shortPath(path: string): string {
  return drawable(path.split(/[\\/]/).filter(Boolean).slice(-2).join('/'))
}

export function callStatus(call: { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }): CallStatus {
  if (call.isInterrupted) return 'interrupted'
  if (call.isRunning) return 'running'
  return call.isErrored ? 'error' : 'ok'
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

// The last lines of a failed call's output: the text the model read, or a
// record's stderr then stdout.
export function outputTail(output: unknown, count = TAIL_LINES): string[] {
  const text = typeof output === 'string' ? output : [field(output, 'stderr'), field(output, 'stdout')].filter(Boolean).join('\n')
  return text
    .split(/\r?\n/)
    .map(line => drawable(line).trimEnd())
    .filter(line => line.trim() !== '')
    .slice(-count)
}

function readHunks(value: unknown): Hunk[] | undefined {
  if (!Array.isArray(value)) return undefined
  const hunks: Hunk[] = []
  for (const hunk of value) {
    if (!isRecord(hunk) || !Array.isArray(hunk.lines)) return undefined
    const { oldStart, oldLines, newStart, newLines } = hunk
    if (![oldStart, oldLines, newStart, newLines].every(n => typeof n === 'number')) return undefined
    hunks.push({
      oldStart: oldStart as number,
      oldLines: oldLines as number,
      newStart: newStart as number,
      newLines: newLines as number,
      lines: hunk.lines.filter((line): line is string => typeof line === 'string').map(line => line.slice(0, 1) + drawable(line.slice(1))),
    })
  }
  return hunks
}

// Hunks cut to `cap` body lines in all. A cut hunk gets its header recounted
// from the lines it keeps, so the source still parses as a unified diff.
function capHunks(hunks: readonly Hunk[], cap: number): { text: string; hidden: number } {
  const parts: string[] = []
  let room = cap
  let hidden = 0
  for (const hunk of hunks) {
    const body = hunk.lines.filter(line => !line.startsWith('\\'))
    if (room <= 0) {
      hidden += body.length
      continue
    }
    const kept = body.slice(0, room)
    hidden += body.length - kept.length
    room -= kept.length
    const oldLines = kept.filter(line => !line.startsWith('+')).length
    const newLines = kept.filter(line => !line.startsWith('-')).length
    parts.push(`@@ -${hunk.oldStart},${oldLines} +${hunk.newStart},${newLines} @@`, ...kept)
  }
  return { text: parts.join('\n'), hidden }
}

export function editDiff(tool: string, output: unknown, cap = DIFF_CAP): EditDiff | undefined {
  if ((tool !== 'Edit' && tool !== 'Write') || !isRecord(output) || output.staged === true) return undefined
  const filePath = field(output, 'filePath')
  if (filePath === undefined) return undefined
  const path = drawable(filePath)

  let hunks = readHunks(output.structuredPatch)
  if (tool === 'Write' && output.type === 'create' && typeof output.content === 'string') {
    const lines = output.content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
    hunks = [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(line => `+${drawable(line)}`) }]
  }
  if (hunks === undefined || hunks.length === 0) return undefined

  const body = hunks.flatMap(hunk => hunk.lines)
  const git = isRecord(output.gitDiff) ? output.gitDiff : undefined
  const added = typeof git?.additions === 'number' ? git.additions : body.filter(line => line.startsWith('+')).length
  const removed = typeof git?.deletions === 'number' ? git.deletions : body.filter(line => line.startsWith('-')).length
  const { text, hidden } = capHunks(hunks, cap)
  return { path, added, removed, hunks: text, hiddenLines: hidden }
}
