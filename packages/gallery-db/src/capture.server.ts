import { createHash, randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, uuid, type GalleryUser } from '@gallery/core';
import {
  analyzeCapture,
  correctedCapture,
  validClock,
  type CaptureEvidence,
  type CaptureResult,
} from '../../gallery-core/src/capture-evidence.ts';

function validateEvidence(raw: unknown): CaptureEvidence {
  ensure(raw && typeof raw === 'object' && !Array.isArray(raw), '时间证据格式无效。');
  const e = raw as CaptureEvidence;
  ensure(e.clock === null || validClock(e.clock), '拍摄时间无效。');
  ensure(
    e.explicitOffset === null ||
      (Number.isInteger(e.explicitOffset) && e.explicitOffset >= -720 && e.explicitOffset <= 840),
    '拍摄偏移无效。',
  );
  ensure(typeof e.dateSource === 'string' && e.dateSource.length <= 100, '日期来源无效。');
  ensure(
    e.destinationZone === null || (typeof e.destinationZone === 'string' && e.destinationZone.length <= 80),
    '地点时区无效。',
  );
  if (e.destinationZone) new Intl.DateTimeFormat('en', { timeZone: e.destinationZone }).format(0);
  ensure(e.gpsUtc === null || validClock(e.gpsUtc), 'GPS 时间无效。');
  ensure(
    e.gpsStatus === null || (typeof e.gpsStatus === 'string' && e.gpsStatus.length <= 50),
    'GPS 状态无效。',
  );
  ensure(
    typeof e.gpsPositionValid === 'boolean' && typeof e.gpsPositionMatches === 'boolean',
    'GPS 证据无效。',
  );
  return {
    clock: e.clock,
    explicitOffset: e.explicitOffset,
    dateSource: e.dateSource,
    destinationZone: e.destinationZone,
    gpsUtc: e.gpsUtc,
    gpsStatus: e.gpsStatus,
    gpsPositionValid: e.gpsPositionValid,
    gpsPositionMatches: e.gpsPositionMatches,
  };
}
/** Maintenance import only, no HTTP endpoint. Uses the regular admin role and never reads Immich tables. */
export async function importCaptureEvidence(db: Kysely<unknown>, report: unknown) {
  const r = report as {
    schemaVersion: number;
    photos: { assetId: string; sourceSignature: string; evidence: unknown }[];
  };
  ensure(r?.schemaVersion === 1 && Array.isArray(r.photos) && r.photos.length <= 100000, '证据文件无效。');
  const result = { imported: 0, unchanged: 0, stale: 0 };
  await db.transaction().execute(async (trx) => {
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    for (const item of r.photos) {
      const id = uuid(item.assetId),
        evidence = validateEvidence(item.evidence);
      const current = (
        await sql<{
          source_signature: string;
        }>`SELECT s.source_signature FROM gallery.capture_source_asset s JOIN gallery.photo p ON p.immich_asset_id=s.asset_id WHERE s.asset_id=${id}::uuid`.execute(
          trx,
        )
      ).rows[0];
      if (!current || current.source_signature !== item.sourceSignature) {
        result.stale++;
        continue;
      }
      const fingerprint = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
      const old = (
        await sql<{
          fingerprint: string;
          source_signature: string;
        }>`SELECT fingerprint,source_signature FROM gallery.capture_evidence WHERE asset_id=${id}::uuid`.execute(
          trx,
        )
      ).rows[0];
      if (old?.fingerprint === fingerprint && old.source_signature === current.source_signature) {
        result.unchanged++;
        continue;
      }
      const analysis = analyzeCapture(evidence);
      await sql`INSERT INTO gallery.capture_evidence(asset_id,source_signature,fingerprint,evidence,analysis) VALUES(${id}::uuid,${current.source_signature},${fingerprint},${JSON.stringify(evidence)}::jsonb,${JSON.stringify(analysis)}::jsonb)
      ON CONFLICT(asset_id) DO UPDATE SET source_signature=excluded.source_signature,fingerprint=excluded.fingerprint,evidence=excluded.evidence,analysis=excluded.analysis,version=gallery.capture_evidence.version+1,collected_at=now()`.execute(
        trx,
      );
      await sql`INSERT INTO gallery.audit_event(id,action,target_type,target_id,details) VALUES(${randomUUID()}::uuid,'capture.collect','photo',${id},${JSON.stringify({ fingerprint, previous: old?.fingerprint ?? null, status: analysis.status })}::jsonb)`.execute(
        trx,
      );
      result.imported++;
    }
  });
  return result;
}
export async function adminCaptureTimes(db: Kysely<unknown>) {
  const rows = (
    await sql<{
      asset_id: string;
      filename: string;
      model: string | null;
      source_signature: string;
      taken_at: Date | null;
      local_taken_at: Date | null;
      time_zone: string | null;
      effective_taken_at: Date | null;
      effective_local_at: Date | null;
      effective_zone: string | null;
      capture_status: string;
      evidence: CaptureEvidence | null;
      analysis: CaptureResult | null;
      fingerprint: string | null;
      version: string | null;
      correction_version: string | null;
      mode: string | null;
      collected_at: Date | null;
      album_slug: string | null;
      photo_id: string | null;
      manual_visits: number;
    }>`SELECT r.asset_id,r.filename,r.model,r.source_signature,r.taken_at,r.local_taken_at,r.time_zone,s.taken_at AS effective_taken_at,s.local_taken_at AS effective_local_at,s.time_zone AS effective_zone,s.capture_status,
    e.evidence,e.analysis,e.fingerprint,e.version::text,c.version::text AS correction_version,c.mode,e.collected_at,
    link.album_slug,link.photo_id,((SELECT count(*) FROM gallery.visit_override_asset v WHERE v.asset_id=r.asset_id)+(SELECT count(*) FROM gallery.region_visit_override_asset v WHERE v.asset_id=r.asset_id))::int AS manual_visits
    FROM gallery.capture_source_asset r JOIN gallery.photo p ON p.immich_asset_id=r.asset_id JOIN gallery.admin_source_asset s ON s.asset_id=r.asset_id
    LEFT JOIN gallery.capture_evidence e ON e.asset_id=r.asset_id LEFT JOIN gallery.capture_correction c ON c.asset_id=r.asset_id
    LEFT JOIN LATERAL(SELECT album_slug,photo_id FROM gallery.published_photo WHERE asset_id=r.asset_id ORDER BY album_id LIMIT 1) link ON true
    ORDER BY r.local_taken_at DESC NULLS LAST,r.asset_id`.execute(db)
  ).rows;
  return {
    photos: rows.map((r) => ({
      ...r,
      taken_at: r.taken_at?.toISOString() ?? null,
      local_taken_at: r.local_taken_at?.toISOString() ?? null,
      effective_taken_at: r.effective_taken_at?.toISOString() ?? null,
      effective_local_at: r.effective_local_at?.toISOString() ?? null,
      collected_at: r.collected_at?.toISOString() ?? null,
      version: r.version ?? '0',
      correction_version: r.correction_version ?? '0',
    })),
  };
}
export async function reviewCaptureTimes(
  db: Kysely<unknown>,
  user: GalleryUser,
  input: Record<string, unknown>,
  apply = false,
) {
  ensure(user?.id, '请先登录。', 401);
  const items = input.items as {
    assetId: string;
    version: string;
    correctionVersion: string;
    sourceSignature: string;
  }[];
  ensure(Array.isArray(items) && items.length > 0 && items.length <= 100, '请选择 1–100 张照片。');
  ensure(new Set(items.map((i) => i.assetId)).size === items.length, '不能重复选择照片。');
  const mode = input.mode === 'disable' ? 'disable' : input.mode === 'suggestion' ? 'suggestion' : 'manual';
  const sourceZone = typeof input.sourceZone === 'string' ? input.sourceZone.trim() : '';
  ensure(mode !== 'manual' || (sourceZone.length > 0 && sourceZone.length <= 80), '请填写相机采用的时区。');
  return db.transaction().execute(async (trx) => {
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    const current = await adminCaptureTimes(trx),
      preview = [];
    for (const item of items) {
      const id = uuid(item.assetId),
        row = current.photos.find((p) => p.asset_id === id);
      ensure(row, '照片已不在当前允许来源中。', 404);
      ensure(
        row.version === item.version &&
          row.correction_version === item.correctionVersion &&
          row.source_signature === item.sourceSignature,
        '照片或时间证据已变化，请刷新后重新核对。',
        409,
      );
      ensure(
        row.evidence && row.fingerprint && row.capture_status !== 'stale',
        '请先采集最新时间证据。',
        409,
      );
      const zone = mode === 'suggestion' ? row.analysis?.sourceZone : sourceZone;
      ensure(mode !== 'suggestion' || row.analysis?.status === 'suggested', '这张照片没有可以确认的建议。');
      ensure(mode === 'disable' || zone, '缺少可确认的相机时区。');
      let resolved: ReturnType<typeof correctedCapture> | null = null;
      try {
        resolved = mode === 'disable' ? null : correctedCapture(row.evidence, zone!);
      } catch (e) {
        ensure(false, e instanceof RangeError ? '时区无效，请填写 UTC+08:00 或 Asia/Shanghai 这样的时区。' : e instanceof Error ? e.message : '时区无效。');
      }
      const after = resolved?.localTakenAt ?? row.local_taken_at,
        afterInstant = resolved?.takenAt ?? row.taken_at;
      preview.push({
        assetId: id,
        filename: row.filename,
        before: row.effective_local_at,
        after,
        timeZone: resolved ? resolved.timeZone : row.time_zone,
        sourceZone: mode === 'disable' ? null : (zone ?? null),
        secondsChanged:
          afterInstant && row.effective_taken_at
            ? (Date.parse(afterInstant) - Date.parse(row.effective_taken_at)) / 1000
            : 0,
        dateChanged: row.effective_local_at?.slice(0, 10) !== after?.slice(0, 10),
        manualVisits: row.manual_visits,
      });
      if (apply) {
        await sql`INSERT INTO gallery.capture_correction(asset_id,source_signature,evidence_fingerprint,mode,source_zone,resolved,updated_by)
          VALUES(${id}::uuid,${row.source_signature},${row.fingerprint},${mode === 'disable' ? 'disabled' : 'confirmed'},${mode === 'disable' ? null : zone!},${resolved ? JSON.stringify(resolved) : null}::jsonb,${user.id}::uuid)
          ON CONFLICT(asset_id) DO UPDATE SET source_signature=excluded.source_signature,evidence_fingerprint=excluded.evidence_fingerprint,mode=excluded.mode,source_zone=excluded.source_zone,resolved=excluded.resolved,version=gallery.capture_correction.version+1,updated_by=excluded.updated_by,updated_at=now()`.execute(
          trx,
        );
        await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id,details) VALUES(${randomUUID()}::uuid,${user.id}::uuid,${mode === 'disable' ? 'capture.disable' : 'capture.confirm'},'photo',${id},${JSON.stringify({ before: { takenAt: row.effective_taken_at, localTakenAt: row.effective_local_at, timeZone: row.effective_zone }, after: resolved, sourceZone: zone, evidence: row.fingerprint })}::jsonb)`.execute(
          trx,
        );
      }
    }
    return { preview, applied: apply };
  });
}
