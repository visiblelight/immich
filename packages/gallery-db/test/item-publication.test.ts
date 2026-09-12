import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { emptyAlbum, mergeAlbumItem, sameAlbumContent, captureTime, type AlbumContent } from '@gallery/core';
const album = (): AlbumContent => ({
  ...emptyAlbum('Published', 'test'),
  markdown: 'Public story',
  photos: Array.from({ length: 4 }, (_, i) => ({
    id: randomUUID(),
    asset: randomUUID(),
    title: String(i),
    description: 'old',
    alt: '',
    location: 'inherit' as const,
  })),
});
test('item publication preserves unrelated story, edits, ordering and excludes new selections', () => {
  const base = album(),
    incoming = structuredClone(base);
  incoming.markdown = 'private draft';
  incoming.photos[1]!.description = 'target';
  incoming.photos[2]!.description = 'unrelated';
  incoming.photos.reverse();
  incoming.photos.push(album().photos[0]!);
  const next = mergeAlbumItem(base, incoming, base.photos[1]!.id).content;
  assert.equal(next.markdown, 'Public story');
  assert.deepEqual(
    next.photos.map((p) => p.id),
    base.photos.map((p) => p.id),
  );
  assert.deepEqual(
    next.photos.map((p) => p.description),
    ['old', 'target', 'old', 'old'],
  );
  assert.equal(sameAlbumContent(next, incoming), false);
});
test('formation, cover and dissolution apply all necessary membership changes atomically', () => {
  const base = album(),
    incoming = structuredClone(base),
    id = randomUUID();
  incoming.photos[0]!.group = incoming.photos[2]!.group = id;
  incoming.groups = [{ id, title: 'Church', description: 'Shared', cover: incoming.photos[2]!.id }];
  const grouped = mergeAlbumItem(base, incoming, id).content;
  assert.equal(grouped.photos.filter((p) => p.group === id).length, 2);
  assert.equal(grouped.groups![0]!.cover, incoming.photos[2]!.id);
  const dissolved = structuredClone(grouped);
  dissolved.groups = [];
  dissolved.photos.forEach((p) => {
    p.group = '';
  });
  assert.equal(mergeAlbumItem(grouped, dissolved, id).content.groups!.length, 0);
  // A group present only in the saved draft still participates in dependency closure.
  assert.equal(mergeAlbumItem(base, dissolved, grouped.photos[0]!.id, grouped).ids.size, 2);
});
test('local clock is timezone independent and missing/invalid timezones are explicit', () => {
  assert.equal(
    captureTime({ localTakenAt: '2026-04-01T00:15:00Z', takenAt: '2026-03-31T20:15:00Z', timeZone: 'UTC+4' }).value,
    '2026/04/01 00:15:00 · UTC+4',
  );
  assert.match(captureTime({ localTakenAt: '2026-04-01T00:15:00Z' }).value, /时区未知/);
  assert.match(captureTime({ localTakenAt: '2026-04-01T00:15:00Z', timeZone: 'broken' }).value, /时区未知/);
  assert.equal(captureTime({ takenAt: '2026-04-01T00:15:00Z' }).value, '时间未知');
});
