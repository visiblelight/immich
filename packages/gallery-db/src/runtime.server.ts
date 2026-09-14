import { createDatabase } from './index.server.ts';
import { assertDatabaseCompatibility } from './compatibility.server.ts';
import { ensure } from '@gallery/core';
import type { DatabaseService } from './config.server.ts';
import type { MediaRoot } from './media.server.ts';
import { sql } from 'kysely';
export function runtime(env: Record<string, string | undefined>, service: DatabaseService) {
  ensure(env.GALLERY_DATABASE_URL, 'Gallery 尚未配置数据库。', 503);
  const db = createDatabase<unknown>(env.GALLERY_DATABASE_URL, service);
  const originValue = env[service === 'gallery-admin' ? 'GALLERY_ADMIN_ORIGIN' : 'GALLERY_PUBLIC_ORIGIN'];
  ensure(originValue, 'Gallery 访问地址未配置。', 503);
  const origin = new URL(originValue);
  ensure(
    ['http:', 'https:'].includes(origin.protocol) && origin.origin === originValue,
    'Gallery 访问地址必须是完整 origin。',
    503,
  );
  const root: MediaRoot = {
    sourceRoot: env.GALLERY_MEDIA_SOURCE_ROOT ?? '',
    mountedRoot: env.GALLERY_MEDIA_MOUNTED_ROOT ?? '',
  };
  ensure(root.sourceRoot.startsWith('/') && root.mountedRoot.startsWith('/'), 'Gallery 图片目录未配置。', 503);
  let readyUntil = 0;
  let checking: Promise<void> | null = null;
  const ready = async () => {
    if (Date.now() < readyUntil) return;
    if (!checking)
      checking = assertDatabaseCompatibility(db, service)
        .then(async () => {
          const site = await sql`SELECT name FROM gallery.published_site WHERE id=1`.execute(db);
          ensure(site.rows.length, 'Gallery 站点尚未初始化。', 503);
          if (service === 'gallery-admin') await sql`SELECT attempts FROM gallery.auth_throttle LIMIT 0`.execute(db);
          readyUntil = Date.now() + 15000;
        })
        .finally(() => {
          checking = null;
        });
    await checking;
  };
  return {
    db,
    articleMediaRoot: env.GALLERY_ARTICLE_MEDIA_ROOT ?? '',
    mapSecretKey: env.GALLERY_MAP_SECRET_KEY,
    origin: origin.origin,
    secure: origin.protocol === 'https:',
    root,
    ready,
    publicOrigin: env.GALLERY_PUBLIC_ORIGIN ?? '',
  };
}
