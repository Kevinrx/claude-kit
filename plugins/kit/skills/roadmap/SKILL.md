---
name: roadmap
description: Break a big feature or a new product (several PRs of work, e.g. "an ecommerce site") into well-written GitHub issues, one shippable slice each, instead of implementing it. Interviews me, drafts the issues locally for review, and creates them with gh only after I approve. Use when I want a backlog or issues rather than code; for work that fits in one PR, use kit:plan.
argument-hint: "[feature or product description]"
---

# Roadmap

Output: GitHub issues a teammate (person or agent) could pick up cold, plus a local `ROADMAP.md` that records them. Nothing is implemented and no `PLAN.md` is written: each issue gets planned later with `/kit:plan #N`, against the code as it is by then.

If the request fits in one PR, say so and offer `/kit:plan` instead.

## 1. Discover (never assume)

1. `CLAUDE.md` / `AGENTS.md` (root and nested), README, stack files (`package.json`, `Gemfile`, …), CI workflows.
2. `gh repo view --json nameWithOwner,defaultBranchRef` — tell me which repo the issues will go to. No remote or no `gh` auth → stop and say so.
3. `gh label list`, `gh api repos/{owner}/{repo}/milestones`, `.github/ISSUE_TEMPLATE/` (follow its sections if present), and `gh issue list --state open` so nothing is duplicated.
4. Empty or greenfield repo: say so. The first issue is then scaffolding (app skeleton, test runner, lint, CI) so later issues have a gate to pass.

## 2. Interview

Rounds of `AskUserQuestion` until nothing material is open. Don't ask what the repo already answers.

- Who uses it and the core flows (for a shop: browse, cart, checkout, orders, admin).
- MVP vs later: what must exist for a first release, what gets its own later issues, what's out entirely.
- Constraints: stack, hosting, auth provider, payments, email, third-party services.
- Risk: which flows touch money, auth or personal data.
- Last round, once the size is known: grouping. Labels by default (area like `backend`/`frontend`/`infra`, type like `feature`/`chore`). Offer a parent tracking issue or a milestone only when there are more than ~8 issues.

## 3. Break down

- Vertical, independently shippable slices, about one PR each: a slice delivers something testable end to end, not "all the models" then "all the controllers".
- Order by dependency: foundation → data model → backend → frontend → polish. A slice lists what it's blocked by; keep chains short so work can run in parallel.
- Every slice's acceptance criteria include tests, the way a dev's ticket does ("unit tests cover totals with and without a discount").
- Flag slices touching auth, money or personal data in their notes — they'll want `kit:security-reviewer` when implemented.
- Too big to describe in one issue → split it. Too small to be worth a PR → merge it into a neighbour.

## 4. Draft

Location: `.claude/kit-plans/<slug>/`. If plans aren't committed in this repo, add `.claude/kit-plans/` to `.git/info/exclude` (never the team's `.gitignore`).

`ROADMAP.md`: a short overview (goal, MVP line, out of scope), then an ordered table, then one section per issue:

```markdown
| # | key | title | labels | blocked by | issue |
|---|-----|-------|--------|------------|-------|
| 1 | scaffold | Set up app skeleton, tests and CI | infra, chore | — | |
| 2 | catalog | Product catalog with categories | backend, feature | scaffold | |
```

The `issue` column stays empty until publish. Each issue body, written for a person first — plain sentences, no plan jargon (no waves, difficulty or step lists):

```markdown
## Context
Why this exists and where it fits in the roadmap, in 2-4 sentences.

## Scope
- What to build, concretely (screens, endpoints, models, jobs).

## Acceptance criteria
- [ ] Observable behavior a reviewer can check.
- [ ] Unit tests cover <the cases that matter>.
- [ ] <Request/system test for the main flow, if the stack has them.>

## Dependencies
Blocked by: {{scaffold}}          ← keys, replaced with #N on publish

## Out of scope
- What a reader might expect here but belongs to another issue (name it).

## Notes
Design hints, edge cases, links, security flags. Optional.
```

Write `PROGRESS.md` with first line `status: drafted`. Then show me the table and ask for approval. Changes loop back here; nothing leaves the machine yet.

## 5. Publish (only after an explicit yes)

1. Missing labels or milestone → list them and confirm, then `gh label create` / create the milestone.
2. For each row in table order that has no `issue` number yet: write its body to a temp file and run `gh issue create --title … --body-file … --label …` (plus `--milestone`). Write the returned number into the table **immediately**, before the next one — a rerun skips numbered rows, so an interrupted run never duplicates.
3. When all exist, replace every `{{key}}` with its `#N` and `gh issue edit <n> --body-file …` the issues that changed.
4. Tracking issue (if chosen): a checklist of `- [ ] #N title` in order, created last.
5. Set `status: done` in `PROGRESS.md` so session start and `/kit:implement` don't treat the roadmap as an open plan.

Issue bodies follow the global no-attribution rule: nothing about Claude or AI.

## 6. Hand over

The issues in order, each as a link with its blockers, and `/kit:plan #N` for the first unblocked one. Then stop.

## Red flags

- "I'll start on the first issue meanwhile" → no. Issues only.
- "Create them now, tidy up after" → issues are public to the team. Draft, approve, then publish.
- "Acceptance: it works" → name the behavior and the tests.
- "One issue per layer" → slices are vertical.
- "The rerun can just create everything again" → skip rows that already have a number.
