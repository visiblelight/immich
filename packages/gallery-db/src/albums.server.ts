import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import sharp from 'sharp';
import { readSourceDerivative, type MediaRoot } from './media.server.ts';
import {
  mergeAlbumItem,
  sameAlbumContent,
  documentMarkdown,
  literalMarkdown,
  assertTree,
  emptyAlbum,
  ensure,
  uuid,
  validateContent,
  validateContactLinks,
  type AlbumContent,
  type DraftPhoto,
  type GallerySite,
  type GalleryUser,
  type ManagedAlbum,
  type SourcePhoto,
} from '@gallery/core';

type Db = Kysely<unknown>;
interface DraftRow {
  id: string;
  slug: string;
  status: ManagedAlbum['status'];
  version: string;
  draft_version: string;
  source_draft_version: string | null;
  release_parent_album_id: string | null;
  parent_album_id: string | null;
  position: string;
  title: string;
  summary: string;
  description_document: {
    blocks: AlbumContent['blocks'];
    markdown?: string;
    groups?: import('@gallery/core').PhotoGroup[];
  };
  cover_asset_id: string | null;
  location_mode: AlbumContent['location'];
  show_exif: boolean;
  visible: boolean;
  has_unpublished_changes: boolean;
}
async function siteRow(db: Db, lock = false): Promise<GallerySite> {
  const r = (
    await sql<{
      name: string;
      tagline: string;
      version: string;
      tree_version: string;
      contact_links: GallerySite['contactLinks'];
    }>`SELECT name,tagline,version,tree_version,contact_links FROM gallery.site WHERE id=1 ${lock ? sql`FOR UPDATE` : sql``}`.execute(
      db,
    )
  ).rows[0];
  ensure(r, 'Gallery 尚未初始化。', 503);
  return {
    name: r.name,
    tagline: r.tagline,
    version: r.version,
    treeVersion: r.tree_version,
    contactLinks: r.contact_links,
  };
}
export async function adminState(db: Db) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      const site = await siteRow(trx);
      const rows = (
        await sql<DraftRow>`SELECT a.id,a.slug,a.status,a.version,a.has_unpublished_changes,d.version AS draft_version,r.source_draft_version,r.parent_album_id AS release_parent_album_id,d.parent_album_id,d.position,d.title,d.summary,d.description_document,d.cover_asset_id,d.location_mode,d.show_exif,EXISTS(SELECT 1 FROM gallery.published_album p WHERE p.album_id=a.id) AS visible FROM gallery.album a JOIN gallery.album_draft d ON d.album_id=a.id LEFT JOIN gallery.album_release r ON r.id=a.current_release_id ORDER BY d.position,a.created_at,a.id`.execute(
          trx,
        )
      ).rows;
      const photos = (
        await sql<
          DraftPhoto & { album_id: string; description_format: string }
        >`SELECT id,album_id,immich_asset_id AS asset,title,description,alt_text AS alt,location_mode AS location,group_id AS "group",description_format FROM gallery.album_photo ORDER BY album_id,position`.execute(
          trx,
        )
      ).rows;
      const albums: ManagedAlbum[] = rows.map((r) => ({
        id: r.id,
        version: r.version,
        draftVersion: r.draft_version,
        releaseVersion: r.source_draft_version,
        publishedParent: r.release_parent_album_id,
        status: r.status,
        visible: r.visible,
        hasUnpublishedChanges: r.has_unpublished_changes,
        draft: {
          title: r.title,
          slug: r.slug,
          parent: r.parent_album_id ?? '',
          position: Number(r.position),
          summary: r.summary,
          blocks: [],
          markdown: documentMarkdown(r.description_document, r.summary),
          groups: r.description_document.groups ?? [],
          cover: r.cover_asset_id ?? '',
          location: r.location_mode,
          showExif: r.show_exif,
          photos: photos
            .filter((p) => p.album_id === r.id)
            .map(({ album_id, description_format, ...p }) => ({
              ...p,
              group: p.group ?? '',
              description: description_format === 'plain' ? literalMarkdown(p.description) : p.description,
            })),
        },
      }));
      return { site, albums };
    });
}
async function actor(db: Db, user: GalleryUser) {
  ensure(
    (
      await sql`SELECT id FROM gallery."user" WHERE id=${user.id}::uuid AND status='active' AND role='admin' FOR SHARE`.execute(
        db,
      )
    ).rows.length,
    '登录已失效。',
    401,
  );
}
async function audit(db: Db, user: GalleryUser, action: string, id: string) {
  await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,${action},'album',${id})`.execute(
    db,
  );
}
async function lockAlbum(db: Db, id: string, expected: Record<string, unknown>) {
  const site = await siteRow(db, true);
  ensure(expected.treeVersion === site.treeVersion, '相册结构已被其他操作更新，请重新载入后再试。', 409);
  const a = (
    await sql<{
      version: string;
      status: string;
      slug: string;
      current_release_id: string | null;
    }>`SELECT version,status,slug,current_release_id FROM gallery.album WHERE id=${uuid(id)}::uuid FOR UPDATE`.execute(
      db,
    )
  ).rows[0];
  ensure(a, '相册不存在。', 404);
  const d = (
    await sql<{
      version: string;
    }>`SELECT version FROM gallery.album_draft WHERE album_id=${id}::uuid FOR UPDATE`.execute(db)
  ).rows[0];
  ensure(
    a.version === expected.version && d?.version === expected.draftVersion,
    '草稿已被另一个窗口修改。请重新载入，避免覆盖。',
    409,
  );
  return a;
}
async function trees(db: Db) {
  const rows = (
    await sql<{
      id: string;
      draft_parent: string | null;
      release_parent: string | null;
      current_release_id: string | null;
      status: string;
    }>`SELECT a.id,d.parent_album_id AS draft_parent,r.parent_album_id AS release_parent,a.current_release_id,a.status FROM gallery.album a JOIN gallery.album_draft d ON d.album_id=a.id LEFT JOIN gallery.album_release r ON r.id=a.current_release_id`.execute(
      db,
    )
  ).rows;
  return {
    draft: new Map(rows.map((r) => [r.id, r.draft_parent ?? ''])),
    release: new Map(rows.filter((r) => r.current_release_id).map((r) => [r.id, r.release_parent ?? ''])),
    rows,
  };
}
async function sources(db: Db, ids: string[]) {
  if (!ids.length) return [];
  const rows = (
    await sql<{
      asset_id: string;
      make: string | null;
      model: string | null;
      lens_model: string | null;
      f_number: number | null;
      focal_length: number | null;
      iso: number | null;
      exposure_time: string | null;
    }>`SELECT asset_id,make,model,lens_model,f_number,focal_length,iso,exposure_time FROM gallery.admin_source_asset WHERE asset_id=ANY(${ids}::uuid[])`.execute(
      db,
    )
  ).rows;
  ensure(rows.length === ids.length, '部分照片来源已失效或不在授权范围内，请移除后重试。', 409);
  return rows;
}
async function coverValid(db: Db, id: string, c: AlbumContent, parents: Map<string, string>) {
  if (!c.cover || c.photos.some((p) => p.asset === c.cover)) return;
  const rows = (
    await sql<{
      album_id: string;
    }>`SELECT album_id FROM gallery.published_photo WHERE asset_id=${c.cover}::uuid AND album_id<>${id}::uuid`.execute(
      db,
    )
  ).rows;
  ensure(
    rows.some((r) => {
      let parent = r.album_id;
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) {
        if (parent === id) return true;
        seen.add(parent);
        parent = parents.get(parent) ?? '';
      }
      return false;
    }),
    '封面需要来自本册照片或当前公开的后代相册。',
    409,
  );
}
export async function createAlbum(db: Db, user: GalleryUser, input: Record<string, unknown>) {
  const id = randomUUID();
  const c = validateContent(
    emptyAlbum(String(input.title ?? ''), `album-${id.slice(0, 8)}`, String(input.parent ?? '')),
  );
  ensure(c.title.trim(), '请填写相册标题。');
  await db.transaction().execute(async (trx) => {
    await actor(trx, user);
    const site = await siteRow(trx, true);
    ensure(input.treeVersion === site.treeVersion, '相册结构已更新，请刷新。', 409);
    const tree = await trees(trx);
    tree.draft.set(id, c.parent);
    assertTree(tree.draft);
    await sql`INSERT INTO gallery.album(id,slug,created_by) VALUES(${id}::uuid,${c.slug},${user.id}::uuid)`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.album_draft(album_id,title,parent_album_id,location_mode,updated_by) VALUES(${id}::uuid,${c.title},${c.parent || null}::uuid,${c.location},${user.id}::uuid)`.execute(
      trx,
    );
    await sql`UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1`.execute(trx);
    await audit(trx, user, 'album.create', id);
  });
  return id;
}
export async function saveAlbum(db: Db, user: GalleryUser, id: string, input: Record<string, unknown>) {
  const c = validateContent(input.content);
  await db.transaction().execute((trx) => saveAlbumInTransaction(trx, user, id, input, c));
}
async function saveAlbumInTransaction(
  trx: Db,
  user: GalleryUser,
  id: string,
  input: Record<string, unknown>,
  c: AlbumContent,
) {
  await actor(trx, user);
  const a = await lockAlbum(trx, id, input);
  ensure(!a.current_release_id || a.slug === c.slug, '首次发布后不能修改访问地址。', 409);
  const tree = await trees(trx);
  const previousParent = tree.draft.get(id);
  tree.draft.set(id, c.parent);
  assertTree(tree.draft);
  await sources(
    trx,
    c.photos.map((p) => p.asset),
  );
  await coverValid(trx, id, c, tree.draft);
  const duplicate = (await sql`SELECT id FROM gallery.album WHERE slug=${c.slug} AND id<>${id}::uuid`.execute(trx)).rows
    .length;
  ensure(!duplicate, '访问地址已被其他相册使用。', 409);
  await sql`UPDATE gallery.album SET slug=${c.slug},has_unpublished_changes=true,version=version+1,updated_at=now() WHERE id=${id}::uuid`.execute(
    trx,
  );
  await sql`UPDATE gallery.album_draft SET title=${c.title},summary=${c.summary},description_document=${JSON.stringify({ schemaVersion: 1, blocks: [], markdown: c.markdown, groups: c.groups })}::jsonb,parent_album_id=${c.parent || null}::uuid,position=${c.position},cover_asset_id=${c.cover || null}::uuid,location_mode=${c.location},show_exif=${c.showExif},version=version+1,updated_by=${user.id}::uuid,updated_at=now() WHERE album_id=${id}::uuid`.execute(
    trx,
  );
  const previous = (
    await sql<{
      id: string;
      asset: string;
      created_at: Date;
    }>`SELECT id,immich_asset_id AS asset,created_at FROM gallery.album_photo WHERE album_id=${id}::uuid`.execute(trx)
  ).rows;
  for (const p of c.photos) {
    const old = previous.find((x) => x.id === p.id);
    ensure(!old || old.asset === p.asset, '照片身份不能更换来源。', 409);
  }
  await sql`INSERT INTO gallery.asset_entry(immich_asset_id) SELECT x.asset FROM jsonb_to_recordset(${JSON.stringify(c.photos)}::jsonb) AS x(asset uuid) ON CONFLICT DO NOTHING`.execute(
    trx,
  );
  await sql`DELETE FROM gallery.album_photo WHERE album_id=${id}::uuid`.execute(trx);
  if (c.photos.length)
    await sql`INSERT INTO gallery.album_photo(id,album_id,immich_asset_id,position,title,description,alt_text,location_mode,group_id,description_format,created_at)
      SELECT x.id,${id}::uuid,x.asset,x.position,x.title,x.description,x.alt,x.location,x.group_id,'markdown',coalesce(x.created_at,now())
      FROM jsonb_to_recordset(${JSON.stringify(c.photos.map((p, position) => ({ ...p, position, group_id: p.group || null, created_at: previous.find((x) => x.id === p.id)?.created_at ?? null })))}::jsonb)
      AS x(id uuid,asset uuid,position integer,title text,description text,alt text,location text,group_id uuid,created_at timestamptz)`.execute(
      trx,
    );
  if (previousParent !== c.parent)
    await sql`UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1`.execute(trx);
  await audit(trx, user, 'album.save', id);
}
async function storedContent(db: Db, id: string, release?: string): Promise<AlbumContent> {
  const row = (
    await sql<DraftRow>`SELECT a.slug,d.* FROM gallery.album a JOIN ${release ? sql`gallery.album_release` : sql`gallery.album_draft`} d ON d.album_id=a.id WHERE a.id=${id}::uuid ${release ? sql`AND d.id=${release}::uuid` : sql``}`.execute(
      db,
    )
  ).rows[0]!;
  const photos = (
    await sql<
      DraftPhoto & { description_format: string }
    >`SELECT ${release ? sql`photo_id` : sql`id`} AS id,immich_asset_id AS asset,title,description,alt_text AS alt,location_mode AS location,group_id AS "group",description_format FROM ${release ? sql`gallery.album_release_photo` : sql`gallery.album_photo`} WHERE ${release ? sql`release_id=${release}::uuid` : sql`album_id=${id}::uuid`} ORDER BY position`.execute(
      db,
    )
  ).rows;
  return validateContent({
    title: row.title,
    slug: row.slug,
    parent: row.parent_album_id ?? '',
    position: Number(row.position),
    summary: row.summary,
    markdown: documentMarkdown(row.description_document, row.summary),
    blocks: [],
    groups: row.description_document.groups ?? [],
    cover: row.cover_asset_id ?? '',
    location: row.location_mode,
    showExif: row.show_exif,
    photos: photos.map(({ description_format, ...p }) => ({
      ...p,
      group: p.group ?? '',
      description: description_format === 'plain' ? literalMarkdown(p.description) : p.description,
    })),
  });
}

