import { env } from '$env/dynamic/private';
import { createDatabase, directMail, assertDatabaseCompatibility } from '@gallery/db/server';
import { ensure } from '@gallery/core';
let readyUntil = 0;
let checking: Promise<void> | undefined;
async function ready() {
  if (Date.now() < readyUntil) return;
  checking ??= assertDatabaseCompatibility(db!, 'gallery-community')
    .then(() => {
      readyUntil = Date.now() + 15000;
    })
    .finally(() => {
      checking = undefined;
    });
  await checking;
}
let db: ReturnType<typeof createDatabase> | undefined;
export const communityConfigured = () => Boolean(env.GALLERY_COMMUNITY_DATABASE_URL);
export function getCommunity() {
  ensure(env.GALLERY_COMMUNITY_DATABASE_URL, '用户互动服务暂未启用。', 503);
  db ??= createDatabase(env.GALLERY_COMMUNITY_DATABASE_URL, 'gallery-community');
  return { db, ready, secret: env.GALLERY_MEMBER_CODE_SECRET ?? '', send: directMail(env) };
}
export const memberCookie = 'gallery_member_session';
