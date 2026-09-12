import test from 'node:test';
import assert from 'node:assert/strict';
import { countries, borders, seas, type Point } from '../../gallery-public/src/lib/visited/regional-map.ts';

function inside(point: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0])
      result = !result;
  }
  return result;
}

test('regional drawing preserves Caucasus direction and required shared borders', () => {
  const country = (id: string) => countries.find((c) => c.id === id)!;
  assert.ok(country('AM').label[1] > country('GE').label[1]);
  assert.ok(country('AZ').label[0] > country('AM').label[0]);
  assert.ok(country('KZ').label[0] > 780 && country('AZ').label[0] < 700);
  for (const [a, b] of [
    ['GE', 'AM'],
    ['GE', 'RU'],
    ['GE', 'AZ'],
    ['AM', 'TR'],
    ['AM', 'IR'],
    ['AM', 'AZ'],
    ['AZ', 'IR'],
    ['IR', 'TM'],
    ['KZ', 'RU'],
    ['IQ', 'IR'],
  ])
    assert.ok(
      borders.some((edge) => edge.countries.includes(a!) && edge.countries.includes(b!)),
      `${a}/${b} must share a border`,
    );
  assert.ok(!borders.some((edge) => edge.countries.includes('AZ') && edge.countries.includes('KZ')));
  assert.ok(borders.every((edge) => edge.countries.length <= 2));
  // A regional crop must not accidentally turn landlocked Afghanistan into a coast.
  assert.ok(
    borders
      .filter((edge) => edge.countries.includes('AF'))
      .every((edge) => edge.countries.length === 2 || (edge.a[0] === 1280 && edge.b[0] === 1280)),
  );
});

test('country labels stay inside their regions and important waters remain clear', () => {
  for (const country of countries)
    assert.ok(inside(country.label, country.points), `${country.id} label outside its region`);
  for (const sea of seas)
    assert.deepEqual(
      countries.filter((c) => inside([sea.x, sea.y], c.points)).map((c) => c.id),
      [],
      `${sea.name} was filled by land`,
    );
  // Northern and southern Caspian, the Red Sea corridor and Persian Gulf outlet.
  for (const point of [
    [740, 200],
    [750, 385],
    [330, 710],
    [420, 860],
    [820, 710],
  ] as Point[])
    assert.deepEqual(
      countries.filter((c) => inside(point, c.points)).map((c) => c.id),
      [],
      `water corridor ${point} is blocked`,
    );
});

test('country interiors do not overlap across a dense independent sampling grid', () => {
  const boxes = countries.map((c) => ({
    ...c,
    minX: Math.min(...c.points.map((p) => p[0])),
    maxX: Math.max(...c.points.map((p) => p[0])),
    minY: Math.min(...c.points.map((p) => p[1])),
    maxY: Math.max(...c.points.map((p) => p[1])),
  }));
  for (let y = 11.317; y < 1030; y += 5)
    for (let x = 21.719; x < 1280; x += 5) {
      const matches = boxes.filter(
        (c) => x > c.minX && x < c.maxX && y > c.minY && y < c.maxY && inside([x, y], c.points),
      );
      assert.ok(matches.length <= 1, `overlap at ${x},${y}: ${matches.map((c) => c.id).join('/')}`);
    }
});

test('full world inventory, complete names and Caucasus geography remain consistent', async () => {
  const { readFile } = await import('node:fs/promises');
  const world = JSON.parse(
    await readFile(new URL('../../gallery-public/src/lib/visited/world-map.json', import.meta.url), 'utf8'),
  );
  assert.equal(world.countries.length, 195);
  assert.equal(new Set(world.countries.map((c: { id: string }) => c.id)).size, 195);
  const byId = new Map<string, any>(world.countries.map((c: any) => [c.id, c]));
  for (const id of ['GE', 'AM', 'AZ', 'KZ', 'CN', 'RU', 'US', 'CA', 'BR', 'AU', 'VA', 'MC', 'SG', 'PS', 'NR', 'TV'])
    assert.ok(byId.has(id));
  assert.ok(byId.get('AM').label[1] > byId.get('GE').label[1]);
  assert.ok(byId.get('AZ').label[0] > byId.get('AM').label[0]);
  assert.ok(byId.get('KZ').label[0] > byId.get('AZ').label[0]);
  for (const c of world.countries) assert.equal(c.lines.join(''), c.name);
  for (const sea of ['地中海', '黑海', '里海', '红海'])
    assert.ok(world.waters.some((s: { name: string }) => s.name === sea));
});

test('full-world shared edges preserve Caucasus and Central Asia land neighbours', async () => {
  const { countries } = await import('../../gallery-core/src/countries.ts');
  // Original code-native generator is tested independently of the generated SVG.
  const { buildCartogram, COLS } = await import('../../gallery-public/scripts/cartogram-layout.mjs');
  const { owners } = buildCartogram(countries);
  const neighbours = (id: string) => {
    const adjacent = new Set<string>();
    for (const [key, value] of owners)
      if (value === id)
        for (const k of [key - 1, key + 1, key - COLS, key + COLS]) {
          const n = owners.get(k);
          if (n && n !== id) adjacent.add(n);
        }
    return adjacent;
  };
  assert.deepEqual([...neighbours('GE')].sort(), ['AM', 'AZ', 'RU', 'TR']);
  assert.deepEqual([...neighbours('AM')].sort(), ['AZ', 'GE', 'IR', 'TR']);
  assert.ok(neighbours('KZ').has('CN'));
  assert.ok(!neighbours('KZ').has('MN'));
  assert.ok(!neighbours('AZ').has('KZ'));
});
