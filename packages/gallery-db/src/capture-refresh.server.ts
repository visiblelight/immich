import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, uuid, type GalleryUser } from '@gallery/core';

export type CaptureJob = { assetId: string; token: string };
export async function requestCaptureRefresh(db: Kysely<unknown>, user: GalleryUser, input: Record<string, unknown>) {
  ensure(user?.id, '请先登录。', 401);
  const raw = input.assets;
  ensure(Array.isArray(raw) && raw.length > 0 && raw.length <= 100, '请选择 1–100 张照片。');
  const assets = [...new Set(raw.map(uuid))];
  return db.transaction().execute(async trx => {
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    const allowed = (await sql`SELECT s.asset_id FROM gallery.capture_source_asset s JOIN gallery.photo p ON p.immich_asset_id=s.asset_id WHERE s.asset_id=ANY(${assets}::uuid[])`.execute(trx)).rows;
    ensure(allowed.length === assets.length, '照片已不在当前允许来源中，请刷新页面。', 404);
    for (const id of assets) {
      await sql`INSERT INTO gallery.capture_refresh(asset_id,token,state,requested_by) VALUES(${id}::uuid,${randomUUID()}::uuid,'queued',${user.id}::uuid)
      ON CONFLICT(asset_id) DO UPDATE SET token=excluded.token,state='queued',requested_by=excluded.requested_by,requested_at=now(),started_at=NULL,finished_at=NULL,error=NULL
      WHERE gallery.capture_refresh.state IN ('completed','failed') OR
        (gallery.capture_refresh.state='queued' AND gallery.capture_refresh.requested_at<now()-interval '2 minutes') OR
        (gallery.capture_refresh.state='reading' AND gallery.capture_refresh.started_at<now()-interval '15 minutes')`.execute(trx);
    }
    return { requested: assets.length };
  });
}

/** Operator CLI only: short leases prevent a stopped worker from locking the interface forever. */
export async function claimCaptureRefresh(db: Kysely<unknown>): Promise<CaptureJob[]> {
  return db.transaction().execute(async trx => {
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    await sql`UPDATE gallery.capture_refresh SET state='failed',finished_at=now(),error='读取未完成，请重新读取。'
      WHERE state='reading' AND started_at<now()-interval '15 minutes'`.execute(trx);
    await sql`UPDATE gallery.capture_refresh r SET state='failed',finished_at=now(),error='照片已不在当前允许来源中。'
      WHERE state='queued' AND NOT EXISTS(SELECT 1 FROM gallery.capture_source_asset s JOIN gallery.photo p ON p.immich_asset_id=s.asset_id WHERE s.asset_id=r.asset_id)`.execute(trx);
    return (await sql<CaptureJob>`WITH pending AS (
      SELECT asset_id FROM gallery.capture_refresh WHERE state='queued' ORDER BY requested_at,asset_id LIMIT 100 FOR UPDATE SKIP LOCKED
    ) UPDATE gallery.capture_refresh r SET state='reading',started_at=now(),error=NULL FROM pending p
      WHERE r.asset_id=p.asset_id RETURNING r.asset_id AS "assetId",r.token`.execute(trx)).rows;
  });
}

/** Only completes the claimed generation; an old result cannot overwrite a retry. */
export async function finishCaptureRefresh(db: Kysely<unknown>, jobs: CaptureJob[], accepted: Set<string>, error: string) {
  ensure(jobs.length <= 100, '读取任务过多。');
  for (const job of jobs) {
    const id = uuid(job.assetId), token = uuid(job.token), success = accepted.has(id);
    await sql`UPDATE gallery.capture_refresh SET state=${success ? 'completed' : 'failed'},finished_at=now(),error=${success ? null : error}
      WHERE asset_id=${id}::uuid AND token=${token}::uuid AND state='reading'`.execute(db);
  }
}
