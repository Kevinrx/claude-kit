---
name: verify
description: Independently verify work another agent or session wrote before trusting it, committing it or opening a PR. Spawns a fresh-context reviewer that re-runs the gate, hunts self-granted exceptions (skipped tests, disabled lint) and proves new tests fail without the change. Not for work you wrote yourself in this session.
argument-hint: "[plan slug | base branch]"
disable-model-invocation: true
---

# Verify

The usual failure of delegated work isn't a crash — it's a confident "done" that isn't. A report's narrative is not evidence; only command output is.

## When

- The diff was written by a subagent or another session, or
- it's about to become a PR / merge and nobody independent has looked at it.

Not when you wrote it yourself this session: your own gate run is the evidence. Don't re-review yourself for ceremony.

## How

1. Collect: the diff range (`git diff <base>...HEAD` plus uncommitted changes), the plan's **done when** lines / acceptance checks, the gate commands with their source, and whether the change touches a risk area (auth/permissions, multi-tenancy, money, migrations/data changes, deletion, UI behavior).
2. **You** decide what must be true and write it into the brief before spawning. A checker left to pick its own check picks one the work already passes.
3. Spawn `kit:reviewer` in **verify** mode with all of the above. Its default (Sonnet) is enough for L1/L2/L3, which are mechanical (claude-kit `docs/spikes/opus-5-5-review.md`); pass an explicit `model: "opus"` override only when L4 applies (a risk area below) and adversarial reasoning is worth paying for.
4. Act on the verdict: PASS → ready to commit / PR. PARTIAL → show me and let me decide. FAIL → back to the implementer with the findings, once, differently; a second FAIL comes to me.

## Layers the reviewer runs

- **L1 Gate** — re-runs every gate command itself.
- **L2 Exceptions audit** — searches the diff for `eslint-disable`, `@ts-ignore` / `@ts-expect-error`, `rubocop:disable`, `.skip(` / `.only(` / `xit` / `skip` / `pending`, removed assertions, loosened thresholds, widened types. An unexplained hit is a FAIL.
- **L3 Red-proof** — each new test must fail without the implementation it covers:
  `node "${CLAUDE_SKILL_DIR}/scripts/red-proof.mjs" --test-cmd "<test command>" <impl files>`
  Needs a clean tree and a test command that's green on HEAD; paths are relative to the current directory (on Windows the command runs in cmd.exe — use double quotes). Exit 0 = proven; 1 = the test isn't load-bearing (FAIL); 2/3 = usage or setup error, not a verdict.
- **L4 Adversarial** — only for the risk areas above: try to break it. UI changes need runtime evidence (run it, screenshot, curl — or spawn `kit:ui-checker` with the expected behavior). For auth/permissions, multi-tenancy or money, also spawn `kit:security-reviewer` on the same diff — pass `model: "opus"` for a high-stakes case (core auth/session logic, payment processing, a migration moving data), its Sonnet default otherwise; its FAIL fails the verification.

## Steering

A failure pattern seen twice becomes a rule the same day: a hook, a line in a CLAUDE.md, or a memory.
