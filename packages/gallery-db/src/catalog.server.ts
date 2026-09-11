import { sql, type Kysely } from 'kysely';
import { ensure, uuid, type DisplayAlbum, type DisplayPhoto, type TextBlock } from '@gallery/core';
type AlbumRow = {
  album_id: string;
  slug: string;
  title: string;
  summary: string;
  parent_album_id: string | null;
  description_document: { blocks: TextBlock[] };
  photo_album_id: string | null;
  photo_id: string | null;
  count: string;
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
          contactLinks: import('@gallery/core').ContactLink[];
        }>`SELECT name,tagline,contact_links AS "contactLinks" FROM gallery.published_site WHERE id=1`.execute(trx)
      ).rows[0];
      ensure(site, 'Gallery 尚未初始化。', 503);
      const rows = (
        await sql<AlbumRow>`SELECT a.album_id,a.slug,a.title,a.summary,a.parent_album_id,a.description_document,c.photo_album_id,c.photo_id,(SELECT count(*) FROM gallery.published_photo p WHERE p.album_id=a.album_id)::text AS count FROM gallery.published_album a LEFT JOIN gallery.published_cover c ON c.album_id=a.album_id ORDER BY a.position,a.first_published_at,a.album_id`.execute(
          trx,
        )
      ).rows;
      const albums: DisplayAlbum[] = rows.map((r) => ({
        id: r.album_id,
        slug: r.slug,
        title: r.title,
        summary: r.summary,
        parent: r.parent_album_id ?? '',
        blocks: r.description_document.blocks,
        cover: r.photo_id ? `/media/${r.photo_album_id}/${r.photo_id}?variant=thumbnail` : null,
        count: Number(r.count),
        photos: [],
      }));
      const active = slug ? albums.find((a) => a.slug === slug) : null;
      if (slug) ensure(active, '相册不存在或尚未公开。', 404);
      if (active) {
        const photos = (
          await sql<{
            photo_id: string;
            title: string;
            description: string;
            alt_text: string;
            public_exif: DisplayPhoto['exif'];
            latitude: number | null;
            longitude: number | null;
          }>`SELECT photo_id,title,description,alt_text,public_exif,latitude,longitude FROM gallery.published_photo WHERE album_id=${active.id}::uuid ORDER BY position,photo_id`.execute(
            trx,
          )
        ).rows;
        active.photos = photos.map((p) => ({
          id: p.photo_id,
          title: p.title,
          description: p.description,
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
          contactLinks: import('@gallery/core').ContactLink[];
        }>`SELECT name,tagline,contact_links AS "contactLinks" FROM gallery.site WHERE id=1`.execute(trx)
      ).rows[0];
      ensure(site, 'Gallery 尚未初始化。', 503);
      const rows = (
        await sql<{
          id: string;
          slug: string;
          title: string;
          summary: string;
          parent_album_id: string | null;
          description_document: { blocks: TextBlock[] };
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
        summary: r.summary,
        parent: r.parent_album_id ?? '',
        blocks: r.description_document.blocks,
        cover: r.cover_asset_id ? `/media/source/${r.cover_asset_id}?variant=thumbnail` : null,
        count: Number(r.count),
        photos: [],
      }));
      const active = albums.find((a) => a.id === albumId);
      ensure(active, '相册不存在。', 404);
      const photos = (
        await sql<{
          id: string;
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
        }>`SELECT p.id,p.title,p.description,p.alt_text,p.immich_asset_id AS asset,s.make,s.model,s.lens_model,s.f_number,s.focal_length,s.iso,s.exposure_time FROM gallery.album_photo p JOIN gallery.admin_source_asset s ON s.asset_id=p.immich_asset_id WHERE p.album_id=${albumId}::uuid ORDER BY p.position,p.id`.execute(
          trx,
        )
      ).rows;
      active.photos = photos.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
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
      }));
      return { site, albums, active };
    });
}
