import test from 'node:test';
import assert from 'node:assert/strict';
import {
  photoFilters,
  matchesPhoto,
  equipmentKey,
  appendPhotoFilters,
} from '../../gallery-core/src/photo-filters.ts';
const p = {
  places: ['country:AM', 'city:616052'],
  camera: 'sony ilce-7m4',
  lens: 'fe 24-70mm',
  focal: 35,
  tags: ['a', 'b'],
  month: '2026-08',
};
test('photo facets intersect, equipment multi-select unions, focal endpoints inclusive', () => {
  const f = photoFilters({
    place: 'country:AM',
    cameras: ['sony ilce-7m4', 'nikon z6'],
    focalMin: 35,
    focalMax: 50,
  });
  assert.ok(matchesPhoto(p, f, ['a', 'b'], '2026-08'));
  assert.ok(!matchesPhoto(p, f, ['c'], ''));
  assert.ok(!matchesPhoto({ ...p, focal: null }, f, [], ''));
  assert.ok(
    !matchesPhoto({ ...p, focal: 8.72 }, f, [], ''),
    'actual focal length is not substituted with equivalent focal length',
  );
  assert.ok(matchesPhoto({ ...p, focal: 50 }, f, [], ''));
  assert.ok(matchesPhoto({ ...p, camera: 'canon r6' }, f, [], '', 'camera'));
  assert.ok(!matchesPhoto({ ...p, places: ['country:GE'] }, f, [], ''));
});
test('filter serialization survives pagination and validates ranges', () => {
  const f = photoFilters({
    place: 'city:616052',
    cameras: ['sony', 'sony'],
    lenses: ['zoom'],
    focalMin: 20,
    focalMax: 50,
  });
  assert.equal(f.cameras.length, 1);
  const q = appendPhotoFilters(new URLSearchParams({ page: '2', tag: 'a' }), f);
  assert.equal(q.get('page'), '2');
  assert.equal(q.get('place'), 'city:616052');
  assert.equal(q.get('focalMin'), '20');
  assert.deepEqual(q.getAll('camera'), ['sony']);
  assert.equal(equipmentKey(' Sony   ILCE-7M4 '), 'sony ilce-7m4');
  assert.throws(() => photoFilters({ focalMin: 50, focalMax: 20 }));
  assert.throws(() => photoFilters({ focalMin: NaN }));
  assert.throws(() => photoFilters({ place: '../../private' }));
});

test('place chooser builds identity-based branches and retains parent context in search', async () => {
  const { placeChoiceTree } = await import('../../gallery-core/src/photo-filters.ts');
  const options = [
    { id: 'city:1', name: '厦门', parent: 'region:1', kind: 'city', path: '中国 / 福建 / 厦门', count: 2 },
    { id: 'country:ES', name: '西班牙', parent: '', kind: 'country', path: '西班牙', count: 1 },
    { id: 'region:1', name: '福建', parent: 'country:CN', kind: 'region', path: '中国 / 福建', count: 5 },
    { id: 'city:2', name: '漳州', parent: 'region:1', kind: 'city', path: '中国 / 福建 / 漳州', count: 3 },
    { id: 'country:CN', name: '中国', parent: '', kind: 'country', path: '中国', count: 5 },
  ];
  const root = placeChoiceTree(options).find((p) => p.id === 'country:CN')!;
  assert.equal(root.children[0]!.id, 'region:1');
  assert.deepEqual(
    root.children[0]!.children.map((p) => p.name),
    ['厦门', '漳州'],
  );
  assert.equal(root.children[0]!.count, 5);
  const result = placeChoiceTree(options, '厦门');
  assert.equal(result.length, 1);
  assert.equal(result[0]!.name, '中国');
  assert.equal(result[0]!.children[0]!.name, '福建');
  assert.deepEqual(
    result[0]!.children[0]!.children.map((p) => p.name),
    ['厦门'],
  );
  assert.equal(placeChoiceTree(options, '福建')[0]!.children[0]!.children.length, 2);
  assert.equal(placeChoiceTree(options, '不存在').length, 0);
  const filter = photoFilters({ place: 'region:1' });
  for (const city of ['city:1', 'city:2'])
    assert.ok(matchesPhoto({ ...p, places: ['country:CN', 'region:1', city] }, filter, [], ''));
  assert.ok(!matchesPhoto({ ...p, places: ['country:ES'] }, filter, [], ''));
});
