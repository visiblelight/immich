import { sql, type Kysely } from 'kysely';
export interface MapRequest {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
  albumId?: string;
}
export interface MapCluster {
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  count: string;
}
/** Deduplicate and choose the conservative occurrence BEFORE bbox tests. Counts are
 * complete; bounded cluster paging belongs in the HTTP layer in Phase E.
 */
export async function getMapClusters(db: Kysely<unknown>, request: MapRequest): Promise<MapCluster[]> {
  const { west, south, east, north, zoom } = request;
  if (
    ![west, south, east, north, zoom].every(Number.isFinite) ||
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    south > north ||
    !Number.isInteger(zoom) ||
    zoom < 0 ||
    zoom > 20
  )
    throw new Error('Invalid map bounds');
  // At most 65x65 cells in a viewport, while zoom can resolve small regions.
  const longitudeSpan = west <= east ? east - west : 360 - west + east;
  const step = Math.max(360 / 2 ** (zoom + 2), longitudeSpan / 64, (north - south) / 64);
  const scope = request.albumId ? sql`AND ${request.albumId}::uuid = ANY(ancestor_ids)` : sql``;
  const longitudeBounds =
    west <= east ? sql`longitude BETWEEN ${west} AND ${east}` : sql`(longitude >= ${west} OR longitude <= ${east})`;
  const result = await sql<MapCluster>`WITH occurrences AS (
    SELECT asset_id, location_mode, latitude, longitude FROM gallery.published_photo
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL ${scope}
  ), points AS (
    SELECT DISTINCT ON (asset_id) asset_id, latitude, longitude FROM occurrences
    ORDER BY asset_id, (location_mode = 'approximate') DESC, latitude, longitude
  ), bounded AS (
    SELECT *, floor((longitude + 180) / ${step})::integer AS x,
      floor((latitude + 90) / ${step})::integer AS y
    FROM points WHERE latitude BETWEEN ${south} AND ${north} AND ${longitudeBounds}
  ) SELECT x, y, avg(latitude)::double precision AS latitude, avg(longitude)::double precision AS longitude,
    count(*)::text AS count FROM bounded GROUP BY x, y ORDER BY x, y`.execute(db);
  return result.rows;
}