/** Save and optionally publish one dependency-closed item, in one transaction. */
export async function saveAlbumItem(
  db: Db,
  user: GalleryUser,
  id: string,
  input: Record<string, unknown>,
  root: MediaRoot,
) {
  const incoming = validateContent(input.content),
    target = uuid(input.target);
  ensure(typeof input.publish === 'boolean', '发布操作无效。');
  await db.transaction().execute(async (trx) => {
    await actor(trx, user);
    const album = await lockAlbum(trx, id, input);
    const draft = await storedContent(trx, id);
    const published = album.current_release_id ? await storedContent(trx, id, album.current_release_id) : null;
    if (input.publish)
      ensure(
        published &&
          (await sql`SELECT album_id FROM gallery.published_album WHERE album_id=${id}::uuid`.execute(trx)).rows.length,
        '请先发布相册并确认所有上级已公开。当前可保存草稿。',
        409,
      );
    const saved = mergeAlbumItem(draft, incoming, target, ...(published ? [published] : []));
    await saveAlbumInTransaction(trx, user, id, input, saved.content);
    if (!input.publish || !published) {
      if (published)
        await sql`UPDATE gallery.album SET has_unpublished_changes=${!sameAlbumContent(saved.content, published)} WHERE id=${id}::uuid`.execute(
          trx,
        );
      return;
    }
    const next = mergeAlbumItem(published, incoming, target, draft);
    const members = next.content.photos.filter((p) => next.ids.has(p.id));
    const qualified = await sources(
      trx,
      members.map((p) => p.asset),
    );
    for (const member of members)
      for (const variant of ['preview', 'thumbnail'] as const) {
        try {
          const bytes = await readSourceDerivative(trx, member.asset, variant, root);
          const info = await sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' }).metadata();
          ensure(info.width && info.height, '图片不可用。');
        } catch {
          ensure(false, '照片预览不可用，请检查 Immich；本次修改尚未保存或发布。', 409);
        }
      }
    const release = randomUUID();
    // Copy album-level fields from the PUBLIC version, including privacy policy and ancestry.
    await sql`INSERT INTO gallery.album_release(id,album_id,release_number,source_draft_version,published_by,parent_album_id,position,title,summary,description_document,cover_asset_id,cover_focal_point,location_mode,show_exif,seo_title,seo_description)
      SELECT ${release}::uuid,r.album_id,(SELECT max(release_number)+1 FROM gallery.album_release WHERE album_id=${id}::uuid),(SELECT version FROM gallery.album_draft WHERE album_id=${id}::uuid),${user.id}::uuid,r.parent_album_id,r.position,r.title,r.summary,
      jsonb_set(r.description_document,'{groups}',${JSON.stringify(next.content.groups)}::jsonb),${next.content.cover || null}::uuid,r.cover_focal_point,r.location_mode,r.show_exif,r.seo_title,r.seo_description
      FROM gallery.album_release r WHERE r.id=${album.current_release_id}::uuid`.execute(trx);
    const values = next.content.photos.map((p, position) => {
      const s = qualified.find((s) => s.asset_id === p.asset);
      return {
        ...p,
        position,
        affected: next.ids.has(p.id),
        group_id: p.group || null,
        exif:
          s && published.showExif
            ? {
                make: s.make,
                model: s.model,
                lensModel: s.lens_model,
                fNumber: s.f_number,
                focalLength: s.focal_length,
                iso: s.iso,
                exposureTime: s.exposure_time,
              }
            : null,
      };
    });
    await sql`INSERT INTO gallery.album_release_photo(release_id,photo_id,immich_asset_id,position,title,description,alt_text,location_mode,public_exif,group_id,description_format)
      SELECT ${release}::uuid,x.id,x.asset,x.position,x.title,x.description,x.alt,x.location,CASE WHEN x.affected THEN x.exif ELSE old.public_exif END,x.group_id,'markdown'
      FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS x(id uuid,asset uuid,position integer,title text,description text,alt text,location text,exif jsonb,group_id uuid,affected boolean)
      LEFT JOIN gallery.album_release_photo old ON old.release_id=${album.current_release_id}::uuid AND old.photo_id=x.id`.execute(
      trx,
    );
    await sql`UPDATE gallery.album SET current_release_id=${release}::uuid,has_unpublished_changes=${!sameAlbumContent(saved.content, next.content)},version=version+1,last_published_at=now(),updated_at=now() WHERE id=${id}::uuid`.execute(
      trx,
    );
    await sql`UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1`.execute(trx);
    await audit(trx, user, 'album.publish-item', id);
  });
}

