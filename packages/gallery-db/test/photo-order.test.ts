import test from 'node:test';
import assert from 'node:assert/strict';
import { albumPhotoItems, groupSelectedPhotos, orderAlbumPhotos, photoItemKey, type DraftPhoto } from '@gallery/core';
const photos = (): DraftPhoto[] =>
  ['A', 'B', 'C', 'D'].map((id) => ({
    id,
    asset: `asset-${id}`,
    title: id,
    description: `description-${id}`,
    alt: id,
    location: 'inherit',
  }));

test('moving third photo to second then grouping the first two preserves the displayed identities', () => {
  const moved = orderAlbumPhotos(photos(), ['A', 'C', 'B', 'D']);
  const result = groupSelectedPhotos(moved, [moved[0]!.id, moved[1]!.id], 'group');
  assert.deepEqual(
    result.photos.filter((p) => p.group === 'group').map((p) => p.asset),
    ['asset-A', 'asset-C'],
  );
  assert.equal(result.group.cover, 'A');
  assert.deepEqual(
    result.photos.map((p) => p.description),
    ['description-A', 'description-C', 'description-B', 'description-D'],
  );
  assert.deepEqual(albumPhotoItems(result.photos).map(photoItemKey), ['group', 'B', 'D']);
});
test('selection remains tied to IDs across reorder, group movement and member sorting', () => {
  const original = photos();
  const grouped = groupSelectedPhotos(orderAlbumPhotos(original, ['D', 'C', 'B', 'A']), ['A', 'C'], 'group');
  assert.deepEqual(
    grouped.photos.filter((p) => p.group).map((p) => p.id),
    ['C', 'A'],
  );
  const moved = orderAlbumPhotos(grouped.photos, ['B', 'group', 'D']);
  const angles = orderAlbumPhotos(moved, ['A', 'C'], 'group');
  assert.deepEqual(
    angles.map((p) => p.id),
    ['B', 'A', 'C', 'D'],
  );
  assert.deepEqual(
    original.map((p) => p.group),
    [undefined, undefined, undefined, undefined],
  );
  assert.throws(() => orderAlbumPhotos(angles, ['group', 'group', 'D']));
  assert.throws(() => orderAlbumPhotos(angles, ['A', 'B'], 'group'));
});
