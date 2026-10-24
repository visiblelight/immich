import { publicPhotoPlaces } from './places.server.ts';
import { sql, type Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import {
  ensure,
  inferVisits,
  evidenceDate,
  clusterPhotos,
  photoBounds,
  uuid,
  type MapViewport,
  type MapPhoto,
  type PhotoCluster,
  type VisitedCountry,
  type GalleryUser,
  type VisitEvidence,
  regionByCode,
  compareVisitsByCapture,
  compareVisitedPlaces,
} from '@gallery/core';
import { countries } from '../../gallery-core/src/countries.ts';

const names = new Map(countries.map((c) => [c.id, c.zh]));
type Evidence = VisitEvidence & {
  assetId: string;
  albumId: string;
  albumSlug: string;
  latitude: number;
  longitude: number;
  approximate: boolean;
  region: string | null;
};
type Override = {
  id: string;
  country_code: string;
  region_code?: string;
  start: string | null;
  end: string | null;
  label: string;
  version: number;
  assets: string[];
};
type Visit = {
  id: string;
  country: string;
  start: string | null;
  end: string | null;
  label: string;
  manual: boolean;
  version: number;
  needsReview: boolean;
  photos: Evidence[];
};
const dates = (photos: Evidence[]) => {
  const dates = photos
    .map(evidenceDate)
    .filter((p) => p !== null)
    .map((p) => p.date)
    .sort();
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
};
/** GPS and authorization are read on every request. Only the country lookup for a
 * coordinate is cached; published membership/ancestry never comes from a cache.
 */
export async function visitedSnapshot(db: Kysely<unknown>) {
  const read = async (trx: Kysely<unknown>) => {
    const rows = (
      await sql<{
        asset_id: string;
        photo_id: string;
        album_id: string;
        album_slug: string;
        latitude: number;
        longitude: number;
        location_mode: string;
        taken_at: Date | null;
        local_taken_at: Date | null;
        time_zone: string | null;
      }>`SELECT DISTINCT ON(asset_id) asset_id,photo_id,album_id,album_slug,latitude,longitude,location_mode,taken_at,local_taken_at,time_zone
      FROM gallery.published_photo WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY asset_id,(location_mode='approximate') DESC,album_id,photo_id`.execute(trx)
    ).rows;
    const { byAsset: placesByAsset } = await publicPhotoPlaces(trx);
    const points: Evidence[] = [];
    let unassigned = 0;
    for (const row of rows) {
      const places = placesByAsset.get(row.asset_id) ?? [];
      const country = places[0]?.country ?? null;
      if (!country) {
        unassigned++;
        continue;
      }
      points.push({
        id: row.photo_id,
        assetId: row.asset_id,
        albumId: row.album_id,
        albumSlug: row.album_slug,
        latitude: row.latitude,
        longitude: row.longitude,
        approximate: row.location_mode === 'approximate',
        region: row.location_mode === 'exact' ? places.find((p) => p.regionCode)?.regionCode ?? null : null,
        country,
        takenAt: row.taken_at?.toISOString() ?? null,
        localTakenAt: row.local_taken_at?.toISOString() ?? null,
        timeZone: row.time_zone,
      });
    }
    const gap = (
      await sql<{
        visit_gap_days: number;
      }>`SELECT visit_gap_days FROM gallery.map_settings WHERE id=1`.execute(trx)
    ).rows[0]!.visit_gap_days;
    const overrides = (
      await sql<Override>`SELECT o.id,o.country_code,to_char(o.start_local_date,'YYYY-MM-DD') AS start,to_char(o.end_local_date,'YYYY-MM-DD') AS end,o.label,o.version,
      coalesce(array_agg(a.asset_id) FILTER (WHERE a.asset_id IS NOT NULL),ARRAY[]::uuid[]) AS assets
      FROM gallery.visit_override o LEFT JOIN gallery.visit_override_asset a ON a.override_id=o.id GROUP BY o.id`.execute(
        trx,
      )
    ).rows;
    const byAsset = new Map(points.map((p) => [p.assetId, p])),
      byId = new Map(points.map((p) => [p.id, p]));
    const assigned = new Set<string>(),
      visits: Visit[] = [],
      stale: Override[] = [];
    for (const override of overrides) {
      const photos = override.assets
        .map((id) => byAsset.get(id))
        .filter((p): p is Evidence => !!p && p.country === override.country_code);
      const needsReview = photos.length !== override.assets.length;
      if (needsReview) stale.push(override);
      if (!photos.length) continue;
      photos.forEach((p) => assigned.add(p.id));
      visits.push({
        id: override.id,
        country: override.country_code,
        ...(needsReview ? dates(photos) : { start: override.start, end: override.end }),
        label: needsReview ? '' : override.label,
        manual: true,
        version: override.version,
        needsReview,
        photos,
      });
    }
    // Assigned foreign-country evidence still helps separate automatic journeys.
    for (const inferred of inferVisits(points, gap)) {
      const photos = inferred.photoIds.filter((id) => !assigned.has(id)).map((id) => byId.get(id)!);
      if (photos.length)
        visits.push({
          id: inferred.id,
          country: inferred.country,
          ...dates(photos),
          label: '',
          manual: false,
          version: 0,
          needsReview: false,
          photos,
        });
    }
    visits.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || a.id.localeCompare(b.id));
    const summaries: VisitedCountry[] = [];
    for (const [id, name] of names) {
      const groups = visits.filter((v) => v.country === id);
      if (!groups.length) continue;
      summaries.push({
        id,
        name,
        count: groups.reduce((n, v) => n + v.photos.length, 0),
        visits: groups.map((v) => ({
          id: v.id,
          start: v.start,
          end: v.end,
          count: v.photos.length,
          manual: v.manual,
          label: v.label,
          photoStart: dates(v.photos).start,
        })).sort(compareVisitsByCapture),
      });
    }
    summaries.sort(compareVisitedPlaces);
    return { points, visits, summaries, unassigned, total: rows.length, stale, gap };
  };
  return db.isTransaction ? read(db) : db.transaction().setIsolationLevel('repeatable read').execute(read);
}
export async function publicVisited(db: Kysely<unknown>) {
  const snapshot = await visitedSnapshot(db);
  return {
    countries: snapshot.summaries,
    total: snapshot.total,
    unassigned: snapshot.unassigned,
  };
}
export function countryCode(input: string) {
  ensure(names.has(input), '国家不存在。', 404);
  return input;
}
export async function countryOverview(db: Kysely<unknown>, code: string, visitId: string | null) {
  countryCode(code);
  const snapshot = await visitedSnapshot(db);
  const country = snapshot.summaries.find((c) => c.id === code);
  ensure(country, '这个国家暂无可公开展示的位置照片。', 404);
  const selected = snapshot.visits.filter((v) => v.country === code && (!visitId || v.id === visitId));
  ensure(!visitId || selected.length, '这次到访记录已变化，请返回国家页面重新选择。', 404);
  return {
    country,
    visitId,
    bounds: photoBounds(selected.flatMap((v) => v.photos)),
  };
}
async function descriptions(db: Kysely<unknown>, points: Evidence[]): Promise<MapPhoto[]> {
  if (!points.length) return [];
  const rows = (
    await sql<{
      photo_id: string;
      album_id: string;
      album_title: string;
      title: string;
      alt_text: string;
      group_id: string | null;
      description_document: { groups?: { id: string; title: string }[] };
    }>`SELECT p.photo_id,p.album_id,a.title AS album_title,p.title,p.alt_text,p.group_id,a.description_document
    FROM gallery.published_photo p JOIN gallery.published_album a ON a.album_id=p.album_id
    WHERE p.photo_id IN (${sql.join(points.map((p) => sql`${p.id}::uuid`))})`.execute(db)
  ).rows;
  const byId = new Map(rows.map((r) => [`${r.album_id}:${r.photo_id}`, r]));
  return points.flatMap((p) => {
    const row = byId.get(`${p.albumId}:${p.id}`);
    if (!row) return [];
    const group = row.description_document.groups?.find((g) => g.id === row.group_id);
    return [
      {
        id: p.id,
        albumId: p.albumId,
        albumSlug: p.albumSlug,
        albumTitle: row.album_title,
        countryName: names.get(p.country),
        title: group?.title || row.title || row.alt_text || '照片',
        thumbnail: `/media/${p.albumId}/${p.id}?variant=thumbnail`,
        latitude: p.latitude,
        longitude: p.longitude,
      },
    ];
  });
}
export async function countryPhotos(
  db: Kysely<unknown>,
  code: string,
  options: {
    visitId?: string | null;
    viewport?: MapViewport;
    cluster?: string | null;
    page?: number;
    scope?: 'country' | 'all';
  } = {},
): Promise<{
  clusters: PhotoCluster[];
  photos: MapPhoto[];
  total: number;
  page: number;
}> {
  if (!db.isTransaction)
    return db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute((trx) => countryPhotos(trx, code, options));
  countryCode(code);
  const snapshot = await visitedSnapshot(db),
    page = options.page ?? 1;
  ensure(Number.isInteger(page) && page >= 1 && page <= 100000, '页码无效。');
  ensure(!options.scope || ['country', 'all'].includes(options.scope), '照片范围无效。');
  ensure(options.scope !== 'all' || !options.visitId, '查看所有国家时不使用单国到访筛选。');
  ensure(!options.cluster || options.viewport, '选择聚合照片需要地图范围。');
  const visits = snapshot.visits.filter(
    (v) => options.scope === 'all' || (v.country === code && (!options.visitId || v.id === options.visitId)),
  );
  ensure(!options.visitId || visits.length, '到访记录已变化，请重新选择。', 404);
  let points = visits
    .flatMap((v) => v.photos)
    .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? '') || a.id.localeCompare(b.id));
  return mapPhotos(db, points, options, page);
}
async function mapPhotos(
  db: Kysely<unknown>,
  initialPoints: Evidence[],
  options: { viewport?: MapViewport; cluster?: string | null },
  page: number,
): Promise<{ clusters: PhotoCluster[]; photos: MapPhoto[]; total: number; page: number }> {
  let points = initialPoints;
  if (options.viewport) {
    const grouped = clusterPhotos(points, options.viewport);
    if (options.cluster) points = grouped.get(options.cluster) ?? [];
    else {
      const representatives = await descriptions(
        db,
        [...grouped.values()].map((points) => points[0]!),
      );
      const photos = new Map(representatives.map((p) => [p.id, p]));
      const clusters: PhotoCluster[] = [];
      for (const [id, members] of grouped) {
        const photo = photos.get(members[0]!.id);
        if (!photo) continue;
        clusters.push({
          id,
          count: members.length,
          latitude: members.reduce((n, p) => n + p.latitude, 0) / members.length,
          longitude: members.reduce((n, p) => n + p.longitude, 0) / members.length,
          photo,
        });
      }
      return {
        clusters,
        photos: [],
        total: clusters.reduce((n, c) => n + c.count, 0),
        page,
      };
    }
  }
  return {
    clusters: [],
    photos: await descriptions(db, points.slice((page - 1) * 48, page * 48)),
    total: points.length,
    page,
  };
}
export type VisitIndexRow = {
  id: string; country: string; region: string | null; place: string; placeName: string;
  start: string | null; end: string | null; label: string; count: number;
  manual: boolean; needsReview: boolean; invalid: boolean; version: number;
};
/** A single authorized snapshot supplies all journey summaries. Photo membership and
 * thumbnail URLs are loaded only by the editor, never sent with this overview. */
