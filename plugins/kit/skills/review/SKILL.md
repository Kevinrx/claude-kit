---
name: review
description: Review the current changes (branch diff plus uncommitted) for correctness, edge cases, security and stack-specific pitfalls, in a fresh context, with a PASS / PASS WITH NOTES / FAIL verdict. Use when asked to review code, or before opening a PR.
argument-hint: "[base branch | PR number | path]"
---

# Review

1. **Scope.** From the argument: a PR (`gh pr diff <n>`), a base branch, or a path. Default: `git diff $(git merge-base HEAD <default branch>)` plus uncommitted changes.
2. **Who.** Tiny diffs (under ~30 lines) → review inline yourself. Anything bigger → spawn `kit:reviewer` in **review** mode; the fresh context is the point.
3. **Brief the reviewer** with: the intent (plan, issue, or what I asked for), the exact diff command, the stack (so it loads the `kit:stack-*` skills), and the instruction to report only real issues.
4. **Present** the verdict and findings grouped by severity, as returned. Offer to fix CRITICAL and MAJOR findings; don't fix anything without asking.

For a heavier multi-agent PR review, the `code-review` plugin (`/code-review`) is also installed.
