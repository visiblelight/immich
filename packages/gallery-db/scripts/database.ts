import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrate } from '../src/migrate.server.ts';

const action = process.argv[2];
if (!['bootstrap', 'migrate', 'source-enable', 'source-disable'].includes(action ?? '')) {
  throw new Error('Usage: database.ts bootstrap|migrate|source-enable|source-disable [owner UUID] [label]');
}
const url = process.env[action === 'bootstrap' ? 'GALLERY_BOOTSTRAP_DATABASE_URL' : 'GALLERY_MIGRATION_DATABASE_URL'];
if (!url) throw new Error('Missing dedicated Gallery database administration URL');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  if (action === 'bootstrap') {
    const passwords = ['MIGRATOR', 'ADMIN', 'PUBLIC'].map((role) => {
      const password = process.env[`GALLERY_${role}_PASSWORD`];
      if (!password || password.length < 24)
        throw new Error(`GALLERY_${role}_PASSWORD must have at least 24 characters`);
      return [role.toLowerCase(), password] as const;
    });
    const immichRole = process.env.GALLERY_IMMICH_DATABASE_ROLE;
    if (!immichRole || !(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [immichRole])).rowCount)
      throw new Error('Set the existing Immich database role');
    await client.query('BEGIN');
    await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${pg.escapeIdentifier(immichRole)}`);
    await client.query(
      await readFile(new URL('../../../deployment/gallery/database/bootstrap.sql', import.meta.url), 'utf8'),
    );
    for (const [role, password] of passwords) {
      await client.query(`ALTER ROLE ${pg.escapeIdentifier(`gallery_${role}`)} PASSWORD ${pg.escapeLiteral(password)}`);
    }
    await client.query('COMMIT');
    console.log('Gallery roles and schema initialized. Source scope is empty.');
  } else if (action === 'migrate') {
    console.log('Applied Gallery migrations:', (await migrate(client)).join(', ') || 'already current');
  } else {
    const identity = await client.query('SELECT current_user');
    if (identity.rows[0]?.current_user !== 'gallery_migrator')
      throw new Error('Source configuration requires gallery_migrator');
    const ownerId = process.argv[3];
    if (!ownerId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ownerId))
      throw new Error('Expected Immich owner UUID');
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO gallery.immich_source_owner(immich_owner_id, label, enabled) VALUES ($1, $2, $3)
      ON CONFLICT (immich_owner_id) DO UPDATE SET label = EXCLUDED.label, enabled = EXCLUDED.enabled, updated_at = now()`,
      [ownerId, process.argv[4] ?? '', action === 'source-enable'],
    );
    await client.query(
      `INSERT INTO gallery.audit_event(id, action, target_type, target_id) VALUES ($1, $2, 'source', $3)`,
      [crypto.randomUUID(), action === 'source-enable' ? 'source.enable' : 'source.disable', ownerId],
    );
    await client.query('COMMIT');
    console.log('Gallery source scope updated.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  // pg errors may contain SQL literals, URLs or user content. Do not log them.
  console.error(
    'Gallery database operation failed.',
    error instanceof Error && 'code' in error
      ? `SQLSTATE ${String(error.code)}`
      : 'Check configuration and migration history.',
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
