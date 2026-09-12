import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type pg from 'pg';
import { sql, type Kysely } from 'kysely';
import {
  adminState,
  adminTags,
  saveTag,
  createAlbum,
  saveAlbum,
  publishAlbum,
  saveAlbumItem,
  publicCatalog,
  publicPhotoFeed,
  setAlbumAvailability,
} from '../../src/index.server.ts';
export async function sharedPhotosAndTags(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  assets: string[],
  mediaRoot: string,
) {
  const user = { id: userId, email: 'gallery@example.invalid', displayName: 'Gallery' },
    root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#70816a' } })
    .jpeg()
    .toBuffer();
  for (const asset of assets)
    for (const variant of ['preview', 'thumbnail'])
      await writeFile(path.join(mediaRoot, `${asset}-${variant}.jpg`), bytes);
  const state = async (id: string) => {
    const s = await adminState(db),
      a = s.albums.find((a) => a.id === id)!;
    return { a, v: { version: a.version, draftVersion: a.draftVersion, treeVersion: s.site.treeVersion } };
  };
  const tag = await saveTag(db, user, { name: 'Architecture', active: true });
  const night = await saveTag(db, user, { name: 'Night', active: true });
  const secret = await saveTag(db, user, { name: 'Private draft theme', active: true });
  await assert.rejects(saveTag(db, user, { name: ' architecture ', active: true }), /同名/);
  const a = await createAlbum(db, user, { title: 'Shared A', treeVersion: (await adminState(db)).site.treeVersion });
  let sa = await state(a);
  sa.a.draft.showExif = true;
  sa.a.draft.photos = assets.map((asset, i) => ({
    id: randomUUID(),
    asset,
    title: 'Unified',
    description: 'Original',
    alt: 'Image',
    location: 'inherit',
    tags: i ? [tag] : [tag, night],
  }));
  await saveAlbum(db, user, a, { ...sa.v, content: sa.a.draft });
  await publishAlbum(db, user, a, (await state(a)).v, root);
  const b = await createAlbum(db, user, { title: 'Shared B', treeVersion: (await adminState(db)).site.treeVersion });
  let sb = await state(b);
  sa = await state(a);
  sb.a.draft.showExif = true;
  sb.a.draft.photos = [{ ...sa.a.draft.photos[0]!, id: randomUUID() }];
  await saveAlbum(db, user, b, { ...sb.v, content: sb.a.draft });
  await publishAlbum(db, user, b, (await state(b)).v, root);
  sb = await state(b);
  const staleB = structuredClone(sb);
  sa = await state(a);
  sa.a.draft.photos[0]!.description = 'Shared draft';
  sa.a.draft.photos[0]!.tags = [night, secret];
  await saveAlbumItem(
    db,
    user,
    a,
    { ...sa.v, content: sa.a.draft, target: sa.a.draft.photos[0]!.id, publish: false },
    root,
  );
  assert.equal((await state(b)).a.draft.photos[0]!.description, 'Shared draft');
  assert.equal((await publicCatalog(pub, sb.a.draft.slug)).active!.photos[0]!.description, 'Original');
  assert.ok(!(await publicPhotoFeed(pub)).availableTags.some((t) => t.id === secret));
  await assert.rejects(saveAlbum(db, user, b, { ...staleB.v, content: staleB.a.draft }), /窗口|更新/);
  sb = await state(b);
  sb.a.draft.markdown = 'Private album B journey';
  await saveAlbum(db, user, b, { ...sb.v, content: sb.a.draft });
  sa = await state(a);
  await saveAlbumItem(
    db,
    user,
    a,
    { ...sa.v, content: sa.a.draft, target: sa.a.draft.photos[0]!.id, publish: true },
    root,
  );
  const publicB = (await publicCatalog(pub, sb.a.draft.slug)).active!;
  assert.equal(publicB.photos[0]!.description, 'Shared draft');
  assert.notEqual(publicB.markdown, 'Private album B journey');
  assert.equal((await publicPhotoFeed(pub, { tags: [night, secret] })).total, 1);
  assert.equal((await publicPhotoFeed(pub, { tags: [tag, night] })).total, 0);
  const tagRow = (await adminTags(db)).find((t) => t.id === night)!;
  await saveTag(db, user, { ...tagRow, name: 'Evening' });
  assert.equal(
    (await publicPhotoFeed(pub, { tags: [night] })).photos[0]!.tags!.find((t) => t.id === night)!.name,
    'Evening',
  );
  const nowTag = (await adminTags(db)).find((t) => t.id === night)!;
  await assert.rejects(saveTag(db, user, { ...nowTag, remove: true }), /引用/);
  await saveTag(db, user, { ...nowTag, active: false });
  assert.equal((await publicPhotoFeed(pub, { tags: [night] })).total, 1);
  for (const id of [a, b]) await setAlbumAvailability(db, user, id, { ...(await state(id)).v, action: 'offline' });
  const hidden = await publicPhotoFeed(pub, { tags: [night] });
  assert.equal(hidden.total, 0);
  assert.ok(!hidden.availableTags.some((t) => t.id === night));
  await assert.rejects(sql`SELECT * FROM gallery.photo_tag`.execute(pub), /permission denied/);
  await owner.query('UPDATE public.asset SET "deletedAt"=now() WHERE id=$1', [assets[0]]);
  await setAlbumAvailability(db, user, a, { ...(await state(a)).v, action: 'restore' });
  assert.equal((await publicPhotoFeed(pub, { tags: [night] })).total, 0);
}
