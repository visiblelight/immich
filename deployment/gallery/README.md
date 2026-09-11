# Gallery engineering and deployment

The local functional MVP and Gallery-only Compose packaging are implemented. See [operations](../../docs/gallery/development/operations.md), [local development](../../docs/gallery/development/mvp-local.md), and [delivery status](../../docs/gallery/delivery/mvp-completion.md).

- `Dockerfile` and `Dockerfile.dockerignore`: locked Gallery build; excludes local media and secrets.
- `compose/compose.yml`: public/admin on an existing Immich database network, read-only media and loopback ports.
- `compose/.env.example`, `compose/Caddyfile.example`: configuration templates; DNS/TLS is an operator deployment step.
- `baseline.json`: exact current Immich source and candidate validation scope; not a general production certification.
- `scripts/pnpm.sh`: repository toolchain wrapper; use root `gallery:*` scripts.
- `scripts/database-check.mjs`: disposable PostgreSQL role, publishing, HTTP, load and full dump/restore checks.
- `scripts/prepare-upgrade-check.mjs`: prepares the recorded candidate's original migration/schema runtime without switching the working checkout.

Runtime processes never receive owner or migrator credentials. Deployment does not initialize another repository or replace Immich Compose. No production domain or live database upgrade has been performed.
