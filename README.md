# claude-kit

My personal Claude Code setup: one plugin (`kit`) with a plan → implement → verify workflow, stack skills, three agents and safety hooks, plus my global rules. Same setup on every machine.

## What's inside

| | |
|---|---|
| **Workflow skills** | `/kit:plan` issue → executable plan · `/kit:implement` plan → verified PR · `/kit:verify` independent check of delegated work · `/kit:review` fresh-context code review · `/kit:debug` reproduce → hypotheses → root cause · `/kit:second-opinion` ask Codex on hard calls · `/kit:handoff` save state to continue on the other machine · `/kit:terse` short replies |
| **Stack skills** | `kit:stack-rails`, `kit:stack-react`, `kit:stack-typescript`, `kit:stack-node` — load automatically when working on matching files; the session-start hook also names the ones a repo needs |
| **Agents** | `kit:researcher` (read-only, sonnet) · `kit:implementer` (sonnet, pick opus per spawn for hard work) · `kit:reviewer` (read-only, opus — review / verify / plan-critique) |
| **Hooks** (Node, work on macOS and Windows) | block catastrophic shell commands and ask before destructive ones (force push, `reset --hard`, `db:drop`…) · ask before edits that weaken tests or write real-looking secrets · opt-in stop gate · git/stack/plan context at session start |
| **Global rules** | [`global/CLAUDE.md`](global/CLAUDE.md), imported from `~/.claude/CLAUDE.md` |

## New machine

```bash
git clone https://github.com/Kevinrx/claude-kit ~/claude-kit
cd ~/claude-kit
node setup/setup.mjs --dry-run   # see what it will change
node setup/setup.mjs             # add --disable-omc to turn off oh-my-claudecode
```

Setup points `~/.claude/CLAUDE.md` at `global/CLAUDE.md`, merges [`global/settings.json`](global/settings.json), adds this repo as the `claude-kit` marketplace and installs `kit` plus context7, typescript-lsp, ruby-lsp, frontend-design, code-review and codex (if the Codex CLI is installed). It backs up what it changes to `~/.claude/backups/`. Restart Claude Code afterwards.

The LSP plugins need their servers: `npm i -g typescript-language-server typescript` and `gem install ruby-lsp`.

## Day to day

- Feature or unclear bug: `/kit:plan <issue>` → read the plan → `/kit:implement <slug>`.
- Switching machines mid-task: `/kit:handoff`, push, then `/kit:implement <slug>` on the other one.
- Per-repo stop gate: create `.claude/gate` with the repo's checks, e.g. `bin/rspec && npx eslint app/javascript`. Claude can't end a turn with uncommitted changes while it fails (gives up after 3 tries).

## Changing the kit

1. Edit here. Try it without installing: `claude --plugin-dir plugins/kit`.
2. `npm test` (hook tests) and `npm run validate`.
3. Commit and push. On each machine: `git pull`, then `claude plugin marketplace update claude-kit && claude plugin update kit@claude-kit`, and restart.

`global/CLAUDE.md` changes apply as soon as the file changes (it's imported, not copied).

If the marketplace was first added from the local folder and you've since pushed to GitHub: `claude plugin marketplace remove claude-kit`, then re-run setup.

## Credits

Ideas taken from [diego-cc-kit](https://github.com/diecoscai/diego-cc-kit) (triage/implement/verify, red-proof, stop gate, test guard, delegation rules) and a personal opencode config (plan review, waves and difficulty routing, code review checklist, second opinion, caveman mode).
