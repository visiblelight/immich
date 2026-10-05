import { publicPhotoPlaces } from './places.server.ts';
import { photoProfiles } from './shared-photos.server.ts';
import { adminTags } from './tags.server.ts';
import { sql, type Kysely } from 'kysely';
import {
  ensure,
  uuid,
  type DisplayAlbum,
  type DisplayPhoto,
  type TextBlock,
  type PhotoGroup,
  documentMarkdown,
  literalMarkdown,
  markdownSummary,
} from '@gallery/core';
type AlbumRow = {
  album_id: string;
  slug: string;
  title: string;
  summary: string;
  parent_album_id: string | null;
  description_document: {
    blocks: TextBlock[];
    markdown?: string;
    groups?: PhotoGroup[];
  };
  photo_album_id: string | null;
  photo_id: string | null;
  count: string;
  total_count: string;
  child_count: string;
  taken_at: Date | null;
  updated_at: Date;
};
export async function publicCatalog(db: Kysely<unknown>, slug?: string) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      const site = (
        await sql<{
          name: string;
          tagline: string;
          copyrightName: string;
          footerText: string;
          contactLinks: import('@gallery/core').ContactLink[];
        }>`SELECT name,tagline,copyright_name AS "copyrightName",footer_text AS "footerText",contact_links AS "contactLinks" FROM gallery.published_site WHERE id=1`.execute(
          trx,
        )
      ).rows[0];
      ensure(site, 'Gallery 尚未初始化。', 503);
      const rows = (
        await sql<AlbumRow>`WITH visible AS MATERIALIZED (SELECT * FROM gallery.published_album),
          photos AS MATERIALIZED (SELECT album_id,asset_id,ancestor_ids,local_taken_at,taken_at FROM gallery.published_photo)
          SELECT a.album_id,a.slug,a.title,a.summary,a.parent_album_id,a.description_document,c.photo_album_id,c.photo_id,
          (SELECT count(*) FROM photos p WHERE p.album_id=a.album_id)::text AS count,
          (SELECT count(DISTINCT p.asset_id) FROM photos p WHERE a.album_id=ANY(p.ancestor_ids))::text AS total_count,
          (SELECT count(*) FROM visible child WHERE child.parent_album_id=a.album_id)::text AS child_count,
          (SELECT min(coalesce(p.local_taken_at,p.taken_at)) FROM photos p WHERE a.album_id=ANY(p.ancestor_ids)) AS taken_at,
          (SELECT max(child.published_at) FROM visible child WHERE a.album_id=ANY(child.ancestor_ids)) AS updated_at
          FROM visible a LEFT JOIN gallery.published_cover c ON c.album_id=a.album_id
          ORDER BY updated_at DESC,a.album_id`.execute(trx)
      ).rows;
      const albums: DisplayAlbum[] = rows.map((r) => ({
        id: r.album_id,
        slug: r.slug,
        title: r.title,
        summary: r.summary || markdownSummary(documentMarkdown(r.description_document)),
        parent: r.parent_album_id ?? '',
        blocks: [],
        markdown: documentMarkdown(r.description_document, r.summary),
        groups: [],
        cover: r.photo_id ? `/media/${r.photo_album_id}/${r.photo_id}?variant=thumbnail` : null,
        count: Number(r.count),
        totalCount: Number(r.total_count),
        childCount: Number(r.child_count),
        takenAt: r.taken_at?.toISOString() ?? null,
        updatedAt: r.updated_at.toISOString(),
        photos: [],
      }));
      const active = slug ? albums.find((a) => a.slug === slug) : null;
      if (slug) ensure(active, '相册不存在或尚未公开。', 404);
      if (active) {
        const geo = await publicPhotoPlaces(trx, active.id);
        const photos = (
          await sql<{
            tags: DisplayPhoto['tags'];
            photo_id: string;
            asset_id: string;
            group_id: string | null;
            description_format: string;
            taken_at: Date | null;
            local_taken_at: Date | null;
            time_zone: string | null;
            first_added_at: Date | null;
            estimated: boolean;
            title: string;
            description: string;
            alt_text: string;
            public_exif: DisplayPhoto['exif'];
            latitude: number | null;
            longitude: number | null;
          }>`SELECT asset_id,tags,photo_id,title,description,alt_text,public_exif,latitude,longitude,group_id,description_format,taken_at,local_taken_at,time_zone,first_added_at,estimated FROM gallery.published_photo WHERE album_id=${active.id}::uuid ORDER BY position,photo_id`.execute(
            trx,
          )
        ).rows;
        const occurrences = (
          await sql<{ asset_id: string; albumSlug: string; albumTitle: string; photoId: string }>`
            SELECT p.asset_id,a.slug AS "albumSlug",a.title AS "albumTitle",p.photo_id AS "photoId"
            FROM gallery.published_photo p JOIN gallery.published_album a ON a.album_id=p.album_id
            WHERE p.asset_id IN (SELECT asset_id FROM gallery.published_photo WHERE album_id=${active.id}::uuid)
            ORDER BY a.position,a.first_published_at,a.album_id,p.photo_id`.execute(trx)
        ).rows;
        const byAsset = new Map<string, NonNullable<DisplayPhoto['occurrences']>>();
        for (const { asset_id, ...occurrence } of occurrences) {
          const list = byAsset.get(asset_id) ?? [];
          list.push(occurrence);
          byAsset.set(asset_id, list);
        }
        active.groups = (
          rows.find((r) => r.album_id === active.id)?.description_document.groups ?? []
        ).flatMap((g) => {
          const members = photos.filter((p) => p.group_id === g.id);
          return members.length
            ? [{ ...g, cover: members.some((p) => p.photo_id === g.cover) ? g.cover : members[0]!.photo_id }]
            : [];
        });
        active.photos = photos.map((p) => ({
          id: p.photo_id,
          tags: p.tags,
          places: geo.byPhoto.get(`${active.id}/${p.photo_id}`) ?? [],
          occurrences: byAsset.get(p.asset_id) ?? [],
          group: active.groups?.find((g) => g.id === p.group_id),
          takenAt: p.taken_at?.toISOString() ?? null,
          localTakenAt: p.local_taken_at?.toISOString() ?? null,
          timeZone: p.time_zone,
          addedAt: p.first_added_at?.toISOString() ?? null,
          addedEstimated: p.estimated,
          albumId: active.id,
          albumSlug: active.slug,
          albumTitle: active.title,
          title: p.title,
          description: p.description_format === 'plain' ? literalMarkdown(p.description) : p.description,
          alt: p.alt_text,
          exif: p.public_exif,
          latitude: p.latitude,
          longitude: p.longitude,
          src: `/media/${active.id}/${p.photo_id}?variant=preview`,
          thumbnail: `/media/${active.id}/${p.photo_id}?variant=thumbnail`,
        }));
      }
      return { site, albums, active };
    });
}
/** Authenticated draft projection uses the same rendering DTO as public pages. */
export async function draftCatalog(db: Kysely<unknown>, albumId: string) {
  uuid(albumId);
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      const site = (
        await sql<{
          name: string;
          tagline: string;
          copyrightName: string;
          footerText: string;
          contactLinks: import('@gallery/core').ContactLink[];
        }>`SELECT name,tagline,copyright_name AS "copyrightName",footer_text AS "footerText",contact_links AS "contactLinks" FROM gallery.site WHERE id=1`.execute(
          trx,
        )
      ).rows[0];
      ensure(site, 'Gallery 尚未初始化。', 503);
      const rows = (
        await sql<{
          id: string;
          slug: string;
          title: string;
          summary: string;
          parent_album_id: string | null;
          description_document: {
            blocks: TextBlock[];
            markdown?: string;
            groups?: PhotoGroup[];
          };
          cover_asset_id: string | null;
          count: string;
          show_exif: boolean;
        }>`SELECT a.id,a.slug,d.title,d.summary,d.parent_album_id,d.description_document,d.cover_asset_id,d.show_exif,(SELECT count(*) FROM gallery.album_photo p WHERE p.album_id=a.id)::text AS count FROM gallery.album a JOIN gallery.album_draft d ON d.album_id=a.id ORDER BY d.position,a.created_at,a.id`.execute(
          trx,
        )
      ).rows;
      const albums: DisplayAlbum[] = rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        summary: r.summary || markdownSummary(documentMarkdown(r.description_document)),
        parent: r.parent_album_id ?? '',
        blocks: [],
        markdown: documentMarkdown(r.description_document, r.summary),
        groups: r.description_document.groups ?? [],
        cover: r.cover_asset_id ? `/media/source/${r.cover_asset_id}?variant=thumbnail` : null,
        count: Number(r.count),
        photos: [],
      }));
      const active = albums.find((a) => a.id === albumId);
      ensure(active, '相册不存在。', 404);
      const photos = (
        await sql<{
          id: string;
          group_id: string | null;
          description_format: string;
          taken_at: Date | null;
          local_taken_at: Date | null;
          time_zone: string | null;
          title: string;
          description: string;
          alt_text: string;
          asset: string;
          make: string | null;
          model: string | null;
          lens_model: string | null;
          f_number: number | null;
          focal_length: number | null;
          iso: number | null;
          exposure_time: string | null;
        }>`SELECT p.id,p.title,p.description,p.alt_text,p.group_id,p.description_format,s.taken_at,s.local_taken_at,s.time_zone,p.immich_asset_id AS asset,s.make,s.model,s.lens_model,s.f_number,s.focal_length,s.iso,s.exposure_time FROM gallery.album_photo p JOIN gallery.admin_source_asset s ON s.asset_id=p.immich_asset_id WHERE p.album_id=${albumId}::uuid ORDER BY p.position,p.id`.execute(
          trx,
        )
      ).rows;
      const profiles = await photoProfiles(
        trx,
        photos.map((p) => p.asset),
      );
      const tags = await adminTags(trx);
      const visiblePhotos = photos.filter((p) => !profiles.get(p.asset)?.hidden_from_gallery);
      active.groups = (active.groups ?? []).flatMap((g) => {
        const members = visiblePhotos.filter((p) => p.group_id === g.id);
        return members.length
          ? [{ ...g, cover: members.some((p) => p.id === g.cover) ? g.cover : members[0]!.id }]
          : [];
      });
      active.count = visiblePhotos.length;
      const coverAsset = rows.find((r) => r.id === albumId)?.cover_asset_id;
      if (coverAsset && profiles.get(coverAsset)?.hidden_from_gallery) active.cover = null;
      active.photos = visiblePhotos.map((original) => {
        const shared = profiles.get(original.asset);
        const p = shared ? { ...original, ...shared } : original;
        return {
          id: original.id,
          tags: tags.filter((t) => shared?.tags.includes(t.id)).map((t) => ({ id: t.id, name: t.name })),
          group: active.groups?.find((g) => g.id === p.group_id),
          takenAt: p.taken_at?.toISOString() ?? null,
          localTakenAt: p.local_taken_at?.toISOString() ?? null,
          timeZone: p.time_zone,
          title: p.title,
          description: p.description_format === 'plain' ? literalMarkdown(p.description) : p.description,
          alt: p.alt_text,
          exif: rows.find((a) => a.id === albumId)?.show_exif
            ? {
                make: p.make,
                model: p.model,
                lensModel: p.lens_model,
                fNumber: p.f_number,
                focalLength: p.focal_length,
                iso: p.iso,
                exposureTime: p.exposure_time,
              }
            : null,
          latitude: null,
          longitude: null,
          src: `/media/source/${p.asset}?variant=preview`,
          thumbnail: `/media/source/${p.asset}?variant=thumbnail`,
        };
      });
      return { site, albums, active };
    });
}
