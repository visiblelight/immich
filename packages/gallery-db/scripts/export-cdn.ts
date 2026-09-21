// Executed inside the public container: only its read-only database role and media mounts.
// stdout is a private pipe to the host sync worker, never a log or public HTTP endpoint.
import { sql } from 'kysely';
import {
  runtime,
  readArticlePhotoDerivative,
  readPublishedDerivative,
  sanitizeImage,
  imageContentType,
  readArticleMedia,
} from '../src/index.server.ts';
import { cdnObjectKey } from '../src/cdn.server.ts';
const app = runtime(process.env, 'gallery-public');
const seen = new Set<string>();
const send = (record: unknown) =>
  new Promise<void>((resolve, reject) => {
    process.stdout.write(JSON.stringify(record) + '\n', (error) => (error ? reject(error) : resolve()));
  });
async function emit(bytes: Buffer) {
  const key = cdnObjectKey(bytes);
  if (seen.has(key)) return;
  seen.add(key);
  await send({ kind: 'media', key, contentType: imageContentType(bytes), data: bytes.toString('base64') });
}
try {
  await app.ready();
  // The listing is only a candidate set. Reauthorize every item in the existing media reader.
  const photos = (
    await sql<{
      album_id: string;
      photo_id: string;
    }>`SELECT DISTINCT album_id,photo_id FROM gallery.published_media`.execute(app.db)
  ).rows;
  const articles = (
    await sql<{
      article_id: string;
      id: string;
    }>`SELECT DISTINCT article_id,id FROM gallery.published_article_media`.execute(app.db)
  ).rows;
  const articlePhotos = (
    await sql<{
      article_id: string;
      album_id: string;
      asset_id: string;
    }>`SELECT DISTINCT article_id,album_id,asset_id FROM gallery.published_article_photo_media`.execute(
      app.db,
    )
  ).rows;
  let failures = 0;
  for (const item of photos)
    for (const variant of ['thumbnail', 'preview'] as const) {
      try {
        const media = await readPublishedDerivative(app.db, item.album_id, item.photo_id, variant, app.root);
        await emit(await sanitizeImage(media.bytes, variant));
      } catch {
        failures++;
      }
    }
  for (const item of articlePhotos)
    for (const variant of ['thumbnail', 'preview'] as const) {
      try {
        const media = await readArticlePhotoDerivative(
          app.db,
          item.article_id,
          item.album_id,
          item.asset_id,
          variant,
          app.root,
        );
        await emit(await sanitizeImage(media.bytes, variant));
      } catch {
        failures++;
      }
    }
  for (const item of articles)
    for (const variant of ['thumbnail', 'preview'] as const) {
      try {
        await emit(await readArticleMedia(app.db, app.articleMediaRoot, item.id, variant, item.article_id));
      } catch {
        failures++;
      }
    }
  await send({ kind: 'complete', count: seen.size, failures });
} finally {
  await app.db.destroy();
}
