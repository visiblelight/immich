import { publicCatalog } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
export async function load({ params }: { params: { slug: string } }) {
  try {
    const app = getRuntime();
    return { ...(await publicCatalog(app.db, params.slug)), origin: app.origin };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
