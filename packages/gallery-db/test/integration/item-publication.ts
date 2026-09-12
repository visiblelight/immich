import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type pg from 'pg';
import type { Kysely } from 'kysely';
import {
  adminState,
  createAlbum,
  saveAlbum as rawSaveAlbum,
  saveAlbumItem as rawSaveAlbumItem,
  publishAlbum,
  publicCatalog,
  publicPhotoFeed,
  setAlbumAvailability,
} from '../../src/index.server.ts';

export async function itemPublication(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  assets: string[],
  mediaRoot: string,
) {
  const user = { id: userId, email: 'gallery@example.invalid', displayName: 'Gallery' };
  const root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#718659' } })
    .jpeg()
    .toBuffer();
  for (const asset of assets)
    for (const variant of ['preview', 'thumbnail'])
      await writeFile(path.join(mediaRoot, `${asset}-${variant}.jpg`), bytes);
  const state = async (id: string) => {
    const s = await adminState(db),
      a = s.albums.find((a) => a.id === id)!;
    return { a, versions: { version: a.version, draftVersion: a.draftVersion, treeVersion: s.site.treeVersion } };
  };
  const id = await createAlbum(db, user, {
    title: 'Partial publication',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const c = (await state(id)).a.draft;
  c.markdown = 'Public journey';
  c.photos = assets.slice(0, 3).map((asset, i) => ({
    id: randomUUID(),
    asset,
    title: `Photo ${i}`,
    description: 'Original',
    alt: '',
    location: 'inherit',
  }));
  await saveAlbum(db, user, id, { ...(await state(id)).versions, content: c });
  await assert.rejects(
    saveAlbumItem(
      db,
      user,
      id,
      { ...(await state(id)).versions, content: c, target: c.photos[0]!.id, publish: true },
      root,
    ),
    /先发布/,
  );
  await publishAlbum(db, user, id, (await state(id)).versions, root);
  const candidate = structuredClone(c);
  candidate.markdown = 'Unpublished journey';
  candidate.photos[0]!.description = 'Published target';
  candidate.photos[1]!.description = 'Other private edit';
  candidate.photos.reverse();
  candidate.photos.push({ ...candidate.photos[0]!, id: randomUUID(), asset: assets[3]!, description: 'New selection' });
  await saveAlbum(db, user, id, { ...(await state(id)).versions, content: candidate });
  const stale = (await state(id)).versions;
  await saveAlbumItem(db, user, id, { ...stale, content: candidate, target: c.photos[0]!.id, publish: true }, root);
  const current = (await publicCatalog(pub, c.slug)).active!;
  assert.equal(current.markdown, 'Public journey');
  assert.deepEqual(
    current.photos.map((p) => p.id),
    c.photos.map((p) => p.id),
  );
  assert.deepEqual(
    current.photos.map((p) => p.description),
    ['Published target', 'Original', 'Original'],
  );
  assert.equal((await state(id)).a.hasUnpublishedChanges, true);
  await assert.rejects(
    saveAlbumItem(db, user, id, { ...stale, content: candidate, target: c.photos[0]!.id, publish: true }, root),
    /已被|已更新/,
  );
  // Grouping a newly added photo with a published one updates only that membership.
  const group = randomUUID();
  candidate.photos.find((p) => p.id === c.photos[0]!.id)!.group = group;
  candidate.photos.at(-1)!.group = group;
  candidate.groups = [
    { id: group, title: 'Shared work', description: 'Only group story', cover: candidate.photos.at(-1)!.id },
  ];
  await saveAlbumItem(
    db,
    user,
    id,
    { ...(await state(id)).versions, content: candidate, target: group, publish: true },
    root,
  );
  const grouped = (await publicCatalog(pub, c.slug)).active!;
  assert.equal(grouped.photos.length, 4);
  assert.equal(grouped.photos.filter((p) => p.group?.id === group).length, 2);
  assert.equal(grouped.photos.find((p) => p.id === c.photos[1]!.id)!.description, 'Original');
  // Missing source rolls back the draft save AND release pointer.
  const before = await state(id);
  await owner.query('UPDATE public.asset SET "deletedAt"=now() WHERE id=$1', [assets[3]]);
  candidate.groups[0]!.description = 'Must roll back';
  await assert.rejects(
    saveAlbumItem(db, user, id, { ...before.versions, content: candidate, target: group, publish: true }, root),
  );
  assert.deepEqual((await state(id)).a, before.a);
  await owner.query('UPDATE public.asset SET "deletedAt"=NULL WHERE id=$1', [assets[3]]);
  await writeFile(path.join(mediaRoot, `${assets[3]}-preview.jpg`), 'invalid derivative');
  const beforeMediaFailure = await state(id);
  await assert.rejects(
    saveAlbumItem(
      db,
      user,
      id,
      { ...beforeMediaFailure.versions, content: candidate, target: group, publish: true },
      root,
    ),
    /预览不可用/,
  );
  assert.deepEqual((await state(id)).a, beforeMediaFailure.a);
  await writeFile(path.join(mediaRoot, `${assets[3]}-preview.jpg`), bytes);
  candidate.groups = [];
  candidate.photos.forEach((p) => {
    p.group = '';
  });
  await saveAlbumItem(
    db,
    user,
    id,
    { ...(await state(id)).versions, content: candidate, target: group, publish: true },
    root,
  );
  assert.ok((await publicCatalog(pub, c.slug)).active!.photos.every((p) => !p.group));
  await setAlbumAvailability(db, user, id, { ...(await state(id)).versions, action: 'offline' });
  const offline = await state(id);
  await assert.rejects(
    saveAlbumItem(
      db,
      user,
      id,
      { ...offline.versions, content: candidate, target: c.photos[0]!.id, publish: true },
      root,
    ),
    /先发布/,
  );
  assert.deepEqual((await state(id)).a, offline.a);
  await setAlbumAvailability(db, user, id, { ...(await state(id)).versions, action: 'restore' });
  await publishAlbum(db, user, id, (await state(id)).versions, root);
  assert.equal((await state(id)).a.hasUnpublishedChanges, false);
  // Crossing UTC month boundaries uses local month; changing GPS never changes clock.
  await owner.query('UPDATE public.asset SET "fileCreatedAt"=$2,"localDateTime"=$3 WHERE id=$1', [
    assets[0],
    '2032-03-31T20:15:00Z',
    '2032-04-01T00:15:00Z',
  ]);
  await owner.query('UPDATE public.asset_exif SET "timeZone"=$2 WHERE "assetId"=$1', [assets[0], 'Asia/Tbilisi']);
  const local = (await publicPhotoFeed(pub, { month: '2032-04' })).photos.find((p) => p.id === c.photos[0]!.id)!;
  assert.equal(local.localTakenAt, '2032-04-01T00:15:00.000Z');
  assert.equal(local.timeZone, 'Asia/Tbilisi');
  await owner.query('UPDATE public.asset_exif SET latitude=41.64,longitude=41.64 WHERE "assetId"=$1', [assets[0]]);
  assert.equal(
    (await publicPhotoFeed(pub, { month: '2032-04' })).photos.find((p) => p.id === c.photos[0]!.id)!.localTakenAt,
    local.localTakenAt,
  );
  const parent = await createAlbum(db, user, {
    title: 'Publication parent',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  await publishAlbum(db, user, parent, (await state(parent)).versions, root);
  const child = (await state(id)).a.draft;
  child.parent = parent;
  await saveAlbum(db, user, id, { ...(await state(id)).versions, content: child });
  await publishAlbum(db, user, id, (await state(id)).versions, root);
  await setAlbumAvailability(db, user, parent, { ...(await state(parent)).versions, action: 'offline' });
  child.photos[0]!.description = 'Can save while ancestor is offline';
  await assert.rejects(
    saveAlbumItem(
      db,
      user,
      id,
      { ...(await state(id)).versions, content: child, target: child.photos[0]!.id, publish: true },
      root,
    ),
    /先发布/,
  );
  await saveAlbumItem(
    db,
    user,
    id,
    { ...(await state(id)).versions, content: child, target: child.photos[0]!.id, publish: false },
    root,
  );
  assert.equal((await state(id)).a.visible, false);
  assert.equal((await state(id)).a.draft.photos[0]!.description, child.photos[0]!.description);
  await setAlbumAvailability(db, user, parent, { ...(await state(parent)).versions, action: 'restore' });
}

// Test client follows the UI: retain edited content, refresh shared optimistic versions after save.
async function saveAlbum(...args: Parameters<typeof rawSaveAlbum>) {
  await rawSaveAlbum(...args);
  const current = (await adminState(args[0])).albums.find((a) => a.id === args[2])!;
  const input = args[3].content as import('@gallery/core').AlbumContent;
  for (const p of input.photos) p.photoVersion = current.draft.photos.find((x) => x.id === p.id)?.photoVersion;
}

async function saveAlbumItem(...args: Parameters<typeof rawSaveAlbumItem>) {
  await rawSaveAlbumItem(...args);
  const current = (await adminState(args[0])).albums.find((a) => a.id === args[2])!;
  const input = args[3].content as import('@gallery/core').AlbumContent;
  for (const p of input.photos) p.photoVersion = current.draft.photos.find((x) => x.id === p.id)?.photoVersion;
}
