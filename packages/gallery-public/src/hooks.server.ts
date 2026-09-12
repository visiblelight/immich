import type { Handle } from '@sveltejs/kit';
import { GalleryError } from '@gallery/core';
import { getRuntime } from '$lib/server/runtime';
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/design') || event.url.pathname.startsWith('/health/')) return resolve(event);
  try {
    const app = getRuntime();
    await app.ready();
    const response = await resolve(event);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set(
      'referrer-policy',
      event.url.pathname.startsWith('/visited') ? 'strict-origin-when-cross-origin' : 'same-origin',
    );
    return response;
  } catch (e) {
    return new Response(e instanceof GalleryError ? e.message : 'Gallery 暂时无法读取内容。', {
      status: e instanceof GalleryError ? e.status : 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
};
