import { publicCatalog } from '@gallery/db/server';
import { GalleryError, isUuid } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
export async function load({ params }: { params: { slug: string; photoId: string } }) {
  if (!isUuid(params.photoId)) error(404, '照片不存在或尚未公开。');
  try {
    const app = getRuntime();
    const catalog = await publicCatalog(app.db, params.slug);
    const photo = catalog.active?.photos.find((p) => p.id === params.photoId);
    if (!photo) error(404, '照片不存在或已从当前公开相册移除。');
    return {
      ...catalog,
      photoId: photo.id,
      photoTitle: photo.group ? photo.group.title : photo.title,
      photoDescription: photo.group ? photo.group.description : photo.description,
      origin: app.origin,
    };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
