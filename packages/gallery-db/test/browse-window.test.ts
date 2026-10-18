import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browseWindow } from '../src/browse-window.server.ts';
test('continuation preserves ties and survives deletion of its boundary item', () => {
  const rows = Array.from({length: 103}, (_, i) => ({id: String(i).padStart(3, '0'), time: 10}));
  const key = (p: typeof rows[number]) => [-p.time, p.id];
  const first = browseWindow(rows, 48, key);
  const remaining = rows.filter(p => p.id !== '047');
  const next = browseWindow(remaining, 48, key, {after: first.window.next});
  assert.equal(next.items[0]?.id, '048');
  const last = browseWindow(remaining, 48, key, {after: next.window.next});
  assert.deepEqual(last.items.map(p => p.id), ['096','097','098','099','100','101','102']);
  assert.equal(last.window.hasMore, false);
  assert.equal(browseWindow(rows, 48, key, {anchor: p => p.id === '099'}).window.page, 3);
  assert.throws(() => browseWindow(rows, 48, key, {after: '[null]'}));
});
