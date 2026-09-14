---
name: learn
description: Turn a mistake or a repeated failure into a durable rule, in the cheapest place that will actually prevent it — a guard hook with a test, a CLAUDE.md line, a stack-skill checklist item, or a memory. Use when I say "remember this" or "don't do that again", or when the same failure shows up a second time.
argument-hint: "[the lesson]"
---

# Learn

A failure seen twice becomes a rule the same day. The question is where the rule lives, because a rule in the wrong place is either ignored or noise in every session.

## 1. State the lesson

One sentence: the situation, the wrong move, the right move. Include the evidence (the command, the error, the diff). If I didn't say what the lesson is, propose one and confirm.

## 2. Pick the cheapest place that will actually stop it

Prefer mechanisms over prose — a hook can't be forgotten; a sentence can.

| The lesson is… | Put it in | Example |
|---|---|---|
| a command or edit that must never happen silently | a guard in the kit (`plugins/kit/hooks/guard-*.mjs`) + a test in `tests/<hook>.test.mjs` | "ask before `rails db:seed:replant`" |
| a check that must pass before finishing, in one repo | that repo's `.claude/gate` (`/kit:gate`) | "run `tsc` too" |
| a convention of one repo | that repo's `CLAUDE.md` (or `AGENTS.md`) | "money is integer cents" |
| a pitfall of a stack, in any repo | the stack skill's rules or review checklist (`plugins/kit/skills/stack-*/SKILL.md`) | "`find_by` returns nil — handle it" |
| how I want you to work, everywhere | `global/CLAUDE.md` in the kit | "ask before adding a dependency" |
| a fact about me, a machine, or a project that isn't in any file | auto memory | "the work Mac has no Docker" |

Kit files: edit the claude-kit repo (find it with `git -C ~/claude-kit rev-parse --show-toplevel`), never the plugin cache under `~/.claude/plugins/`. `global/CLAUDE.md` applies immediately; plugin changes need commit, push and `claude plugin update kit@claude-kit`.

## 3. Draft, show, apply on yes

- Keep it to the fewest words that change behavior. Check the target file doesn't already say it (update instead of duplicating).
- Hooks: follow the kit's `CLAUDE.md` — logic inside `main()`, a test, `npm test` green.
- Tell me where it went and, for kit changes, what I need to run to pick it up.
