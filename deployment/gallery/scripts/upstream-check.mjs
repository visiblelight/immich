import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const build = resolve(process.env.GALLERY_IMMICH_BUILD_DIR ?? '.gallery-local/drift/immich-code');
const upstreamRequire = createRequire(join(build, 'repositories/database.repository.js'));
const galleryRequire = createRequire(resolve('packages/gallery-db/package.json'));
upstreamRequire('reflect-metadata');
const { DatabaseRepository } = upstreamRequire('./database.repository.js');
const { Kysely, PostgresDialect } = galleryRequire('kysely');
const pg = galleryRequire('pg');
const config = JSON.parse(await readFile('.gallery-local/phase-b/connection.json', 'utf8'));
const url = new URL(config.ownerUrl);
assert.ok(
  config.name.startsWith('gallery-db-check-') && url.hostname === '127.0.0.1' && url.pathname === '/gallery_test',
  'Only an isolated database is allowed',
);
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: config.ownerUrl }) }) });
const messages = [];
const logger = {
  setContext() {},
  log(message) {
    messages.push(message);
  },
  warn(message) {
    messages.push(message);
  },
  error(message) {
    messages.push(message);
  },
};
// Inject only connection configuration and a log sink. The repository methods,
// migration provider/files, schema definitions and drift rules are unmodified.
const repository = new DatabaseRepository(db, logger, {
  isDev: () => false,
  getEnv: () => ({ database: { config: { connectionType: 'url', url: config.ownerUrl } } }),
});
try {
  await repository.runMigrations();
  const drift = await repository.getSchemaDrift();
  await writeFile(
    process.env.GALLERY_UPGRADE_CHECK === '1'
      ? '.gallery-local/phase-b/upstream-upgrade-check.json'
      : '.gallery-local/phase-b/upstream-check.json',
    JSON.stringify({ build, messages, drift }, null, 2),
  );
  assert.deepEqual(drift.items, [], 'Immich source-to-database schema drift must be empty');
  console.log('Original Immich DatabaseRepository.runMigrations + getSchemaDrift passed: 0 drift items.');
} finally {
  await db.destroy();
}
