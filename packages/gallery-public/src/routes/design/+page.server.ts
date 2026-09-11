import { error } from '@sveltejs/kit';
import { albums } from '$lib/design/catalog-data';
export function load({ url }: { url: URL }) {
  const albumId = url.searchParams.get('album');
  const view = url.searchParams.get('page') || 'albums';
  if (!['albums', 'about'].includes(view) || (albumId && !albums.some((album) => album.id === albumId))) {
    error(404, '页面不存在');
  }
  return { albumId, view };
}
