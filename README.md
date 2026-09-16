# claude-kit

This is Kevin's personal [Claude Code](https://docs.claude.com/en/docs/claude-code) setup, kept in a public repo so every machine runs the same version — it's not built to suit everyone, but you're welcome to install it as-is or fork it and change the rules to your own.

It's one plugin (`kit`) that turns Claude Code into a plan → implement → verify workflow: a set of slash-command **skills** (like `/kit:plan`), a few review and implementation **agents** it can delegate to, and safety **hooks** that run automatically around what it does — plus one shared set of global rules.

If you're new to Claude Code plugins: a **skill** is a written procedure Claude follows when you type its slash command (or, for some, whenever the situation matches — see [Commands](#commands)); an **agent** is a subagent Claude can hand a task to, with its own tools and often its own model; a **hook** is a script the Claude Code harness runs on its own, around tool calls or at session start, whether or not Claude "wants" it to.

## Commands

Everything below is invoked as `/kit:<name>`, e.g. `/kit:plan`. Arguments in `[brackets]` are optional.

- **`/kit:plan [issue number/url or description]`** — turns a feature request, bug report or GitHub issue into a written `PLAN.md` + `PROGRESS.md` that a fresh session (yours later, or another machine) can execute without asking anything. Read-only: it investigates the repo and interviews you for real unknowns, but writes only the plan files.
- **`/kit:implement [plan slug or path] [--auto]`** — executes a plan from `/kit:plan` step by step until its goal is met, then opens a PR. `--auto` skips the commit/push/PR confirmation stops, for unattended runs (e.g. under `/goal`); everything else — blocking questions, the 3-attempt gate limit, never weakening a test — still applies.
- **`/kit:verify [plan slug | base branch]`** — independently checks work written by a subagent or another session before it's trusted: re-runs the gate, hunts for self-granted exceptions (skipped tests, disabled lint), and proves new tests actually fail without the change.
- **`/kit:review [base branch | PR number | path]`** — fresh-context code review of the current changes for correctness, edge cases, security and stack-specific pitfalls, ending in a PASS / PASS WITH NOTES / FAIL verdict.
- **`/kit:debug`** — systematic debugging for a bug with an unknown cause: reproduce first, then competing hypotheses and the cheapest probe for each, fix the root cause, lock it in with a regression test.
- **`/kit:address-review [PR number or URL]`** — works through a PR's review comments: fetches every thread, classifies each as fix/question/disagree, fixes the accepted ones with checks green, and drafts replies. Nothing is pushed or posted without an explicit yes.
- **`/kit:second-opinion [the decision or question]`** — asks a different model (OpenAI Codex CLI) for an independent read on a genuinely uncertain or hard-to-reverse call. For occasional use, not a rubber stamp.
- **`/kit:handoff`** — writes exactly where the current work stands into the plan's `PROGRESS.md`, so it can be resumed in a fresh session or on another machine.
- **`/kit:learn [the lesson]`** — turns a mistake or a repeated failure into a durable rule, placed wherever will actually prevent it again: a guard hook with a test, a `CLAUDE.md` line, a stack-skill checklist item, or memory.
- **`/kit:gate`** — sets up (or fixes) a repo's stop gate: a `.claude/gate` script built from the checks the repo actually has. While it fails, Claude can't end a turn with uncommitted changes.
- **`/kit:terse [lite|full|ultra|off]`** — switches replies to compressed, fewer-token mode for the rest of the session; `off` (or "normal mode") turns it back off.
- **`/kit:humanize [off]`** — strips AI-sounding tells (marketing verbs, "not just X, it's Y" formulas, padded lists) from prose you ask it to write for someone else to read — READMEs, docs, PR descriptions.

The four `kit:stack-*` skills (`rails`, `react`, `typescript`, `node`) aren't commands — they load automatically based on which files are being touched, and give Claude the conventions and review checklist for that stack.

## What's inside

