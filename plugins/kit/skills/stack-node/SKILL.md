---
name: stack-node
description: Node.js backend and tooling conventions and review checklist — package manager, async error handling, input validation, subprocess and HTTP safety. Use when writing, reviewing or planning Node.js servers, CLIs or scripts (not browser React code).
paths:
  - "**/*.mjs"
  - "**/*.cjs"
  - "server/**"
  - "api/**"
  - "scripts/**"
---

# Node.js

## Discover first

- Package manager from the lockfile: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, `package-lock.json` → npm. Use only that one.
- Node version: `.nvmrc`, `.node-version`, `engines`. Module system: `"type"` in `package.json`.
- Test runner (node:test, Vitest, Jest) and lint from `package.json` scripts. Don't add a new framework.

## Writing code

- Every promise is awaited or returned. No floating promises; no mixing callbacks and promises.
- Never swallow errors. Re-throw with context (`new Error('loading config', { cause: err })`). Unknown errors become a 500 with a log, not a silent success.
- Validate input at the boundary (request bodies, query strings, CLI args, env vars). Fail fast at startup on missing config.
- Subprocesses: `execFile` / `spawn` with an args array, never `exec` with interpolated input.
- User-supplied paths: resolve and check they stay inside the allowed directory (path traversal).
- Database: parameterized queries only.
- Outbound HTTP: `fetch` has no default timeout — use `AbortSignal.timeout(ms)`. Handle non-2xx responses explicitly.
- Streams: respect backpressure (`pipeline` from `node:stream/promises`).
- Ask before adding a dependency; check whether the standard library already does it.

## Review checklist

Floating promises · swallowed errors · missing input validation · shell injection · path traversal · SQL injection · no timeouts on outbound calls · secrets in code or logs · wrong package manager or lockfile churn · unnecessary new dependencies.
