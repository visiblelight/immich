import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { chinaRegions, regionByCode, photoFilters } from '@gallery/core';
import { getRegionLocator } from '../src/regions.server.ts';
import { getCountryLocator } from '../src/countries.server.ts';
import { createPlaceResolver } from '../src/places.server.ts';

const centers = [
  ['CN-BJ', 116.397, 39.908],
  ['CN-TJ', 117.2, 39.12],
  ['CN-HE', 114.51, 38.04],
  ['CN-SX', 112.55, 37.87],
  ['CN-NM', 111.67, 40.82],
  ['CN-LN', 123.43, 41.8],
  ['CN-JL', 125.32, 43.82],
  ['CN-HL', 126.64, 45.76],
  ['CN-SH', 121.47, 31.23],
  ['CN-JS', 118.78, 32.06],
  ['CN-ZJ', 120.15, 30.27],
  ['CN-AH', 117.28, 31.86],
  ['CN-FJ', 118.12, 24.5],
  ['CN-JX', 115.86, 28.68],
  ['CN-SD', 117.12, 36.65],
  ['CN-HA', 113.62, 34.75],
  ['CN-HB', 114.3, 30.59],
  ['CN-HN', 112.98, 28.19],
  ['CN-GD', 113.25, 23.11667],
  ['CN-GX', 108.32, 22.82],
  ['CN-HI', 110.33, 20.03],
  ['CN-CQ', 106.55, 29.56],
  ['CN-SC', 104.06, 30.66],
  ['CN-GZ', 106.63, 26.65],
  ['CN-YN', 102.71, 25.04],
  ['CN-XZ', 91.13, 29.65],
  ['CN-SN', 108.94, 34.34],
  ['CN-GS', 103.83, 36.06],
  ['CN-QH', 101.78, 36.62],
  ['CN-NX', 106.23, 38.48],
  ['CN-XJ', 87.62, 43.82],
  ['CN-HK', 114.1694, 22.3193],
  ['CN-MO', 113.541, 22.197],
  ['CN-TW', 121.5654, 25.033],
] as const;
const source = {
  asset_id: 'test',
  location_mode: 'exact',
  latitude: 24.5,
  longitude: 118.12,
  city: null,
  state: null,
  manual_place: null,
};
test('fixed province catalog and offline boundary checksum cover all 34 approved regions', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../data/china-regions-source.json', import.meta.url),
      'utf8',
    ),
  );
  const bytes = gunzipSync(
    await readFile(
      new URL('../data/china-regions-5.1.2.json.gz', import.meta.url),
    ),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    manifest.outputJsonSha256,
  );
  const data = JSON.parse(bytes.toString());
  assert.equal(chinaRegions.length, 34);
  assert.deepEqual(
    Object.keys(data.regions).sort(),
    chinaRegions.map((r) => r.code).sort(),
  );
  const locate = await getRegionLocator(),
    country = await getCountryLocator();
  for (const [code, lng, lat] of centers) {
    assert.equal(locate(lng, lat), code, code);
    assert.equal(country(lng, lat), 'CN', code + ' retains world grouping');
  }
  assert.equal(
    locate(118, 20),
    null,
    'open sea must not receive a nearby province',
  );
  assert.equal(locate(NaN, 20), null);
  const first = data.regions['CN-FJ'][0][0][0];
  assert.equal(
    locate(first[0], first[1]),
    null,
    'exact border vertex remains uncertain',
  );
  for (const r of chinaRegions)
    assert.equal(photoFilters({ place: r.placeId }).place, r.placeId);
  assert.throws(() => photoFilters({ place: 'region:CN-XX' }));
  assert.equal(regionByCode('CN-XX'), undefined);
});
test('province proof is independent of city names and shares stable photo-filter hierarchy', async () => {
  const r = await createPlaceResolver();
  assert.deepEqual(
    r.resolve(source).map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
  );
  const city = r.resolve({ ...source, city: 'Xiamen', state: 'Fujian' });
  assert.deepEqual(
    city.map((p) => p.id),
    ['country:CN', 'region:CN-FJ', 'city:1790645'],
  );
  assert.equal(city[1]!.regionCode, 'CN-FJ');
  assert.deepEqual(
    r
      .resolve({ ...source, city: 'Xiamen', state: 'Guangdong' })
      .map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
  );
  assert.deepEqual(
    r
      .resolve({ ...source, city: 'Guangzhou', state: 'Guangdong' })
      .map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
  );
  assert.equal(
    r.get('region:1811017')?.id,
    'region:CN-FJ',
    'legacy province URL remains valid',
  );
  assert.equal(
    r.path('city:1790645')[1]?.id,
    'region:CN-FJ',
    'city-filter and region-map paths share identity',
  );
});
test('manual province is supported without city, conflicts never override proven region, privacy wins', async () => {
  const r = await createPlaceResolver();
  assert.deepEqual(
    r.resolve({ ...source, manual_place: 'region:CN-FJ' }).map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
  );
  assert.deepEqual(
    r.resolve({ ...source, manual_place: 'region:1811017' }).map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
  );
  assert.ok(
    r.manualRegionConflict({ ...source, manual_place: 'city:1809858' }),
  );
  assert.deepEqual(
    r.resolve({ ...source, manual_place: 'city:1809858' }).map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
  );
  for (const mode of ['approximate', 'hidden']) {
    const places = r.resolve({
      ...source,
      location_mode: mode,
      manual_place: 'region:CN-FJ',
      city: 'Xiamen',
      state: 'Fujian',
    });
    assert.deepEqual(
      places.map((p) => p.kind),
      mode === 'hidden' ? [] : ['country'],
    );
  }
  assert.deepEqual(
    r.resolve({ ...source, latitude: null }).map((p) => p.id),
    [],
  );
  const coast = { ...source, longitude: 118.08187, latitude: 24.47979 };
  assert.deepEqual(
    r.resolve(coast),
    [],
    'a known coastal gap is not assigned automatically',
  );
  assert.deepEqual(
    r.resolve({ ...coast, manual_place: 'region:CN-FJ' }).map((p) => p.id),
    ['country:CN', 'region:CN-FJ'],
    'bounded coastal country evidence permits province confirmation',
  );
  assert.deepEqual(
    r.resolve({
      ...coast,
      manual_place: 'region:CN-FJ',
      location_mode: 'approximate',
    }),
    [],
    'coastal manual province does not bypass approximate privacy',
  );
});
test('province label customization and legacy URLs cannot merge geographic identities', async () => {
  const r = await createPlaceResolver([
    {
      id: 'region:1811017',
      name_zh: '福建省',
      name_en: '',
      aliases: ['闽'],
      canonical_id: 'region:1809935',
      version: '1',
    },
  ]);
  assert.equal(r.get('region:CN-FJ')?.name, '福建省');
  assert.equal(r.get('region:1811017')?.id, 'region:CN-FJ');
  assert.ok(r.get('region:CN-FJ')?.aliases.includes('闽'));
  assert.equal(r.resolve(source).at(-1)?.regionCode, 'CN-FJ');
});

test('Hong Kong city hierarchy and legacy district source names remain compatible', async () => {
  const r = await createPlaceResolver();
  assert.deepEqual(
    r.path('city:1819729').map((p) => p.id),
    ['country:CN', 'region:CN-HK', 'city:1819729'],
  );
  const town = r.get('city:1818209')!;
  assert.equal(r.path(town.id)[1]?.regionCode, 'CN-HK');
  assert.equal(
    r.matchesState(town, 'Tsuen Wan'),
    true,
    'old district state name still corroborates its city',
  );
  assert.equal(r.matchesState(town, 'Guangdong'), false);
  const hongKong = {
    ...source,
    latitude: 22.27832,
    longitude: 114.17469,
    city: 'Hong Kong',
    state: 'Hong Kong',
    manual_place: 'city:1819729',
  };
  assert.deepEqual(
    r.resolve(hongKong).map((p) => p.id),
    ['country:CN', 'region:CN-HK', 'city:1819729'],
  );
  assert.deepEqual(
    r.resolve({ ...hongKong, location_mode: 'approximate' }).map((p) => p.id),
    ['country:CN'],
  );
});
