import type { Handle } from '@sveltejs/kit';
import { GalleryError } from '@gallery/core';
import { getRuntime } from '$lib/server/runtime';
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/design') || event.url.pathname.startsWith('/health/'))
    return resolve(event);
  try {
    const app = getRuntime();
    const origin = new URL(app.origin);
    if (
      ['GET', 'HEAD'].includes(event.request.method) &&
      origin.hostname === 'localhost' &&
      event.request.headers.get('host') === `127.0.0.1${origin.port ? ':' + origin.port : ''}`
    )
      return new Response(null, {
        status: 307,
        headers: {
          location: `${app.origin}${event.url.pathname}${event.url.search}`,
          'cache-control': 'no-store',
        },
      });
    await app.ready();
    const response = await resolve(event);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    return response;
  } catch (e) {
    return new Response(e instanceof GalleryError ? e.message : 'Gallery 暂时无法读取内容。', {
      status: e instanceof GalleryError ? e.status : 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
};
