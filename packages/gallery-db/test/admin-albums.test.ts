import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyAlbum,
  albumPhotoCounts,
  galleryInventory,
  albumTreeRows,
  type ManagedAlbum,
} from '@gallery/core';
function album(id: string, parent = '', visible = true): ManagedAlbum {
  return {
    id,
    draft: emptyAlbum(id, id, parent),
    visible,
    status: visible ? 'published' : 'draft',
  } as ManagedAlbum;
}
test('inventory deduplicates cross-album assets and counts group members as photographs', () => {
  const a = album('A'),
    b = album('B');
  a.draft.photos = [
    { id: 'p1', asset: 'one', group: 'g' },
    { id: 'p2', asset: 'two', group: 'g' },
  ] as typeof a.draft.photos;
  b.draft.photos = [{ id: 'p3', asset: 'one' }] as typeof b.draft.photos;
  assert.deepEqual(albumPhotoCounts(a.draft), { photos: 2, groups: 1 });
  assert.deepEqual(galleryInventory([a, b]), { albums: 2, photos: 2, groups: 1 });
});
test('album trees put descendants under parents and retain context when filtering', () => {
  const parent = album('第比利斯'),
    child = album('郊区', parent.id, false),
    other = album('卡兹别克');
  const input = [child, parent, other];
  assert.deepEqual(
    albumTreeRows(input).map((r) => [r.album.id, r.depth]),
    [
      [parent.id, 0],
      [child.id, 1],
      [other.id, 0],
    ],
  );
  assert.deepEqual(
    albumTreeRows(input, '', 'all', new Set([parent.id])).map((r) => r.album.id),
    [parent.id, other.id],
  );
  const filtered = albumTreeRows(input, '郊区', 'draft', new Set([parent.id]));
  assert.deepEqual(
    filtered.map((r) => [r.album.id, r.context, r.depth]),
    [
      [parent.id, true, 0],
      [child.id, false, 1],
    ],
  );
  assert.equal(albumTreeRows(input, '不存在').length, 0);
});
test('new albums explicitly default to exact location without altering older content', () => {
  const old = { ...emptyAlbum('old', 'old'), location: 'hidden' };
  assert.equal(emptyAlbum('new', 'new').location, 'exact');
  galleryInventory([{ ...album('old'), draft: old as ManagedAlbum['draft'] }]);
  assert.equal(old.location, 'hidden');
});

test('creation ordering sorts siblings in either direction without detaching children', () => {
  const old = { ...album('old'), createdAt: '2026-01-01T00:00:00Z' };
  const recent = { ...album('recent'), createdAt: '2026-03-01T00:00:00Z' };
  const child = { ...album('child', old.id), createdAt: '2026-04-01T00:00:00Z' };
  const earlierChild = { ...album('earlier-child', old.id), createdAt: '2026-02-01T00:00:00Z' };
  const input = [old, earlierChild, child, recent];
  const ordered = (direction: 'created-desc' | 'created-asc') =>
    albumTreeRows(input, '', 'all', new Set(), direction).map((r) => [r.album.id, r.depth]);
  assert.deepEqual(ordered('created-desc'), [
    ['recent', 0],
    ['old', 0],
    ['child', 1],
    ['earlier-child', 1],
  ]);
  assert.deepEqual(ordered('created-asc'), [
    ['old', 0],
    ['earlier-child', 1],
    ['child', 1],
    ['recent', 0],
  ]);
  assert.deepEqual(
    input.map((a) => a.id),
    ['old', 'earlier-child', 'child', 'recent'],
  );
});
