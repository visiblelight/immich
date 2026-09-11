import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const schemaFile = process.argv[2];
const metadataFile = process.argv[3];
if (!schemaFile)
  throw new Error(
    'Usage: gallery:test:db /absolute/path/to/immich-schema-only.sql [/absolute/path/to/immich-migration-metadata.sql]',
  );
const schema = await readFile(schemaFile);
// Must be an actual schema-only pg_dump, never a data dump.
if (!schema.includes(Buffer.from('PostgreSQL database dump')) || /^COPY |^INSERT INTO /m.test(schema.toString())) {
  throw new Error('Expected a schema-only pg_dump without rows');
}
const run = (file, args, options = {}) =>
  new Promise((ok, fail) => {
    const child = spawn(file, args, { stdio: 'inherit', ...options });
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`Validation process exited ${code}`))));
  });
await run(process.execPath, ['deployment/gallery/scripts/isolation-start.mjs']);
await writeFile(
  '.gallery-local/phase-b/validation.json',
  JSON.stringify({ passed: false, status: 'running', startedAt: new Date().toISOString() }, null, 2),
);
const config = JSON.parse(await readFile('.gallery-local/phase-b/connection.json', 'utf8'));
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      execFileSync('docker', ['exec', config.name, 'pg_isready', '-U', 'postgres', '-d', 'gallery_test'], {
        stdio: 'pipe',
      });
      ready = true;
      break;
    } catch {
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  execFileSync(
    'docker',
    ['exec', '-i', config.name, 'psql', '-U', 'postgres', '-d', 'gallery_test', '-v', 'ON_ERROR_STOP=1'],
    { input: schema, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  if (metadataFile) {
    const metadata = await readFile(metadataFile, 'utf8');
    const tables = [...metadata.matchAll(/^COPY ([^ ]+) /gm)].map((m) => m[1]);
    if (
      !tables.length ||
      tables.some((table) => !['public.kysely_migrations', 'public.migration_overrides'].includes(table)) ||
      /^INSERT INTO /m.test(metadata)
    )
      throw new Error('Only migration technical metadata may be restored');
    execFileSync(
      'docker',
      ['exec', '-i', config.name, 'psql', '-U', 'postgres', '-d', 'gallery_test', '-v', 'ON_ERROR_STOP=1'],
      { input: metadata, stdio: ['pipe', 'ignore', 'pipe'] },
    );
  }
  await run(process.execPath, ['deployment/gallery/scripts/schema-drift.mjs', 'before']);
  await run(process.execPath, ['--test', 'test/integration/database.test.ts'], {
    cwd: resolve('packages/gallery-db'),
    env: { ...process.env, GALLERY_TEST_CONFIG: resolve('.gallery-local/phase-b/connection.json') },
  });
  await run(process.execPath, ['deployment/gallery/scripts/schema-drift.mjs', 'after']);
  if (metadataFile)
    await run(process.execPath, ['deployment/gallery/scripts/upstream-check.mjs'], {
      env: { ...process.env, GALLERY_UPGRADE_CHECK: '0' },
    });
  if (metadataFile && process.env.GALLERY_UPGRADE_CHECK === '1') {
    await run(process.execPath, ['deployment/gallery/scripts/upstream-check.mjs'], {
      env: { ...process.env, GALLERY_IMMICH_BUILD_DIR: resolve('.gallery-local/upgrade/runtime/dist') },
    });
    console.log('Recorded candidate original migration/schema check passed on the Gallery-bearing isolated database.');
  }
  await writeFile(
    '.gallery-local/phase-b/validation.json',
    JSON.stringify(
      {
        passed: true,
        checkedAt: new Date().toISOString(),
        postgresImage: '14-vectorchord0.4.3-pgvectors0.2.0',
        data: 'synthetic',
        schemaOnly: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    '.gallery-local/phase-b/validation.json',
    JSON.stringify({ passed: false, status: 'failed', checkedAt: new Date().toISOString() }, null, 2),
  );
  throw error;
} finally {
  const label = execFileSync(
    'docker',
    ['inspect', config.name, '--format', '{{index .Config.Labels "gallery.isolation"}}'],
    { encoding: 'utf8' },
  ).trim();
  if (label === 'true' && config.name.startsWith('gallery-db-check-')) {
    execFileSync('docker', ['rm', '-f', '-v', config.name], { stdio: 'pipe' });
    console.log('Removed isolated test container and its ephemeral data.');
  }
}
