# claude-kit

Personal Claude Code kit, distributed as a plugin marketplace.

- `plugins/kit/` — the plugin: `skills/*/SKILL.md`, `agents/*.md`, `hooks/hooks.json` + Node hook scripts (`hooks/*.mjs`, no dependencies, must run on macOS and Windows).
- `plugins/kit-mods/` — mods (Claude Code function hooks, not Node scripts): `hooks/register.tsx` wires everything and is the only file that may touch `$` (the engine won't follow `$` across an import); the other `hooks/*.ts` files are pure logic. State contract in `types/index.d.ts`, tests in `tests/*.test.ts` run by `npm run test:mods`.
- `global/` — `CLAUDE.md` (imported from `~/.claude/CLAUDE.md`) and `settings.json` (merged by setup).
- `setup/setup.mjs` — per-machine setup. `tests/` — `node --test` suite: one `<hook>.test.mjs` per hook, `red-proof`, `setup`, and `kit.test.mjs` (structure and docs consistency); shared helpers in `tests/helpers.mjs`.

Rules:
- Hooks must never break a session: wrap logic in `main()` from `hooks/lib.mjs`; only `stop-gate.mjs` and `subagent-report-gate.mjs` exit 2, deliberately, and both cap their blocks.
- Every hook change needs a test in `tests/<hook>.test.mjs`. Run `npm test` and `npm run validate` before committing.
- Every mod change needs a test in `plugins/kit-mods/tests/` and a passing `npm run test:mods`. Mods are for display and for rules settings hooks can't express; `guard-commands` and friends stay the enforcement layer, since mods don't draw in VS Code, `-p` or cloud sessions.
- Keep skills short and specific (well under 500 lines); descriptions say what the skill does and when to use it.
- No version in `plugin.json`: updates are picked up from the git commit.