export async function publishAlbum(
  db: Db,
  user: GalleryUser,
  id: string,
  input: Record<string, unknown>,
  root: MediaRoot,
) {
  await db.transaction().execute(async (trx) => {
    await actor(trx, user);
    await lockAlbum(trx, id, input);
    const draft = (
      await sql<{
        title: string;
        parent_album_id: string | null;
        cover_asset_id: string | null;
        show_exif: boolean;
      }>`SELECT title,parent_album_id,cover_asset_id,show_exif FROM gallery.album_draft WHERE album_id=${id}::uuid`.execute(
        trx,
      )
    ).rows[0]!;
    ensure(draft.title.trim(), '请填写相册标题。');
    const tree = await trees(trx);
    assertTree(tree.draft);
    tree.release.set(id, draft.parent_album_id ?? '');
    assertTree(tree.release);
    if (draft.parent_album_id)
      ensure(
        (
          await sql`SELECT album_id FROM gallery.published_album WHERE album_id=${draft.parent_album_id}::uuid`.execute(
            trx,
          )
        ).rows.length,
        '请先公开父相册。',
        409,
      );
    const members = (
      await sql<{
        id: string;
        asset: string;
      }>`SELECT id,immich_asset_id AS asset FROM gallery.album_photo WHERE album_id=${id}::uuid ORDER BY position`.execute(
        trx,
      )
    ).rows;
    const qualified = await sources(
      trx,
      members.map((p) => p.asset),
    );
    for (const [index, member] of members.entries()) {
      try {
        for (const variant of ['preview', 'thumbnail'] as const) {
          const bytes = await readSourceDerivative(trx, member.asset, variant, root);
          const metadata = await sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' }).metadata();
          ensure(metadata.width && metadata.height, '图片不可用。');
        }
      } catch {
        ensure(false, `第 ${index + 1} 张照片的预览图不可用，请检查 Immich 或移除该照片。`, 409);
      }
    }
    await coverValid(trx, id, { cover: draft.cover_asset_id ?? '', photos: members } as AlbumContent, tree.release);
    const release = randomUUID();
    await sql`INSERT INTO gallery.album_release(id,album_id,release_number,source_draft_version,published_by,parent_album_id,position,title,summary,description_document,cover_asset_id,cover_focal_point,location_mode,show_exif,seo_title,seo_description) SELECT ${release}::uuid,d.album_id,(SELECT coalesce(max(release_number),0)+1 FROM gallery.album_release WHERE album_id=${id}::uuid),d.version,${user.id}::uuid,d.parent_album_id,d.position,d.title,d.summary,d.description_document,d.cover_asset_id,d.cover_focal_point,d.location_mode,d.show_exif,d.seo_title,d.seo_description FROM gallery.album_draft d WHERE d.album_id=${id}::uuid`.execute(
      trx,
    );
    const exifs = qualified.map((s) => ({
      asset: s.asset_id,
      exif: draft.show_exif
        ? {
            make: s.make,
            model: s.model,
            lensModel: s.lens_model,
            fNumber: s.f_number,
            focalLength: s.focal_length,
            iso: s.iso,
            exposureTime: s.exposure_time,
          }
        : null,
    }));
    await sql`INSERT INTO gallery.album_release_photo(release_id,photo_id,immich_asset_id,position,title,description,alt_text,location_mode,public_exif,group_id,description_format) SELECT ${release}::uuid,p.id,p.immich_asset_id,p.position,p.title,p.description,p.alt_text,p.location_mode,x.exif,p.group_id,p.description_format FROM gallery.album_photo p LEFT JOIN jsonb_to_recordset(${JSON.stringify(exifs)}::jsonb) AS x(asset uuid,exif jsonb) ON x.asset=p.immich_asset_id WHERE p.album_id=${id}::uuid`.execute(
      trx,
    );
    await sql`UPDATE gallery.album SET has_unpublished_changes=false,status='published',current_release_id=${release}::uuid,version=version+1,first_published_at=coalesce(first_published_at,now()),last_published_at=now(),offline_at=NULL,updated_at=now() WHERE id=${id}::uuid`.execute(
      trx,
    );
    await sql`UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1`.execute(trx);
    await audit(trx, user, 'album.publish', id);
  });
}
export async function setAlbumAvailability(db: Db, user: GalleryUser, id: string, input: Record<string, unknown>) {
  ensure(input.action === 'offline' || input.action === 'restore', '操作无效。');
  await db.transaction().execute(async (trx) => {
    await actor(trx, user);
    const a = await lockAlbum(trx, id, input);
    ensure(a.current_release_id, '尚未发布的相册不能执行此操作。');
    if (input.action === 'restore') {
      const tree = await trees(trx);
      assertTree(tree.release);
      const parent = tree.release.get(id);
      if (parent)
        ensure(
          (await sql`SELECT album_id FROM gallery.published_album WHERE album_id=${parent}::uuid`.execute(trx)).rows
            .length,
          '请先恢复父相册。',
          409,
        );
    }
    await sql`UPDATE gallery.album SET status=${input.action === 'offline' ? 'offline' : 'published'},offline_at=${input.action === 'offline' ? sql`now()` : sql`NULL`},version=version+1,updated_at=now() WHERE id=${id}::uuid`.execute(
      trx,
    );
    await sql`UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1`.execute(trx);
    await audit(trx, user, `album.${input.action}`, id);
  });
}
export async function saveSite(db: Db, user: GalleryUser, input: Record<string, unknown>) {
  const contacts = validateContactLinks(input.contactLinks ?? []);
  ensure(
    typeof input.name === 'string' &&
      input.name.trim().length > 0 &&
      input.name.length <= 100 &&
      typeof input.tagline === 'string' &&
      input.tagline.length <= 2000,
    '站点名称或简介格式无效。',
  );
  await db.transaction().execute(async (trx) => {
    await actor(trx, user);
    const site = await siteRow(trx, true);
    ensure(input.version === site.version, '站点设置已更新，请刷新。', 409);
    await sql`UPDATE gallery.site SET name=${String(input.name).trim()},tagline=${String(input.tagline)},contact_links=${JSON.stringify(contacts)}::jsonb,version=version+1,updated_by=${user.id}::uuid,updated_at=now() WHERE id=1`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,'site.save','site','1')`.execute(
      trx,
    );
  });
}

export async function deleteDraftAlbum(db: Db, user: GalleryUser, id: string, input: Record<string, unknown>) {
  await db.transaction().execute(async (trx) => {
    await actor(trx, user);
    const album = await lockAlbum(trx, id, input);
    ensure(album.status === 'draft' && !album.current_release_id, '已发布相册请使用下线操作。', 409);
    const children = await sql`SELECT album_id FROM gallery.album_draft WHERE parent_album_id=${id}::uuid`.execute(trx);
    ensure(!children.rows.length, '请先移走或删除子相册。', 409);
    await sql`DELETE FROM gallery.album WHERE id=${id}::uuid`.execute(trx);
    await sql`UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1`.execute(trx);
    await audit(trx, user, 'album.delete-draft', id);
  });
}
export async function picker(db: Db, filters: URLSearchParams) {
  const album = filters.get('album'),
    tag = filters.get('tag'),
    after = filters.get('after'),
    search = filters.get('search') ?? '',
    since = filters.get('since');
  ensure(search.length <= 200, '文件名过长。');
  if (since) ensure(/^\d{4}-\d{2}-\d{2}$/.test(since) && Number.isFinite(Date.parse(since)), '日期格式无效。');
  const rows = (
    await sql<{
      asset_id: string;
      filename: string;
      width: number | null;
      height: number | null;
      taken_at: Date;
      city: string | null;
      make: string | null;
      model: string | null;
      lens_model: string | null;
      f_number: number | null;
      focal_length: number | null;
      iso: number | null;
      exposure_time: string | null;
    }>`SELECT s.asset_id,s.filename,s.width,s.height,s.taken_at,s.city,s.make,s.model,s.lens_model,s.f_number,s.focal_length,s.iso,s.exposure_time FROM gallery.admin_source_asset s WHERE true ${album ? sql`AND EXISTS(SELECT 1 FROM gallery.admin_source_album_asset a WHERE a.album_id=${uuid(album)}::uuid AND a.asset_id=s.asset_id)` : sql``} ${tag ? sql`AND EXISTS(SELECT 1 FROM gallery.admin_source_tag_asset t WHERE t.tag_id=${uuid(tag)}::uuid AND t.asset_id=s.asset_id)` : sql``} ${after ? sql`AND s.asset_id>${uuid(after)}::uuid` : sql``} ${search ? sql`AND strpos(lower(s.filename),lower(${search}))>0` : sql``} ${since ? sql`AND s.taken_at>=${since}::date` : sql``} ORDER BY s.asset_id LIMIT 61`.execute(
      db,
    )
  ).rows;
  const assets: SourcePhoto[] = rows.slice(0, 60).map((s) => ({
    id: s.asset_id,
    filename: s.filename,
    width: s.width,
    height: s.height,
    takenAt: s.taken_at.toISOString(),
    city: s.city,
    exif: {
      make: s.make,
      model: s.model,
      lensModel: s.lens_model,
      fNumber: s.f_number,
      focalLength: s.focal_length,
      iso: s.iso,
      exposureTime: s.exposure_time,
    },
  }));
  const albums = (
    await sql<{
      id: string;
      name: string;
    }>`SELECT album_id AS id,name FROM gallery.admin_source_album ORDER BY name,album_id`.execute(db)
  ).rows;
  const tags = (
    await sql<{
      id: string;
      name: string;
    }>`SELECT tag_id AS id,value AS name FROM gallery.admin_source_tag ORDER BY value,tag_id`.execute(db)
  ).rows;
  return { assets, albums, tags, next: rows.length > 60 ? assets.at(-1)!.id : null };
}
