// The delegation rules from global/CLAUDE.md, enforced at spawn time:
// at most 3 subagents at once, and a writer running beside another writer
// gets its own worktree.
import type { KitModsAgent } from '../types'

export const MAX_RUNNING = 3

// Agent types that never edit files. Anything else (general-purpose,
// kit:implementer, a fork, an unknown plugin agent) counts as a writer.
const READ_ONLY = new Set([
  'Explore',
  'Plan',
  'claude-code-guide',
  'statusline-setup',
  'kit:researcher',
  'kit:reviewer',
  'kit:security-reviewer',
  'kit:analyst',
  'kit:ui-checker',
])

export const isWriter = (type: string): boolean => !READ_ONLY.has(type)

// Why the spawn breaks a rule, or undefined when it may start.
export function spawnRefusal(type: string, isWorktree: boolean, running: readonly KitModsAgent[]): string | undefined {
  if (running.length >= MAX_RUNNING) {
    const names = running.map(agent => agent.type).join(', ')
    return `kit-mods: ${running.length} subagents are already running (${names}). The kit allows at most ${MAX_RUNNING} at once: wait for one to finish, or do this yourself.`
  }
  const otherWriter = running.find(agent => isWriter(agent.type))
  if (isWriter(type) && !isWorktree && otherWriter !== undefined) {
    return `kit-mods: ${type} would edit files while ${otherWriter.type} is also running. Parallel writers need their own worktree: spawn it with isolation: "worktree", wait for the other one, or use a read-only agent (kit:researcher, Explore).`
  }
  return undefined
}
