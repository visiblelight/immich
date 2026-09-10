# Gallery engineering and deployment

Current phase: A — foundation. See [local development](../../docs/gallery/development/getting-started.md).

- `baseline.json`: exact Immich source and observed upgrade candidate; not a compatibility certification.
- `tsconfig.base.json`: strict settings for Gallery source packages.
- `scripts/pnpm.sh`: optional wrapper for the isolated local toolchain.
- `scripts/doctor.mjs`: toolchain/package installation check; no database access.
- `scripts/smoke.mjs`: starts built public/admin servers on loopback, checks their phase-A HTTP contract, then stops them.
- `.env.example`: configuration contract with no production credentials.

Compose, Docker images, migration/bootstrap commands, backup/restore and database readiness are scheduled for later phases. No placeholder Compose is supplied as if it could deploy the product.
