---
name: debug
description: Systematic debugging for bugs with an unknown cause — failing or flaky tests, errors, wrong behavior. Reproduce first, then competing hypotheses and cheap probes, fix the root cause, lock it with a regression test. Use when something is broken and the cause isn't obvious.
---

# Debug

No fix before a reproduction. No "should be fixed now" without re-running the reproduction.

1. **Reproduce.** Get one command that shows the bug: a failing test, a curl, a script, or exact UI steps. If you can't reproduce it, say what you tried and what information you need — don't guess-fix.
2. **Collect evidence.** Full error and stack trace; logs (`log/development.log`, `log/test.log`, browser console, server output); recent changes (`git log -p -- <files>`, or `git bisect` when it used to work).
3. **Hypotheses.** Write 2–3 competing explanations, each with evidence for and against, and the cheapest probe that would tell them apart. Run the cheapest probe first. Update the list after every probe.
4. **Root cause.** Explain the chain from trigger to symptom in 2–3 sentences. If you can't, you haven't found it yet.
5. **Fix the cause**, not the symptom. No retries, sleeps or nil-guards papering over it — unless that genuinely is the right fix, and then say why.
6. **Lock it.** Write the regression test first and watch it fail, then apply the fix and watch it pass. Run the wider suite.
7. **Report**: cause, fix, and the reproduction before and after.

## Stuck

Three hypotheses ruled out → step back, re-read the evidence, widen the search. Still stuck → `/kit:second-opinion` with what you've ruled out.

## Flaky tests

Run it in a loop (`for i in $(seq 20); do <cmd> || break; done`), try random order and fixed seeds (`--seed`, `--order random`), and look for time, shared state, test ordering and unawaited async work. Never fix flakiness with a sleep.
