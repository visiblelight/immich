import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVisitedPlaces, compareVisitsByCapture, visitDateRange, type VisitSummary, type VisitedCountry } from '../../gallery-core/src/visited.ts';

const visit = (id: string, start: string | null, photoStart = start): VisitSummary => ({ id, start, end: start, photoStart, count: 1, manual: false, label: '' });
const place = (id: string, visits: VisitSummary[]): VisitedCountry => ({ id, name: id, count: visits.length, visits });

test('place chronology uses earliest photo across separate trips, not latest trip or edited date', () => {
  const places = [
    place('unknown', [visit('u', '2027-01-01', null)]),
    place('old', [visit('o2', '2026-10-01'), visit('o1', '2026-12-01', '2020-01-01')]),
    place('recent', [visit('r', '2025-01-01')]),
  ];
  assert.deepEqual(places.toSorted(compareVisitedPlaces).map(p => p.id), ['recent', 'old', 'unknown']);
});

test('trip ordering uses capture date with stable ties and missing dates last', () => {
  const trips = [visit('u', null), visit('b', '2025-01-01'), visit('new', '2020-01-01', '2026-01-01'), visit('a', '2025-01-01')];
  assert.deepEqual(trips.toSorted(compareVisitsByCapture).map(v => v.id), ['new', 'a', 'b', 'u']);
});

test('travel periods distinguish one-day, multi-day, and undated trips', () => {
  assert.equal(visitDateRange(visit('a', '2026-01-02')), '2026.01.02');
  assert.equal(visitDateRange({ start: '2025-12-30', end: '2026-01-02' }), '2025.12.30 — 2026.01.02');
  assert.equal(visitDateRange(visit('u', null)), '拍摄日期待确认');
});
