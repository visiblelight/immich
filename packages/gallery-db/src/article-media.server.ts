import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rename, rm, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { sql, type Kysely } from 'kysely';
import { ensure, uuid, type GalleryUser } from '@gallery/core';
import { articleLock } from './articles.server.ts';
let active = 0;
export async function uploadArticleMedia(
  db: Kysely<unknown>,
  user: GalleryUser,
  root: string,
  bytes: Buffer,
  name: string,
) {
  ensure(path.isAbsolute(root), '文章素材目录尚未配置。', 503);
  ensure(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024, '图片不能超过 10 MB。', 413);
  ensure(active < 2, '正在处理其他图片，请稍后重试。', 429);
  active++;
  let temporary = '';
  let destination = '';
  let inserted = false;
  try {
    const options = { limitInputPixels: 40_000_000, failOn: 'error' as const };
    const meta = await sharp(bytes, options).metadata();
    ensure(
      ['jpeg', 'png', 'webp'].includes(meta.format ?? '') && (meta.pages ?? 1) === 1,
      '仅支持单张 JPEG、PNG、WebP 图片。',
    );
    const preview = await sharp(bytes, options)
      .rotate()
      .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(preview.data)
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    await mkdir(root, { recursive: true });
    const base = await realpath(root);
    temporary = await mkdtemp(path.join(base, '.upload-'));
    await writeFile(path.join(temporary, 'preview.webp'), preview.data, { flag: 'wx', mode: 0o640 });
    await writeFile(path.join(temporary, 'thumbnail.webp'), thumbnail, { flag: 'wx', mode: 0o640 });
    const id = randomUUID(),
      key = randomUUID();
    destination = path.join(base, key);
    await rename(temporary, destination);
    temporary = '';
    await sql`INSERT INTO gallery.article_media(id,name,storage_key,mime_type,width,height,bytes,checksum,uploaded_by) VALUES(${id}::uuid,${name.slice(0, 200) || '文章插图'},${key}::uuid,'image/webp',${preview.info.width},${preview.info.height},${preview.data.length + thumbnail.length},${createHash('sha256').update(preview.data).digest('hex')},${user.id}::uuid)`.execute(
      db,
    );
    inserted = true;
    return {
      id,
      ref: id,
      kind: 'upload' as const,
      title: name.slice(0, 200) || '文章插图',
      alt: '文章插图',
      src: `/media/articles/${id}`,
      preview: `/media/articles/${id}?variant=preview`,
      width: preview.info.width,
      height: preview.info.height,
    };
  } finally {
    active--;
    if (temporary) await rm(temporary, { recursive: true, force: true });
    if (destination && !inserted) await rm(destination, { recursive: true, force: true });
  }
}
export async function readArticleMedia(
  db: Kysely<unknown>,
  root: string,
  id: string,
  variant: string,
  articleId?: string,
) {
  uuid(id);
  ensure(['thumbnail', 'preview'].includes(variant), '图片不存在。', 404);
  ensure(path.isAbsolute(root), '图片不可用。', 404);
  const row = articleId
    ? (
        await sql<{
          storage_key: string;
        }>`SELECT storage_key FROM gallery.published_article_media WHERE id=${id}::uuid AND article_id=${uuid(articleId)}::uuid`.execute(
          db,
        )
      ).rows[0]
    : (
        await sql<{
          storage_key: string;
        }>`SELECT storage_key FROM gallery.article_media WHERE id=${id}::uuid`.execute(db)
      ).rows[0];
  ensure(row, '图片不存在。', 404);
  uuid(row.storage_key);
  const base = await realpath(root);
  const filePath = path.join(base, row.storage_key, variant + '.webp');
  const resolved = await realpath(filePath);
  ensure(
    resolved === filePath && path.relative(base, resolved) === path.join(row.storage_key, variant + '.webp'),
    '图片不可用。',
    404,
  );
  const file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    ensure(stat.isFile() && stat.size <= 32 * 1024 * 1024, '图片不可用。', 404);
    return await file.readFile();
  } finally {
    await file.close();
  }
}
export async function deleteArticleMedia(db: Kysely<unknown>, root: string, id: string) {
  uuid(id);
  ensure(path.isAbsolute(root), '文章素材目录未配置。', 503);
  const key = await db.transaction().execute(async (trx) => {
    await articleLock(trx);
    ensure(
      !(await sql`SELECT 1 FROM gallery.article_media_ref WHERE media_id=${id}::uuid LIMIT 1`.execute(trx))
        .rows.length,
      '素材仍被草稿或历史发布版本引用，不能删除。',
      409,
    );
    const row = (
      await sql<{
        storage_key: string;
      }>`DELETE FROM gallery.article_media WHERE id=${id}::uuid RETURNING storage_key`.execute(trx)
    ).rows[0];
    ensure(row, '素材不存在。', 404);
    return uuid(row.storage_key);
  });
  const base = await realpath(root);
  const target = path.join(base, key);
  try {
    ensure((await realpath(target)) === target, '素材路径无效。');
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
