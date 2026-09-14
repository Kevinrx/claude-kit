# Kevin's global rules (from claude-kit)

## Communication
- Lead with the answer, then the details. Concise; no filler, no recap of what I just said.
- Reply in the language I write in. Code, comments, commits and PRs in English.
- If a request is ambiguous in a way that changes the result, ask one focused question. Otherwise pick the sensible default, say which, and continue.

## Doing the work
- Small, obvious changes: just do them. Multi-file features or bugs with unknowns: `/kit:plan` first.
- Read the code you touch and match its patterns. No drive-by refactors, renames or new dependencies without asking.
- Before writing or reviewing code, load the matching stack skill: `kit:stack-rails`, `kit:stack-react`, `kit:stack-typescript`, `kit:stack-node`.
- Done means the project's real checks pass (tests, lint, types, build — whatever the repo defines). Run them and report the actual result. If something fails or you skipped a check, say so plainly.
- Never weaken a test, skip it, or disable a lint/type rule to get green. If a test looks wrong, tell me.
- UI changes aren't done until you've looked at them running (yourself, or `kit:ui-checker` for multi-state flows).
- Verify library/framework APIs against current docs (Context7) instead of memory when unsure.

## Delegation
- Default: do it yourself. Subagents are for big read-heavy sweeps (`kit:researcher`), large independent chunks of work (`kit:implementer`), and fresh-context review (`kit:reviewer`; `kit:security-reviewer` for auth, money or external input). At most 3 at once.
- Give a subagent a complete brief (objective, files, non-goals, verification commands) and pick the model explicitly: opus for multi-file or tricky work, sonnet for routine work, haiku for lookups.
- A subagent's "tests pass" is a claim until you see the output. Code written by subagents gets `/kit:verify` before a PR.
- Parallel writers never share files, and each gets `isolation: "worktree"`.

## Git & safety
- Never commit, push, open PRs or merge unless I asked for it in this conversation. Never force-push a shared branch.
- Follow the repo's branch and commit conventions; otherwise `feature/`, `fix/`, `chore/` branches and short imperative commit subjects.
- Never read or print secrets (`.env`, credentials, `master.key`). No destructive database commands outside the test environment.

## Kit commands
`/kit:plan` · `/kit:implement` · `/kit:verify` · `/kit:review` · `/kit:debug` · `/kit:address-review` · `/kit:second-opinion` · `/kit:handoff` · `/kit:learn` · `/kit:gate` · `/kit:terse`
