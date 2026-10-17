// Run inside the pinned official Immich image; credentials arrive only via env file.
// This runs database migrations and schema verification, never media jobs.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire('/usr/src/app/server/package.json');
req('reflect-metadata');
const { Kysely, PostgresDialect } = req('kysely');
const pg = req('pg');
const { DatabaseRepository } = req('./dist/repositories/database.repository.js');
const url = process.env.GALLERY_UPGRADE_DATABASE_URL;
assert.ok(url, 'Explicit upgrade connection required');
assert.ok(['gallery-upgrade-333-db', 'database'].includes(new URL(url).hostname));
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });
const logger = { setContext() {}, log() {}, warn() {}, error() {} };
const repository = new DatabaseRepository(db, logger, {
  isDev: () => false,
  getEnv: () => ({ database: { config: { connectionType: 'url', url } } }),
});
(async () => {
  try {
    await repository.runMigrations();
    const drift = await repository.getSchemaDrift();
    assert.deepEqual(drift.items, [], 'Official schema drift must be zero');
    console.log(JSON.stringify({ version: req('./package.json').version, migrations: (await repository.getMigrations()).length, drift: 0 }));
  } finally { await db.destroy(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
