# Gallery migrations

0001 creates 12 business tables, 0002 creates 11 controlled views, and 0003 adds
persistent authentication throttling. The runner owns schema_migration: 14 tables
in total. Exact columns, constraints and permissions are documented in
`docs/gallery/architecture/database.md`.

Bootstrap is a separate, one-time database-owner operation in
`deployment/gallery/database/bootstrap.sql`; the normal runner requires an actual
`gallery_migrator` login. Runtime services never migrate on import or startup.
Migrations use an advisory lock, SHA-256 history checks and one transaction per file.
Do not edit an applied migration; introduce the next numbered SQL file.

See `docs/gallery/development/mvp-local.md` for explicit local integration and
`docs/gallery/delivery/mvp-local.md` for actual verification and deployment limits.
Phase B records remain historical evidence of the original isolated validation.