export async function adminVisitIndex(db: Kysely<unknown>, options: {
  scope?: 'country' | 'region'; place?: string; q?: string; status?: string; page?: number;
} = {}): Promise<{
  records: VisitIndexRow[]; total: number; activeTotal: number; invalidTotal: number; placeCount: number;
  places: { id: string; name: string; count: number }[]; page: number; pages: number;
  unassigned: number; unassignedProvince: number; restricted: number;
}> {
  if (!db.isTransaction) return db.transaction().setIsolationLevel('repeatable read')
    .execute((trx) => adminVisitIndex(trx, options));
  const { scope = 'country', place = '', q = '', status = '', page = 1 } = options;
  ensure(scope === 'country' || scope === 'region', '到访范围无效。');
  ensure(['', 'auto', 'manual', 'review', 'invalid'].includes(status), '到访状态无效。');
  ensure(Number.isInteger(page) && page >= 1 && page <= 100000, '页码无效。');
  ensure(q.length <= 200, '搜索内容过长。');
  if (place) scope === 'region' ? regionCode(place) : countryCode(place);
  const world = await visitedSnapshot(db);
  const regional = scope === 'region' ? await regionalSnapshot(db, 'CN', world) : null;
  const snapshot = regional ?? world;
  const destination = (code: string) => ({ country: scope === 'region' ? 'CN' : code,
    region: scope === 'region' ? code : null, place: code,
    placeName: scope === 'region' ? regionCode(code).name : names.get(code)!,
  });
  const records: VisitIndexRow[] = snapshot.visits.map((v) => ({
    ...destination(v.country), id: v.id, start: v.start, end: v.end, label: v.label,
    count: v.photos.length, manual: v.manual, needsReview: v.needsReview, invalid: false, version: v.version,
  }));
  const activeIds = new Set(records.map((v) => v.id));
  for (const v of snapshot.stale) {
    if (activeIds.has(v.id)) continue;
    // Keep only identity/version for invalid evidence; do not revive unavailable titles or dates.
    records.push({ ...destination(v.region_code ?? v.country_code), id: v.id,
      start: null, end: null, label: '', count: 0, manual: true, needsReview: true, invalid: true, version: v.version });
  }
  const places = [...new Set(records.map((v) => v.place))].map((id) => ({
    id, name: destination(id).placeName, count: records.filter((v) => v.place === id && !v.invalid).length,
  })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const query = q.trim().toLocaleLowerCase();
  const filtered = records.filter((v) => (!place || v.place === place)
    && (!query || `${v.placeName} ${v.label} ${v.start ?? ''} ${v.end ?? ''}`.toLocaleLowerCase().includes(query))
    && (!status || (status === 'auto' ? !v.manual : status === 'manual' ? v.manual
      : status === 'review' ? v.needsReview : v.invalid)))
    .sort((a, b) => Number(a.invalid) - Number(b.invalid)
      || (b.start ?? '').localeCompare(a.start ?? '') || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), current = Math.min(page, pages);
  return { records: filtered.slice((current - 1) * 20, current * 20), total: filtered.length,
    activeTotal: activeIds.size, invalidTotal: records.length - activeIds.size,
    placeCount: places.filter((p) => p.count > 0).length, places, page: current, pages,
    unassigned: world.unassigned, unassignedProvince: regional?.unassignedProvince ?? 0,
    restricted: regional?.restricted ?? 0 };
}

export async function adminVisited(db: Kysely<unknown>, code?: string, region?: string): Promise<{
  countries: VisitedCountry[]; regions: VisitedCountry[]; region: string | null;
  nationalCount: number; unassignedProvince: number; restricted: number; unassigned: number;
  records: { id: string; start: string | null; end: string | null; label: string; manual: boolean;
    version: number; needsReview: boolean; count: number; photoIds: string[] }[];
  stale: { id: string; country: string; region?: string; version: number }[];
  photos: { id: string; thumbnail: string; albumSlug: string; date: string | null }[];
}> {
  if (!db.isTransaction)
    return db.transaction().setIsolationLevel('repeatable read').execute((trx) => adminVisited(trx, code, region));
  if (code) countryCode(code);
  if (region) ensure(regionCode(region).country === code, '地区与国家不匹配。');
  const snapshot = await visitedSnapshot(db);
  const regional = code === 'CN' ? await regionalSnapshot(db, code, snapshot) : null;
  const current = region ? regional! : snapshot;
  const selected = region ?? code;
  const points = selected ? current.points.filter((p) => region ? p.region === region : p.country === code) : [];
  const records = current.visits
    .filter((v) => v.country === selected)
    .map((v) => ({
      id: v.id,
      start: v.start,
      end: v.end,
      label: v.label,
      manual: v.manual,
      version: v.version,
      needsReview: v.needsReview,
      count: v.photos.length,
      photoIds: v.photos.map((p) => p.id),
    }));
  // Stale evidence identifies the record, never unavailable filenames or dates.
  const stale = current.stale
    .filter((v) => region ? v.region_code === region : !code || v.country_code === code)
    .map((v) => ({ id: v.id, country: v.country_code, region: v.region_code, version: v.version }));
  return {
    countries: snapshot.summaries,
    regions: regional?.summaries ?? [],
    region: region ?? null,
    nationalCount: regional?.nationalCount ?? 0,
    unassignedProvince: regional?.unassignedProvince ?? 0,
    restricted: regional?.restricted ?? 0,
    unassigned: snapshot.unassigned,
    records,
    stale,
    photos: points.map((p) => ({
      id: p.id,
      thumbnail: `/media/${p.albumId}/${p.id}?variant=thumbnail`,
      albumSlug: p.albumSlug,
      date: evidenceDate(p)?.date ?? null,
    })),
  };
}

function localDate(input: unknown) {
  if (input === null || input === '') return null;
  ensure(
    typeof input === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(input) &&
      Number.isFinite(Date.parse(input)) &&
      new Date(input).toISOString().slice(0, 10) === input,
    '到访日期无效。',
  );
  return input;
}
export async function saveVisit(db: Kysely<unknown>, user: GalleryUser, input: Record<string, unknown>) {
  const code = countryCode(String(input.country));
  const region = input.region ? regionCode(String(input.region)) : null;
  ensure(!region || region.country === code, '地区与国家不匹配。');
  const groupCode = region?.code ?? code;
  const table = region ? 'gallery.region_visit_override' : 'gallery.visit_override';
  const members = region ? 'gallery.region_visit_override_asset' : 'gallery.visit_override_asset';
  const groupColumn = region ? 'region_code' : 'country_code';
  const id = input.id ? uuid(input.id) : randomUUID(),
    start = localDate(input.start),
    end = localDate(input.end),
    label = String(input.label ?? '').trim();
  ensure(
    (start === null && end === null) || (start !== null && end !== null && start <= end),
    '到访结束日期不能早于开始日期。',
  );
  ensure(label.length <= 120, '到访名称过长。');
  ensure(
    Array.isArray(input.photoIds) && input.photoIds.length > 0 && input.photoIds.length <= 20000,
    '请选取 1–20000 张照片。',
  );
  const photoIds = new Set(input.photoIds.map(uuid));
  const replaced = (Array.isArray(input.replace) ? input.replace : []).map((v: unknown) => {
    ensure(v && typeof v === 'object', '记录版本无效。');
    const r = v as { id: unknown; version: unknown };
    return { id: uuid(r.id), version: Number(r.version) };
  });
  ensure(
    !replaced.some((r) => r.id === id) && new Set(replaced.map((r) => r.id)).size === replaced.length,
    '合并记录重复。',
  );
  await db.transaction().execute(async (trx) => {
    // Serialize regrouping so uniqueness conflicts cannot silently overwrite another edit.
    await sql`SELECT version FROM gallery.map_settings WHERE id=1 FOR UPDATE`.execute(trx);
    const snapshot = region ? await regionalSnapshot(trx, code) : await visitedSnapshot(trx);
    const photos = snapshot.points.filter((p) => (region ? p.region === groupCode : p.country === code) && photoIds.has(p.id));
    ensure(photos.length === photoIds.size, '选中的照片或位置已变化，请重新载入。', 409);
    if (input.id) {
      const existing = (
        await sql<{
          version: number;
          country_code: string;
        }>`SELECT version,${sql.ref(groupColumn)} AS country_code FROM ${sql.table(table)} WHERE id=${id}::uuid FOR UPDATE`.execute(
          trx,
        )
      ).rows[0];
      ensure(
        existing && existing.version === input.version && existing.country_code === groupCode,
        '记录已变化，请重新载入。',
        409,
      );
      await sql`DELETE FROM ${sql.table(members)} WHERE override_id=${id}::uuid`.execute(trx);
      await sql`UPDATE ${sql.table(table)} SET start_local_date=${start}::date,end_local_date=${end}::date,label=${label},version=version+1,updated_at=now(),updated_by=${user.id}::uuid WHERE id=${id}::uuid`.execute(
        trx,
      );
    } else
      await sql`INSERT INTO ${sql.table(table)}(id,${sql.ref(groupColumn)},start_local_date,end_local_date,label,updated_by) VALUES(${id}::uuid,${groupCode},${start}::date,${end}::date,${label},${user.id}::uuid)`.execute(
        trx,
      );
    for (const record of replaced) {
      const existing = snapshot.visits.find((v) => v.id === record.id && v.manual && v.country === groupCode);
      ensure(
        existing && existing.photos.every((p) => photoIds.has(p.id)),
        '合并需要包含所选人工记录的全部有效照片。',
      );
      const removed =
        await sql`DELETE FROM ${sql.table(table)} WHERE id=${record.id}::uuid AND ${sql.ref(groupColumn)}=${groupCode} AND version=${record.version}`.execute(
          trx,
        );
      ensure(Number(removed.numAffectedRows) === 1, '记录已变化，请重新载入。', 409);
    }
    await sql`INSERT INTO ${sql.table(members)}(override_id,${sql.ref(groupColumn)},asset_id) VALUES ${sql.join(photos.map((photo) => sql`(${id}::uuid,${groupCode},${photo.assetId}::uuid)`))}`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()},${user.id},${region ? 'region-visit.save' : 'visit.save'},${region ? 'region-visit' : 'visit'},${id})`.execute(
      trx,
    );
  });
  return id;
}
export async function deleteVisit(db: Kysely<unknown>, user: GalleryUser, input: Record<string, unknown>) {
  const id = uuid(input.id);
  const region = input.region ? regionCode(String(input.region)) : null;
  const table = region ? 'gallery.region_visit_override' : 'gallery.visit_override';
  await db.transaction().execute(async (trx) => {
    const result =
      await sql`DELETE FROM ${sql.table(table)} WHERE id=${id}::uuid AND version=${Number(input.version)} ${region ? sql`AND region_code=${region.code}` : sql``}`.execute(
        trx,
      );
    ensure(Number(result.numAffectedRows) === 1, '记录已变化，请重新载入。', 409);
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()},${user.id},${region ? 'region-visit.reset' : 'visit.reset'},${region ? 'region-visit' : 'visit'},${id})`.execute(
      trx,
    );
  });
}

