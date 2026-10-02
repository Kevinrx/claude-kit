// The active kit plan: formats from the plan and implement skills
// (PLAN.md `# title` and `### N. <title> — wave …` steps; PROGRESS.md `status:` and a `## Log`).
import type { KitModsPlan } from '../types'

export const PLANS_DIR = '.claude/kit-plans'

// A finished plan stays in the band this long, so its last step is seen landing.
export const SHOW_DONE_FOR_MS = 10 * 60_000

export type ParsedPlan = Omit<KitModsPlan, 'others'>

type Step = { number: string; title: string }

function parseSteps(planText: string): Step[] {
  return [...planText.matchAll(/^### (\d+)\.\s*(.+)$/gm)].map(([, number = '', heading = '']) => ({
    number,
    title: heading.split(/\s+—\s+wave\b/)[0]?.trim().toLowerCase() ?? '',
  }))
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A step counts as done when any log line marks it done, naming it by number
// (`- 1. …`, `step 1`) or by its whole title (`- <title> — …`, `(<title>)`), so
// the log's exact wording doesn't matter and a step logged twice (redone after a
// resume) still counts once. A title only matches as the line's subject, never
// as a substring of another step's title.
function isStepDone(step: Step, doneLines: readonly string[]): boolean {
  const byNumber = new RegExp(`^- (?:${step.number}\\.\\s|.*\\bstep ${step.number}\\b)`, 'i')
  const title = escapeRegExp(step.title)
  const byTitle = new RegExp(`^- (?:\\d+\\.\\s+)?${title}\\s+—|\\(${title}\\)`, 'i')
  return doneLines.some(line => byNumber.test(line) || (step.title !== '' && byTitle.test(line)))
}

// A log line that marks something done: "done" as a word, but not "not done".
const isDoneLine = (line: string): boolean => line.startsWith('- ') && /\bdone\b/i.test(line) && !/\bnot\s+done\b/i.test(line)

export function parsePlan(slug: string, planText: string, progressText: string): ParsedPlan {
  const steps = parseSteps(planText)
  const doneLines = progressText.split(/\r?\n/).filter(isDoneLine)
  return {
    slug,
    title: planText.match(/^# (.+)$/m)?.[1]?.trim() ?? slug,
    status: progressText.match(/^status:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown',
    total: steps.length,
    done: steps.filter(step => isStepDone(step, doneLines)).length,
  }
}

// The most recently touched open plan (or one finished in the last few
// minutes), and how many others are open.
export function pickActive(plans: readonly { mtimeMs: number; plan: ParsedPlan }[], now: number): KitModsPlan | null {
  const shown = plans.filter(({ plan, mtimeMs }) => plan.status !== 'done' || now - mtimeMs < SHOW_DONE_FOR_MS)
  const [latest] = [...shown].sort((a, b) => b.mtimeMs - a.mtimeMs)
  return latest ? { ...latest.plan, others: shown.length - 1 } : null
}

// Whether a file the model just wrote is a plan's PROGRESS.md (any OS spelling).
export const isProgressFile = (path: string): boolean => /(^|[\\/])\.claude[\\/]kit-plans[\\/][^\\/]+[\\/]PROGRESS\.md$/i.test(path)
