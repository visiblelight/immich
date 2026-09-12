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
  saveAlbum,
  publishAlbum,
  publicCatalog,
  publicPhotoFeed,
  draftCatalog,
  setAlbumAvailability,
} from '../../src/index.server.ts';

export async function photoGroups(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  assets: string[],
  mediaRoot: string,
) {
  const user = { id: userId, email: 'gallery@example.invalid', displayName: 'Gallery' };
  const root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const bytes = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#69795a' } })
    .jpeg()
    .toBuffer();
  for (const asset of assets) {
    for (const variant of ['preview', 'thumbnail'])
      await writeFile(path.join(mediaRoot, `${asset}-${variant}.jpg`), bytes);
    await owner.query('UPDATE public.asset SET "fileCreatedAt"=$2,"localDateTime"=$2 WHERE id=$1', [
      asset,
      '2030-04-15T10:00:00Z',
    ]);
  }
  const versions = async (id: string) => {
    const s = await adminState(db),
      a = s.albums.find((a) => a.id === id)!;
    return { version: a.version, draftVersion: a.draftVersion, treeVersion: s.site.treeVersion };
  };
  const id = await createAlbum(db, user, {
    title: 'Group timeline',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const content = (await adminState(db)).albums.find((a) => a.id === id)!.draft;
  content.markdown = '## Journey\n\nShared **Markdown** story';
  content.location = 'hidden';
  const groupId = randomUUID();
  content.photos = assets.map((asset) => ({
    id: randomUUID(),
    asset,
    title: 'Angle',
    description: 'Individual words',
    alt: 'Church from one side',
    location: 'inherit',
    group: groupId,
  }));
  content.groups = [
    { id: groupId, title: 'Church', description: '**Group description**', cover: content.photos[1]!.id },
  ];
  await saveAlbum(db, user, id, { ...(await versions(id)), content });
  const added = (
    await owner.query('SELECT first_added_at FROM gallery.asset_entry WHERE immich_asset_id=$1', [assets[0]])
  ).rows[0].first_added_at.toISOString();
  const created = (
    await owner.query('SELECT created_at FROM gallery.album_photo WHERE id=$1', [content.photos[0]!.id])
  ).rows[0].created_at.toISOString();
  assert.equal((await draftCatalog(db, id)).active.groups?.[0]?.description, '**Group description**');
  await publishAlbum(db, user, id, await versions(id), root);
  const original = await publicCatalog(pub, content.slug);
  assert.equal(original.active?.markdown, content.markdown);
  assert.equal(original.active?.photos[0]?.group?.title, 'Church');
  const copy = structuredClone(content);
  copy.markdown = 'Unpublished';
  copy.groups![0]!.description = 'Unpublished group';
  copy.photos.reverse();
  await saveAlbum(db, user, id, { ...(await versions(id)), content: copy });
  assert.equal((await publicCatalog(pub, content.slug)).active?.photos[0]?.group?.description, '**Group description**');
  assert.equal(
    (
      await owner.query('SELECT first_added_at FROM gallery.asset_entry WHERE immich_asset_id=$1', [assets[0]])
    ).rows[0].first_added_at.toISOString(),
    added,
  );
  assert.equal(
    (
      await owner.query('SELECT created_at FROM gallery.album_photo WHERE id=$1', [content.photos[0]!.id])
    ).rows[0].created_at.toISOString(),
    created,
  );
  await publishAlbum(db, user, id, await versions(id), root);
  assert.equal((await publicCatalog(pub, content.slug)).active?.photos[0]?.id, copy.photos[0]!.id);
  const duplicate = await createAlbum(db, user, {
    title: 'Other occurrence',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const other = (await adminState(db)).albums.find((a) => a.id === duplicate)!.draft;
  other.photos = [{ ...content.photos[0]!, id: randomUUID(), group: '', description: 'Other context' }];
  other.location = 'exact';
  await saveAlbum(db, user, duplicate, { ...(await versions(duplicate)), content: other });
  await publishAlbum(db, user, duplicate, await versions(duplicate), root);
  const feed = await publicPhotoFeed(pub, { month: '2030-04' });
  assert.equal(feed.total, 2);
  assert.equal(feed.photos.length, 2);
  assert.equal(feed.photos.find((p) => p.id === content.photos[0]!.id)?.occurrences?.length, 2);
  assert.ok(feed.photos.every((p) => p.latitude === null));
  assert.ok((await publicPhotoFeed(pub, { sort: 'added' })).photos.some((p) => p.addedAt === added));
  await setAlbumAvailability(db, user, id, { ...(await versions(id)), action: 'offline' });
  const fallback = await publicPhotoFeed(pub, { month: '2030-04' });
  assert.equal(fallback.total, 1);
  assert.equal(fallback.photos[0]?.description, 'Other context');
  assert.equal(fallback.photos[0]?.occurrences?.length, 1);
  assert.equal(fallback.photos[0]?.group, undefined);
  await owner.query('UPDATE public.asset SET "deletedAt"=now() WHERE id=$1', [assets[0]]);
  assert.equal((await publicPhotoFeed(pub, { month: '2030-04' })).total, 0);
  await owner.query('UPDATE public.asset SET "deletedAt"=NULL WHERE id=$1', [assets[0]]);
  await setAlbumAvailability(db, user, id, { ...(await versions(id)), action: 'restore' });
  // Removing and re-adding does not reset the global arrival timestamp.
  other.photos = [];
  await saveAlbum(db, user, duplicate, { ...(await versions(duplicate)), content: other });
  other.photos = [{ ...content.photos[0]!, id: randomUUID(), group: '' }];
  await saveAlbum(db, user, duplicate, { ...(await versions(duplicate)), content: other });
  assert.equal(
    (
      await owner.query('SELECT first_added_at FROM gallery.asset_entry WHERE immich_asset_id=$1', [assets[0]])
    ).rows[0].first_added_at.toISOString(),
    added,
  );
}
