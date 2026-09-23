# Spike: Sonnet 5 vs Opus 5.5 as kit:reviewer (2026-09-23)

**Verdict: KEEP.** Sonnet stays the default, and the Opus escalation threshold in `/kit:review` (>150 changed lines, >4 files, or a core-risk area) doesn't change.

Opus 5.5 costs $4 / $20 per MTok and Sonnet 5 costs $2 / $10, so Opus is now 2× Sonnet per token (Opus 5 was 2.5×). Anthropic says Opus 5.5 "catches more bugs with fewer false alarms". This spike checks whether that earns Opus more reviews in this kit. `kit:reviewer` ran in review mode twice per diff with the same brief, once with `model: "sonnet"` and once with `model: "opus"`, both at the agent's frontmatter `effort: medium`. Tokens are the `subagent_tokens` reported with each run.

Decision rule, fixed before the runs:
- **LOWER** the threshold if Opus finds a real CRITICAL/MAJOR that Sonnet missed on ≥ 2 of the 3 diffs, or if Opus tokens × 2 ≤ 1.2 × Sonnet tokens, summed over the 3 diffs.
- Otherwise **KEEP**.

| Diff | Model | Verdict | CRITICAL / MAJOR | MINOR | Tokens |
|---|---|---|---|---|---|
| A: PR #10, session-context import check (+50) | Sonnet | PASS WITH NOTES | 0 | 1 (`~/` branch untested) | 41,404 |
| A | Opus | PASS WITH NOTES | 0 | 4 (the same gap; a read error drops all session context; `@` paths with spaces cause a false warning; no opt-out) | 29,293 |
| B: PR #9, setup `--disable-superpowers` (+55) | Sonnet | PASS | 0 | 1 (braces style) | 38,569 |
| B | Opus | PASS WITH NOTES | 0 | 2 (no hint about the new flag; README lost the monorepo detail) | 32,000 |
| C: 2 bugs planted in `guard-commands.mjs` | Sonnet | FAIL | 1 CRITICAL, 1 MAJOR: both planted bugs | 0 | 33,740 |
| C | Opus | FAIL | 2 CRITICAL, 2 MAJOR: both planted bugs, plus a `NaN` env value that silently turns off nested-command checks, plus the missing test | 0 | 25,015 |

The diff C bugs were:
- An env-var read that throws while the module loads, before `main()`, so the hook crashes (exit 1) and the guard stops protecting anything.
- The `-f` branch removed from the force-push rule.

The rule applied to these runs:
- Opus found a real CRITICAL/MAJOR that Sonnet missed on 1 of 3 diffs (C: the `NaN` depth bypass, which Sonnet's suggested fix would also have let through).
- Tokens: Opus used 86,308 and Sonnet 113,713. Opus's dollar cost is 86,308 × 2 = 172,616 in Sonnet-token units, which is 1.52× Sonnet's and above the 1.2× limit.
- Both conditions fail, so the verdict is KEEP.

What the runs showed:
- Opus used **fewer tokens on every diff**, about 25% fewer on average, and made fewer tool calls (3–4 against 8–11). Per token it is still 2×, so each review costs about 1.5× Sonnet's.
- Both models caught every planted bug. Opus rated them more sharply: it called the fail-open regex CRITICAL where Sonnet said MAJOR. It also found more real edge cases on clean diffs.
- Sonnet made one wrong factual claim: "no test covers `-f`", but `tests/guard-commands.test.mjs:128` does. It also ran PR #9's gate on the current tree instead of the PR's version. Opus had neither problem.

Caveats:
- Three diffs is a small sample, and all of them are small Node diffs from this repo.
- Each model ran once per diff, so run-to-run variance isn't measured.
- Diff C plants obvious bugs, which neither model missed. A subtler plant might separate them more.
- It's worth re-running this if prices change or if Sonnet starts missing issues on real reviews.

Follow-up (same day): `kit:security-reviewer` moved to an Opus default anyway. It only runs on diffs that already look sensitive, so it runs rarely. The one serious issue Opus alone caught here (the `NaN` bypass) was a security bug. `kit:reviewer` keeps the KEEP verdict above.
