import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, literalMarkdown, validateTagIds, type DraftPhoto, type GalleryUser } from '@gallery/core';
type Db = Kysely<unknown>;
type Profile = {
  immich_asset_id: string;
  title: string;
  description: string;
  description_format: string;
  alt_text: string;
  version: string;
  tags: string[];
};
export async function photoProfiles(db: Db, assets: string[], published = false) {
  if (!assets.length) return new Map<string, Profile>();
  const rows = (
    await sql<Profile>`SELECT p.immich_asset_id,r.title,r.description,r.description_format,r.alt_text,p.version,
    coalesce((SELECT array_agg(t.tag_id ORDER BY t.tag_id) FROM ${published ? sql`gallery.photo_release_tag` : sql`gallery.photo_tag`} t WHERE ${published ? sql`t.release_id=r.id` : sql`t.immich_asset_id=p.immich_asset_id`}),ARRAY[]::uuid[]) AS tags
    FROM gallery.photo p ${published ? sql`JOIN gallery.photo_release r ON r.id=p.current_release_id` : sql`JOIN gallery.photo r ON r.immich_asset_id=p.immich_asset_id`}
    WHERE p.immich_asset_id=ANY(${assets}::uuid[])`.execute(db)
  ).rows;
  return new Map(rows.map((r) => [r.immich_asset_id, r]));
}
export async function hydratePhotoProfiles<T extends DraftPhoto>(db: Db, photos: T[], published = false) {
  const profiles = await photoProfiles(
    db,
    photos.map((p) => p.asset),
    published,
  );
  return photos.map((p) => {
    const r = profiles.get(p.asset);
    return r
      ? {
          ...p,
          description_format: 'markdown',
          title: r.title,
          description: r.description_format === 'plain' ? literalMarkdown(r.description) : r.description,
          alt: r.alt_text,
          tags: r.tags,
          photoVersion: r.version,
        }
      : p;
  });
}
export async function savePhotoProfiles(db: Db, photos: DraftPhoto[], albumId: string) {
  const existing = await photoProfiles(
    db,
    photos.map((p) => p.asset),
  );
  const changed: string[] = [];
  for (const p of photos) {
    const old = existing.get(p.asset);
    const tags = validateTagIds(p.tags ?? []);
    const oldDescription = old?.description_format === 'plain' ? literalMarkdown(old.description) : old?.description;
    const differs =
      !old ||
      old.title !== p.title ||
      oldDescription !== p.description ||
      old.alt_text !== p.alt ||
      JSON.stringify(old.tags) !== JSON.stringify(tags);
    if (old && p.photoVersion !== undefined)
      ensure(p.photoVersion === old.version, '这张照片已在另一个相册或窗口更新，请重新载入后再编辑。', 409);
    if (old && differs) ensure(p.photoVersion === old.version, '照片已有统一资料，请重新载入后再编辑，避免覆盖。', 409);
    if (!differs) {
      p.photoVersion = old!.version;
      p.tags = tags;
      continue;
    }
    const valid = (
      await sql<{
        id: string;
        active: boolean;
      }>`SELECT id,active FROM gallery.tag WHERE id=ANY(${tags}::uuid[])`.execute(db)
    ).rows;
    ensure(
      valid.length === tags.length && valid.every((t) => t.active || old?.tags.includes(t.id)),
      '标签不存在或已停用，请重新选择。',
      409,
    );
    const row = (
      await sql<{
        version: string;
      }>`INSERT INTO gallery.photo(immich_asset_id,title,description,description_format,alt_text)
      VALUES(${p.asset}::uuid,${p.title},${p.description},'markdown',${p.alt}) ON CONFLICT(immich_asset_id) DO UPDATE SET title=excluded.title,description=excluded.description,description_format='markdown',alt_text=excluded.alt_text,version=gallery.photo.version+1,updated_at=now() RETURNING version`.execute(
        db,
      )
    ).rows[0]!;
    await sql`DELETE FROM gallery.photo_tag WHERE immich_asset_id=${p.asset}::uuid`.execute(db);
    if (tags.length)
      await sql`INSERT INTO gallery.photo_tag SELECT ${p.asset}::uuid,unnest(${tags}::uuid[])`.execute(db);
    p.photoVersion = row.version;
    p.tags = tags;
    changed.push(p.asset);
  }
  if (changed.length) {
    // Existing site row lock serializes all album/tag writes. Invalidate other editing windows.
    await sql`UPDATE gallery.album SET version=version+1,has_unpublished_changes=true WHERE id<>${albumId}::uuid AND id IN(SELECT album_id FROM gallery.album_photo WHERE immich_asset_id=ANY(${changed}::uuid[]))`.execute(
      db,
    );
    await sql`UPDATE gallery.album_draft SET version=version+1 WHERE album_id<>${albumId}::uuid AND album_id IN(SELECT album_id FROM gallery.album_photo WHERE immich_asset_id=ANY(${changed}::uuid[]))`.execute(
      db,
    );
  }
}
export async function publishPhotoProfiles(db: Db, user: GalleryUser, assets: string[]) {
  for (const asset of [...new Set(assets)]) {
    const release = randomUUID();
    const result =
      await sql`INSERT INTO gallery.photo_release(id,immich_asset_id,title,description,description_format,alt_text,source_version,published_by,public_exif)
      SELECT ${release}::uuid,p.immich_asset_id,p.title,p.description,p.description_format,p.alt_text,p.version,${user.id}::uuid,
      jsonb_build_object('make',s.make,'model',s.model,'lensModel',s.lens_model,'fNumber',s.f_number,'focalLength',s.focal_length,'iso',s.iso,'exposureTime',s.exposure_time)
      FROM gallery.photo p JOIN gallery.admin_source_asset s ON s.asset_id=p.immich_asset_id WHERE p.immich_asset_id=${asset}::uuid`.execute(
        db,
      );
    ensure(result.numAffectedRows === 1n, '照片来源或统一资料不可用。', 409);
    await sql`INSERT INTO gallery.photo_release_tag SELECT ${release}::uuid,tag_id FROM gallery.photo_tag WHERE immich_asset_id=${asset}::uuid`.execute(
      db,
    );
    await sql`UPDATE gallery.photo SET current_release_id=${release}::uuid WHERE immich_asset_id=${asset}::uuid`.execute(
      db,
    );
  }
}
