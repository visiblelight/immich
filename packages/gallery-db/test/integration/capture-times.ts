import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { sql, type Kysely } from 'kysely';
import { adminCaptureTimes, importCaptureEvidence, reviewCaptureTimes } from '../../src/capture.server.ts';
import { requestCaptureRefresh, claimCaptureRefresh, finishCaptureRefresh } from '../../src/capture-refresh.server.ts';
import { publicCatalog, publicPhotoFeed, visitedSnapshot } from '../../src/index.server.ts';
import {captureTime, evidenceDate} from '@gallery/core';
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
  const automatic = (await publicCatalog(pub, albumSlug)).active!.photos.find(p=>p.localTakenAt==='2017-01-31T19:00:00.000Z');
  assert.equal(automatic?.captureStatus,'verified','GPS result is visible without a manual confirmation');
  const input = { mode: 'manual', sourceZone:'UTC+08:00', items: [await selection()] };
  const proposed = await reviewCaptureTimes(db, user, input);
  assert.equal(proposed.preview[0]!.after, '2017-01-31T19:00:00.000Z');
  assert.equal(proposed.preview[0]!.dateChanged, false);
  assert.equal(
    (await adminCaptureTimes(db)).photos.find((p) => p.asset_id === id)!.capture_status,
    'verified',
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
    'verified',
  );
  await reviewCaptureTimes(db, user, input, true);
  // A changed analysis policy must re-evaluate old evidence without invalidating manual decisions.
  await owner.query(`UPDATE gallery.capture_evidence SET analysis=jsonb_set(analysis,'{status}','"suggested"') WHERE asset_id=$1`,[id]);
  assert.equal((await importCaptureEvidence(db,report)).imported,1);
  assert.equal((await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!.capture_status,'confirmed');
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
  await owner.query(`UPDATE gallery.capture_evidence SET analysis=jsonb_set(analysis,'{status}','"suggested"') WHERE asset_id=$1`,[id]);
  assert.equal((await importCaptureEvidence(db,report)).imported,1);
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
  const queue = async()=> (await sql<{token:string;state:string}>`SELECT token,state FROM gallery.capture_refresh WHERE asset_id=${id}::uuid`.execute(db)).rows[0]!;
  await assert.rejects(requestCaptureRefresh(db,user,{assets:[id,randomUUID()]}),/来源/);
  assert.equal((await sql`SELECT * FROM gallery.capture_refresh`.execute(db)).rows.length,0);
  await requestCaptureRefresh(db,user,{assets:[id]});
  const queued=await queue();
  await requestCaptureRefresh(db,user,{assets:[id]});
  assert.equal((await queue()).token,queued.token,'double clicks share a request');
  const jobs=await claimCaptureRefresh(db);
  assert.equal(jobs.length,1);
  assert.equal((await claimCaptureRefresh(db)).length,0,'only one worker claims a request');
  await importCaptureEvidence(db,report,jobs);
  assert.equal((await queue()).state,'failed','a changed source cannot finish with old evidence');
  await requestCaptureRefresh(db,user,{assets:[id]});
  const retry=await claimCaptureRefresh(db);
  await finishCaptureRefresh(db,jobs,new Set([id]),'failure');
  assert.equal((await queue()).state,'reading','late completion cannot overwrite a retry');
  const fresh=await selection();
  const refreshedReport={...report,photos:[{...report.photos[0]!,sourceSignature:fresh.sourceSignature}]};
  await importCaptureEvidence(db,refreshedReport,retry);
  assert.equal((await queue()).state,'completed');
  assert.equal((await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!.capture_status,'verified');
  // Adding a location does not invent a GPS timestamp; after rereading, manual correction is available.
  await requestCaptureRefresh(db,user,{assets:[id]});
  await importCaptureEvidence(db,{...refreshedReport,photos:[{...refreshedReport.photos[0]!,evidence:{...base,gpsUtc:null,gpsStatus:'Measurement Void',gpsPositionValid:false,gpsPositionMatches:false}}]},await claimCaptureRefresh(db));
  assert.equal((await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!.capture_status,'unknown');
  await reviewCaptureTimes(db,user,{mode:'manual',sourceZone:'UTC+08:00',items:[await selection()]},true);
  assert.equal((await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!.capture_status,'confirmed');
  // Failed reads keep the last evidence, and old jobs cannot replace it even when source fields match.
  const goodVersion=(await selection()).version;
  await importCaptureEvidence(db,{...refreshedReport,photos:[{...refreshedReport.photos[0]!,evidence:{...base,clock:'2017-02-02T01:00:00.000Z'}}]},jobs);
  assert.equal((await selection()).version,goodVersion);
  await requestCaptureRefresh(db,user,{assets:[id]});
  const failedJobs=await claimCaptureRefresh(db);
  await importCaptureEvidence(db,{schemaVersion:1,photos:[],errors:[{assetId:id}]},failedJobs);
  assert.equal((await queue()).state,'failed');
  assert.equal((await selection()).version,goodVersion);
  await assert.rejects(sql`SELECT * FROM gallery.capture_refresh`.execute(pub));
  await requestCaptureRefresh(db,user,{assets:[id]});
  await claimCaptureRefresh(db);
  await owner.query("UPDATE gallery.capture_refresh SET started_at=now()-interval '16 minutes' WHERE asset_id=$1",[id]);
  assert.equal((await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!.refresh_expired,true);
  await requestCaptureRefresh(db,user,{assets:[id]});
  assert.equal((await queue()).state,'queued','an expired worker does not block retry');
  await assert.rejects(sql`SELECT * FROM gallery.capture_evidence`.execute(pub));
  // A location hint may be offered with invalid GPS, but only an explicit manual choice may use it.
  const protectedBefore=await snapshot();
  const invalidFixReport={...refreshedReport,photos:[{...refreshedReport.photos[0]!,evidence:{...base,destinationZone:null,gpsStatus:'Measurement Void'}}]};
  await importCaptureEvidence(db,invalidFixReport);
  const candidate=(await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!;
  assert.equal(candidate.destination_candidate,'Asia/Amman');
  assert.equal(candidate.evidence!.destinationZone,null);
  assert.equal(candidate.capture_status,'unknown');
  const cameraOnly={mode:'manual',sourceZone:'UTC+08:00',items:[{...await selection(),destinationZone:null}]};
  const cameraPreview=await reviewCaptureTimes(db,user,cameraOnly);
  assert.equal(cameraPreview.preview[0]!.afterCaption,'相机时间 · UTC+08:00');
  assert.equal(cameraPreview.preview[0]!.destinationPending,true);
  assert.equal((await selection()).correctionVersion,candidate.correction_version,'preview must not write a correction');
  await reviewCaptureTimes(db,user,cameraOnly,true);
  const cameraPhoto=(await publicCatalog(pub,albumSlug)).active!.photos.find(p=>p.id===fixed.id)!;
  assert.equal(cameraPhoto.takenAt,'2017-01-31T17:00:00.000Z');
  assert.equal(cameraPhoto.timeZone,null);
  assert.match(captureTime(cameraPhoto).value,/UTC\+08:00.*待确认/);
  assert.equal(evidenceDate({...cameraPhoto,country:'JO',takenAt:cameraPhoto.takenAt??null,localTakenAt:cameraPhoto.localTakenAt??null,timeZone:cameraPhoto.timeZone??null}),null);
  const destinationInput={mode:'manual',sourceZone:'UTC+08:00',items:[{...await selection(),destinationZone:'Asia/Jerusalem'}]};
  await assert.rejects(reviewCaptureTimes(db,user,{...destinationInput,items:[...destinationInput.items,{...await selection(sony),destinationZone:'invalid-zone'}]},true),/拍摄地点时区无效/);
  assert.equal((await selection()).correctionVersion,destinationInput.items[0]!.correctionVersion,'bad batch must roll back valid earlier items');
  await reviewCaptureTimes(db,user,destinationInput,true);
  const localPhoto=(await publicCatalog(pub,albumSlug)).active!.photos.find(p=>p.id===fixed.id)!;
  assert.equal(localPhoto.localTakenAt,'2017-01-31T19:00:00.000Z');
  assert.equal(localPhoto.timeZone,'Asia/Jerusalem');
  assert.equal(captureTime(localPhoto).label,'当地拍摄时间');
  const saved=(await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!;
  assert.equal(saved.fingerprint,candidate.fingerprint,'manual destination must not change evidence fingerprints');
  assert.equal(saved.confirmed_source_zone,'UTC+08:00');
  await importCaptureEvidence(db,invalidFixReport);
  assert.equal((await adminCaptureTimes(db)).photos.find(p=>p.asset_id===id)!.effective_zone,'Asia/Jerusalem','rereading identical evidence preserves the manual destination');
  assert.equal((await visitedSnapshot(pub)).visits.find(v=>v.id===visit)!.start,'2017-02-01');
  assert.equal(await snapshot(),protectedBefore,'manual destination must not edit Immich metadata');
  await reviewCaptureTimes(db,user,{mode:'disable',items:[await selection()]},true);
  assert.equal((await publicCatalog(pub,albumSlug)).active!.photos.find(p=>p.id===fixed.id)!.takenAt,'2017-01-31T23:00:00.000Z');
  await owner.query('UPDATE public.asset SET "isOffline"=true WHERE id=$1', [id]);
  await assert.rejects(requestCaptureRefresh(db,user,{assets:[id]}),/来源/);
  assert.equal((await claimCaptureRefresh(db)).length,0);
  assert.equal((await queue()).state,'failed');
  assert.ok(!(await adminCaptureTimes(db)).photos.some((p) => p.asset_id === id));
  assert.ok(!(await publicCatalog(pub, albumSlug)).active!.photos.some((p) => p.id === fixed.id));
}
