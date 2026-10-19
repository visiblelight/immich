import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { chinaRegions } from '../../gallery-core/src/regions.ts';

const source = process.argv[2],
  countries = process.argv[3];
if (!source || !countries)
  throw new Error(
    'Provide fixed Natural Earth v5.1.2 admin-1 and admin-0 GeoJSON files',
  );
const hashes = [
  '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5',
  '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
];
const input = [source, countries].map((path, i) => {
  const bytes = readFileSync(path);
  if (createHash('sha256').update(bytes).digest('hex') !== hashes[i])
    throw new Error('Natural Earth checksum mismatch');
  return JSON.parse(bytes.toString());
});
const regions: Record<string, number[][][][]> = {};
const add = (
  id: string,
  geometry: { type: string; coordinates: number[][][] | number[][][][] },
) => {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);
  (regions[id] ??= []).push(...polygons);
};
const members: Record<string, string[]> = {};
for (const f of input[0].features) {
  const p = f.properties;
  if (p.adm0_a3 !== 'CHN') continue;
  const id = p.iso_3166_2 === 'CN-X01~' ? 'CN-HI' : p.iso_3166_2;
  if (!chinaRegions.some((region) => region.code === id))
    throw new Error('Unmapped China admin-1: ' + id);
  add(id, f.geometry);
  (members[id] ??= []).push(p.iso_3166_2);
}
// Use admin-0 outlines so internal district boundaries do not become artificial
// ambiguous province borders. This is the same fixed dataset/grouping as the world map.
for (const f of input[1].features) {
  const id = (
    { HK: 'CN-HK', MO: 'CN-MO', TW: 'CN-TW' } as Record<string, string>
  )[f.properties.ISO_A2_EH];
  if (!id) continue;
  add(id, f.geometry);
  members[id] = [f.properties.ISO_A2_EH];
}
if (
  chinaRegions.some((r) => !regions[r.code]) ||
  Object.keys(regions).length !== 34
)
  throw new Error('Missing China regions');
const output = JSON.stringify({
  version: 'natural-earth-5.1.2-china-admin1',
  regions,
});
writeFileSync(
  new URL('../data/china-regions-5.1.2.json.gz', import.meta.url),
  gzipSync(output, { level: 9 }),
);
writeFileSync(
  new URL('../data/china-regions-source.json', import.meta.url),
  JSON.stringify(
    {
      version:
        'Natural Earth repository v5.1.2; admin-1 layer 5.1.1; admin-0 layer 5.1.1',
      downloaded: '2026-10-19',
      license: 'Public domain',
      licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
      inputs: [
        'ne_10m_admin_1_states_provinces.geojson',
        'ne_10m_admin_0_countries.geojson',
      ].map((file, i) => ({
        url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/${file}`,
        sha256: hashes[i],
      })),
      outputJsonSha256: createHash('sha256').update(output).digest('hex'),
      coordinateSystem:
        'WGS84 longitude/latitude; original coordinates preserved without simplification',
      grouping:
        '31 mainland regions use admin-1; Paracel Islands CN-X01~ joins CN-HI; HK/MO/TW use admin-0 outlines and join the existing CN world-map group; unrepresented islands remain unknown.',
      members,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Prepared ${Object.keys(regions).length} region boundary groups`);
