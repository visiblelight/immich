import type { ComponentProps } from 'svelte';
import type { Gallery } from '@gallery/ui';
import type { DisplayAlbum, DisplayPhoto } from '@gallery/core';
import type { BrowseWindow } from '../../../gallery-ui/src/browse-stream';
type Props = ComponentProps<typeof Gallery>;
export type BrowseData = {
  site: Props['site']; albums: DisplayAlbum[]; active?: DisplayAlbum | null;
  feed?: NonNullable<Props['feed']> & { photos: DisplayPhoto[]; window: BrowseWindow };
  albumWindow?: BrowseWindow; photoWindow?: BrowseWindow; albumSort?: string;
  albumSearch?: { query: string; matchedIds: string[] }; photoId?: string | null;
  relatedArticles?: { title: string; slug: string }[]; origin: string;
  returnTo?: string | null; photoTitle?: string; photoDescription?: string;
};
export type SavedBrowse = { data?: BrowseData; anchor?: string; offset: number; y: number; firstAlbums: number; firstPhotos: number; time: number };
// A short, bounded in-memory history cache, never persisted to disk/localStorage.
const cache = new Map<string, SavedBrowse>();
export function saveBrowse(key: string, value: SavedBrowse) {
  cache.delete(key);
  if ((value.data?.active?.photos.length ?? value.data?.feed?.photos.length ?? 0) > 600 || (value.data?.albums.length ?? 0) > 240) value.data = undefined;
  cache.set(key, value);
  while (cache.size > 6) cache.delete(cache.keys().next().value!);
}
export function readBrowse(key: string) {
  const saved = cache.get(key);
  return saved && Date.now() - saved.time < 120000 ? saved : undefined;
}
export function browseKey(url: URL) {
  const copy = new URL(url);
  copy.pathname = copy.pathname.replace(/\/photos\/[\w-]+$/, '');
  for (const name of ['photo','anchor','after','albumAfter']) copy.searchParams.delete(name);
  copy.hash = ''; copy.searchParams.sort();
  return copy.pathname + copy.search;
}
