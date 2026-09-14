---
name: address-review
description: Work through the review comments on a pull request — fetch every thread, classify each one (fix / question / disagree), fix the accepted ones with the repo's checks green, and draft replies. Use when asked to address, answer or resolve PR feedback.
argument-hint: "[PR number or URL]"
---

# Address review

Nothing gets pushed or posted without my explicit yes.

## 1. Collect

- PR: the argument, or `gh pr view --json number,headRefName` for the current branch. Check out its branch; dirty tree → ask first.
- Threads: `gh pr view <n> --comments` (conversation) and `gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate` (inline, with `path`, `line`, `in_reply_to_id`). Skip threads that are resolved or already answered by me.
- Load the `kit:stack-*` skills for the files involved.

## 2. Classify

For each thread, read the code it points at before deciding:

| # | Where | Ask | Verdict | Plan |
|---|---|---|---|---|
| 1 | `path:line` | one-line summary | fix / question / disagree / already done | what you'll change, or the reason |

- **fix** — the reviewer is right, or it's cheap and harmless.
- **question** — they asked something; answer it, change nothing unless the answer shows a problem.
- **disagree** — you think it's wrong: say why with evidence (`path:line`, docs, a test). I decide.

Show me the table and wait for my go (I may flip verdicts).

## 3. Fix

One thread at a time, smallest change that satisfies it. Run the repo's checks (the plan's gate, `.claude/gate`, or the CI commands) after the fixes. Never weaken a test to make a reviewer's request pass.

## 4. Reply drafts

Per thread, one or two sentences: what changed (with the commit, once committed) or the answer / reason. No "Great catch!". Show them all.

## 5. Finish — only on yes

Commit (`address review: <summary>`), push, then post the replies with `gh api repos/{owner}/{repo}/pulls/<n>/comments/<id>/replies -f body=...` (inline) or `gh pr comment <n>` (conversation).
