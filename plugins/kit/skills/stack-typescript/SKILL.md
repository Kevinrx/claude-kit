---
name: stack-typescript
description: TypeScript conventions and review checklist — strict typing without escape hatches, runtime validation at boundaries, discriminated unions. Use when writing, reviewing or planning TypeScript code.
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "tsconfig*.json"
---

# TypeScript

## Discover first

- Type check command: the `package.json` script (`typecheck`, `tsc`, `check`), otherwise `npx tsc --noEmit -p <tsconfig>`. It's part of the gate.
- The `strict` flags in `tsconfig.json` are the contract — never loosen them to make a change compile.
- Generated types (Prisma, GraphQL codegen, OpenAPI): regenerate with the repo's command after schema changes.

## Writing code

- No `any`. Use `unknown` and narrow. No `as` casts to silence an error; fix the type. No `@ts-ignore` — if unavoidable, use `@ts-expect-error` with a reason. No `!` non-null assertions without proof.
- Types don't validate runtime data: parse external input (HTTP bodies, env vars, `JSON.parse`, local storage) with the repo's validator (zod, valibot…) at the boundary.
- Model states as discriminated unions instead of objects full of optional fields. Exhaustive `switch` with a `never` check.
- Use `satisfies` to check object literals without widening them. `as const` for literal tuples and maps.
- Don't widen an exported type or function signature just to fit one call site.
- Check ESM/CJS settings (`module`, `moduleResolution`, `"type"` in `package.json`) when imports fail — don't patch around them.

## Review checklist

`any` / casts / ignores added · unvalidated external data · optional-field soup instead of unions · non-exhaustive switches · widened public types · `tsconfig` loosened · generated types stale.
