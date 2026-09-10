# Gallery development in the Immich fork

These instructions apply to Gallery work. Preserve Immich's existing architecture and tooling for unrelated work.

- Read `docs/gallery/README.md` and the relevant approved design before changing Gallery behavior. Track actual implementation separately from accepted requirements.
- Product branch: `codex/gallery`. Keep `main` as an upstream mirror. Do not merge upstream versions into the working database without an isolated upgrade validation.
- Gallery code belongs in `packages/gallery-*`; deployment and developer tooling in `deployment/gallery`; documentation in `docs/gallery`.
- Node and pnpm versions follow the repository's `mise.toml` and root `packageManager`. Do not silently change them or the existing `mise.lock`.
- Run Gallery checks/builds using the `gallery:*` root scripts. Do not trigger unrelated Immich services or CVAT for Gallery work.
- Gallery Album is independent of Immich Album. Select across Immich albums; do not add a source-album foreign key.
- Gallery users are independent of Immich users. Runtime services must not receive database owner/migration credentials.
- Never grant public access based only on a known asset ID. Published ancestry, current release membership, source scope, asset state and media path checks all apply.
- GPS remains live in Immich; Gallery text and selection are published snapshots. Avoid copying GPS into release tables.
- Keep database code in explicit server-only entrypoints. Do not import it into components or universal load functions.
- Do not edit Immich tables, migrations or media for routine Gallery functionality. Add Gallery migrations and matching data-dictionary changes together.
- Frontend visual direction is an explicit user review milestone. Infrastructure scaffolding is not an approved product design.
- Existing user changes must be preserved; do not stage unrelated files or push remote branches without the relevant authorization.
- This project targets local development and Docker Compose. Do not initialize a second repository, register a hosted Site, change databases, or replace the approved stack to follow a generic site template.
