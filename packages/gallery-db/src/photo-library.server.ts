import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import sharp from 'sharp';
import {
  ensure,
  uuid,
  literalMarkdown,
  emptyAlbum,
  validateContent,
  validateTagIds,
  type GalleryUser,
} from '@gallery/core';
import { photoProfiles, savePhotoProfiles, publishPhotoProfiles } from './shared-photos.server.ts';
import { refreshSharedFlags } from './albums.server.ts';
import { readSourceDerivative, type MediaRoot } from './media.server.ts';

type Db = Kysely<unknown>;
export async function photoLibrary(db: Db, params: URLSearchParams) {
  const page = Number(params.get('page') || 1),
    query = (params.get('q') || '').trim();
  ensure(Number.isSafeInteger(page) && page >= 1 && page <= 100000 && query.length <= 200, '筛选参数无效。');
  const album = params.get('album') ? uuid(params.get('album')) : '';
  const tag = params.get('tag') ? uuid(params.get('tag')) : '';
  const scope = params.get('scope') || '';
  ensure(['', 'hidden', 'visible', 'pending'].includes(scope), '展示范围无效。');
  const where = sql`EXISTS(SELECT 1 FROM gallery.album_photo a WHERE a.immich_asset_id=p.immich_asset_id)
    ${query ? sql`AND (p.title ILIKE ${'%' + query + '%'} OR p.description ILIKE ${'%' + query + '%'} OR s.filename ILIKE ${'%' + query + '%'})` : sql``}
    ${album ? sql`AND EXISTS(SELECT 1 FROM gallery.album_photo a WHERE a.immich_asset_id=p.immich_asset_id AND a.album_id=${album}::uuid)` : sql``}
    ${tag ? sql`AND EXISTS(SELECT 1 FROM gallery.photo_tag t WHERE t.immich_asset_id=p.immich_asset_id AND t.tag_id=${tag}::uuid)` : sql``}
    ${scope === 'hidden' ? sql`AND p.hidden_from_gallery` : scope === 'visible' ? sql`AND NOT p.hidden_from_gallery` : scope === 'pending' ? sql`AND (r.id IS NULL OR r.source_version<>p.version)` : sql``}`;
  const from = sql`FROM gallery.photo p JOIN gallery.admin_source_asset s ON s.asset_id=p.immich_asset_id LEFT JOIN gallery.photo_release r ON r.id=p.current_release_id WHERE ${where}`;
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      const count = (await sql<{ total: number }>`SELECT count(*)::int AS total ${from}`.execute(trx))
        .rows[0]!.total;
      const rows = (
        await sql<{
          asset: string;
          filename: string;
          title: string;
          description: string;
          description_format: string;
          version: string;
          pending: boolean;
          hidden: boolean;
          albums: { id: string; title: string }[];
          tags: string[];
        }>`SELECT p.immich_asset_id AS asset,s.filename,p.title,p.description,p.description_format,p.version,p.hidden_from_gallery AS hidden,(r.id IS NULL OR r.source_version<>p.version) AS pending,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.album_id,'title',d.title) ORDER BY d.title,d.album_id) FROM gallery.album_photo a JOIN gallery.album_draft d ON d.album_id=a.album_id WHERE a.immich_asset_id=p.immich_asset_id),'[]'::jsonb) AS albums,
      coalesce((SELECT array_agg(t.tag_id ORDER BY t.tag_id) FROM gallery.photo_tag t WHERE t.immich_asset_id=p.immich_asset_id),ARRAY[]::uuid[]) AS tags
      ${from} ORDER BY p.updated_at DESC,p.immich_asset_id LIMIT 48 OFFSET ${(page - 1) * 48}`.execute(trx)
      ).rows;
      const albums = (
        await sql<{
          id: string;
          title: string;
        }>`SELECT album_id AS id,title FROM gallery.album_draft ORDER BY title,album_id`.execute(trx)
      ).rows;
      return {
        photos: rows.map(({ description_format, ...photo }) => ({
          ...photo,
          description:
            description_format === 'plain' ? literalMarkdown(photo.description) : photo.description,
        })),
        total: count,
        page,
        albums,
      };
    });
}
export async function editPhotoLibrary(
  db: Db,
  user: GalleryUser,
  input: Record<string, unknown>,
  root: MediaRoot,
) {
  ensure(
    Array.isArray(input.photos) && input.photos.length > 0 && input.photos.length <= 100,
    '每次请选择 1–100 张照片。',
  );
  const selected = input.photos.map((v: unknown) => {
    ensure(v && typeof v === 'object', '照片参数无效。');
    const p = v as Record<string, unknown>;
    ensure(typeof p.version === 'string' && /^\d+$/.test(p.version), '照片版本无效。');
    return { asset: uuid(p.asset), version: p.version };
  });
  const assets = selected.map((p) => p.asset);
  ensure(
    new Set(assets).size === assets.length && typeof input.publish === 'boolean',
    '照片选择或发布方式无效。',
  );
  const operation = (name: string, max: number) => {
    const raw = input[name] as Record<string, unknown> | undefined;
    ensure(raw && ['keep', 'replace', 'clear'].includes(String(raw.mode)), '请选择字段修改方式。');
    ensure(
      raw.mode !== 'replace' || (typeof raw.value === 'string' && raw.value.length <= max),
      '修改内容过长或无效。',
    );
    return raw;
  };
  const title = operation('title', 200),
    description = operation('description', 50000);
  const tags = input.tags as Record<string, unknown> | undefined;
  ensure(
    tags && ['keep', 'add', 'remove', 'replace', 'clear'].includes(String(tags.mode)),
    '标签修改方式无效。',
  );
  const tagIds = validateTagIds(tags.value ?? []);
  return db.transaction().execute(async (trx) => {
    ensure(
      (
        await sql`SELECT id FROM gallery."user" WHERE id=${user.id}::uuid AND role='admin' AND status='active' FOR SHARE`.execute(
          trx,
        )
      ).rows.length,
      '登录已失效。',
      401,
    );
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    const available = (
      await sql`SELECT asset_id FROM gallery.admin_source_asset s WHERE asset_id=ANY(${assets}::uuid[]) AND EXISTS(SELECT 1 FROM gallery.album_photo a WHERE a.immich_asset_id=s.asset_id)`.execute(
        trx,
      )
    ).rows;
    ensure(available.length === assets.length, '部分照片已被移除或来源不可用，请重新载入。', 409);
    const profiles = await photoProfiles(trx, assets);
    const apply = (op: Record<string, unknown>, old: string) =>
      op.mode === 'keep' ? old : op.mode === 'clear' ? '' : String(op.value);
    const photos = selected.map(({ asset, version }) => {
      const old = profiles.get(asset);
      ensure(old && old.version === version, '部分照片已在其他窗口更新，整批未保存，请重新载入。', 409);
      const nextTags =
        tags.mode === 'keep'
          ? old.tags
          : tags.mode === 'clear'
            ? []
            : tags.mode === 'add'
              ? [...new Set([...old.tags, ...tagIds])]
              : tags.mode === 'remove'
                ? old.tags.filter((id) => !tagIds.includes(id))
                : tagIds;
      return {
        asset,
        id: asset,
        photoVersion: version,
        title: apply(title, old.title),
        description: apply(
          description,
          old.description_format === 'plain' ? literalMarkdown(old.description) : old.description,
        ),
        alt: old.alt_text,
        location: 'inherit',
        hiddenFromGallery: old.hidden_from_gallery,
        tags: nextTags,
      };
    });
    const clean = validateContent({ ...emptyAlbum('照片资料', 'photo-library'), photos }).photos;
    const none = '00000000-0000-0000-0000-000000000000';
    await savePhotoProfiles(trx, clean, none);
    if (input.publish) {
      for (const asset of assets)
        for (const variant of ['thumbnail', 'preview'] as const) {
          const bytes = await readSourceDerivative(trx, asset, variant, root);
          const info = await sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' }).metadata();
          ensure(info.width && info.height, '照片预览图不可用，本批操作未保存。', 409);
        }
      await publishPhotoProfiles(trx, user, assets);
      // Publishing existing drafts must also invalidate open album editors.
      await sql`UPDATE gallery.album SET version=version+1 WHERE id IN(SELECT album_id FROM gallery.album_photo WHERE immich_asset_id=ANY(${assets}::uuid[]))`.execute(
        trx,
      );
      await sql`UPDATE gallery.album_draft SET version=version+1 WHERE album_id IN(SELECT album_id FROM gallery.album_photo WHERE immich_asset_id=ANY(${assets}::uuid[]))`.execute(
        trx,
      );
    }
    await refreshSharedFlags(trx, assets, none);
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,${input.publish ? 'photo.batch-publish' : 'photo.batch-save'},'photo-batch',${assets.join(',')})`.execute(
      trx,
    );
    return { count: assets.length };
  });
}
