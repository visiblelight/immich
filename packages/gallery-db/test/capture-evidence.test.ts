import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCapture,
  correctedCapture,
  instantForClock,
  validClock,
  type CaptureEvidence,
} from '../../gallery-core/src/capture-evidence.ts';
import { captureTime } from '../../gallery-core/src/capture-time.ts';
import { evidenceDate } from '../../gallery-core/src/visits.ts';
const canon: CaptureEvidence = {
  clock: '2017-01-23T18:21:37.000Z',
  explicitOffset: null,
  dateSource: 'original:SubSecDateTimeOriginal',
  destinationZone: 'Asia/Amman',
  gpsUtc: '2017-01-23T10:22:22.911Z',
  gpsStatus: null,
  gpsPositionValid: true,
  gpsPositionMatches: true,
};
test('Canon GPS suggests Beijing source clock without applying or replacing exposure seconds', () => {
  const r = analyzeCapture(canon);
  assert.equal(r.status, 'suggested');
  assert.equal(r.sourceZone, 'UTC+08:00');
  assert.equal(r.localTakenAt, '2017-01-23T12:21:37.000Z');
  assert.equal(r.gpsDifferenceSeconds, -45.911);
});
test('Sony explicit camera offset with manually supplied destination is preserved', () => {
  const r = analyzeCapture({
    ...canon,
    clock: '2026-07-27T18:19:28.822Z',
    explicitOffset: 480,
    destinationZone: 'Asia/Tbilisi',
    gpsUtc: null,
    gpsPositionValid: false,
    gpsPositionMatches: false,
  });
  assert.equal(r.status, 'verified');
  assert.equal(r.takenAt, '2026-07-27T10:19:28.822Z');
  assert.equal(r.localTakenAt, '2026-07-27T14:19:28.822Z');
});
test('missing, invalid, stale and conflicting GPS evidence never silently corrects', () => {
  for (const e of [
    { gpsUtc: null },
    { gpsStatus: 'V' },
    { gpsPositionValid: false },
    { gpsPositionMatches: false },
  ])
    assert.equal(analyzeCapture({ ...canon, ...e }).status, 'unknown');
  assert.equal(analyzeCapture({ ...canon, gpsUtc: '2017-01-21T10:22:22Z' }).status, 'conflict');
  assert.equal(analyzeCapture({ ...canon, explicitOffset: 120 }).status, 'conflict');
  assert.equal(
    analyzeCapture({ ...canon, dateSource: 'original:GPSDateTime', explicitOffset: 0, gpsStatus: 'Void' })
      .status,
    'unknown',
  );
});
test('unknown destination does not claim a local time, and historical DST/date boundaries are respected', () => {
  assert.equal(
    analyzeCapture({ ...canon, explicitOffset: 480, gpsUtc: null, destinationZone: null }).timeZone,
    null,
  );
  assert.equal(
    correctedCapture({ ...canon, clock: '2017-01-24T01:00:00Z' }, 'UTC+08:00').localTakenAt,
    '2017-01-23T19:00:00.000Z',
  );
  assert.equal(
    correctedCapture({ ...canon, clock: '2026-07-27T18:00:00Z', destinationZone: 'Europe/Rome' }, 'UTC+08:00')
      .localTakenAt,
    '2026-07-27T12:00:00.000Z',
  );
  assert.equal(
    correctedCapture({ ...canon, clock: '2026-01-27T18:00:00Z', destinationZone: 'Europe/Rome' }, 'UTC+08:00')
      .localTakenAt,
    '2026-01-27T11:00:00.000Z',
  );
  assert.throws(() => instantForClock('2026-11-01T01:30:00Z', 'America/New_York'), /重复/);
  assert.throws(() => instantForClock('2026-03-08T02:30:00Z', 'America/New_York'), /缺失/);
  assert.equal(validClock('2026-02-30T00:00:00Z'), false);
});
test('unconfirmed clocks are labelled and excluded from confirmed automatic visit dates', () => {
  const p = {
    id: 'a',
    country: 'JO',
    localTakenAt: canon.clock,
    takenAt: '2017-01-23T16:21:37Z',
    timeZone: 'Asia/Amman',
    captureStatus: 'suggested',
  };
  assert.match(captureTime(p).value, /待核对/);
  assert.equal(evidenceDate(p), null);
});
