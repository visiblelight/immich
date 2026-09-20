import { readArticleMedia, publishedCdnRedirect } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
import type { RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = async ({ params, url }) => {
  const authorizedAt = Date.now();
  try {
    const app = getRuntime();
    const bytes = await readArticleMedia(
      app.db,
      app.articleMediaRoot,
      params.id!,
      url.searchParams.get('variant') ?? 'thumbnail',
      params.article,
    );
    const cdn = await publishedCdnRedirect(bytes, authorizedAt);
    if (cdn) return cdn;
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
};
