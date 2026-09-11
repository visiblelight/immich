import type { Handle } from '@sveltejs/kit';
import { GalleryError } from '@gallery/core';
import { sessionUser } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/design') || event.url.pathname.startsWith('/health/')) return resolve(event);
  try {
    const app = getRuntime();
    // Chromium can omit the port from Origin on IP-literal loopback URLs.
    // Navigate old local page links to the configured hostname before submitting;
    // never redirect a POST or relax the origin/port check.
    const origin = new URL(app.origin);
    if (
      ['GET', 'HEAD'].includes(event.request.method) &&
      origin.hostname === 'localhost' &&
      event.request.headers.get('host') === `127.0.0.1${origin.port ? ':' + origin.port : ''}`
    ) {
      return new Response(null, {
        status: 307,
        headers: { location: `${app.origin}${event.url.pathname}${event.url.search}`, 'cache-control': 'no-store' },
      });
    }
    await app.ready();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
      event.request.headers.get('origin') !== app.origin
    )
      return Response.json(
        { message: `请求来源与后台地址不一致，请通过 ${app.origin}/login 登录。` },
        { status: 403, headers: { 'cache-control': 'no-store' } },
      );
    event.locals.user = await sessionUser(app.db, event.cookies.get('gallery_admin_session'));
    const open = event.url.pathname === '/login' || event.url.pathname === '/api/login';
    if (!open && !event.locals.user) {
      return event.url.pathname.startsWith('/api/') || event.url.pathname.startsWith('/media/')
        ? Response.json({ message: '请先登录 Gallery。' }, { status: 401, headers: { 'cache-control': 'no-store' } })
        : new Response(null, { status: 303, headers: { location: '/login', 'cache-control': 'no-store' } });
    }
    const response = await resolve(event);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-robots-tag', 'noindex, nofollow');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('referrer-policy', 'same-origin');
    response.headers.set('x-frame-options', 'DENY');
    return response;
  } catch (e) {
    const message = e instanceof GalleryError ? e.message : 'Gallery 暂时无法连接数据服务。';
    const options = {
      status: e instanceof GalleryError ? e.status : 503,
      headers: { 'cache-control': 'no-store' },
    };
    return event.url.pathname.startsWith('/api/')
      ? Response.json({ message }, options)
      : new Response(message, options);
  }
};
