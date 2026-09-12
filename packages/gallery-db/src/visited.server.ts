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
} from '@gallery/core';
import { countries } from '../../gallery-core/src/countries.ts';
import { getCountryLocator } from './countries.server.ts';

const names = new Map(countries.map((c) => [c.id, c.zh]));
type Evidence = VisitEvidence & {
  assetId: string;
  albumId: string;
  albumSlug: string;
  latitude: number;
  longitude: number;
  approximate: boolean;
};
type Override = {
  id: string;
  country_code: string;
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
  const locate = await getCountryLocator();
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
    const points: Evidence[] = [];
    let unassigned = 0;
    for (const row of rows) {
      const country = locate(row.longitude, row.latitude, row.location_mode === 'approximate');
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
        country,
        takenAt: row.taken_at?.toISOString() ?? null,
        localTakenAt: row.local_taken_at?.toISOString() ?? null,
        timeZone: row.time_zone,
      });
    }
    const gap = (
      await sql<{ visit_gap_days: number }>`SELECT visit_gap_days FROM gallery.map_settings WHERE id=1`.execute(trx)
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
        })),
      });
    }
    return { points, visits, summaries, unassigned, total: rows.length, stale };
  };
  return db.isTransaction ? read(db) : db.transaction().setIsolationLevel('repeatable read').execute(read);
}
export async function publicVisited(db: Kysely<unknown>) {
  const snapshot = await visitedSnapshot(db);
  return { countries: snapshot.summaries, total: snapshot.total, unassigned: snapshot.unassigned };
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
  return { country, visitId, bounds: photoBounds(selected.flatMap((v) => v.photos)) };
}
async function descriptions(db: Kysely<unknown>, points: Evidence[]): Promise<MapPhoto[]> {
  if (!points.length) return [];
  const rows = (
    await sql<{
      photo_id: string;
      album_id: string;
      title: string;
      alt_text: string;
      group_id: string | null;
      description_document: { groups?: { id: string; title: string }[] };
    }>`SELECT p.photo_id,p.album_id,p.title,p.alt_text,p.group_id,a.description_document
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
  options: { visitId?: string | null; viewport?: MapViewport; cluster?: string | null; page?: number } = {},
): Promise<{ clusters: PhotoCluster[]; photos: MapPhoto[]; total: number; page: number }> {
  if (!db.isTransaction)
    return db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute((trx) => countryPhotos(trx, code, options));
  countryCode(code);
  const snapshot = await visitedSnapshot(db),
    page = options.page ?? 1;
  ensure(Number.isInteger(page) && page >= 1 && page <= 100000, '页码无效。');
  const visits = snapshot.visits.filter((v) => v.country === code && (!options.visitId || v.id === options.visitId));
  ensure(!options.visitId || visits.length, '到访记录已变化，请重新选择。', 404);
  let points = visits
    .flatMap((v) => v.photos)
    .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? '') || a.id.localeCompare(b.id));
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
      return { clusters, photos: [], total: clusters.reduce((n, c) => n + c.count, 0), page };
    }
  }
  return {
    clusters: [],
    photos: await descriptions(db, points.slice((page - 1) * 48, page * 48)),
    total: points.length,
    page,
  };
}
export async function adminVisited(db: Kysely<unknown>, code?: string) {
  if (code) countryCode(code);
  const snapshot = await visitedSnapshot(db);
  const points = code ? snapshot.points.filter((p) => p.country === code) : [];
  const records = snapshot.visits
    .filter((v) => v.country === code)
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
  // Unavailable evidence never yields private filenames or dates. A stale manual
  // record with no live evidence is only identified for deletion by the admin.
  const stale = snapshot.stale
    .filter((v) => !code || v.country_code === code)
    .map((v) => ({ id: v.id, country: v.country_code, version: v.version }));
  return {
    countries: snapshot.summaries,
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
  const snapshot = await visitedSnapshot(db),
    photos = snapshot.points.filter((p) => p.country === code && photoIds.has(p.id));
  ensure(photos.length === photoIds.size, '选中的照片或位置已变化，请重新载入。', 409);
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
    if (input.id) {
      const existing = (
        await sql<{
          version: number;
          country_code: string;
        }>`SELECT version,country_code FROM gallery.visit_override WHERE id=${id}::uuid FOR UPDATE`.execute(trx)
      ).rows[0];
      ensure(
        existing && existing.version === input.version && existing.country_code === code,
        '记录已变化，请重新载入。',
        409,
      );
      await sql`DELETE FROM gallery.visit_override_asset WHERE override_id=${id}::uuid`.execute(trx);
      await sql`UPDATE gallery.visit_override SET start_local_date=${start}::date,end_local_date=${end}::date,label=${label},version=version+1,updated_at=now(),updated_by=${user.id}::uuid WHERE id=${id}::uuid`.execute(
        trx,
      );
    } else
      await sql`INSERT INTO gallery.visit_override(id,country_code,start_local_date,end_local_date,label,updated_by) VALUES(${id}::uuid,${code},${start}::date,${end}::date,${label},${user.id}::uuid)`.execute(
        trx,
      );
    for (const record of replaced) {
      const existing = snapshot.visits.find((v) => v.id === record.id && v.manual && v.country === code);
      ensure(existing && existing.photos.every((p) => photoIds.has(p.id)), '合并需要包含所选人工记录的全部有效照片。');
      const removed =
        await sql`DELETE FROM gallery.visit_override WHERE id=${record.id}::uuid AND country_code=${code} AND version=${record.version}`.execute(
          trx,
        );
      ensure(Number(removed.numAffectedRows) === 1, '记录已变化，请重新载入。', 409);
    }
    await sql`INSERT INTO gallery.visit_override_asset(override_id,country_code,asset_id) VALUES ${sql.join(photos.map((photo) => sql`(${id}::uuid,${code},${photo.assetId}::uuid)`))}`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()},${user.id},'visit.save','visit',${id})`.execute(
      trx,
    );
  });
  return id;
}
export async function deleteVisit(db: Kysely<unknown>, user: GalleryUser, input: Record<string, unknown>) {
  const id = uuid(input.id);
  await db.transaction().execute(async (trx) => {
    const result =
      await sql`DELETE FROM gallery.visit_override WHERE id=${id}::uuid AND version=${Number(input.version)}`.execute(
        trx,
      );
    ensure(Number(result.numAffectedRows) === 1, '记录已变化，请重新载入。', 409);
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()},${user.id},'visit.reset','visit',${id})`.execute(
      trx,
    );
  });
}
