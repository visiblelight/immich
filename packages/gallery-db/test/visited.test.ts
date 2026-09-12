import test from 'node:test';
import assert from 'node:assert/strict';
import { getCountryLocator, createCountryLocator } from '../src/countries.server.ts';
import { inferVisits, clusterPhotos, photoBounds, type VisitEvidence } from '@gallery/core';
import { encryptMapSecret, decryptMapSecret, validateMapProvider } from '../src/map-settings.server.ts';
const evidence = (id: string, country: string, date: string | null): VisitEvidence => ({
  id,
  country,
  takenAt: date ? date + 'T10:00:00Z' : null,
  localTakenAt: date ? date + 'T14:00:00Z' : null,
  timeZone: date ? 'Asia/Tbilisi' : null,
});
test('real fixed borders resolve capitals, small states, seas and antimeridian', async () => {
  const locate = await getCountryLocator();
  for (const [code, lng, lat] of [
    ['GE', 44.8271, 41.7151],
    ['GE', 41.6367, 41.6168],
    ['AZ', 49.8671, 40.4093],
    ['KZ', 71.43, 51.13],
    ['AM', 44.51, 40.18],
    ['CN', 116.397, 39.908],
    ['FR', 2.35, 48.856],
    ['VA', 12.4534, 41.9029],
    ['MC', 7.425, 43.739],
    ['FJ', 178.45, -18.14],
  ] as const)
    assert.equal(locate(lng, lat), code, code);
  assert.equal(locate(33, 43), null);
  assert.equal(locate(0, 0), null);
  assert.equal(locate(NaN, 20), null);
});
test('approximate cells spanning a border or enclave never reveal exact nationality', () => {
  const square = (x: number, y: number, w: number) => [
    [
      [x, y],
      [x + w, y],
      [x + w, y + w],
      [x, y + w],
      [x, y],
    ],
  ];
  const locate = createCountryLocator({ version: 'test', regions: { AA: [square(0, 0, 1)], BB: [square(1, 0, 1)] } });
  assert.equal(locate(0.995, 0.5), 'AA');
  assert.equal(locate(0.995, 0.5, true), null);
  assert.equal(locate(0.5, 0.5, true), 'AA');
  assert.equal(locate(1, 0.5), null);
  const dateline = createCountryLocator({
    version: 'test',
    regions: {
      AA: [
        [
          [
            [179, -1],
            [-179, -1],
            [-179, 1],
            [179, 1],
            [179, -1],
          ],
        ],
      ],
    },
  });
  assert.equal(dateline(179.5, 0), 'AA');
  assert.equal(dateline(-179.5, 0), 'AA');
  assert.equal(dateline(0, 0), null);
});
test('visits split on foreign evidence and gaps, unknown dates remain unknown', () => {
  const v = inferVisits([
    evidence('a', 'GE', '2025-01-01'),
    evidence('b', 'AM', '2025-01-02'),
    evidence('c', 'GE', '2025-01-03'),
    evidence('d', 'GE', '2025-03-01'),
    evidence('e', 'GE', null),
  ]);
  assert.equal(v.filter((v) => v.country === 'GE').length, 4);
  assert.equal(v.find((v) => v.id === 'undated-GE')?.start, null);
  const same = inferVisits([
    evidence('a', 'GE', '2025-01-01'),
    evidence('b', 'AM', '2025-01-01'),
    evidence('c', 'GE', '2025-01-02'),
  ]);
  assert.equal(same.filter((v) => v.country === 'GE').length, 1);
  assert.throws(() => inferVisits([evidence('a', 'GE', null), evidence('a', 'GE', null)]));
});
test('clusters retain all counts across wrapped viewport and bound large responses', () => {
  const points = Array.from({ length: 10000 }, (_, i) => ({
    longitude: (i % 200) * 1.8 - 179.9,
    latitude: Math.floor(i / 200) * 3 - 74,
  }));
  const result = clusterPhotos(points, { west: -180, east: 180, south: -80, north: 80, zoom: 20 });
  assert.equal(
    [...result.values()].reduce((n, p) => n + p.length, 0),
    points.length,
  );
  assert.ok(result.size < 1000);
  const dateline = [
    { longitude: 179, latitude: 0 },
    { longitude: -179, latitude: 0 },
  ];
  assert.equal(
    [...clusterPhotos(dateline, { west: 170, east: -170, south: -10, north: 10, zoom: 2 }).values()].flat().length,
    2,
  );
  assert.equal(photoBounds(dateline).west, 179);
  assert.equal(photoBounds(dateline).east, -179);
});
test('map secrets authenticate ciphertext and key, provider validation rejects unsafe URLs', () => {
  const master = 'ab'.repeat(32),
    cipher = encryptMapSecret('secret-value', master);
  assert.ok(!cipher.includes('secret-value'));
  assert.equal(decryptMapSecret(cipher, master), 'secret-value');
  assert.throws(() => decryptMapSecret(cipher, 'cd'.repeat(32)));
  assert.throws(() =>
    validateMapProvider({
      provider: 'osm',
      enabled: true,
      isDefault: true,
      tileUrl: 'http://example.com/{z}/{x}/{y}',
      attribution: 'test',
    }),
  );
});
