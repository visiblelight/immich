# Gallery migrations

Phase B implements and verifies `0001_foundation.sql` (12 business tables) and
`0002_source_and_public_views.sql` (11 controlled views). The migration runner
owns the 13th table, `gallery.schema_migration`.

Bootstrap is a separate, one-time database-owner operation in
`deployment/gallery/database/bootstrap.sql`; the normal runner requires an actual
`gallery_migrator` login. Runtime services never migrate on import or startup.
Migrations use an advisory lock, SHA-256 history checks and one transaction per file.
Do not edit an applied migration; introduce the next numbered SQL file.

The original Immich database has **not** received these migrations. Phase B ran
only against isolated PostgreSQL 14 with synthetic data. Reproduction, bootstrap,
source-owner commands and validation limits are documented in
`docs/gallery/development/database.md` and `docs/gallery/delivery/phase-b.md`.
