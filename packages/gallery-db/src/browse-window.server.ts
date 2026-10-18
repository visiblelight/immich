import { ensure } from '@gallery/core';
export type BrowseWindow = { page: number; total: number; hasMore: boolean; next: string | null };
type Key = (string | number)[];
const compare = (a: Key, b: Key) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
};
/** Keyset continuation survives deletion of the previous batch's last item. */
export function browseWindow<T>(rows: T[], size: number, key: (row: T) => Key, options: { page?: number; after?: string | null; anchor?: (row: T) => boolean } = {}) {
  const page = options.page ?? 1;
  ensure(Number.isSafeInteger(page) && page > 0 && page <= 100000, '页码无效。');
  const sorted = [...rows].sort((a, b) => compare(key(a), key(b)));
  let start = (page - 1) * size;
  if (options.after) {
    let cursor: unknown;
    try { cursor = JSON.parse(options.after); } catch { ensure(false, '加载位置无效。'); }
    ensure(options.after.length <= 1024 && Array.isArray(cursor) && cursor.length > 0 && cursor.length <= 4 && cursor.every(v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))), '加载位置无效。');
    if (sorted.length) ensure(cursor.length === key(sorted[0]!).length && cursor.every((v, i) => typeof v === typeof key(sorted[0]!)[i]), '加载位置无效。');
    const index = sorted.findIndex(row => compare(key(row), cursor as Key) > 0);
    start = index < 0 ? sorted.length : index;
  } else if (options.anchor) {
    const index = sorted.findIndex(options.anchor);
    if (index >= 0) start = Math.floor(index / size) * size;
  }
  const items = sorted.slice(start, start + size);
  const hasMore = start + items.length < sorted.length;
  return { items, window: { page: Math.floor(start / size) + 1, total: sorted.length, hasMore, next: hasMore && items.length ? JSON.stringify(key(items.at(-1)!)) : null } satisfies BrowseWindow };
}
