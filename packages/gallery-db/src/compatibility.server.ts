import { sql, type Kysely } from 'kysely';
import type { DatabaseService } from './config.server.ts';
/** Run before marking a service ready. Unknown major versions fail closed until
 * their actual source contract and privilege tests have been certified.
 */
export async function assertDatabaseCompatibility(
  db: Kysely<unknown>,
  service: DatabaseService,
): Promise<void> {
  const { rows } = await sql<{
    version: number;
    role: string;
    elevated: boolean;
  }>`SELECT
    current_setting('server_version_num')::integer AS version, current_user AS role,
    (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls) AS elevated
    FROM pg_catalog.pg_roles WHERE rolname = current_user`.execute(db);
  const row = rows[0];
  const expected = service === 'gallery-public' ? 'gallery_public' : 'gallery_admin';
  if (!row || row.role !== expected || row.elevated || row.version < 140000 || row.version >= 150000) {
    throw new Error('Unsupported Gallery database contract');
  }
  const privileges = await sql<{ unsafe: boolean }>`SELECT (
    has_schema_privilege(current_user, 'public', 'CREATE') OR
    has_schema_privilege(current_user, 'gallery', 'CREATE') OR
    has_column_privilege(current_user, 'public.asset', 'id', 'SELECT') OR
    has_column_privilege(current_user, 'public.asset_exif', 'latitude', 'SELECT') OR
    pg_has_role(current_user, 'gallery_migrator', 'MEMBER') OR
    pg_has_role(current_user, 'gallery_view_owner', 'MEMBER')
  ) AS unsafe`.execute(db);
  if (privileges.rows[0]?.unsafe !== false) throw new Error('Unsafe Gallery database privileges');
  // Explicit columns force PostgreSQL to validate underlying view dependencies.
  await sql`SELECT name,copyright_name,footer_text FROM gallery.published_site LIMIT 0`.execute(db);
  await sql`SELECT album_id, release_id, ancestor_ids, description_document FROM gallery.published_album LIMIT 0`.execute(
    db,
  );
  await sql`SELECT album_id, photo_id, asset_id, location_mode, latitude, longitude, group_id, description_format, tags, taken_at, local_taken_at, time_zone, first_added_at FROM gallery.published_photo LIMIT 0`.execute(
    db,
  );
  await sql`SELECT preview_id, preview_path, preview_update_id, thumbnail_id, thumbnail_path,
    thumbnail_update_id FROM gallery.published_media LIMIT 0`.execute(db);
  await sql`SELECT id,name,photo_count FROM gallery.published_tag LIMIT 0`.execute(db);
  await sql`SELECT id,slug,release_id,content,first_published_at FROM gallery.published_article LIMIT 0`.execute(
    db,
  );
  await sql`SELECT article_id,id,storage_key FROM gallery.published_article_media LIMIT 0`.execute(db);
  await sql`SELECT article_id,album_id,asset_id,preview_path FROM gallery.published_article_photo_media LIMIT 0`.execute(
    db,
  );
  await sql`SELECT article_id,album_id,group_id FROM gallery.published_article_group LIMIT 0`.execute(db);
  if (service === 'gallery-admin') {
    await sql`SELECT immich_asset_id,hidden_from_gallery FROM gallery.photo LIMIT 0`.execute(db);
    await sql`SELECT id,version,content FROM gallery.article LIMIT 0`.execute(db);
    await sql`SELECT asset_id, is_edited, latitude, longitude, city, source_description FROM gallery.admin_source_asset LIMIT 0`.execute(
      db,
    );
  }
}
