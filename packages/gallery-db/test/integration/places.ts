import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type pg from 'pg';
import { sql, type Kysely } from 'kysely';
import {
  adminState,
  createAlbum,
  saveAlbum,
  publishAlbum,
  publicPhotoFeed,
  publicVisited,
  publicCatalog,
  adminPlaces,
  savePlace,
  placeResolver,
  setAlbumAvailability,
} from '../../src/index.server.ts';
export async function placesAndFilters(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  assets: string[],
  mediaRoot: string,
) {
  const user = {
      id: userId,
      email: 'gallery@example.invalid',
      displayName: 'Gallery',
    },
    root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#70816a' },
  })
    .jpeg()
    .toBuffer();
  for (const [index, asset] of assets.entries()) {
    for (const v of ['thumbnail', 'preview'])
      await writeFile(path.join(mediaRoot, `${asset}-${v}.jpg`), bytes);
    await owner.query(
      'UPDATE public.asset_exif SET latitude=40.1903,longitude=44.5151,city=$2,state=$3,make=$4,model=$5,"lensModel"=$6,"focalLength"=$7 WHERE "assetId"=$1',
      [
        asset,
        index === 0 ? 'Yerevan' : null,
        'Yerevan',
        ' Sony ',
        index === 2 ? 'ILCE-7M3' : 'ILCE-7M4',
        ' FE 24-70mm ',
        index === 2 ? 8.72 : index === 1 ? 50 : 20,
      ],
    );
  }
  const versions = async (id: string) => {
    const s = await adminState(db),
      a = s.albums.find((a) => a.id === id)!;
    return {
      version: a.version,
      draftVersion: a.draftVersion,
      treeVersion: s.site.treeVersion,
    };
  };
  const parent = await createAlbum(db, user, {
    title: 'Search ancestor',
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  await publishAlbum(db, user, parent, await versions(parent), root);
  const album = await createAlbum(db, user, {
    title: 'Places acceptance',
    parent,
    treeVersion: (await adminState(db)).site.treeVersion,
  });
  const state = async () => {
    const s = await adminState(db),
      a = s.albums.find((a) => a.id === album)!;
    return {
      a,
      v: {
        version: a.version,
        draftVersion: a.draftVersion,
        treeVersion: s.site.treeVersion,
      },
    };
  };
  let st = await state();
  st.a.draft.showExif = true;
  st.a.draft.location = 'exact';
  st.a.draft.photos = assets.map((asset) => ({
    id: randomUUID(),
    asset,
    title: 'Place filter test',
    description: '',
    alt: '',
    location: 'inherit',
    tags: [],
  }));
  await saveAlbum(db, user, album, { ...st.v, content: st.a.draft });
  await publishAlbum(db, user, album, (await state()).v, root);
  const feed = await publicPhotoFeed(pub, {
    filters: {
      place: 'country:AM',
      cameras: ['sony ilce-7m4'],
      focalMin: 20,
      focalMax: 50,
    },
  });
  assert.equal(feed.photos.filter((p) => p.albumId === album).length, 2);
  assert.ok(
    !feed.availableCameras.some((c) => c.id === 'sony ilce-7m3'),
    'camera facet still respects focal range',
  );
  assert.ok((await publicPhotoFeed(pub)).availableCameras.some((c) => c.id === 'sony ilce-7m3'));
  assert.ok(feed.availableLenses.some((c) => c.id === 'fe 24-70mm'));
  assert.ok(feed.photos.find((p) => p.exif?.focalLength === 20)?.places?.some((p) => p.id === 'city:616052'));
  const before = await adminPlaces(db);
  const second = before.photos.find((p) => p.asset_id === assets[1])!;
  assert.equal(
    second.places.at(-1)?.id,
    'country:AM',
    'nearest populated place alone does not authorize city assignment',
  );
  await savePlace(db, user, {
    asset: assets[1],
    place: 'city:616052',
    latitude: second.latitude,
    longitude: second.longitude,
    version: '0',
  });
  assert.equal(
    (await publicPhotoFeed(pub, { filters: { place: 'city:616052' } })).photos.filter(
      (p) => p.albumId === album,
    ).length,
    2,
  );
  await savePlace(db, user, {
    id: 'city:616052',
    nameZh: '埃里温',
    nameEn: 'Yerevan',
    aliases: ['耶烈万'],
    version: '0',
  });
  assert.ok(
    (await publicCatalog(pub, (await state()).a.draft.slug)).active!.photos[0]!.places!.some(
      (p) => p.name === '埃里温',
    ),
  );
  const search = async (query: string) => (await publicCatalog(pub, undefined, query)).albumSearch.matchedIds;
  for (const query of ['places ACCEPTANCE', 'Place filter test', '亚美尼亚', 'Armenia', '埃里温', '耶烈万']) {
    const result = await search(query);
    assert.ok(result.includes(album), `public album matches ${query}`);
    assert.ok(result.includes(parent), `published ancestor matches descendant ${query}`);
  }
  st = await state();
  st.a.draft.markdown = 'Unpublished search secret';
  await saveAlbum(db, user, album, { ...st.v, content: st.a.draft });
  assert.ok(
    !(await search('Unpublished search secret')).includes(album),
    'draft descriptions are not searchable',
  );
  await assert.rejects(
    savePlace(db, user, {
      id: 'city:616052',
      nameZh: '冲突',
      aliases: [],
      version: '0',
    }),
    /已修改/,
  );
  await owner.query('UPDATE public.asset_exif SET latitude=41.7151,longitude=44.8271 WHERE "assetId"=$1', [
    assets[1],
  ]);
  assert.ok(
    !(await publicPhotoFeed(pub, { filters: { place: 'city:616052' } })).photos.some(
      (p) => p.id === st.a.draft.photos[1]!.id,
    ),
  );
  assert.ok(
    (await publicPhotoFeed(pub, { filters: { place: 'country:GE' } })).photos.some(
      (p) => p.id === st.a.draft.photos[1]!.id,
    ),
  );
  await assert.rejects(
    savePlace(db, user, {
      asset: assets[1],
      place: 'city:616052',
      latitude: 40.1903,
      longitude: 44.5151,
      version: '1',
    }),
    /位置已变化/,
  );
  // Synthetic coastal photos reproduce the cape's simplified coastline miss.
  for (const asset of assets.slice(0, 2))
    await owner.query(
      `UPDATE public.asset_exif SET latitude=38.780582,longitude=-9.501083,city='Azoia',state='Lisbon' WHERE "assetId"=$1`,
      [asset],
    );
  const coastal = (await adminPlaces(db)).photos.filter((p) => assets.slice(0, 2).includes(p.asset_id));
  assert.equal(coastal.length, 2);
  assert.ok(coastal.every((p) => p.needsReview && p.country === 'PT' && !p.places.length));
  assert.ok(coastal.every((p) => p.candidates[0]?.id === 'city:2271271' && p.candidates[0]?.corroborated));
  const batch = coastal.map((p) => ({
    asset: p.asset_id,
    latitude: p.latitude,
    longitude: p.longitude,
    version: p.version ?? '0',
  }));
  await assert.rejects(savePlace(db, user, { assets: batch, place: 'country:ES' }), /有效地点/);
  await assert.rejects(
    savePlace(db, user, {
      assets: [batch[0], { ...batch[1], version: '999' }],
      place: 'city:2271271',
    }),
    /已修改/,
  );
  assert.ok(
    (await adminPlaces(db)).photos
      .filter((p) => assets.slice(0, 2).includes(p.asset_id))
      .every((p) => p.needsReview),
    'batch conflict rolls back every photo',
  );
  await savePlace(db, user, { assets: batch, place: 'city:2271271' });
  const confirmed = (await adminPlaces(db)).photos.filter((p) => assets.slice(0, 2).includes(p.asset_id));
  assert.ok(confirmed.every((p) => !p.needsReview && p.manualConfirmed));
  assert.equal(
    (await publicPhotoFeed(pub, { filters: { place: 'country:PT' } })).photos.filter(
      (p) => p.albumId === album,
    ).length,
    2,
  );
  assert.equal(
    (await publicPhotoFeed(pub, { filters: { place: 'city:2271271' } })).photos.filter(
      (p) => p.albumId === album,
    ).length,
    2,
  );
  assert.ok((await publicVisited(pub)).countries.some((c) => c.id === 'PT' && c.count >= 2));
  await savePlace(db, user, {
    asset: confirmed[0]!.asset_id,
    latitude: confirmed[0]!.latitude,
    longitude: confirmed[0]!.longitude,
    version: confirmed[0]!.version,
    place: 'country:PT',
  });
  assert.equal(
    (await adminPlaces(db)).photos.find((p) => p.asset_id === confirmed[0]!.asset_id)!.needsReview,
    false,
    'confirmed country is not pending',
  );
  for (const [index, asset] of assets.slice(0, 2).entries())
    await owner.query(
      'UPDATE public.asset_exif SET latitude=$2,longitude=$3,city=$4,state=$5 WHERE "assetId"=$1',
      [asset, index ? 41.7151 : 40.1903, index ? 44.8271 : 44.5151, index ? null : 'Yerevan', 'Yerevan'],
    );
  assert.ok(
    !(await publicPhotoFeed(pub, { filters: { place: 'country:PT' } })).photos.some(
      (p) => p.albumId === album,
    ),
    'GPS change invalidates coastal override',
  );
  assert.ok(
    !(await publicVisited(pub)).countries.some((c) => c.id === 'PT'),
    'visited also drops stale override',
  );
  const r = await placeResolver(pub);
  assert.equal(
    r.resolve({
      asset_id: assets[0]!,
      latitude: 40.1903,
      longitude: 44.5151,
      location_mode: 'approximate',
      city: 'Yerevan',
      state: 'Yerevan',
      manual_place: 'city:616052',
    }).length,
    1,
  );
  assert.equal(
    r.resolve({
      asset_id: assets[0]!,
      latitude: null,
      longitude: null,
      location_mode: 'hidden',
      city: 'Yerevan',
      state: 'Yerevan',
      manual_place: 'city:616052',
    }).length,
    0,
  );
  assert.equal(
    r.get('city:1819729')?.country,
    'CN',
    'Hong Kong places use the same grouping as the world map',
  );
  const other = [...r.all.values()].find(
    (p) => p.kind === 'city' && p.country === 'AM' && p.id !== 'city:616052',
  )!;
  await savePlace(db, user, {
    id: other.id,
    version: '0',
    aliases: [],
    canonicalId: 'city:616052',
  });
  assert.equal((await placeResolver(pub)).get(other.id)?.id, 'city:616052');
  await assert.rejects(
    savePlace(db, user, {
      id: 'city:616052',
      version: '1',
      aliases: [],
      canonicalId: other.id,
    }),
    /循环/,
  );
  await savePlace(db, user, {
    id: other.id,
    version: '1',
    aliases: [],
    canonicalId: '',
  });
  assert.equal((await placeResolver(pub)).get(other.id)?.id, other.id);
  st = await state();
  st.a.draft.showExif = false;
  st.a.draft.photos[0]!.location = 'hidden';
  await saveAlbum(db, user, album, { ...st.v, content: st.a.draft });
  await publishAlbum(db, user, album, (await state()).v, root);
  assert.ok(
    !(await publicPhotoFeed(pub, { filters: { cameras: ['sony ilce-7m4'] } })).photos.some(
      (p) => p.albumId === album,
    ),
  );
  assert.ok(
    !(await publicPhotoFeed(pub, { filters: { place: 'city:616052' } })).photos.some(
      (p) => p.id === st.a.draft.photos[0]!.id,
    ),
  );
  st = await state();
  st.a.draft.photos[1]!.hiddenFromGallery = true;
  st.a.draft.photos[2]!.location = 'approximate';
  await saveAlbum(db, user, album, { ...st.v, content: st.a.draft });
  await publishAlbum(db, user, album, (await state()).v, root);
  assert.ok(!(await search('格鲁吉亚')).includes(album), 'article-only photos do not contribute locations');
  assert.ok(
    !(await search('耶烈万')).includes(album),
    'hidden and approximate positions do not leak city aliases',
  );
  assert.ok(
    (await search('亚美尼亚')).includes(album),
    'approximate positions remain discoverable by country',
  );
  await setAlbumAvailability(db, user, parent, {
    ...(await versions(parent)),
    action: 'offline',
  });
  assert.ok(!(await search('Places acceptance')).includes(album), 'offline ancestry excludes descendants');
  await assert.rejects(sql`SELECT * FROM gallery.photo_place`.execute(pub));
  await assert.rejects(sql`UPDATE gallery.place_label SET name_zh='unsafe'`.execute(pub));
}
