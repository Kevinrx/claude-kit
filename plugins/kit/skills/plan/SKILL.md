---
name: plan
description: Turn a feature request, bug report or GitHub issue into a written plan that another session can execute, before any code is written. Use when asked to plan, scope, triage or investigate work, or when a task spans several files or has real unknowns. Not for one-file obvious changes.
argument-hint: "[issue number/url or description]"
---

# Plan

Output: `PLAN.md` + `PROGRESS.md` that you — or a fresh session on another machine — can execute with `/kit:implement` without asking anything. This is read-only investigation: the only files you write are the plan files.

If the task turns out to be a one-file, obvious change, say so and offer to just do it.

## 1. Discover the repo (never assume)

1. `CLAUDE.md` / `AGENTS.md` (root and nested) — they override this skill.
2. `CONTRIBUTING.md`, `docs/`, CI workflows (`.github/workflows/`), `package.json` scripts, `Gemfile` + `bin/`, `Rakefile`, `Makefile`.
3. Load the matching `kit:stack-*` skills.

Every command you put in the plan must be proven to exist — name where it comes from (`package.json` script `test`, `bin/rspec`, CI step "lint"). An invented `npm test` fails on first run.

## 2. Understand the request

- GitHub issue → `gh issue view <n> --comments`; read linked PRs and code.
- Verify each claim against the current code. Issues go stale — record what you confirmed and what was wrong.
- Features, or anything with unknowns: interview with `AskUserQuestion` in rounds until nothing material is open — approach, edge cases, UX, what's out of scope, and "how could this fail?". Don't ask what the code already answers. Skip the interview for a bug with a clear reproduction.

## 3. Write the plan

Location: the repo's convention if it has one; otherwise `.claude/plans/<slug>/`. If I don't want plans committed in this repo, add `.claude/plans/` to `.git/info/exclude` (local-only — never edit the team's `.gitignore` for this).

`PLAN.md`:

```markdown
# <title>
goal: <one checkable end state naming the commands that prove it — e.g. "`bin/rspec spec/requests/orders_spec.rb` and `npx eslint app/javascript` pass; checkout shows the discount line">
branch: <feature|fix|chore>/<slug> off <base branch>
source: <issue URL | chat>

## Objective
One sentence.

## Verified facts
- <claim> → <what the code actually says> (`path:line`)

## Approach
- pattern: <the technique this relies on, by name — "optimistic update in useCart", "idempotency key on POST /orders", or "none, plain procedural code">
- rejected: <the alternative not taken, and why>
- risk: <the main way this could fail in production>

## Steps
### 1. <title> — wave 1 — difficulty: low|medium|high
files: <paths>
do: <what changes, concretely>
done when: <command or observable behavior>

## Non-goals
## Verification gate
- `<command>` — source: <where it is defined>
## Risks / rollback
## Open questions
```

Rules for steps:
- **done when** is a command or an observable behavior, never "works".
- **wave**: steps in the same wave touch disjoint files and don't depend on each other, so they can run in parallel. When unsure, use sequential waves.
- **difficulty** decides who does it: `high` (architectural risk, tricky logic, wide blast radius) → opus; `low`/`medium` → sonnet or the main session. Differentiate — a plan where every step is `medium` wasn't scored.
- Order: schema/migrations/types → backend → frontend → docs.

`PROGRESS.md`: a first line `status: planned`, then an empty `## Log`.

## 4. Critique before presenting

Check, and fix in place:
- every step has a checkable **done when**; every gate command has a named source
- no two steps in the same wave share a file; dependent steps are in later waves
- destructive steps (migrations, deletions, data changes) have a rollback
- scope equals the request — nothing bigger, nothing adjacent
- difficulty is differentiated

For big or risky plans (more than ~6 steps, or touching auth, money, migrations or deletion), also spawn `kit:reviewer` in **plan-critique** mode with the plan path. Fresh eyes catch what the author can't.

## 5. Hand over

Show the goal line, the steps (one line each) and the open questions. Then stop. Implementation starts only when I say so (`/kit:implement <slug>`).

Also print the unattended variant, ready to paste — `/goal` keeps the session working until an evaluator sees the goal met in the transcript (it can't run commands itself, which is why the goal line names them). Run it in auto permission mode: `/goal` only removes the per-turn stop, not tool-permission prompts, and `--auto` on `/kit:implement` only pre-authorizes that skill's own commit/push/PR asks — without auto mode too, unrelated tool prompts will still stall the goal.

```
/goal Implement .claude/plans/<slug>/PLAN.md with /kit:implement --auto until: <goal line>
```

## Red flags

- "`npm test` is standard, it'll exist" → prove it from its source.
- "The issue explains itself" → verify its claims against the code.
- "goal: implement the feature" → not checkable. Name the command and its exit state.
- "I'll start on the easy part meanwhile" → no. Plan only.
