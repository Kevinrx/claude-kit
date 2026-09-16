---
name: handoff
description: Save exactly where the current work stands so it can be resumed in a fresh session or on another machine (e.g. moving from the Windows PC to the work Mac). Writes a handoff section into the plan's PROGRESS.md and, if I agree, commits and pushes a WIP.
disable-model-invocation: true
---

# Handoff

1. **Where.** The active plan's `PROGRESS.md`. No plan → create `.claude/plans/<slug>/PROGRESS.md` with a one-line objective.
2. **Write** a `## Handoff — <YYYY-MM-DD>` section:
   - goal (one line), branch, last commit
   - done, with evidence (command + result)
   - in progress: exactly where you stopped (`file:line`) and what was half-done
   - next steps, in order
   - gotchas: what failed, what's been ruled out, environment quirks, the commands that matter
   - uncommitted changes (`git status --short`)
3. **Ask me** whether to commit a WIP (`wip: handoff <slug>`) and push the branch so the other machine can pick it up. Touch nothing in git without a yes. If `.claude/plans/` is in `.git/info/exclude`, the file won't travel with a push — say so, and offer to paste the handoff into the PR or issue instead.
4. **Tell me the resume command**: `/kit:implement <slug>`, or "read `.claude/plans/<slug>/PROGRESS.md` and continue".
