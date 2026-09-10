import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

export const migrationDirectory = new URL('../migrations/', import.meta.url);
/** Caller supplies a dedicated migration connection, never a runtime pool. */
export async function migrate(client: pg.Client, directory: URL = migrationDirectory): Promise<string[]> {
  const identity = await client.query<{ current_user: string }>('SELECT current_user');
  if (identity.rows[0]?.current_user !== 'gallery_migrator')
    throw new Error('Gallery migrations require gallery_migrator');
  await client.query('SELECT pg_advisory_lock(728310, 1)');
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS gallery.schema_migration (
      version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const sources = await Promise.all(
      files.map(async (name) => {
        const sql = await readFile(new URL(name, directory), 'utf8');
        return { version: name.slice(0, 4), name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
      }),
    );
    if (new Set(sources.map((s) => s.version)).size !== sources.length)
      throw new Error('Duplicate Gallery migration version');
    const existing = await client.query<{ version: string; name: string; checksum: string }>(
      'SELECT version, name, checksum FROM gallery.schema_migration ORDER BY version',
    );
    for (const row of existing.rows) {
      const source = sources.find((s) => s.version === row.version);
      if (!source || source.name !== row.name || source.checksum !== row.checksum) {
        throw new Error(`Gallery migration history mismatch: ${row.version}`);
      }
    }
    const applied: string[] = [];
    for (const source of sources) {
      if (existing.rows.some((r) => r.version === source.version)) continue;
      if (existing.rows.some((r) => r.version > source.version)) throw new Error('Out-of-order Gallery migration');
      await client.query('BEGIN');
      try {
        await client.query(source.sql);
        await client.query('INSERT INTO gallery.schema_migration(version, name, checksum) VALUES ($1, $2, $3)', [
          source.version,
          source.name,
          source.checksum,
        ]);
        await client.query('COMMIT');
        applied.push(source.version);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(728310, 1)');
  }
}