export function regionCode(input: string) {
  const region = regionByCode(input);
  ensure(region, '地区不存在。', 404);
  return region;
}
/** Region journeys have their own evidence assignments; a country override must
 * never merge or replace region visits. Foreign-country evidence still separates
 * two visits to the same province, while unresolved provinces cannot invent one.
 */
async function regionalSnapshot(
  db: Kysely<unknown>,
  code: string,
  snapshot?: Awaited<ReturnType<typeof visitedSnapshot>>,
) {
  ensure(code === 'CN', '这个国家尚未启用地区足迹。', 404);
  const world = snapshot ?? await visitedSnapshot(db);
  const national = world.points.filter((p) => p.country === code);
  const points = national.filter((p) => !p.approximate && p.region && regionByCode(p.region)?.country === code);
  const byAsset = new Map(points.map((p) => [p.assetId, p]));
  const byId = new Map(points.map((p) => [p.id, p]));
  const overrides = (await sql<Override>`SELECT o.id,split_part(o.region_code,'-',1) AS country_code,o.region_code,
    to_char(o.start_local_date,'YYYY-MM-DD') AS start,to_char(o.end_local_date,'YYYY-MM-DD') AS end,o.label,o.version,
    coalesce(array_agg(a.asset_id) FILTER (WHERE a.asset_id IS NOT NULL),ARRAY[]::uuid[]) AS assets
    FROM gallery.region_visit_override o LEFT JOIN gallery.region_visit_override_asset a ON a.override_id=o.id
    WHERE split_part(o.region_code,'-',1)=${code} GROUP BY o.id`.execute(db)).rows;
  const assigned = new Set<string>(), visits: Visit[] = [], stale: Override[] = [];
  for (const override of overrides) {
    const photos = override.assets.map((id) => byAsset.get(id))
      .filter((p): p is Evidence => !!p && p.region === override.region_code);
    const needsReview = photos.length !== override.assets.length;
    if (needsReview) stale.push(override);
    if (!photos.length) continue;
    for (const photo of photos) assigned.add(photo.id);
    visits.push({
      id: override.id, country: override.region_code!,
      ...(needsReview ? dates(photos) : { start: override.start, end: override.end }),
      label: needsReview ? '' : override.label, manual: true, version: override.version, needsReview, photos,
    });
  }
  const inferenceEvidence = world.points.flatMap((p) => {
    if (p.country !== code) return [{ ...p, country: `country:${p.country}` }];
    return p.region && !p.approximate ? [{ ...p, country: p.region }] : [];
  });
  for (const inferred of inferVisits(inferenceEvidence, world.gap)) {
    if (regionByCode(inferred.country)?.country !== code) continue;
    const photos = inferred.photoIds.filter((id) => !assigned.has(id)).map((id) => byId.get(id)!)
      .filter((p): p is Evidence => !!p);
    if (!photos.length) continue;
    visits.push({
      id: `region-${inferred.id}`, country: inferred.country, ...dates(photos), label: '',
      manual: false, version: 0, needsReview: false, photos,
    });
  }
  visits.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || a.id.localeCompare(b.id));
  const summaries: VisitedCountry[] = [];
  for (const id of new Set(points.map((p) => p.region!))) {
    const groups = visits.filter((v) => v.country === id);
    summaries.push({ id, name: regionByCode(id)!.name,
      count: groups.reduce((n, v) => n + v.photos.length, 0),
      visits: groups.map((v) => ({ id: v.id, start: v.start, end: v.end, count: v.photos.length, manual: v.manual, label: v.label, photoStart: dates(v.photos).start })).sort(compareVisitsByCapture),
    });
  }
  return {
    points, visits, summaries: summaries.sort(compareVisitedPlaces), stale, world,
    nationalCount: national.length,
    restricted: national.filter((p) => p.approximate).length,
    unassignedProvince: national.filter((p) => !p.approximate && !p.region).length,
  };
}
export async function publicRegionalVisited(db: Kysely<unknown>, code = 'CN'): Promise<{
  country: { id: string; name: string; count: number }; regions: VisitedCountry[];
  total: number; nationalCount: number; unassigned: number; unassignedProvince: number; restricted: number;
}> {
  if (!db.isTransaction)
    return db.transaction().setIsolationLevel('repeatable read').execute((trx) => publicRegionalVisited(trx, code));
  const snapshot = await regionalSnapshot(db, code);
  return {
    country: { id: code, name: names.get(code)!, count: snapshot.nationalCount },
    regions: snapshot.summaries,
    total: snapshot.nationalCount,
    nationalCount: snapshot.nationalCount,
    unassigned: snapshot.unassignedProvince,
    unassignedProvince: snapshot.unassignedProvince,
    restricted: snapshot.restricted,
  };
}
export async function regionOverview(db: Kysely<unknown>, id: string, visitId: string | null = null): Promise<{
  region: VisitedCountry; countryCode: string; visitId: string | null; bounds: MapViewport;
}> {
  if (!db.isTransaction)
    return db.transaction().setIsolationLevel('repeatable read').execute((trx) => regionOverview(trx, id, visitId));
  const code = regionCode(id).country;
  const snapshot = await regionalSnapshot(db, code);
  const region = snapshot.summaries.find((r) => r.id === id);
  ensure(region, '这个地区暂无可公开展示的位置照片。', 404);
  const selected = snapshot.visits.filter((v) => v.country === id && (!visitId || v.id === visitId));
  ensure(!visitId || selected.length, '这次到访记录已变化，请返回地区页面重新选择。', 404);
  return { region, countryCode: code, visitId, bounds: photoBounds(selected.flatMap((v) => v.photos)) };
}
export async function regionPhotos(
  db: Kysely<unknown>, id: string,
  options: { visitId?: string | null; viewport?: MapViewport; cluster?: string | null; page?: number; scope?: 'region' | 'country' | 'all' } = {},
): Promise<{ clusters: PhotoCluster[]; photos: MapPhoto[]; total: number; page: number }> {
  if (!db.isTransaction)
    return db.transaction().setIsolationLevel('repeatable read').execute((trx) => regionPhotos(trx, id, options));
  const code = regionCode(id).country, scope = options.scope ?? 'region', page = options.page ?? 1;
  ensure(Number.isInteger(page) && page >= 1 && page <= 100000, '页码无效。');
  ensure(['region', 'country', 'all'].includes(scope), '照片范围无效。');
  ensure(scope === 'region' || !options.visitId, '查看全国或所有国家时不使用省级到访筛选。');
  ensure(!options.cluster || options.viewport, '选择聚合照片需要地图范围。');
  const snapshot = await regionalSnapshot(db, code);
  const visits = snapshot.visits.filter((v) => v.country === id && (!options.visitId || v.id === options.visitId));
  ensure(!options.visitId || visits.length, '到访记录已变化，请重新选择。', 404);
  const selected = scope === 'all' ? snapshot.world.points
    : scope === 'country' ? snapshot.world.points.filter((p) => p.country === code)
      : visits.flatMap((v) => v.photos);
  const points = selected.sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? '') || a.id.localeCompare(b.id));
  return mapPhotos(db, points, options, page);
}