| | |
|---|---|
| **Agents** | `kit:researcher` (read-only, sonnet) · `kit:implementer` (sonnet, pick opus per spawn for hard work) · `kit:reviewer` (read-only, opus — review / verify / plan-critique / contract: backend API vs frontend consumers) · `kit:security-reviewer` (read-only, opus — authz, injection, secrets, advisories) · `kit:ui-checker` (sonnet, browser — runs the flow and edge states, reports what it saw) |
| **Hooks** (Node, tested on macOS, Linux and Windows) | block catastrophic shell commands and ask before destructive ones (force push, `reset --hard`, `db:drop`, `--no-verify`, `gh pr merge`, production Rails, `terraform destroy`, reading `.env` through the shell…) · ask before edits that weaken tests or write real-looking secrets · opt-in stop gate · make a subagent that ends without a report send it · git/stack/plan context at session start and after compaction |
| **Output style** | `terse`: pick it in `/config` or set `"outputStyle": "kit:terse"` — like `/kit:terse`, but it survives compaction |
| **Global rules** | [`global/CLAUDE.md`](global/CLAUDE.md), imported from `~/.claude/CLAUDE.md` |

The command guard is a seatbelt against accidents, not a sandbox: interpreter one-liners (`node -e`, `python -c`) and indirect reads aren't parsed. The `Read()` deny rules in [`global/settings.json`](global/settings.json) and the permission prompts are the real boundary.

## New machine

```bash
git clone https://github.com/Kevinrx/claude-kit ~/claude-kit
cd ~/claude-kit
node setup/setup.mjs --dry-run   # see what it will change
node setup/setup.mjs             # add --disable-omc / --disable-superpowers to turn those off too
```

Setup points `~/.claude/CLAUDE.md` at `global/CLAUDE.md`, merges [`global/settings.json`](global/settings.json), adds this repo as the `claude-kit` marketplace and installs `kit` plus context7, typescript-lsp, ruby-lsp, frontend-design, code-review and codex (if the Codex CLI is installed). With `--disable-omc` or `--disable-superpowers`, it also turns off oh-my-claudecode or superpowers if either is installed and enabled — both ship their own plan/review workflows that compete with kit's. It backs up what it changes to `~/.claude/backups/`. Restart Claude Code afterwards.

The LSP plugins need their servers: `npm i -g typescript-language-server typescript` and `gem install ruby-lsp`.

## Day to day

- Feature or unclear bug: `/kit:plan <issue>` → read the plan → `/kit:implement <slug>` (or the `/goal …` line the plan prints, to run it unattended).
- Review feedback on a PR: `/kit:address-review <pr>`.
- Switching machines mid-task: `/kit:handoff`, push, then `/kit:implement <slug>` on the other one.
- Per-repo stop gate: `/kit:gate` writes `.claude/gate` from the repo's real checks. Claude can't end a turn with uncommitted changes while it fails (gives up after 3 tries); a tree that already passed isn't re-run.
- Same mistake twice: `/kit:learn` puts the rule where it will stick.

## Changing the kit

1. Edit here. Try it without installing: `claude --plugin-dir plugins/kit`.
2. `npm test` (hooks, red-proof, setup, structure) and `npm run validate`. CI runs the tests on macOS, Linux and Windows.
3. Commit and push. On each machine: `git pull`, then `claude plugin marketplace update claude-kit && claude plugin update kit@claude-kit`, and restart.

`global/CLAUDE.md` changes apply as soon as the file changes (it's imported, not copied).

If the marketplace was first added from the local folder and you've since pushed to GitHub: `claude plugin marketplace remove claude-kit`, then re-run setup.

## Credits

Ideas taken from [diego-cc-kit](https://github.com/diecoscai/diego-cc-kit) (triage/implement/verify, red-proof, stop gate, test guard, delegation rules, subagent report gate, API contract check), [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (security reviewer, learner) and a personal opencode config (plan review, waves and difficulty routing, code review checklist, second opinion, caveman mode).
