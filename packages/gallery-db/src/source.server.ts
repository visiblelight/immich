import { sql, type Kysely } from 'kysely';

export interface SourceAsset {
  asset_id: string;
  filename: string;
  width: number | null;
  height: number | null;
  taken_at: Date;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source_description: string | null;
}
export interface SourceFilters {
  albumId?: string;
  tagId?: string;
  afterId?: string;
  limit?: number;
}
/** Stable picker DTO: no original paths, credentials, or unrelated owner metadata. */
export async function listSourceAssets(db: Kysely<unknown>, filters: SourceFilters = {}): Promise<SourceAsset[]> {
  const limit = filters.limit ?? 60;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid source page size');
  const album = filters.albumId
    ? sql`AND EXISTS (SELECT 1 FROM gallery.admin_source_album_asset m
    WHERE m.album_id = ${filters.albumId}::uuid AND m.asset_id = s.asset_id)`
    : sql``;
  const tag = filters.tagId
    ? sql`AND EXISTS (SELECT 1 FROM gallery.admin_source_tag_asset m
    WHERE m.tag_id = ${filters.tagId}::uuid AND m.asset_id = s.asset_id)`
    : sql``;
  const cursor = filters.afterId ? sql`AND s.asset_id > ${filters.afterId}::uuid` : sql``;
  return (
    await sql<SourceAsset>`SELECT s.asset_id, s.filename, s.width, s.height, s.taken_at,
    s.latitude, s.longitude, s.city, s.state, s.country, s.source_description
    FROM gallery.admin_source_asset s WHERE true ${album} ${tag} ${cursor}
    ORDER BY s.asset_id LIMIT ${limit}`.execute(db)
  ).rows;
}

export async function listSourceAlbums(db: Kysely<unknown>) {
  return (
    await sql<{
      album_id: string;
      name: string;
    }>`SELECT album_id, name FROM gallery.admin_source_album ORDER BY name, album_id`.execute(db)
  ).rows;
}

/** POSTed IDs are requalified independently of picker pagination and filters. */
export async function qualifySourceSelection(db: Kysely<unknown>, ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0 || ids.length > 200 || new Set(ids).size !== ids.length) return false;
  const result = await sql<{
    count: string;
  }>`SELECT count(*)::text AS count FROM gallery.admin_source_asset WHERE asset_id = ANY(${ids}::uuid[])`.execute(db);
  return Number(result.rows[0]?.count) === ids.length;
}
