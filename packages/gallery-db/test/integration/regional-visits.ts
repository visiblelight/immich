import assert from 'node:assert/strict';
import type pg from 'pg';
import { sql, type Kysely } from 'kysely';
import {
  publicRegionalVisited, regionOverview, regionPhotos, adminVisited, publicVisited,
  saveVisit, deleteVisit, publicPhotoFeed, readPublishedDerivative,
} from '../../src/index.server.ts';

type FixtureAlbum = { id: string; release: string; photos: string[] };
export async function regionalVisits(
  db: Kysely<unknown>, pub: Kysely<unknown>, owner: pg.Client, userId: string,
  assets: string[],
  album: (slug: string, parent: string | null, mode: string, assets: string[]) => Promise<FixtureAlbum>,
) {
  const user = { id: userId, email: 'gallery@example.invalid', displayName: 'Gallery' };
  const before = await publicRegionalVisited(pub, 'CN');
  for (const [index, asset] of assets.entries()) {
    const jiangxi = index === 1;
    await owner.query('UPDATE public.asset_exif SET latitude=$2,longitude=$3,city=NULL,state=NULL,"timeZone"=$4 WHERE "assetId"=$1',
      [asset, jiangxi ? 28.6829 : 24.5, jiangxi ? 115.8582 : 118.12, index === 3 ? null : 'Asia/Shanghai']);
    const date = `2080-01-${String(index + 1).padStart(2, '0')}T04:00:00Z`;
    await owner.query('UPDATE public.asset SET "fileCreatedAt"=$2,"localDateTime"=$2 WHERE id=$1', [asset, date]);
  }
  const parent = await album('regional-parent', null, 'exact', []);
  const exact = await album('regional-exact', parent.id, 'exact', assets.slice(0, 4));
  const duplicate = await album('regional-duplicate', null, 'exact', [assets[0]!]);
  const approximate = await album('regional-approximate', null, 'approximate', [assets[4]!]);
  const hidden = await album('regional-hidden', null, 'hidden', [assets[5]!]);
  const draft = await album('regional-unpublished', null, 'exact', [assets[6]!]);
  await sql`UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=${draft.id}::uuid`.execute(db);
  let summary = await publicRegionalVisited(pub, 'CN');
  assert.equal(summary.nationalCount - before.nationalCount, 5, 'known-country eligible assets deduplicate across albums');
  assert.equal(summary.restricted - before.restricted, 1, 'approximate stays only national');
  assert.equal(summary.regions.reduce((n, r) => n + r.count, 0) + summary.unassignedProvince + summary.restricted, summary.nationalCount);
  assert.equal(summary.regions.find((r) => r.id === 'CN-FJ')!.count - (before.regions.find((r) => r.id === 'CN-FJ')?.count ?? 0), 3);
  const fj = await adminVisited(db, 'CN', 'CN-FJ');
  const fixturePhotoIds = new Set([...exact.photos, ...duplicate.photos]);
  const fixtureFj = fj.photos.filter((p) => fixturePhotoIds.has(p.id));
  assert.equal(fixtureFj.length, 3);
  assert.equal(fj.records.filter((r) => r.photoIds.some((p) => fixturePhotoIds.has(p))).length, 3,
    'Fujian -> Jiangxi -> Fujian separates visits; undated stays separate');
  const national = await adminVisited(db, 'CN');
  assert.equal(national.records.filter((r) => r.photoIds.some((p) => fixturePhotoIds.has(p))).length, 2,
    'within-country travel does not split the country visit, undated remains separate');
  const chosen = national.photos.filter((p) => fixturePhotoIds.has(p.id));
  const countryId = await saveVisit(db, user, { country: 'CN', photoIds: chosen.map((p) => p.id), start: '2080-01-01', end: '2080-01-31', label: 'Country untouched' });
  const provinceId = await saveVisit(db, user, { country: 'CN', region: 'CN-FJ', photoIds: fixtureFj.map((p) => p.id), start: '2080-01-01', end: '2080-01-04', label: 'Regional independent' });
  assert.equal((await adminVisited(db, 'CN')).records.find((v) => v.id === countryId)?.label, 'Country untouched');
  assert.equal((await regionOverview(pub, 'CN-FJ', provinceId)).region.visits.find((v) => v.id === provinceId)?.count, 3);
  await assert.rejects(regionPhotos(pub, 'CN-FJ', { scope: 'country', visitId: provinceId }), /省级到访/);
  await assert.rejects(regionPhotos(pub, 'CN-FJ', { cluster: '1:1' }), /地图范围/);
  await assert.rejects(regionOverview(pub, 'CN-XX'), /地区不存在/);
  const provincePhotos = await regionPhotos(pub, 'CN-FJ');
  assert.equal(provincePhotos.photos.filter((p) => fixturePhotoIds.has(p.id)).length, 3);
  const countryPhotos = await regionPhotos(pub, 'CN-FJ', { scope: 'country' });
  assert.equal(countryPhotos.photos.filter((p) => fixturePhotoIds.has(p.id)).length, 4);
  assert.ok(countryPhotos.photos.some((p) => p.id === approximate.photos[0]));
  assert.ok(!provincePhotos.photos.some((p) => p.id === approximate.photos[0]));
  assert.ok(!JSON.stringify({ summary, provincePhotos }).includes(assets[0]!), 'public DTO never leaks source Asset IDs');
  const placeFeed = await publicPhotoFeed(pub, { filters: { place: 'region:CN-FJ' } });
  assert.equal(placeFeed.photos.filter((p) => fixturePhotoIds.has(p.id)).length, 3, 'place filter and region map agree');
  await assert.rejects(sql`UPDATE gallery.region_visit_override SET label='unsafe'`.execute(pub));
  await assert.rejects(sql`SELECT latitude FROM public.asset_exif`.execute(pub));
  // Moving GPS invalidates only province membership; national record remains intact.
  await owner.query('UPDATE public.asset_exif SET latitude=28.6829,longitude=115.8582 WHERE "assetId"=$1', [assets[0]]);
  const moved = await adminVisited(db, 'CN', 'CN-FJ');
  const reduced = moved.records.find((v) => v.id === provinceId)!;
  assert.equal(reduced.count, 2);
  assert.equal(reduced.label, '');
  assert.equal(reduced.needsReview, true);
  assert.equal((await adminVisited(db, 'CN')).records.find((v) => v.id === countryId)?.count, 4);
  assert.ok((await publicVisited(pub)).countries.find((c) => c.id === 'CN')?.visits.some((v) => v.id === countryId && v.label === 'Country untouched'));
  await assert.rejects(saveVisit(db, user, { country: 'CN', region: 'CN-FJ', photoIds: fixtureFj.map((p) => p.id), start: null, end: null }), /位置已变化/);
  await owner.query('UPDATE public.asset_exif SET latitude=28.6829,longitude=115.8582 WHERE "assetId"=ANY($1::uuid[])', [assets.slice(2, 4)]);
  const empty = await adminVisited(db, 'CN', 'CN-FJ');
  assert.ok(!empty.records.some((v) => v.id === provinceId));
  assert.ok(empty.stale.some((v) => v.id === provinceId && v.version === 1));
  assert.ok(!JSON.stringify(empty.stale).includes(assets[0]!), 'fully stale record exposes no private evidence');
  await assert.rejects(regionOverview(pub, 'CN-FJ', provinceId), /已变化|暂无/);
  await owner.query('UPDATE public.asset_exif SET latitude=24.5,longitude=118.12 WHERE "assetId"=ANY($1::uuid[])', [assets.slice(2, 4)]);
  // Country/region deletion cannot cross the independent tables.
  await assert.rejects(deleteVisit(db, user, { id: countryId, version: 1, region: 'CN-FJ' }), /记录已变化/);
  await deleteVisit(db, user, { id: provinceId, version: 1, region: 'CN-FJ' });
  assert.ok((await adminVisited(db, 'CN')).records.some((v) => v.id === countryId));
  // The more restrictive occurrence wins before province classification.
  const stricter = await album('regional-more-restrictive', null, 'approximate', [assets[2]!]);
  assert.ok(!(await regionPhotos(pub, 'CN-FJ')).photos.some((p) => p.id === exact.photos[2]));
  await sql`UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=${stricter.id}::uuid`.execute(db);
  const hiddenDuplicate = await album('regional-hidden-duplicate', null, 'hidden', [assets[2]!]);
  const hiddenIds = new Set([exact.photos[2]!, ...hiddenDuplicate.photos]);
  for (const scope of ['region', 'country', 'all'] as const)
    assert.ok(!(await regionPhotos(pub, 'CN-FJ', { scope })).photos.some((p) => hiddenIds.has(p.id)),
      `hidden occurrence wins for region map ${scope}`);
  for (const place of ['country:CN', 'region:CN-FJ'])
    assert.ok(!(await publicPhotoFeed(pub, { filters: { place } })).photos.some((p) => hiddenIds.has(p.id)),
      `hidden occurrence wins for photo filter ${place}`);
  await sql`UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=${hiddenDuplicate.id}::uuid`.execute(db);
  assert.ok((await regionPhotos(pub, 'CN-FJ')).photos.some((p) => p.id === exact.photos[2]), 'removing restrictive occurrence restores eligible exact evidence');
  // Source-scope revocation removes all of its region evidence immediately.
  const sourceOwner = (await owner.query('SELECT "ownerId" FROM public.asset WHERE id=$1', [assets[0]])).rows[0].ownerId;
  await owner.query('UPDATE gallery.immich_source_owner SET enabled=false WHERE immich_owner_id=$1', [sourceOwner]);
  assert.ok(!(await regionPhotos(pub, 'CN-FJ')).photos.some((p) => fixturePhotoIds.has(p.id)));
  await owner.query('UPDATE gallery.immich_source_owner SET enabled=true WHERE immich_owner_id=$1', [sourceOwner]);
  await saveVisit(db, user, { country: 'CN', region: 'CN-FJ', photoIds: [exact.photos[3]!], start: null, end: null, label: 'Regional backup proof' });
  // Unpublished ancestry, deleted source and missing derivatives revoke evidence.
  await sql`UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=${parent.id}::uuid`.execute(db);
  assert.ok(!(await regionPhotos(pub, 'CN-FJ')).photos.some((p) => p.albumId === exact.id));
  await owner.query('UPDATE public.asset SET "deletedAt"=now() WHERE id=$1', [assets[0]]);
  assert.ok(!(await regionPhotos(pub, 'CN-JX')).photos.some((p) => p.albumId === duplicate.id));
  await owner.query('UPDATE public.asset SET "deletedAt"=NULL WHERE id=$1', [assets[0]]);
  await owner.query('UPDATE public.asset_file SET path=$2 WHERE "assetId"=$1 AND type=\'preview\'', [assets[0], '/outside/private.jpg']);
  await assert.rejects(readPublishedDerivative(pub, duplicate.id, duplicate.photos[0]!, 'preview', { sourceRoot: '/data/thumbs', mountedRoot: '/unmounted-test-only' }), /Media unavailable/);
  await owner.query('DELETE FROM public.asset_file WHERE \"assetId\"=$1 AND type=\'preview\'', [assets[0]]);
  assert.ok(!(await regionPhotos(pub, 'CN-JX')).photos.some((p) => p.albumId === duplicate.id));
  await deleteVisit(db, user, { id: countryId, version: 1 });
  await sql`UPDATE gallery.album SET status='offline',offline_at=now() WHERE id IN (${sql.join([duplicate.id, approximate.id, hidden.id].map((id) => sql`${id}::uuid`))})`.execute(db);
}
