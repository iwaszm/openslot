# Supabase layout

- `migrations/` is the authoritative, ordered database change history.
- `functions/` contains the deployed Edge Function sources.
- `tests/` contains transactional database regression checks.
- `audits/` contains read-only schema reconciliation queries.
- `legacy/` contains pre-migration setup scripts retained only for historical reference.
- `config.toml` contains the local Supabase CLI project configuration.

Do not apply files from `legacy/` to a current project. Create a new timestamped migration for every database change.
