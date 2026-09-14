---
name: stack-rails
description: Ruby on Rails conventions, gate commands and review checklist (migrations, N+1, authorization, jobs, RSpec/Minitest). Use when writing, reviewing or planning Ruby/Rails code.
paths:
  - "**/*.rb"
  - "**/*.erb"
  - "**/*.rake"
  - "Gemfile"
  - "config/**"
  - "db/**"
---

# Rails

## Discover first

- Versions: `Gemfile.lock` (Rails, Ruby), `.ruby-version`.
- Tests: `spec/` → RSpec (`bundle exec rspec <file>:<line>`); `test/` → Minitest (`bin/rails test <file>:<line>`). Prefer `bin/*` binstubs when present.
- Lint and security: `bundle exec rubocop` (if in the Gemfile), `erb_lint`, `brakeman`. Only use tools the Gemfile has.
- App patterns: service objects (`app/services`), form objects, concerns, policies (Pundit / CanCanCan), serializers (jbuilder, ActiveModel::Serializers, Blueprinter). Follow what exists; don't introduce a new pattern.
- How the React side is wired: jsbundling-rails (esbuild), vite_ruby, shakapacker/webpacker, react-rails or importmaps. See `kit:stack-react`.

## Writing code

- Strong params for every write action. Authorization check on every controller action that touches a record (use the app's policy layer).
- Queries: no string interpolation in `where` — use hashes or `?` placeholders. Avoid N+1 with `includes` / `preload`; check views, serializers and loops. Use `find_each` for batches.
- `Time.current` / `Date.current`, not `Time.now` / `Date.today`.
- `update_all`, `delete_all` and `insert_all` skip validations and callbacks — only use them deliberately.
- Wrap multi-record writes in a transaction. Keep side effects (emails, HTTP calls, jobs) out of model callbacks; do them after commit (`after_commit`, or enqueue from the service).
- Jobs: idempotent, take IDs not objects, safe to retry.
- Never touch `config/credentials*.yml.enc`, `config/master.key` or `.env` files without asking.

## Migrations

- Reversible (`change`, or `up`/`down`). Never edit a migration that has already been merged or run elsewhere — write a new one.
- Index every foreign key and any column used in lookups. `null: false` plus a default when the column is required.
- Big tables on Postgres: `add_index ... algorithm: :concurrently` with `disable_ddl_transaction!`; add columns without a volatile default; backfill data in a separate migration or task, in batches.
- After migrating, check that `db/schema.rb` (or `structure.sql`) only contains your change.
- `db:drop`, `db:reset` and `db:schema:load` only with `RAILS_ENV=test`.

## Tests

- Request specs over controller specs; system specs only for real browser flows.
- FactoryBot: `build` / `build_stubbed` over `create` when persistence isn't needed. Avoid `let!` chains that hide setup.
- Time: `travel_to` / `freeze_time`. No `sleep`.
- For every change: a happy path, one failure path (invalid input, unauthorized), and the edge case the change was about.

## Review checklist

N+1 queries · missing index · unauthorized access (missing policy check, records not scoped to the current user/account) · mass assignment · SQL injection · CSRF skipped · callbacks with side effects · missing transaction · nil from `find_by` unhandled · time zones · non-idempotent jobs · irreversible or locking migrations · secrets in code.
