import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadOsmStyle, MAP_FALLBACK_MESSAGE } from '../src/lib/visited/map-style.ts';
import { OSM_VECTOR_STYLE, OSM_RASTER_TILES } from '@gallery/core';

const bundled = await readFile(
  new URL('../static/vendor/osm-shortbread-v1/style.json', import.meta.url),
  'utf8',
);
test('legacy OSM preset uses same-origin display assets on production and localhost', async () => {
  for (const origin of ['https://vision.ke', 'https://gallery.example.com', 'http://127.0.0.1:3100']) {
    for (const preset of [
      OSM_VECTOR_STYLE,
      'https://vector.openstreetmap.org/styles/shortbread/colorful.json',
    ]) {
      const result = await loadOsmStyle(preset, 'OSM', 'en', origin, async (url, options) => {
        assert.equal(url, origin + OSM_VECTOR_STYLE);
        assert.equal(options?.referrerPolicy, 'strict-origin-when-cross-origin');
        return new Response(bundled);
      });
      assert.equal(result.vector, true);
      assert.equal(result.warning, '');
      assert.equal(result.style.glyphs, origin + '/vendor/osm-shortbread-v1/fonts/{fontstack}/{range}.pbf');
      assert.equal(result.style.sprite[0].url, origin + '/vendor/osm-shortbread-v1/sprites/basics/sprites');
      assert.deepEqual(result.style.sources['versatiles-shortbread'].tiles, [
        'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt',
      ]);
      assert.ok(JSON.stringify(result.style.layers).includes('name_en'));
      assert.ok(!JSON.stringify(result.style).includes('vector.openstreetmap.org/styles/'));
    }
  }
});
test('network, HTTP and malformed styles fall back without raw fetch errors', async () => {
  for (const fetcher of [
    async () => {
      throw new TypeError('Failed to fetch');
    },
    async () => new Response('', { status: 503 }),
    async () => new Response('<html>not JSON</html>'),
    async () => Response.json({ version: 7 }),
  ]) {
    const result = await loadOsmStyle(OSM_VECTOR_STYLE, 'OSM', 'en', 'https://vision.ke', fetcher);
    assert.equal(result.vector, false);
    assert.equal(result.warning, MAP_FALLBACK_MESSAGE);
    assert.deepEqual(result.style.sources.osm.tiles, [OSM_RASTER_TILES]);
  }
});
test('custom styles and raster providers keep their configured URLs and local labels', async () => {
  const style = {
    version: 8,
    sources: { tiles: { type: 'vector', url: './tiles.json' } },
    layers: [{ layout: { 'text-field': '{name}' } }],
  };
  const result = await loadOsmStyle(
    'https://maps.example.com/styles/custom.json',
    'OSM',
    'local',
    'https://vision.ke',
    async (url) => {
      assert.equal(url, 'https://maps.example.com/styles/custom.json');
      return Response.json(style);
    },
  );
  assert.equal(result.style.sources.tiles.url, 'https://maps.example.com/styles/tiles.json');
  assert.equal(result.style.layers[0].layout['text-field'], '{name}');
  const raster = await loadOsmStyle(OSM_RASTER_TILES, 'OSM', 'en', 'https://vision.ke', async () => {
    throw new Error('Must not fetch raster as JSON');
  });
  assert.equal(raster.warning, '');
  assert.deepEqual(raster.style.sources.osm.tiles, [OSM_RASTER_TILES]);
});
