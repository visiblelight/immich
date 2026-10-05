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
  photoLibrary,
  editPhotoLibrary,
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
  const a = await createAlbum(db, user, {
    title: 'Shared A',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
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
  const b = await createAlbum(db, user, {
    title: 'Shared B',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
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
  assert.equal((await publicPhotoFeed(pub, { tags: [night] })).total, 0);
  assert.ok(!(await publicPhotoFeed(pub)).availableTags.some((t) => t.id === night));
  assert.ok(
    !(await publicCatalog(pub, sb.a.draft.slug)).active!.photos[0]!.tags!.some((t) => t.id === night),
  );
  assert.ok((await publicPhotoFeed(pub, { tags: [night] })).unavailableTags.includes(night));
  await saveTag(db, user, { ...(await adminTags(db)).find((t) => t.id === night)!, active: true });
  assert.equal((await publicPhotoFeed(pub, { tags: [night] })).total, 1);
  // The global library deduplicates shared assets and keeps bulk edits atomic.
  const list = () => photoLibrary(db, new URLSearchParams({ album: a }));
  let library = await list();
  assert.equal(library.total, assets.length);
  assert.equal(library.photos.find((p) => p.asset === assets[0])!.albums.length, 2);
  const keep = { mode: 'keep' };
  const batch = (photos: typeof library.photos, publish = false) => ({
    photos: photos.map((p) => ({ asset: p.asset, version: p.version })),
    title: keep,
    description: keep,
    tags: keep,
    publish,
  });
  const originalTitle = (await publicCatalog(pub, sb.a.draft.slug)).active!.photos[0]!.title;
  const beforeBatch = structuredClone(library.photos);
  await editPhotoLibrary(
    db,
    user,
    {
      ...batch(library.photos),
      title: { mode: 'replace', value: 'Batch title' },
      tags: { mode: 'add', value: [tag] },
    },
    root,
  );
  assert.equal((await state(b)).a.draft.photos[0]!.title, 'Batch title');
  assert.equal((await publicCatalog(pub, sb.a.draft.slug)).active!.photos[0]!.title, originalTitle);
  library = await list();
  assert.ok(library.photos.every((p) => p.tags.includes(tag)));
  const mixed = library.photos.map((p, i) =>
    i === 1 ? beforeBatch.find((old) => old.asset === p.asset)! : p,
  );
  await assert.rejects(
    editPhotoLibrary(
      db,
      user,
      { ...batch(mixed), title: { mode: 'replace', value: 'Should roll back' } },
      root,
    ),
    /更新/,
  );
  assert.ok((await list()).photos.every((p) => p.title === 'Batch title'));
  const openAlbum = await state(b);
  await editPhotoLibrary(db, user, batch(library.photos, true), root);
  assert.equal((await publicCatalog(pub, sb.a.draft.slug)).active!.photos[0]!.title, 'Batch title');
  assert.notEqual((await publicCatalog(pub, sb.a.draft.slug)).active!.markdown, 'Private album B journey');
  await assert.rejects(saveAlbum(db, user, b, { ...openAlbum.v, content: openAlbum.a.draft }), /窗口|更新/);
  library = await list();
  await assert.rejects(
    editPhotoLibrary(db, user, batch([library.photos[0]!, library.photos[0]!]), root),
    /选择/,
  );
  await editPhotoLibrary(
    db,
    user,
    { ...batch(library.photos), title: { mode: 'clear' }, tags: { mode: 'remove', value: [tag] } },
    root,
  );
  assert.ok((await list()).photos.every((p) => p.title === '' && !p.tags.includes(tag)));

  // A folder-only parent may choose a draft descendant cover, but its media is
  // only public once that descendant is published through the same ancestry.
  const parent = await createAlbum(db, user, {
    title: 'Cover parent',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const child = await createAlbum(db, user, {
    title: 'Cover child',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  let childState = await state(child);
  childState.a.draft.parent = parent;
  childState.a.draft.photos = [{ ...(await state(a)).a.draft.photos[0]!, id: randomUUID() }];
  await saveAlbum(db, user, child, { ...childState.v, content: childState.a.draft });
  const parentState = await state(parent);
  parentState.a.draft.cover = assets[0]!;
  await saveAlbum(db, user, parent, { ...parentState.v, content: parentState.a.draft });
  await publishAlbum(db, user, parent, (await state(parent)).v, root);
  const unpublishedChild = (await publicCatalog(pub, parentState.a.draft.slug)).active!;
  assert.equal(unpublishedChild.cover, null);
  assert.equal(unpublishedChild.totalCount, 0);
  assert.equal(unpublishedChild.childCount, 0);
  assert.equal(unpublishedChild.takenAt, null);
  await publishAlbum(db, user, child, (await state(child)).v, root);
  const publishedTree = await publicCatalog(pub, parentState.a.draft.slug);
  assert.ok(publishedTree.active!.cover);
  assert.equal(publishedTree.active!.totalCount, 1);
  assert.equal(publishedTree.active!.count, 0);
  assert.equal(publishedTree.active!.childCount, 1);
  assert.equal(publishedTree.active!.takenAt, publishedTree.albums.find((a) => a.id === child)!.takenAt);
  assert.equal(publishedTree.active!.updatedAt, publishedTree.albums.find((a) => a.id === child)!.updatedAt);
  const originalUpdate = publishedTree.active!.updatedAt;
  childState = await state(child);
  childState.a.draft.title = 'Unpublished child rename';
  await saveAlbum(db, user, child, { ...childState.v, content: childState.a.draft });
  assert.equal((await publicCatalog(pub, parentState.a.draft.slug)).active!.updatedAt, originalUpdate);
  // The same photo in a grandchild remains one photo in the ancestor total.
  const grandchild = await createAlbum(db, user, {
    title: 'Nested duplicate',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const grandchildState = await state(grandchild);
  grandchildState.a.draft.parent = child;
  grandchildState.a.draft.photos = [{ ...childState.a.draft.photos[0]!, id: randomUUID() }];
  await saveAlbum(db, user, grandchild, { ...grandchildState.v, content: grandchildState.a.draft });
  await publishAlbum(db, user, grandchild, (await state(grandchild)).v, root);
  assert.equal((await publicCatalog(pub, parentState.a.draft.slug)).active!.totalCount, 1);
  const unrelated = await createAlbum(db, user, {
    title: 'Unrelated cover',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const unrelatedState = await state(unrelated);
  unrelatedState.a.draft.cover = assets[0]!;
  await assert.rejects(
    saveAlbum(db, user, unrelated, { ...unrelatedState.v, content: unrelatedState.a.draft }),
    /封面/,
  );
  await setAlbumAvailability(db, user, child, { ...(await state(child)).v, action: 'offline' });
  const offlineBranch = (await publicCatalog(pub, parentState.a.draft.slug)).active!;
  assert.equal(offlineBranch.cover, null);
  assert.equal(offlineBranch.totalCount, 0);
  assert.equal(offlineBranch.childCount, 0);
  assert.equal(offlineBranch.takenAt, null);
  for (const id of [a, b])
    await setAlbumAvailability(db, user, id, { ...(await state(id)).v, action: 'offline' });
  const hidden = await publicPhotoFeed(pub, { tags: [night] });
  assert.equal(hidden.total, 0);
  assert.ok(!hidden.availableTags.some((t) => t.id === night));
  await assert.rejects(sql`SELECT * FROM gallery.photo_tag`.execute(pub), /permission denied/);
  await owner.query('UPDATE public.asset SET "deletedAt"=now() WHERE id=$1', [assets[0]]);
  await setAlbumAvailability(db, user, a, { ...(await state(a)).v, action: 'restore' });
  const restoredCatalog = await publicCatalog(pub, (await state(a)).a.draft.slug);
  assert.ok(restoredCatalog.active!.photos.length > 0);
  assert.ok(
    restoredCatalog.active!.photos.every(
      (photo) =>
        photo.occurrences?.length === 1 && photo.occurrences[0]!.albumSlug === restoredCatalog.active!.slug,
    ),
  );
  assert.equal((await publicPhotoFeed(pub, { tags: [night] })).total, 0);
}
