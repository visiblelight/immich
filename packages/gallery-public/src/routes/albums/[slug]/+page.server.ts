import { publicCatalog } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
export async function load({ params, url }: { params: { slug: string }; url: URL }) {
  try {
    const app = getRuntime();
    return {
      ...(await publicCatalog(app.db, params.slug)),
      origin: app.origin,
      initialPage: Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)),
    };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
