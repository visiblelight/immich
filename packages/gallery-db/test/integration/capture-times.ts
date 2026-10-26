import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { sql, type Kysely } from 'kysely';
import { adminCaptureTimes, importCaptureEvidence, reviewCaptureTimes } from '../../src/capture.server.ts';
import { publicCatalog, publicPhotoFeed, visitedSnapshot } from '../../src/index.server.ts';
export async function captureTimes(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  assets: string[],
  albumSlug: string,
) {
  const user = { id: userId, email: 'gallery@example.invalid', displayName: 'Gallery' },
    id = assets[0]!,
    sony = assets[1]!;
  for (const asset of assets)
    await owner.query('INSERT INTO gallery.photo(immich_asset_id) VALUES($1) ON CONFLICT DO NOTHING', [
      asset,
    ]);
  await owner.query('UPDATE public.asset SET "fileCreatedAt"=$2,"localDateTime"=$3 WHERE id=$1', [
    id,
    '2017-01-31T23:00:00Z',
    '2017-02-01T01:00:00Z',
  ]);
  await owner.query(
    'UPDATE public.asset_exif SET latitude=30.329895,longitude=35.438018,"timeZone"=$2 WHERE "assetId"=$1',
    [id, 'Asia/Amman'],
  );
  const snapshot = async () =>
    JSON.stringify(
      (
        await owner.query(
          'SELECT to_jsonb(a) AS asset,to_jsonb(e) AS exif FROM public.asset a JOIN public.asset_exif e ON e."assetId"=a.id WHERE a.id=ANY($1::uuid[]) ORDER BY a.id',
          [assets],
        )
      ).rows,
    );
  const before = await snapshot();
  const sources = (
    await sql<{
      asset_id: string;
      source_signature: string;
    }>`SELECT asset_id,source_signature FROM gallery.capture_source_asset WHERE asset_id=ANY(${assets}::uuid[])`.execute(
      db,
    )
  ).rows;
  const base = {
    clock: '2017-02-01T01:00:00.000Z',
    explicitOffset: null,
    dateSource: 'original:DateTimeOriginal',
    destinationZone: 'Asia/Amman',
    gpsUtc: '2017-01-31T17:00:45.000Z',
    gpsStatus: 'A',
    gpsPositionValid: true,
    gpsPositionMatches: true,
  };
  const report = {
    schemaVersion: 1,
    photos: [
      {
        assetId: id,
        sourceSignature: sources.find((s) => s.asset_id === id)!.source_signature,
        evidence: base,
      },
      {
        assetId: sony,
        sourceSignature: sources.find((s) => s.asset_id === sony)!.source_signature,
        evidence: {
          ...base,
          clock: '2026-07-27T18:19:28.822Z',
          explicitOffset: 480,
          destinationZone: 'Asia/Tbilisi',
          gpsUtc: null,
          gpsPositionValid: false,
          gpsPositionMatches: false,
        },
      },
    ],
  };
  assert.equal((await importCaptureEvidence(db, report)).imported, 2);
  assert.equal((await importCaptureEvidence(db, report)).unchanged, 2);
  const selection = async (asset = id) => {
    const p = (await adminCaptureTimes(db)).photos.find((p) => p.asset_id === asset)!;
    return {
      assetId: asset,
      version: p.version,
      correctionVersion: p.correction_version,
      sourceSignature: p.source_signature,
    };
  };
  const input = { mode: 'suggestion', items: [await selection()] };
  const proposed = await reviewCaptureTimes(db, user, input);
  assert.equal(proposed.preview[0]!.after, '2017-01-31T19:00:00.000Z');
  assert.equal(proposed.preview[0]!.dateChanged, true);
  assert.equal(
    (await adminCaptureTimes(db)).photos.find((p) => p.asset_id === id)!.capture_status,
    'suggested',
  );
  const visit = randomUUID();
  await owner.query(
    'INSERT INTO gallery.visit_override(id,country_code,start_local_date,end_local_date,label) VALUES($1,$2,$3,$3,$4)',
    [visit, 'JO', '2017-02-01', '人工行程'],
  );
  await owner.query(
    'INSERT INTO gallery.visit_override_asset(override_id,asset_id,country_code) VALUES($1,$2,$3)',
    [visit, id, 'JO'],
  );
  await assert.rejects(
    reviewCaptureTimes(
      db,
      user,
      { ...input, items: [...input.items, { ...(await selection(sony)), version: '0' }] },
      true,
    ),
    /变化/,
  );
  assert.equal(
    (await adminCaptureTimes(db)).photos.find((p) => p.asset_id === id)!.capture_status,
    'suggested',
  );
  await reviewCaptureTimes(db, user, input, true);
  await assert.rejects(reviewCaptureTimes(db, user, input, true), /变化/);
  const visible = (await publicCatalog(pub, albumSlug)).active!;
  const fixed = visible.photos.find((p) => p.captureStatus === 'confirmed')!;
  assert.equal(fixed.localTakenAt, '2017-01-31T19:00:00.000Z');
  assert.equal(fixed.takenAt, '2017-01-31T17:00:00.000Z');
  assert.equal(
    visible.photos.find((p) => p.captureStatus === 'verified')!.localTakenAt,
    '2026-07-27T14:19:28.822Z',
  );
  const feed = await publicPhotoFeed(pub, { month: '2017-01' });
  assert.ok(feed.photos.some((p) => p.id === fixed.id));
  assert.ok(!(await publicPhotoFeed(pub, { month: '2017-02' })).photos.some(p => p.id === fixed.id));
  const manual = (await visitedSnapshot(pub)).visits.find((v) => v.id === visit)!;
  assert.equal(manual.start, '2017-02-01');
  assert.equal(manual.label, '人工行程');
  assert.equal(await snapshot(), before, 'Gallery corrections must not write Immich rows');
  await reviewCaptureTimes(db, user, { mode: 'disable', items: [await selection()] }, true);
  assert.equal(
    (await publicCatalog(pub, albumSlug)).active!.photos.find((p) => p.id === fixed.id)!.localTakenAt,
    '2017-02-01T01:00:00.000Z',
  );
  await reviewCaptureTimes(
    db,
    user,
    { mode: 'manual', sourceZone: 'UTC+08:00', items: [await selection()] },
    true,
  );
  await owner.query('UPDATE public.asset_exif SET longitude=35.44 WHERE "assetId"=$1', [id]);
  assert.equal((await adminCaptureTimes(db)).photos.find((p) => p.asset_id === id)!.capture_status, 'stale');
  await assert.rejects(
    reviewCaptureTimes(
      db,
      user,
      { mode: 'manual', sourceZone: 'UTC+08:00', items: [await selection()] },
      true,
    ),
    /最新/,
  );
  assert.equal((await importCaptureEvidence(db, report)).stale, 1);
  await assert.rejects(sql`SELECT * FROM gallery.capture_evidence`.execute(pub));
  await owner.query('UPDATE public.asset SET "isOffline"=true WHERE id=$1', [id]);
  assert.ok(!(await adminCaptureTimes(db)).photos.some((p) => p.asset_id === id));
  assert.ok(!(await publicCatalog(pub, albumSlug)).active!.photos.some((p) => p.id === fixed.id));
}
