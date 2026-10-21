import { randomUUID, createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  ensure,
  validateMediaAttribution,
  type GalleryUser,
  type MediaAttribution,
  type MediaAttributionSettings,
} from '@gallery/core';
export async function mediaAttributionSettings(
  db: Kysely<unknown>,
): Promise<MediaAttributionSettings> {
  const row = (
    await sql<MediaAttributionSettings>`SELECT enabled,creator,homepage,copyright,version FROM gallery.media_attribution WHERE id=1`.execute(
      db,
    )
  ).rows[0];
  ensure(row, '图片署名设置尚未初始化。', 503);
  return row;
}
/** Content policy identity: revision/timestamps deliberately excluded for stable object names. */
export function attributionKey(value?: MediaAttribution): string {
  return value?.enabled
    ? createHash('sha256')
        .update(
          JSON.stringify([
            'attribution-v1',
            value.creator,
            value.homepage,
            value.copyright,
          ]),
        )
        .digest('hex')
    : 'unsigned-v1';
}
export async function saveMediaAttribution(
  db: Kysely<unknown>,
  user: GalleryUser,
  input: Record<string, unknown>,
) {
  const value = validateMediaAttribution(input);
  ensure(
    Number.isSafeInteger(input.version) && Number(input.version) > 0,
    '署名设置版本无效。',
  );
  return db.transaction().execute(async (trx) => {
    ensure(
      (
        await sql`SELECT id FROM gallery."user" WHERE id=${user.id}::uuid AND status='active' AND role='admin' FOR SHARE`.execute(
          trx,
        )
      ).rows.length,
      '账号不可用。',
      401,
    );
    const result =
      await sql<MediaAttributionSettings>`UPDATE gallery.media_attribution SET enabled=${value.enabled},creator=${value.creator},homepage=${value.homepage},copyright=${value.copyright},version=version+1,updated_at=now() WHERE id=1 AND version=${Number(input.version)} RETURNING enabled,creator,homepage,copyright,version`.execute(
        trx,
      );
    ensure(result.rows[0], '署名设置已变化，请刷新后再保存。', 409);
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,'media-attribution.save','site','1')`.execute(
      trx,
    );
    return result.rows[0];
  });
}

/** Read only aggregate sync status, never cloud credentials or object names. */
export async function mediaAttributionStatus(
  db: Kysely<unknown>,
  directory = process.env.GALLERY_MEDIA_STATUS_DIRECTORY,
) {
  const current = await mediaAttributionSettings(db);
  if (!directory)
    return {
      message: '当前环境未接入云端同步，署名直接应用于 Gallery 图片输出。',
    };
  try {
    const { readFile } = await import('node:fs/promises');
    const { default: path } = await import('node:path');
    ensure(path.isAbsolute(directory), '状态目录无效。');
    const state = JSON.parse(
      await readFile(path.join(directory, 'sync.json'), 'utf8'),
    );
    if (state.attributionKey !== attributionKey(current))
      return { message: '设置已生效，等待后台同步新版云端图片。' };
    if (
      !Number.isFinite(state.checkedAt) ||
      Date.now() - state.checkedAt > 180000 ||
      state.checkedAt > Date.now()
    )
      return {
        message: '云端同步状态已过期，Gallery 将在需要时直接提供图片。',
      };
    if (state.phase === 'running')
      return {
        message: `正在同步云端图片，已处理 ${Number(state.objects) || 0} 个展示文件。`,
      };
    if (state.phase === 'failed' || state.failures)
      return {
        message:
          '部分云端图片尚未同步成功，后台将自动重试；Gallery 会直接提供新版图片。',
      };
    if (state.phase !== 'complete') throw new Error('Invalid status');
    return {
      message: `云端同步已完成，共 ${Number(state.objects) || 0} 个展示文件。`,
    };
  } catch {
    return {
      message: '暂未取得云端同步结果，Gallery 可直接提供带当前署名设置的图片。',
    };
  }
}
