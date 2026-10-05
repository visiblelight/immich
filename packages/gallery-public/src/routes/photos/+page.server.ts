import { publicCatalog, publicPhotoFeed } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
export async function load({ url }: { url: URL }) {
  try {
    const app = getRuntime();
    const catalog = await publicCatalog(app.db);
    const feed = await publicPhotoFeed(app.db, {
      tags: url.searchParams.getAll('tag'),
      filters: {
        place: url.searchParams.get('place') ?? '',
        cameras: url.searchParams.getAll('camera'),
        lenses: url.searchParams.getAll('lens'),
        focalMin: url.searchParams.get('focalMin')?.trim() ? Number(url.searchParams.get('focalMin')) : null,
        focalMax: url.searchParams.get('focalMax')?.trim() ? Number(url.searchParams.get('focalMax')) : null,
      },
      sort: url.searchParams.get('sort') ?? 'taken',
      month: url.searchParams.get('month') ?? '',
      page: Number(url.searchParams.get('page') ?? 1),
    });
    const selected = url.searchParams.get('photo');
    const photoId =
      selected === 'first' ? feed.photos[0]?.id : selected === 'last' ? feed.photos.at(-1)?.id : selected;
    if (selected && !feed.photos.some((p) => p.id === photoId)) error(404, '照片不在当前公开列表中。');
    return { site: catalog.site, albums: catalog.albums, feed, photoId, origin: app.origin };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
