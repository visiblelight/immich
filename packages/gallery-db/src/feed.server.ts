import { sql, type Kysely } from 'kysely';
import { publicPhotoPlaces } from './places.server.ts';
import { photoFilters, equipmentKey, equipmentName, matchesPhoto, type PhotoFilters } from '@gallery/core';
import { literalMarkdown, type DisplayPhoto, type PhotoGroup, ensure, validateTagIds } from '@gallery/core';

export async function publicPhotoFeed(
  db: Kysely<unknown>,
  options: {
    sort?: string;
    month?: string;
    page?: number;
    tags?: string[];
    filters?: Partial<PhotoFilters>;
  } = {},
) {
  const filters = photoFilters(options.filters);
  const sort = options.sort === 'added' ? 'added' : 'taken';
  const tagIds = validateTagIds(options.tags ?? []);
  const month = options.month ?? '';
  const page = options.page ?? 1;
  ensure(!month || month === 'unknown' || /^\d{4}-(0[1-9]|1[0-2])$/.test(month), '月份无效。');
  ensure(Number.isSafeInteger(page) && page >= 1 && page <= 100000, '页码无效。');
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      // Deduplicate only AFTER source qualification and published ancestry checks.
      // Each representative carries one complete publication's text and privacy policy.
      const geo = await publicPhotoPlaces(trx);
      if (filters.place) filters.place = geo.resolver.get(filters.place)?.id ?? filters.place;
      const base = sql`WITH visible AS (
      SELECT p.*,a.title AS album_title,a.description_document,
        row_number() OVER (PARTITION BY p.asset_id ORDER BY (p.location_mode='hidden') DESC,(p.location_mode='approximate') DESC,a.first_published_at,a.album_id,p.photo_id) AS choice,
        bool_and(p.public_exif IS NOT NULL) OVER (PARTITION BY p.asset_id) AS equipment_visible
      FROM gallery.published_photo p JOIN gallery.published_album a ON a.album_id=p.album_id

    ), photos AS (
      SELECT *,${sort === 'added' ? sql`first_added_at` : sql`taken_at`} AS sort_date,
      coalesce(to_char(${sort === 'added' ? sql`first_added_at` : sql`local_taken_at`} AT TIME ZONE 'UTC','YYYY-MM'),'unknown') AS month
      FROM visible WHERE choice=1
    )`;
      const evidence = (
        await sql<{
          asset_id: string;
          public_exif: DisplayPhoto['exif'];
          equipment_visible: boolean;
          tags: NonNullable<DisplayPhoto['tags']>;
          month: string;
          sort_date: Date | null;
        }>`${base} SELECT asset_id,public_exif,equipment_visible,tags,month,sort_date FROM photos ORDER BY sort_date DESC NULLS LAST,asset_id`.execute(
          trx,
        )
      ).rows.map((p) => {
        const exif = p.equipment_visible ? p.public_exif : null;
        const make = equipmentName(exif?.make),
          model = equipmentName(exif?.model),
          lens = equipmentName(exif?.lensModel);
        const camera = model
          ? make && !model.toLowerCase().startsWith(make.toLowerCase())
            ? `${make} ${model}`
            : model
          : '';
        const raw = exif?.focalLength;
        return {
          ...p,
          places: (geo.byAsset.get(p.asset_id) ?? []).map((p) => p.id),
          camera: equipmentKey(camera),
          cameraName: camera,
          lens: equipmentKey(lens),
          lensName: lens,
          focal:
            raw !== null && raw !== undefined && Number.isFinite(Number(raw)) && Number(raw) > 0
              ? Number(raw)
              : null,
          tags: p.tags.map((t) => t.id),
        };
      });
      const months = [
        ...new Set(
          evidence.filter((p) => matchesPhoto(p, filters, tagIds, month, 'month')).map((p) => p.month),
        ),
      ]
        .sort((a, b) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a)))
        .map((m) => ({
          month: m,
          count: evidence.filter((p) => p.month === m && matchesPhoto(p, filters, tagIds, month, 'month'))
            .length,
        }));
      const selected = evidence.filter((p) => matchesPhoto(p, filters, tagIds, month));
      const total = selected.length;
      const ids = selected.slice((page - 1) * 48, page * 48).map((p) => p.asset_id);
      const facet = (key: 'camera' | 'lens') => {
        const options = new Map<string, { id: string; name: string; count: number }>();
        for (const p of evidence.filter((p) => matchesPhoto(p, filters, tagIds, month, key))) {
          const id = p[key];
          if (!id) continue;
          const old = options.get(id);
          options.set(id, {
            id,
            name: p[key === 'camera' ? 'cameraName' : 'lensName'],
            count: (old?.count ?? 0) + 1,
          });
        }
        return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
      };
      const placeCounts = new Map<string, number>();
      for (const p of evidence.filter((p) => matchesPhoto(p, filters, tagIds, month, 'place')))
        for (const id of p.places) placeCounts.set(id, (placeCounts.get(id) ?? 0) + 1);
      const availablePlaces = [...placeCounts]
        .map(([id, count]) => ({
          id,
          count,
          name: geo.resolver.get(id)!.name,
          path: geo.resolver
            .path(id)
            .map((p) => p.name)
            .join(' / '),
          kind: geo.resolver.get(id)!.kind,
          parent: geo.resolver.path(id).at(-2)?.id ?? '',
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      const focals = evidence
        .filter((p) => matchesPhoto(p, filters, tagIds, month, 'focal'))
        .flatMap((p) => (p.focal === null ? [] : [p.focal]));
      type Row = {
        asset_id: string;
        equipment_visible: boolean;
        tags: DisplayPhoto['tags'];
        album_id: string;
        album_slug: string;
        album_title: string;
        photo_id: string;
        title: string;
        description: string;
        description_format: string;
        alt_text: string;
        public_exif: DisplayPhoto['exif'];
        latitude: number | null;
        longitude: number | null;
        taken_at: Date | null;
        local_taken_at: Date | null;
        time_zone: string | null;
        first_added_at: Date | null;
        estimated: boolean;
        group_id: string | null;
        description_document: { groups?: PhotoGroup[] };
        occurrences: NonNullable<DisplayPhoto['occurrences']>;
      };
      const rows = (
        await sql<Row>`${base} SELECT p.*,
      (SELECT jsonb_agg(jsonb_build_object('albumSlug',v.album_slug,'albumTitle',v.album_title,'photoId',v.photo_id) ORDER BY v.choice)
       FROM visible v WHERE v.asset_id=p.asset_id) AS occurrences
      FROM photos p WHERE asset_id=ANY(${ids}::uuid[])
      ORDER BY sort_date DESC NULLS LAST,asset_id`.execute(trx)
      ).rows;
      const photos: DisplayPhoto[] = rows.map((p) => ({
        id: p.photo_id,
        tags: p.tags,
        title: p.title,
        description: p.description_format === 'plain' ? literalMarkdown(p.description) : p.description,
        alt: p.alt_text,
        exif: p.equipment_visible ? p.public_exif : null,
        places: geo.byAsset.get(p.asset_id) ?? [],
        latitude: p.latitude,
        longitude: p.longitude,
        takenAt: p.taken_at?.toISOString() ?? null,
        localTakenAt: p.local_taken_at?.toISOString() ?? null,
        timeZone: p.time_zone,
        addedAt: p.first_added_at?.toISOString() ?? null,
        addedEstimated: p.estimated,
        albumId: p.album_id,
        albumSlug: p.album_slug,
        albumTitle: p.album_title,
        occurrences: p.occurrences,
        group: (() => {
          const g = p.description_document.groups?.find((g) => g.id === p.group_id);
          return g ? { ...g, cover: p.photo_id } : undefined;
        })(),
        thumbnail: `/media/${p.album_id}/${p.photo_id}?variant=thumbnail`,
        src: `/media/${p.album_id}/${p.photo_id}?variant=preview`,
      }));
      const availableTags = (
        await sql<{
          id: string;
          name: string;
          count: number;
        }>`SELECT id,name,photo_count::int AS count FROM gallery.published_tag ORDER BY name,id`.execute(trx)
      ).rows;
      return {
        filters,
        availablePlaces,
        availableCameras: facet('camera'),
        availableLenses: facet('lens'),
        focalBounds: focals.length
          ? {
              min: Math.floor(focals.reduce((a, b) => Math.min(a, b), Infinity)),
              max: Math.ceil(focals.reduce((a, b) => Math.max(a, b), 0)),
            }
          : null,
        unavailableTags: tagIds.filter((id) => !availableTags.some((t) => t.id === id)),
        tags: tagIds,
        availableTags,
        photos,
        months: months.map((m) => ({ ...m, count: Number(m.count) })),
        sort,
        month,
        page,
        total,
      };
    });
}
