import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, uuid, type GalleryUser } from '@gallery/core';
type Db = Kysely<unknown>;
export async function adminTags(db: Db) {
  return (
    await sql<{
      id: string;
      name: string;
      active: boolean;
      version: string;
      draftCount: number;
      publishedCount: number;
      referenced: boolean;
    }>`SELECT t.id,t.name,t.active,t.version,
 (SELECT count(*)::int FROM gallery.photo_tag p WHERE p.tag_id=t.id AND EXISTS(SELECT 1 FROM gallery.album_photo a WHERE a.immich_asset_id=p.immich_asset_id)) AS "draftCount",
 coalesce((SELECT photo_count::int FROM gallery.published_tag v WHERE v.id=t.id),0) AS "publishedCount",
 EXISTS(SELECT 1 FROM gallery.photo_tag p WHERE p.tag_id=t.id) OR EXISTS(SELECT 1 FROM gallery.photo_release_tag p WHERE p.tag_id=t.id) AS referenced
 FROM gallery.tag t ORDER BY t.active DESC,t.name,t.id`.execute(db)
  ).rows;
}
export async function saveTag(db: Db, user: GalleryUser, input: Record<string, unknown>) {
  const id = input.id ? uuid(input.id) : randomUUID();
  return db.transaction().execute(async (trx) => {
    ensure(
      (
        await sql`SELECT id FROM gallery."user" WHERE id=${user.id}::uuid AND status='active' AND role='admin' FOR SHARE`.execute(
          trx,
        )
      ).rows.length,
      '登录已失效。',
      401,
    );
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    const old = (
      await sql<{ version: string }>`SELECT version FROM gallery.tag WHERE id=${id}::uuid FOR UPDATE`.execute(trx)
    ).rows[0];
    if (input.id) ensure(old && old.version === input.version, '标签已修改，请刷新后再试。', 409);
    if (input.remove === true) {
      ensure(
        !(
          await sql`SELECT 1 FROM gallery.photo_tag WHERE tag_id=${id}::uuid UNION ALL SELECT 1 FROM gallery.photo_release_tag WHERE tag_id=${id}::uuid LIMIT 1`.execute(
            trx,
          )
        ).rows.length,
        '标签已有引用，请使用停用。',
        409,
      );
      await sql`DELETE FROM gallery.tag WHERE id=${id}::uuid`.execute(trx);
    } else {
      ensure(typeof input.name === 'string', '请填写标签名称。');
      const name = (input.name as string).normalize('NFKC').trim();
      ensure(name.length > 0 && name.length <= 60 && !/[\u0000-\u001f\u007f]/.test(name), '标签名称须为 1–60 个字符。');
      ensure(typeof input.active === 'boolean', '标签状态无效。');
      ensure(
        !(
          await sql`SELECT id FROM gallery.tag WHERE lower(btrim(name))=lower(${name}) AND id<>${id}::uuid`.execute(trx)
        ).rows.length,
        '同名标签已经存在。',
        409,
      );
      await sql`INSERT INTO gallery.tag(id,name,active) VALUES(${id}::uuid,${name},${input.active}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,version=gallery.tag.version+1,updated_at=now()`.execute(
        trx,
      );
    }
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,${input.remove ? 'tag.delete' : 'tag.save'},'tag',${id})`.execute(
      trx,
    );
    return id;
  });
}
