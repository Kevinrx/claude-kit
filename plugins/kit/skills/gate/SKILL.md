---
name: gate
description: Set up (or fix) this repo's stop gate — a `.claude/gate` script built from the checks the repo really has (package.json scripts, bin/ binstubs, Gemfile tools, CI steps). While it fails, Claude can't end a turn with uncommitted changes. Use when asked to add, create or change a stop gate.
disable-model-invocation: true
---

# Gate

The gate is a POSIX `sh` script at `.claude/gate`. The kit's Stop hook runs it when the tree is dirty, and blocks the end of the turn (max 3 times) while it exits non-zero. A tree state that already passed isn't re-run.

## 1. Discover the real checks

Every command must come from somewhere you can name — an invented `npm test` fails on first run.

- `package.json` scripts: `test`, `lint`, `typecheck`/`tsc`, `check`. Use the lockfile's package manager (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, else npm).
- Ruby: `bin/rspec` or `bin/rails test`, `bin/rubocop` / `bundle exec rubocop`, `bundle exec brakeman` — only if they're in `Gemfile.lock` or `bin/`.
- CI: the `run:` lines of `.github/workflows/*.yml` — the closest thing to the team's own definition of green.
- Existing `.claude/gate`: read it; you're probably fixing it.

## 2. Keep it fast

It runs at the end of turns, so aim for well under a minute: unit tests and lint on the whole repo are fine; skip system/e2e tests, full builds and anything needing services that may not be running. Say what you left out and why.

## 3. Propose, then write

Show the script with a comment naming each command's source:

```sh
#!/bin/sh
# kit stop gate — sources: package.json "test", "lint"; bin/rspec (CI step "test")
set -e
bin/rspec
npx eslint app/javascript
```

On yes: write it, then run `sh .claude/gate` once and show the result. If it's already red on a clean tree, say so — the gate would block every turn until that's fixed.

## 4. Commit or keep local

Ask. Teams that don't want it in the repo: add `.claude/gate` to `.git/info/exclude` (local only; never edit the team's `.gitignore` for this).
