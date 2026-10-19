import type { BrowseData } from '../browse-state';
import { publicAlbumBrowse, publicPhotoFeed, relatedArticles } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from './runtime';
import { mapReturnPath } from '../visited/navigation';

export async function loadBrowse(url: URL, slug?: string, directPhoto?: string): Promise<BrowseData> {
  try {
    const app = getRuntime(), q = url.searchParams;
    const selected = directPhoto ?? q.get('photo');
    const anchor = q.get('anchor') ?? '';
    const photoAnchor = anchor.startsWith('album-') ? '' : anchor.replace(/^photo-/, '');
    const isFeed = url.pathname === '/photos' || q.get('kind') === 'photos';
    if (isFeed) {
      const catalog = await publicAlbumBrowse(app.db);
      const feed = await publicPhotoFeed(app.db, {
        tags: q.getAll('tag'), filters: {
          place: q.get('place') ?? '', cameras: q.getAll('camera'), lenses: q.getAll('lens'),
          focalMin: q.get('focalMin')?.trim() ? Number(q.get('focalMin')) : null,
          focalMax: q.get('focalMax')?.trim() ? Number(q.get('focalMax')) : null,
        }, sort: q.get('sort') ?? 'taken', month: q.get('month') ?? '',
        page: Number(q.get('page') ?? 1), after: q.get('after'),
        photoId: (selected !== 'first' && selected !== 'last' ? selected : null) || photoAnchor,
      });
      const photoId = selected === 'first' ? feed.photos[0]?.id : selected === 'last' ? feed.photos.at(-1)?.id : selected;
      if (selected && !feed.photos.some(p => p.id === photoId)) error(404, '照片不在当前公开列表中。');
      return { site: catalog.site, albums: [], feed, photoWindow: feed.window, photoId, origin: app.origin };
    }
    const catalog = await publicAlbumBrowse(app.db, {
      slug, search: q.get('q') ?? '', sort: q.get('sort') ?? 'updated',
      albumPage: Number(q.get(slug ? 'albumsPage' : 'page') ?? 1), albumAfter: q.get('albumAfter'),
      photoPage: Number(q.get('page') ?? 1), photoAfter: q.get('after'), photoId: selected || photoAnchor, albumAnchor: anchor.startsWith('album-') ? anchor.slice(6) : null,
    });
    const photo = catalog.active?.photos.find(p => p.id === selected);
    if (selected && !photo) error(404, '照片不存在或已从当前公开相册移除。');
    return { ...catalog, photoId: selected, photoTitle: photo?.group?.title || photo?.title, photoDescription: photo?.group?.description || photo?.description,
      returnTo: mapReturnPath(q.get('returnTo')),
      relatedArticles: catalog.active ? await relatedArticles(app.db, catalog.active.id) : [], origin: app.origin };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
