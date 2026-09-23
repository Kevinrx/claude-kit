---
name: review
description: Review the current changes (branch diff plus uncommitted) for correctness, edge cases, security and stack-specific pitfalls, in a fresh context, with a PASS / PASS WITH NOTES / FAIL verdict. Use when asked to review code, or before opening a PR.
argument-hint: "[base branch | PR number | path] [--thorough]"
disable-model-invocation: true
---

# Review

1. **Scope.** From the argument: a PR (`gh pr diff <n>`), a base branch, or a path. Default: `git diff $(git merge-base HEAD <default branch>)` plus uncommitted changes.
2. **Who.** Tiny diffs (under ~30 lines) → review inline yourself. Anything bigger → spawn `kit:reviewer` in **review** mode; the fresh context is the point. Add, in parallel:
   - `kit:security-reviewer` when the diff touches auth, permissions, account/tenant scoping, money, uploads, sessions or new external input.
   - `kit:reviewer` in **contract** mode when it changes an API endpoint and its frontend consumers (Rails ↔ React).
3. **Model.** `kit:security-reviewer` always runs on Opus (its default). `kit:reviewer` defaults to Sonnet — cheap enough for routine diffs (Opus 5.5 still costs ~1.5× per review and found little extra on routine diffs — claude-kit `docs/spikes/opus-5-5-review.md`). Pass it an explicit `model: "opus"` override when the diff is large (rough guide: >150 changed lines or >4 files) or touches a core-risk area with real stakes — auth/session logic itself, payment processing, a migration that moves data, mass deletion — not just any diff that happens to touch a param. `--thorough` forces the Opus override regardless of size.
4. **Brief each reviewer** with: the intent (plan, issue, or what I asked for), the exact diff command, the stack (so it loads the `kit:stack-*` skills), and the instruction to report only real issues.
5. **Present** the verdicts and findings grouped by severity, as returned. Offer to fix CRITICAL and MAJOR findings; don't fix anything without asking.

Built-ins for other angles: `/security-review` (pending changes), `/simplify` (reuse and cleanup), `/code-review` (multi-agent, PR level).
