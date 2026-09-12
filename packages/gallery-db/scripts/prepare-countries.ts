import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { countries } from '../../gallery-core/src/countries.ts';

const source = process.argv[2];
if (!source) throw new Error('Provide the downloaded Natural Earth v5.1.2 countries GeoJSON file');
const bytes = readFileSync(source);
const hash = createHash('sha256').update(bytes).digest('hex');
if (hash !== '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255')
  throw new Error('Natural Earth source checksum mismatch');
const raw = JSON.parse(bytes.toString());
const ids = new Set(countries.map((c) => c.id));
const sovereignty = new Map<string, string>();
for (const f of raw.features)
  if (ids.has(f.properties.ISO_A2_EH)) sovereignty.set(f.properties.SOV_A3, f.properties.ISO_A2_EH);
const extra: Record<string, string> = { TW: 'CN', HK: 'CN', MO: 'CN', CYN: 'CY', CNM: 'CY', SOL: 'SO', KOS: 'RS' };
const regions: Record<string, number[][][][]> = {};
for (const f of raw.features) {
  const p = f.properties;
  const id = ids.has(p.ISO_A2_EH) ? p.ISO_A2_EH : (extra[p.ISO_A2_EH] ?? extra[p.ADM0_A3] ?? sovereignty.get(p.SOV_A3));
  if (!id || !ids.has(id) || p.ISO_A2_EH === 'AQ') continue;
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  (regions[id] ??= []).push(...polygons);
}
const missing = [...ids].filter((id) => !regions[id]);
if (missing.length) throw new Error(`Missing boundaries: ${missing.join(',')}`);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../data/countries-5.1.2.json.gz', import.meta.url),
  gzipSync(JSON.stringify({ version: 'natural-earth-5.1.2', regions }), { level: 9 }),
);
writeFileSync(
  new URL('../data/countries-source.json', import.meta.url),
  JSON.stringify(
    {
      version: '5.1.2',
      url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson',
      sha256: hash,
      license: 'Public domain',
      countries: ids.size,
      sourceFeatures: raw.features.length,
      grouping:
        '193 UN members + Holy See + Palestine; dependencies grouped by sovereignty; explicit TW/HK/MO → CN, CYN/CNM → CY, SOL → SO, KOS → RS. Unassigned areas remain unknown.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Prepared ${ids.size} country boundary groups; sha256 ${hash}`);
