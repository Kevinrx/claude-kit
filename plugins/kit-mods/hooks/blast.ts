// Blast radius: recognize the destructive commands kit's guard-commands hook
// asks about, and format what they would destroy. Measuring happens in
// register.tsx; this never blocks anything, guard-commands stays the gate.

export type Risk =
  | { kind: 'reset-hard'; cwd: string | undefined }
  | { kind: 'discard'; cwd: string | undefined }
  | { kind: 'clean'; cwd: string | undefined; flags: string[] }
  | { kind: 'force-push'; cwd: string | undefined }
  | { kind: 'rm'; cwd: string | undefined; paths: string[] }

const MAX_LISTED = 5

// shortcut: splits on && || ; | and newlines without a real shell parser, so
// quoting, subshells and variables aren't understood. A command that hides its
// target that way shows "couldn't measure" or nothing; guard-commands still asks.
export function classify(command: string): Risk | undefined {
  let cwd: string | undefined
  for (const raw of command.split(/&&|\|\||[;|\n]/)) {
    const words = raw.trim().split(/\s+/).filter(Boolean)
    if (words[0] === 'cd' && words[1] !== undefined) {
      cwd = joinPath(cwd, unquote(words[1]))
      continue
    }
    const risk = classifyWords(words, cwd)
    if (risk) return risk
  }
  return undefined
}

function classifyWords(words: string[], cwd: string | undefined): Risk | undefined {
  if (words[0] === 'git') {
    let rest = words.slice(1)
    while (rest[0] === '-C' && rest[1] !== undefined) {
      cwd = joinPath(cwd, unquote(rest[1]))
      rest = rest.slice(2)
    }
    const [sub, ...args] = rest
    if (sub === 'reset' && args.includes('--hard')) return { kind: 'reset-hard', cwd }
    if ((sub === 'checkout' || sub === 'restore') && args.filter(a => a !== '--').join(' ') === '.') return { kind: 'discard', cwd }
    if (sub === 'clean') {
      const flags = args.filter(a => /^-\w+$/.test(a)).join('')
      if (flags.includes('f')) return { kind: 'clean', cwd, flags: ['d', 'x', 'X'].filter(f => flags.includes(f)) }
    }
    if (sub === 'push' && args.some(a => a === '-f' || a.startsWith('--force') || a.startsWith('+'))) return { kind: 'force-push', cwd }
    return undefined
  }
  if (words[0] === 'rm' && words.slice(1).some(a => /^-\w*[rR]/.test(a) || a === '--recursive')) {
    return { kind: 'rm', cwd, paths: words.slice(1).filter(a => !a.startsWith('-')).map(unquote) }
  }
  return undefined
}

const unquote = (word: string): string => word.replace(/^(['"])(.*)\1$/, '$2')

const isAbsolute = (path: string): boolean => /^([\\/]|[A-Za-z]:)/.test(path) || path.startsWith('~')

export function joinPath(base: string | undefined, path: string): string {
  if (base === undefined || isAbsolute(path)) return path
  return `${base.replace(/[\\/]+$/, '')}/${path}`
}

// A path the band can't measure without a shell: globs, variables, ~.
export const isUnmeasurable = (path: string): boolean => /[*?$`{]|^~/.test(path)

export function describeRisk(risk: Risk): string {
  switch (risk.kind) {
    case 'reset-hard':
      return 'git reset --hard discards every uncommitted change'
    case 'discard':
      return 'discards every unstaged change'
    case 'clean':
      return 'git clean deletes untracked files'
    case 'force-push':
      return 'force push replaces the remote branch'
    case 'rm':
      return 'rm -r deletes'
    default: {
      const unreachable: never = risk
      return unreachable
    }
  }
}

// `git diff --stat` output → the summary line, then the first files.
export function diffSummary(out: string): string[] {
  if (!out.trim()) return ['nothing to discard']
  const lines = out.trimEnd().split('\n')
  const summary = lines.pop()?.trim() ?? ''
  return [summary, ...listed(lines.map(line => line.trim()))]
}

// `git clean -n` output → how many paths, then the first ones.
export function cleanSummary(out: string): string[] {
  const paths = out.trim() ? out.trim().split('\n').map(line => line.replace(/^Would remove /, '')) : []
  return paths.length === 0 ? ['nothing to delete'] : [`${paths.length} untracked path(s)`, ...listed(paths)]
}

// `git log --oneline HEAD..@{u}` output → the remote commits a force push drops.
export function pushSummary(upstream: string, out: string): string[] {
  const commits = out.trim() ? out.trim().split('\n') : []
  if (commits.length === 0) return [`drops no commits from ${upstream} (as of the last fetch)`]
  return [`drops ${commits.length} commit(s) from ${upstream} (as of the last fetch)`, ...listed(commits)]
}

export function listed(items: readonly string[]): string[] {
  const shown = items.slice(0, MAX_LISTED).map(item => `  ${item}`)
  return items.length > MAX_LISTED ? [...shown, `  … and ${items.length - MAX_LISTED} more`] : shown
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
