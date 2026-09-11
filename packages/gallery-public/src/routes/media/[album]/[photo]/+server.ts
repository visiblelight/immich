import { readPublishedDerivative, sanitizeImage } from '@gallery/db/server';
import { isUuid } from '@gallery/core';
import { getRuntime } from '$lib/server/runtime';
import type { RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = async ({ params, url }) => {
  const variant = url.searchParams.get('variant') ?? 'thumbnail';
  if (!isUuid(params.album) || !isUuid(params.photo) || !['thumbnail', 'preview'].includes(variant))
    return new Response(null, { status: 404 });
  try {
    const app = getRuntime();
    const media = await readPublishedDerivative(
      app.db,
      params.album,
      params.photo,
      variant as 'thumbnail' | 'preview',
      app.root,
    );
    return new Response(new Uint8Array(await sanitizeImage(media.bytes, variant as 'thumbnail' | 'preview')), {
      headers: { 'content-type': 'image/webp', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  } catch {
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
};
