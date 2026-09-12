import { readPublishedDerivative, sanitizeImage, imageContentType } from '@gallery/db/server';
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
    const output = await sanitizeImage(media.bytes, variant as 'thumbnail' | 'preview');
    return new Response(new Uint8Array(output), {
      headers: {
        'content-type': imageContentType(output),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  }
};
