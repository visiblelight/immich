import { publicArticle, publicCatalog } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
import { error } from '@sveltejs/kit';
import { GalleryError } from '@gallery/core';
export async function load({
  params,
  setHeaders,
}: {
  params: { slug: string };
  setHeaders: (h: Record<string, string>) => void;
}) {
  setHeaders({ 'cache-control': 'no-store' });
  const app = getRuntime();
  try {
    return { article: await publicArticle(app.db, params.slug), site: (await publicCatalog(app.db)).site };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
