import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type pg from 'pg';
import type { Kysely } from 'kysely';
import {
  adminState,
  changePassword,
  createAlbum,
  deleteDraftAlbum,
  hashPassword,
  login,
  logout,
  picker,
  publicCatalog,
  publishAlbum,
  saveAlbum as rawSaveAlbum,
  sessionUser,
  tokenHash,
  setAlbumAvailability,
  sanitizeImage,
  readPublishedDerivative,
} from '../../src/index.server.ts';
import type { AlbumContent, GalleryUser } from '@gallery/core';

export async function workflow(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  actorId: string,
  asset: string,
  outsider: string,
  mediaRoot: string,
) {
  const root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const validImage = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#40674e' } })
    .jpeg()
    .toBuffer();
  await writeFile(path.join(mediaRoot, `${asset}-preview.jpg`), validImage);
  await writeFile(path.join(mediaRoot, `${asset}-thumbnail.jpg`), validImage);
  const user: GalleryUser = { id: actorId, email: 'gallery@example.invalid', displayName: 'Gallery' };
  const password = 'synthetic-gallery-password-2026';
  await owner.query('INSERT INTO gallery.user_credential(user_id,password_hash) VALUES($1,$2)', [
    actorId,
    await hashPassword(password),
  ]);
  const session = await login(db, user.email, password, 'synthetic-client');
  const days = (date: Date) => (date.getTime() - Date.now()) / 86_400_000;
  assert.ok(days(session.expires) > 179 && days(session.expires) <= 180);
  let renewed: Date | undefined;
  assert.equal(
    (
      await sessionUser(db, session.token, (expires) => {
        renewed = expires;
      })
    )?.id,
    actorId,
  );
  assert.equal(renewed, undefined, 'fresh sessions do not rewrite cookies on every request');
  await owner.query("UPDATE gallery.session SET expires_at=now()+interval '8 hours' WHERE token_hash=$1", [
    tokenHash(session.token),
  ]);
  assert.equal(
    (
      await sessionUser(db, session.token, (expires) => {
        renewed = expires;
      })
    )?.id,
    actorId,
  );
  assert.ok(renewed && days(renewed) > 179, 'existing short sessions renew while still valid');
  await owner.query(
    "UPDATE gallery.session SET created_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [tokenHash(session.token)],
  );
  assert.equal(await sessionUser(db, session.token, () => assert.fail('expired session renewed')), null);
  await owner.query("UPDATE gallery.session SET expires_at=now()+interval '180 days' WHERE token_hash=$1", [
    tokenHash(session.token),
  ]);
  await assert.rejects(login(db, user.email, 'incorrect', 'synthetic-client'), /账号或密码/);
  const initial = await adminState(db);
  const parent = await createAlbum(db, user, { title: 'Workflow parent', treeVersion: initial.site.treeVersion });
  const versions = async (id: string) => {
    const current = await adminState(db);
    const a = current.albums.find((a) => a.id === id)!;
    return { id, version: a.version, draftVersion: a.draftVersion, treeVersion: current.site.treeVersion };
  };
  assert.equal((await adminState(db)).albums.find((a) => a.id === parent)!.draft.location, 'exact');
  const child = await createAlbum(db, user, {
    title: 'Workflow child',
    parent,
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  await assert.rejects(publishAlbum(db, user, child, await versions(child), root), /父相册/);
  await publishAlbum(db, user, parent, await versions(parent), root);
  const content = JSON.parse(
    JSON.stringify((await adminState(db)).albums.find((a) => a.id === child)!.draft),
  ) as AlbumContent;
  const photoId = randomUUID();
  content.photos = [
    {
      id: photoId,
      asset,
      title: 'Published caption',
      description: 'Gallery own words',
      alt: 'Synthetic image',
      location: 'inherit',
    },
  ];
  content.cover = asset;
  content.location = 'exact';
  content.showExif = true;
  content.markdown = 'First published story';
  const expected = await versions(child);
  await saveAlbum(db, user, child, { ...expected, content });
  await assert.rejects(saveAlbum(db, user, child, { ...expected, content }), /另一个窗口/);
  const conflicting = await versions(child);
  const parallel = await Promise.allSettled([
    saveAlbum(db, user, child, { ...conflicting, content: { ...content, title: 'Concurrent A' } }),
    saveAlbum(db, user, child, { ...conflicting, content: { ...content, title: 'Concurrent B' } }),
  ]);
  assert.equal(parallel.filter((r) => r.status === 'fulfilled').length, 1);
  await saveAlbum(db, user, child, { ...(await versions(child)), content });
  await writeFile(path.join(mediaRoot, `${asset}-preview.jpg`), 'broken image');
  const beforeFailure = await versions(child);
  await assert.rejects(publishAlbum(db, user, child, beforeFailure, root), /预览图/);
  assert.deepEqual(await versions(child), beforeFailure);
  await writeFile(path.join(mediaRoot, `${asset}-preview.jpg`), validImage);
  await publishAlbum(db, user, child, await versions(child), root);
  await assert.rejects(deleteDraftAlbum(db, user, child, await versions(child)), /已发布/);
  const disposable = await createAlbum(db, user, {
    title: 'Disposable draft',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const nested = await createAlbum(db, user, {
    title: 'Nested draft',
    parent: disposable,
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  await assert.rejects(deleteDraftAlbum(db, user, disposable, await versions(disposable)), /子相册/);
  await deleteDraftAlbum(db, user, nested, await versions(nested));
  await deleteDraftAlbum(db, user, disposable, await versions(disposable));
  assert.ok(!(await adminState(db)).albums.some((a) => a.id === disposable || a.id === nested));
  const slug = content.slug;
  assert.equal((await publicCatalog(pub, slug)).active?.photos[0]?.title, 'Published caption');
  const newContent = JSON.parse(JSON.stringify(content)) as AlbumContent;
  newContent.photos[0]!.title = 'Draft caption';
  newContent.markdown = '## Draft heading';
  await saveAlbum(db, user, child, { ...(await versions(child)), content: newContent });
  assert.equal((await publicCatalog(pub, slug)).active?.photos[0]?.title, 'Published caption');
  await owner.query('UPDATE public.asset_exif SET latitude=41.6168,longitude=41.6367 WHERE "assetId"=$1', [asset]);
  assert.equal((await publicCatalog(pub, slug)).active?.photos[0]?.longitude, 41.6367);
  const illegal = { ...newContent, photos: [{ ...newContent.photos[0]!, asset: outsider }], cover: outsider };
  await assert.rejects(saveAlbum(db, user, child, { ...(await versions(child)), content: illegal }), /授权范围/);
  await assert.rejects(
    saveAlbum(db, user, child, {
      ...(await versions(child)),
      content: { ...newContent, blocks: [{ kind: 'image', src: 'https://invalid.test/private.jpg' }] },
    }),
    /不允许图片/,
  );
  await assert.rejects(
    saveAlbum(db, user, child, {
      ...(await versions(child)),
      content: { ...newContent, slug: 'changed-after-publish' },
    }),
    /不能修改访问地址/,
  );
  const parentDraft = (await adminState(db)).albums.find((a) => a.id === parent)!.draft;
  await assert.rejects(
    saveAlbum(db, user, parent, { ...(await versions(parent)), content: { ...parentDraft, parent: child } }),
    /循环/,
  );
  await setAlbumAvailability(db, user, parent, { ...(await versions(parent)), action: 'offline' });
  await assert.rejects(publicCatalog(pub, slug), /尚未公开/);
  await assert.rejects(
    readPublishedDerivative(pub, child, photoId, 'preview', { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot }),
  );
  await setAlbumAvailability(db, user, child, { ...(await versions(child)), action: 'offline' });
  await setAlbumAvailability(db, user, parent, { ...(await versions(parent)), action: 'restore' });
  await assert.rejects(publicCatalog(pub, slug), /尚未公开/);
  await setAlbumAvailability(db, user, child, { ...(await versions(child)), action: 'restore' });
  assert.equal((await publicCatalog(pub, slug)).active?.photos[0]?.title, 'Published caption');
  await publishAlbum(db, user, child, await versions(child), root);
  assert.equal((await publicCatalog(pub, slug)).active?.photos[0]?.title, 'Draft caption');
  const fixture = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#40674e' } })
    .withMetadata({ exif: { IFD0: { Artist: 'private-metadata', Copyright: 'test-secret' } } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(fixture).metadata()).exif);
  const output = await sanitizeImage(fixture, 'thumbnail');
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 800);
  assert.deepEqual(metadata.icc, (await sharp(fixture).metadata()).icc);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);
  await writeFile(path.join(mediaRoot, `${asset}-preview.jpg`), fixture);
  await writeFile(path.join(mediaRoot, `${asset}-thumbnail.jpg`), fixture);
  const image = await readPublishedDerivative(pub, child, photoId, 'preview', {
    sourceRoot: '/data/thumbs',
    mountedRoot: mediaRoot,
  });
  assert.ok((await sanitizeImage(image.bytes, 'preview')).length > 0);
  const page = await picker(db, new URLSearchParams({ search: 'sample.raw' }));
  assert.ok(page.assets.some((a) => a.id === asset));
  assert.ok(!JSON.stringify(page).includes('/data/thumbs'));
  await logout(db, session.token);
  assert.equal(await sessionUser(db, session.token), null);
  const second = await login(db, user.email, password, 'synthetic-second');
  await changePassword(db, user, password, 'replacement-synthetic-password');
  assert.equal(await sessionUser(db, second.token), null);
  const third = await login(db, user.email, 'replacement-synthetic-password', 'synthetic-third');
  await owner.query('UPDATE gallery."user" SET status=\'disabled\' WHERE id=$1', [actorId]);
  assert.equal(await sessionUser(db, third.token), null);
  await owner.query('UPDATE gallery."user" SET status=\'active\' WHERE id=$1', [actorId]);
}

// Test client follows the UI: retain edited content, refresh shared optimistic versions after save.
async function saveAlbum(...args: Parameters<typeof rawSaveAlbum>) {
  await rawSaveAlbum(...args);
  const current = (await adminState(args[0])).albums.find((a) => a.id === args[2])!;
  const input = args[3].content as import('@gallery/core').AlbumContent;
  for (const p of input.photos) p.photoVersion = current.draft.photos.find((x) => x.id === p.id)?.photoVersion;
}
