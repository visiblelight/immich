import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  ensure,
  uuid,
  GalleryError,
  validateArticleDocument,
  articleText,
  articleImages,
  articleImageKey,
  type ArticleContent,
  type ManagedArticle,
  type ArticleMediaOption,
  type GalleryUser,
} from '@gallery/core';
import { readArticleMedia } from './article-media.server.ts';
import { readSourceDerivative, sanitizeImage, type MediaRoot } from './media.server.ts';
type Db = Kysely<unknown>;
type Row = {
  id: string;
  slug: string;
  status: ManagedArticle['status'];
  version: string;
  content: ArticleContent;
  has_changes: boolean;
};
const dto = (row: Row): ManagedArticle => ({
  ...row.content,
  id: row.id,
  slug: row.slug,
  status: row.status,
  version: String(row.version),
  hasChanges: row.has_changes,
});
export async function articleLock(db: Db) {
  await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(db);
}
export function validateArticleContent(value: unknown): ArticleContent {
  const c = value as ArticleContent;
  ensure(c && typeof c === 'object', '文章内容无效。');
  ensure(typeof c.title === 'string' && c.title.length <= 200, '标题最多 200 字。');
  ensure(typeof c.summary === 'string' && c.summary.length <= 1000, '摘要最多 1000 字。');
  ensure(
    typeof c.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
      Number.isFinite(Date.parse(c.date)) &&
      new Date(c.date).toISOString().slice(0, 10) === c.date,
    '发表日期无效。',
  );
  ensure(typeof c.listed === 'boolean' && Array.isArray(c.albums) && c.albums.length <= 30, '文章设置无效。');
  let document;
  let cover;
  try {
    document = validateArticleDocument(c.document);
    cover = c.cover
      ? validateArticleDocument({ schemaVersion: 1, doc: { type: 'doc', content: [c.cover] } }).doc
          .content![0]!
      : null;
    ensure(!cover || cover.type === 'galleryImage', '封面必须是图片。');
  } catch (error) {
    throw new GalleryError(400, error instanceof Error ? error.message : '正文格式无效。');
  }
  const result: ArticleContent = {
    title: c.title.trim(),
    summary: c.summary.trim(),
    date: c.date,
    listed: c.listed,
    albums: [...new Set(c.albums.map(uuid))],
    document,
    cover,
  };
  ensure(articleImages(result).length <= 200, '每篇文章最多包含 200 张图片。');
  for (const { node } of articleImages(result)) {
    uuid(node.attrs?.ref);
    if (node.attrs?.kind === 'photo') uuid(node.attrs.album);
  }
  return result;
}
export async function getArticle(db: Db, id: string) {
  const row = (
    await sql<Row>`SELECT a.*, (r.id IS NULL OR a.content IS DISTINCT FROM r.content) AS has_changes FROM gallery.article a LEFT JOIN gallery.article_release r ON r.id=a.current_release_id WHERE a.id=${uuid(id)}::uuid`.execute(
      db,
    )
  ).rows[0];
  ensure(row, '文章不存在。', 404);
  return dto(row);
}
export async function listArticles(db: Db, query = '', page = 1, status = '') {
  page = Math.max(1, Math.min(100000, Math.floor(Number(page) || 1)));
  const filter = sql`WHERE a.content->>'title' ILIKE ${'%' + query.slice(0, 200) + '%'} ${['draft', 'published', 'offline'].includes(status) ? sql`AND a.status=${status}` : sql``}`;
  const total = Number(
    (await sql<{ count: string }>`SELECT count(*) FROM gallery.article a ${filter}`.execute(db)).rows[0]!
      .count,
  );
  const rows = (
    await sql<Row>`SELECT a.id,a.slug,a.status,a.version,a.content-'document' AS content,(r.id IS NULL OR a.content IS DISTINCT FROM r.content) AS has_changes FROM gallery.article a LEFT JOIN gallery.article_release r ON r.id=a.current_release_id ${filter} ORDER BY a.updated_at DESC,a.id LIMIT 30 OFFSET ${(page - 1) * 30}`.execute(
      db,
    )
  ).rows;
  return { articles: rows.map(dto), page, total };
}
export async function createArticle(db: Db, user: GalleryUser) {
  const id = randomUUID();
  const content: ArticleContent = {
    title: '',
    summary: '',
    date: new Date().toISOString().slice(0, 10),
    listed: true,
    albums: [],
    cover: null,
    document: { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
  };
  await sql`INSERT INTO gallery.article(id,slug,content,created_by,updated_by) VALUES(${id}::uuid,${id},${JSON.stringify(content)}::jsonb,${user.id}::uuid,${user.id}::uuid)`.execute(
    db,
  );
  return id;
}
async function writeRefs(db: Db, id: string, content: ArticleContent, release: string | null) {
  if (!release)
    for (const table of ['article_photo_ref', 'article_media_ref', 'article_album_ref'])
      await sql`DELETE FROM ${sql.table('gallery.' + table)} WHERE article_id=${id}::uuid AND release_id IS NULL`.execute(
        db,
      );
  for (const { node, key } of articleImages(content)) {
    if (node.attrs!.kind === 'photo') {
      const present = (
        await sql`SELECT 1 FROM gallery.photo WHERE immich_asset_id=${node.attrs!.ref}::uuid`.execute(db)
      ).rows.length;
      ensure(present, '引用的 Gallery 照片不存在。');
      await sql`INSERT INTO gallery.article_photo_ref(article_id,release_id,node_key,photo_id,album_id) VALUES(${id}::uuid,${release}::uuid,${key},${node.attrs!.ref}::uuid,${node.attrs!.album}::uuid)`.execute(
        db,
      );
    } else {
      ensure(
        (await sql`SELECT 1 FROM gallery.article_media WHERE id=${node.attrs!.ref}::uuid`.execute(db)).rows
          .length,
        '上传素材不存在。',
      );
      await sql`INSERT INTO gallery.article_media_ref(article_id,release_id,node_key,media_id) VALUES(${id}::uuid,${release}::uuid,${key},${node.attrs!.ref}::uuid)`.execute(
        db,
      );
    }
  }
  for (const [position, album] of content.albums.entries())
    await sql`INSERT INTO gallery.article_album_ref(article_id,release_id,album_id,position) VALUES(${id}::uuid,${release}::uuid,${album}::uuid,${position})`.execute(
      db,
    );
}
export async function saveArticle(db: Db, user: GalleryUser, input: Record<string, unknown>) {
  const id = uuid(input.id),
    content = validateArticleContent(input.content);
  ensure(
    typeof input.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(input.slug),
    '文章链接只支持小写字母、数字和连字符。',
  );
  return db.transaction().execute(async (trx) => {
    await articleLock(trx);
    const old = await getArticle(trx, id);
    ensure(old.version === String(input.version), '文章已被其他页面修改，请保留当前文字并重新载入。', 409);
    ensure(old.status === 'draft' || old.slug === input.slug, '首次发布后不能修改文章链接。');
    await sql`UPDATE gallery.article SET content=${JSON.stringify(content)}::jsonb,slug=${input.slug},version=version+1,updated_by=${user.id}::uuid,updated_at=now() WHERE id=${id}::uuid`.execute(
      trx,
    );
    await writeRefs(trx, id, content, null);
    return getArticle(trx, id);
  });
}
export async function articleMediaOptions(
  db: Db,
  kind: 'photo' | 'upload',
  query = '',
  album = '',
  page = 1,
): Promise<{ items: ArticleMediaOption[]; more: boolean }> {
  const offset = (Math.max(1, Math.min(100000, Math.floor(Number(page) || 1))) - 1) * 48;
  if (kind === 'photo') {
    if (album) uuid(album);
    const rows = (
      await sql<{
        asset_id: string;
        album_id: string;
        photo_id: string;
        title: string;
        alt_text: string;
        width: number;
        height: number;
        album_title: string;
      }>`SELECT p.*,a.title AS album_title FROM gallery.published_photo p JOIN gallery.published_album a ON a.album_id=p.album_id WHERE (p.title ILIKE ${'%' + query.slice(0, 200) + '%'} OR EXISTS (SELECT 1 FROM jsonb_array_elements(p.tags) t WHERE t->>'name' ILIKE ${'%' + query.slice(0, 200) + '%'})) ${album ? sql`AND p.album_id=${album}::uuid` : sql``} ORDER BY p.album_id,p.position,p.photo_id LIMIT 49 OFFSET ${offset}`.execute(
        db,
      )
    ).rows;
    return {
      more: rows.length > 48,
      items: rows
        .slice(0, 48)
        .map((p) => ({
          id: p.album_id + ':' + p.asset_id,
          ref: p.asset_id,
          kind: 'photo',
          album: p.album_id,
          albumTitle: p.album_title,
          title: p.title || '未命名照片',
          alt: p.alt_text || p.title || '照片',
          src: `/media/source/${p.asset_id}?variant=thumbnail`,
          preview: `/media/source/${p.asset_id}?variant=preview`,
          width: p.width,
          height: p.height,
        })),
    };
  }
  const rows = (
    await sql<{
      id: string;
      name: string;
      width: number;
      height: number;
      usage: number;
    }>`SELECT id,name,width,height,(SELECT count(DISTINCT r.article_id)::integer FROM gallery.article_media_ref r WHERE r.media_id=m.id) AS usage FROM gallery.article_media m WHERE name ILIKE ${'%' + query.slice(0, 200) + '%'} ORDER BY created_at DESC,id LIMIT 49 OFFSET ${offset}`.execute(
      db,
    )
  ).rows;
  return {
    more: rows.length > 48,
    items: rows
      .slice(0, 48)
      .map((m) => ({
        id: m.id,
        ref: m.id,
        kind: 'upload',
        title: m.name,
        usage: m.usage,
        alt: m.name,
        src: `/media/articles/${m.id}?variant=thumbnail`,
        preview: `/media/articles/${m.id}?variant=preview`,
        width: m.width,
        height: m.height,
      })),
  };
}
export async function articleImageMap(db: Db, id: string, content: ArticleContent, admin = false) {
  const images: Record<string, ArticleMediaOption> = {};
  for (const { node } of articleImages(content)) {
    const key = articleImageKey(node);
    if (images[key]) continue;
    if (node.attrs!.kind === 'photo') {
      const rows = admin
        ? (
            await sql<any>`SELECT * FROM gallery.published_photo WHERE album_id=${node.attrs!.album}::uuid AND asset_id=${node.attrs!.ref}::uuid LIMIT 1`.execute(
              db,
            )
          ).rows
        : (
            await sql<any>`SELECT * FROM gallery.published_article_photo WHERE article_id=${id}::uuid AND album_id=${node.attrs!.album}::uuid AND asset_id=${node.attrs!.ref}::uuid LIMIT 1`.execute(
              db,
            )
          ).rows;
      const p = rows[0];
      if (p)
        images[key] = {
          id: key,
          ref: p.asset_id,
          kind: 'photo',
          album: p.album_id,
          title: p.title,
          alt: p.alt_text || p.title || '照片',
          src: admin
            ? `/media/source/${p.asset_id}?variant=preview`
            : `/media/${p.album_id}/${p.photo_id}?variant=preview`,
          preview: admin
            ? `/media/source/${p.asset_id}?variant=preview`
            : `/media/${p.album_id}/${p.photo_id}?variant=preview`,
          width: p.width,
          height: p.height,
        };
    } else {
      const rows = admin
        ? (
            await sql<any>`SELECT id,name,width,height FROM gallery.article_media WHERE id=${node.attrs!.ref}::uuid`.execute(
              db,
            )
          ).rows
        : (
            await sql<any>`SELECT id,width,height FROM gallery.published_article_media WHERE article_id=${id}::uuid AND id=${node.attrs!.ref}::uuid`.execute(
              db,
            )
          ).rows;
      const m = rows[0];
      if (m)
        images[key] = {
          id: m.id,
          ref: m.id,
          kind: 'upload',
          title: m.name ?? '文章插图',
          alt: '文章插图',
          src: admin ? `/media/articles/${m.id}` : `/media/articles/${id}/${m.id}`,
          preview: admin
            ? `/media/articles/${m.id}?variant=preview`
            : `/media/articles/${id}/${m.id}?variant=preview`,
          width: m.width,
          height: m.height,
        };
    }
  }
  return images;
}
export async function publishArticle(
  db: Db,
  user: GalleryUser,
  input: Record<string, unknown>,
  root: MediaRoot,
  mediaRoot = '',
) {
  const id = uuid(input.id);
  return db.transaction().execute(async (trx) => {
    await articleLock(trx);
    const article = await getArticle(trx, id);
    ensure(article.version === String(input.version), '文章版本已变化，请重新预览后发布。', 409);
    const content = validateArticleContent(article);
    ensure(
      content.title &&
        (articleText(content.document.doc).trim().length > 0 ||
          articleImages(content).some((i) => i.key !== 'cover')),
      '请填写标题和正文。',
    );
    // Check both current public membership and readable derivatives before publishing.
    const images = await articleImageMap(trx, id, content, true);
    for (const { node } of articleImages(content)) {
      ensure(images[articleImageKey(node)], '部分图片已不再公开或素材不可用，请更换后发布。');
      if (node.attrs!.kind === 'photo') {
        try {
          for (const variant of ['preview', 'thumbnail'] as const)
            await sanitizeImage(
              await readSourceDerivative(trx, String(node.attrs!.ref), variant, root),
              variant,
            );
        } catch {
          throw new GalleryError(400, '照片展示文件不可用，请在 Immich 处理后重试。');
        }
      }
    }
    for (const { node } of articleImages(content))
      if (node.attrs!.kind === 'upload') {
        await readArticleMedia(trx, mediaRoot, String(node.attrs!.ref), 'preview');
        await readArticleMedia(trx, mediaRoot, String(node.attrs!.ref), 'thumbnail');
      }
    for (const album of content.albums)
      ensure(
        (await sql`SELECT 1 FROM gallery.published_album WHERE album_id=${album}::uuid`.execute(trx)).rows
          .length,
        '关联相册尚未公开。',
      );
    // Each publication gets a new source version, even when restoring identical content.
    const release = randomUUID();
    const version = String(BigInt(article.version) + 1n);
    await sql`INSERT INTO gallery.article_release(id,article_id,source_version,content,published_by) VALUES(${release}::uuid,${id}::uuid,${version}::bigint,${JSON.stringify(content)}::jsonb,${user.id}::uuid)`.execute(
      trx,
    );
    await writeRefs(trx, id, content, release);
    await sql`UPDATE gallery.article SET current_release_id=${release}::uuid,status='published',version=${version}::bigint,updated_by=${user.id}::uuid,updated_at=now() WHERE id=${id}::uuid`.execute(
      trx,
    );
    return getArticle(trx, id);
  });
}
export async function offlineArticle(db: Db, input: Record<string, unknown>) {
  return db.transaction().execute(async (trx) => {
    await articleLock(trx);
    const article = await getArticle(trx, uuid(input.id));
    ensure(article.version === String(input.version), '文章版本已变化，请刷新。', 409);
    ensure(article.status === 'published', '只有已发布文章可以下线。');
    ensure(
      !(await sql`SELECT 1 FROM gallery.site WHERE about_article_id=${article.id}::uuid`.execute(trx)).rows
        .length,
      '请先更换或解除关于页选篇，再下线文章。',
      409,
    );
    await sql`UPDATE gallery.article SET status='offline',version=version+1,updated_at=now() WHERE id=${article.id}::uuid`.execute(
      trx,
    );
    return getArticle(trx, article.id);
  });
}
export async function deleteArticle(db: Db, input: Record<string, unknown>) {
  await db.transaction().execute(async (trx) => {
    await articleLock(trx);
    const article = await getArticle(trx, uuid(input.id));
    ensure(article.version === String(input.version), '文章版本已变化，请刷新。', 409);
    ensure(
      !(await sql`SELECT 1 FROM gallery.article_release WHERE article_id=${article.id}::uuid`.execute(trx))
        .rows.length,
      '已发布的文章请使用下线。',
    );
    for (const table of ['article_photo_ref', 'article_media_ref', 'article_album_ref'])
      await sql`DELETE FROM ${sql.table('gallery.' + table)} WHERE article_id=${article.id}::uuid`.execute(
        trx,
      );
    await sql`DELETE FROM gallery.article WHERE id=${article.id}::uuid`.execute(trx);
  });
}
export async function aboutArticleSettings(db: Db) {
  const site = (
    await sql<{
      about_article_id: string | null;
      version: string;
    }>`SELECT about_article_id,about_article_version AS version FROM gallery.site WHERE id=1`.execute(db)
  ).rows[0]!;
  const articles = (
    await sql<{
      id: string;
      title: string;
    }>`SELECT id,content->>'title' AS title FROM gallery.published_article ORDER BY content->>'title'`.execute(
      db,
    )
  ).rows;
  return { id: site.about_article_id ?? '', version: String(site.version), articles };
}
export async function saveAboutArticle(db: Db, input: Record<string, unknown>) {
  await db.transaction().execute(async (trx) => {
    await articleLock(trx);
    const old = await aboutArticleSettings(trx);
    ensure(old.version === String(input.version), '站点设置已变化，请刷新后再保存。', 409);
    const id = input.id ? uuid(input.id) : null;
    ensure(!id || old.articles.some((a) => a.id === id), '只能选择已发布文章。');
    await sql`UPDATE gallery.site SET about_article_id=${id}::uuid,about_article_version=about_article_version+1 WHERE id=1`.execute(
      trx,
    );
  });
  return aboutArticleSettings(db);
}
export async function publicArticles(db: Db, page = 1) {
  page = Math.max(1, Math.min(100000, Math.floor(Number(page) || 1)));
  const total = Number(
    (
      await sql<{
        count: string;
      }>`SELECT count(*) FROM gallery.published_article WHERE content->>'listed'='true'`.execute(db)
    ).rows[0]!.count,
  );
  const rows = (
    await sql<any>`SELECT id,slug,content-'document' AS content FROM gallery.published_article WHERE content->>'listed'='true' ORDER BY content->>'date' DESC,published_at DESC,id LIMIT 20 OFFSET ${(page - 1) * 20}`.execute(
      db,
    )
  ).rows;
  return {
    total,
    page,
    articles: await Promise.all(
      rows.map(async (r) => ({
        ...r.content,
        id: r.id,
        slug: r.slug,
        images: await articleImageMap(db, r.id, {
          ...r.content,
          document: { schemaVersion: 1, doc: { type: 'doc' } },
        }),
      })),
    ),
  };
}
export async function publicArticle(db: Db, slug: string, about = false) {
  const row = (
    await sql<any>`SELECT * FROM ${sql.table(about ? 'gallery.published_about_article' : 'gallery.published_article')} ${about ? sql`` : sql`WHERE slug=${slug}`}`.execute(
      db,
    )
  ).rows[0];
  if (about && !row) return null;
  ensure(row, '文章不存在或尚未公开。', 404);
  return {
    ...row.content,
    id: row.id,
    slug: row.slug,
    images: await articleImageMap(db, row.id, row.content),
    related: (
      await sql<{
        title: string;
        slug: string;
      }>`SELECT title,slug FROM gallery.published_article_album WHERE article_id=${row.id}::uuid ORDER BY position`.execute(
        db,
      )
    ).rows.map((a) => ({ title: a.title, href: '/albums/' + a.slug })),
  };
}
export async function relatedArticles(db: Db, album: string) {
  return (
    await sql<{
      title: string;
      slug: string;
    }>`SELECT a.content->>'title' AS title,a.slug FROM gallery.published_article a JOIN gallery.published_article_album ref ON ref.article_id=a.id WHERE ref.album_id=${uuid(album)}::uuid ORDER BY a.content->>'date' DESC`.execute(
      db,
    )
  ).rows;
}

export async function articleAlbumOptions(db: Db) {
  return (
    await sql<{
      id: string;
      title: string;
    }>`SELECT album_id AS id,title FROM gallery.published_album ORDER BY title,album_id`.execute(db)
  ).rows;
}
