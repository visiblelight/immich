# Gallery migrations

Migration execution is not implemented in phase A. Do not run ad-hoc SQL against the existing Immich database.

Phase B must validate the approved schema, dedicated roles, source scope and Immich compatibility in an isolated database before creating production migrations. The planned data model is documented in `docs/gallery/architecture/database.md`.

This package deliberately has no default connection, database-owner fallback or migration-on-import behavior.
