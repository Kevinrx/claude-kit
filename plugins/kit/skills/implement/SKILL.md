---
name: implement
description: Execute a plan made with kit:plan (.claude/kit-plans/<slug>/PLAN.md) step by step until its goal is met, ending in a PR. Use when asked to implement, continue, resume or finish a plan.
argument-hint: "[plan slug or path] [--auto]"
---

# Implement

Done = every step's **done when** holds + the verification gate is green + delegated work is verified + PR open (if I want one). Not before, not "mostly".

`--auto`: skip the commit/push/PR confirmation stops below — this invocation stands as authorization for committing each step, pushing and opening the PR, scoped to this plan's branch only. Everything else (blocking open questions, dirty-tree handling, the 3-attempt gate limit, never weakening a test) still applies. Use for unattended runs, e.g. under `/goal`.

## 0. Load

- Find the plan: the argument, or the single plan whose `PROGRESS.md` isn't `status: done`. Several candidates → ask.
- Read `PLAN.md` and `PROGRESS.md`. When resuming (maybe from my other laptop), check the log against `git log` and the tree before trusting it.
- Load the `kit:stack-*` skills for the stack.

## 1. Validate before touching code

- Gate commands exist (check their source). The plan's facts still hold on the current base. Blocking open questions → ask me now.
- Missing or vague `goal:` → write one from the gate and the steps, and note it in `PROGRESS.md`.
- Ask once: may I commit each step on the plan branch? (Pushing and PRs are asked separately at the end.) Skip if `--auto`.
- Create or switch to the plan's branch. Dirty tree → ask before switching.
- Set `status: in progress` in `PROGRESS.md`.

## 2. Execute, one wave at a time

1. **Who**: do it yourself by default. Delegate to `kit:implementer` only when a wave has 2+ large independent steps, or one step is big and self-contained. Parallel writers get `isolation: "worktree"`. Model: `opus` for difficulty high, `sonnet` otherwise.
2. **Brief** (delegation only) — complete, so the agent never has to come back:
   ```
   ## Objective      one measurable sentence
   ## Inputs         absolute paths, patterns to copy, decisions already made, stack skills to load
   ## Deliverables   every file to create/change and what it must contain
   ## Non-goals      what not to touch, rename or "improve"
   ## Verification   exact commands that prove it (they exist in this repo)
   ## Parallel       sibling agents running now and their files — don't touch those
   Report: per deliverable done / partial / skipped, with pasted command output.
   An ambiguity this brief doesn't settle → stop and report the question; don't guess.
   ```
3. **Gate** after each step. Fail → fix and re-run, **max 3 attempts per step**. Then stop, paste the exact error into `PROGRESS.md`, and tell me.
4. **Pre-existing failures**: prove it — run the failing command on the base (`git stash` or a worktree). Zero *new* failures is the bar.
5. **UI steps**: run the app and look at it (browser tools / screenshot) before calling the step done. For a flow with several states to check, spawn `kit:ui-checker` with the URL or start command, the steps and the expected result of each.
6. Commit the step (if allowed) and append to `PROGRESS.md`: `- <step> — done — <command + result>`.

Never weaken a test, add a skip, or disable a lint/type rule to get green. If a test looks wrong, tell me.

## 3. Verify

- Any code a subagent wrote → `/kit:verify`. PARTIAL/FAIL → back to step 2 with the findings. One retry that differs from the first attempt (more context, stronger model); a second failure comes to me.
- Code you wrote yourself → your gate output is the evidence. Optionally `/kit:review` before the PR.

## 4. Finish

- Ask before pushing and before opening the PR (skip if `--auto`). Title: imperative, under ~70 chars, prefixed with the branch's type (`fix:`, `feat:`, `chore:`). `gh pr create` body:
  ```
  ## Summary
  <1-3 bullets: what changed and why>

  ## Test plan
  - [ ] <gate command> — <result>
  - [ ] <verifier verdict, if a subagent wrote code>
  ```
- Never merge.
- Set `status: done` in `PROGRESS.md`.

## Red flags

- "The failures look unrelated" → prove it against the base, or they're yours.
- "Fourth attempt is nearly there" → 3 means 3. Record the blocker and report.
- "The implementer said tests pass" → a claim until you see the output.
- "Renders fine, tests pass" → tests don't see layout. Look at it.
