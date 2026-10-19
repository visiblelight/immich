import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapReturnPath } from '../src/lib/visited/navigation.ts';

test('photo viewer preserves national and regional map state', () => {
  for (const path of ['/visited/AM?lat=40&lng=44&zoom=7', '/visited/regions/CN-FJ?scope=country&provider=osm&language=en', '/visited/regions/CN']) {
    assert.equal(mapReturnPath(path), path);
  }
});

test('photo viewer rejects external and non-map return destinations', () => {
  for (const path of [null, '', '//example.com', 'https://example.com', '/visited/../albums', '/albums', '/visited/CN/../../login', '/visited/regions/CN-FJ#bad', '/visited/CN?x=1\n']) {
    assert.equal(mapReturnPath(path), null);
  }
});
