---
name: stack-react
description: React conventions and review checklist — hooks, effects, data fetching, accessibility, testing with React Testing Library. Covers plain JavaScript React (including inside Rails apps) and TSX. Use when writing, reviewing or planning React components or hooks.
paths:
  - "**/*.jsx"
  - "**/*.tsx"
  - "app/javascript/**"
  - "app/frontend/**"
  - "src/components/**"
---

# React

## Discover first

- Language: plain JavaScript unless there's a `tsconfig.json` (then also load `kit:stack-typescript`). In JS repos don't introduce TypeScript; follow the repo's PropTypes / JSDoc usage if any.
- Build: Vite, esbuild (jsbundling-rails), shakapacker/webpacker, CRA, Next. Tests: Jest or Vitest + React Testing Library. Lint: ESLint (run it on the files you touched). Formatting: Prettier if configured.
- State and data: whatever the repo uses (React Query, SWR, Redux, Zustand, context). Don't add a library.
- Inside Rails: how components are mounted (react-rails `react_component`, a `data-` attribute + `createRoot`, or a full SPA), and how they talk to Rails (JSON endpoints, CSRF token from `<meta name="csrf-token">` sent as `X-CSRF-Token`).

## Writing code

- Rules of hooks. Complete dependency arrays — never silence `react-hooks/exhaustive-deps`; restructure instead.
- Effects are for syncing with external systems. Derived values are computed during render, not copied into state with an effect.
- Clean up effects: subscriptions, timers, listeners; `AbortController` for fetches.
- Data fetching: handle loading, error and empty states; guard against races when params change fast (abort, or ignore stale responses).
- Stable `key`s from data ids — not the array index for lists that reorder, insert or delete.
- Memoize (`useMemo`, `useCallback`, `memo`) only for a measured problem or a memoized child that needs stable props.
- Accessibility: semantic elements (`button`, not a clickable `div`), labels for inputs, alt text, focus handling in modals, keyboard access.
- Security: `dangerouslySetInnerHTML` only with sanitized content. Nothing secret in client code — every env var in the bundle is public.

## Tests

- React Testing Library: query by role, label or text (`getByRole`), use `userEvent` over `fireEvent`, and assert what the user sees — not internal state or implementation details.
- Mock the network at the boundary (MSW if the repo has it), not the component's own modules.
- UI changes: run the app and look at the result (browser tools / screenshot) — tests don't see layout.

## Review checklist

Stale closures · missing or extra effect dependencies · missing cleanup · state derived via effects · request races · unstable keys · unhandled loading/error/empty states · inaccessible controls · unsanitized HTML · secrets in the bundle · tests coupled to implementation details.
