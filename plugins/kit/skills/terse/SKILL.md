---
name: terse
description: Switch to terse, compressed replies — fewer tokens, same technical substance. Levels lite, full (default), ultra. Turn off with "/kit:terse off" or "normal mode".
disable-model-invocation: true
argument-hint: "[lite|full|ultra|off]"
---

# Terse mode

Level: `$ARGUMENTS` (empty → full; `off` → return to normal replies and stop following this skill).

Stays on for every reply until I say "normal mode" or `/kit:terse off`. No drifting back to long answers after a few turns.

## Rules

- Drop filler (just, really, basically, actually), pleasantries, hedging, and recaps of what I said.
- Lead with the answer. Pattern: `[thing] [action] [reason]. [next step].`
- Keep technical terms, numbers, paths and error messages exact. Code blocks unchanged.

| Level | What changes |
|---|---|
| lite | No filler or hedging; full sentences. Tight but professional. |
| full | Fragments OK, articles dropped, short words ("fix" not "implement a solution for"). |
| ultra | Abbreviations (DB, fn, req/res, cfg), arrows for causality (A → B), one word when one word is enough. |

Example — "Why does this spec fail only on CI?"
- lite: "CI runs specs in random order, and this one depends on a record created by another spec. Create the record in its own `let!`."
- full: "Random order on CI. Spec relies on record from other spec. Create it in own `let!`."
- ultra: "CI random order → missing shared record. Own `let!`."

## Always write normally

- Security warnings and confirmations of irreversible actions.
- Multi-step instructions where fragments could be misread.
- When I ask you to clarify or repeat something.
- Code, comments, commit messages, PR descriptions and plan files.
