import { sql, type Kysely } from 'kysely';
import { literalMarkdown, type DisplayPhoto, type PhotoGroup, ensure } from '@gallery/core';

export async function publicPhotoFeed(
  db: Kysely<unknown>,
  options: { sort?: string; month?: string; page?: number } = {},
) {
  const sort = options.sort === 'added' ? 'added' : 'taken';
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
      const base = sql`WITH visible AS (
      SELECT p.*,a.title AS album_title,a.description_document,
        row_number() OVER (PARTITION BY p.asset_id ORDER BY a.first_published_at,a.album_id,p.photo_id) AS choice
      FROM gallery.published_photo p JOIN gallery.published_album a ON a.album_id=p.album_id
    ), photos AS (
      SELECT *,${sort === 'added' ? sql`first_added_at` : sql`taken_at`} AS sort_date,
      coalesce(to_char(${sort === 'added' ? sql`first_added_at` : sql`taken_at`} AT TIME ZONE 'UTC','YYYY-MM'),'unknown') AS month
      FROM visible WHERE choice=1
    )`;
      const months = (
        await sql<{
          month: string;
          count: string;
        }>`${base} SELECT month,count(*)::text AS count FROM photos GROUP BY month ORDER BY CASE WHEN month='unknown' THEN 1 ELSE 0 END,month DESC`.execute(
          trx,
        )
      ).rows;
      const total = months.filter((m) => !month || m.month === month).reduce((n, m) => n + Number(m.count), 0);
      type Row = {
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
      FROM photos p ${month ? sql`WHERE p.month=${month}` : sql``}
      ORDER BY sort_date DESC NULLS LAST,asset_id LIMIT 48 OFFSET ${(page - 1) * 48}`.execute(trx)
      ).rows;
      const photos: DisplayPhoto[] = rows.map((p) => ({
        id: p.photo_id,
        title: p.title,
        description: p.description_format === 'plain' ? literalMarkdown(p.description) : p.description,
        alt: p.alt_text,
        exif: p.public_exif,
        latitude: p.latitude,
        longitude: p.longitude,
        takenAt: p.taken_at?.toISOString() ?? null,
        addedAt: p.first_added_at?.toISOString() ?? null,
        addedEstimated: p.estimated,
        albumId: p.album_id,
        albumSlug: p.album_slug,
        albumTitle: p.album_title,
        occurrences: p.occurrences,
        group: p.description_document.groups?.find((g) => g.id === p.group_id),
        thumbnail: `/media/${p.album_id}/${p.photo_id}?variant=thumbnail`,
        src: `/media/${p.album_id}/${p.photo_id}?variant=preview`,
      }));
      return { photos, months: months.map((m) => ({ ...m, count: Number(m.count) })), sort, month, page, total };
    });
}
