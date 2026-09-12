import { amapProxySecret } from '@gallery/db/server';
import { GalleryError, ensure } from '@gallery/core';
import { getRuntime } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
const routes: Record<string, string> = {
  'v4/map/styles': 'https://webapi.amap.com/v4/map/styles',
  'v3/vectormap': 'https://fmap01.amap.com/v3/vectormap',
  'v3/assistant/coordinate/convert': 'https://restapi.amap.com/v3/assistant/coordinate/convert',
};
const windows = new Map<string, { until: number; count: number }>();
let concurrent = 0;
export const GET: RequestHandler = async ({ params, url, request, getClientAddress }) => {
  let entered = false;
  try {
    const app = getRuntime();
    ensure(request.headers.get('referer')?.startsWith(app.origin + '/'), '请求来源无效。', 403);
    const target = routes[params.path];
    ensure(target, '地图代理接口不存在。', 404);
    ensure(url.search.length < 12000, '地图请求过长。', 413);
    const now = Date.now(),
      ip = getClientAddress();
    for (const [key, value] of windows) if (value.until < now) windows.delete(key);
    const count = windows.get(ip) ?? { until: now + 60000, count: 0 };
    ensure(count.count++ < 300 && concurrent < 16 && windows.size < 5000, '地图请求过于频繁，请稍后再试。', 429);
    windows.set(ip, count);
    const config = await amapProxySecret(app.db, app.mapSecretKey);
    ensure(url.searchParams.get('key') === config.key, '地图 Key 无效。', 403);
    const upstream = new URL(target);
    upstream.search = url.search;
    upstream.searchParams.set('jscode', config.securityCode);
    upstream.searchParams.set('key', config.key);
    concurrent++;
    entered = true;
    const response = await fetch(upstream, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      headers: { Referer: app.origin + '/' },
    });
    ensure(response.ok, '地图服务暂时不可用。', 502);
    const reader = response.body?.getReader();
    ensure(reader, '地图服务返回为空。', 502);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8_000_000) {
        await reader.cancel();
        throw new GalleryError(502, '地图响应过大。');
      }
      chunks.push(value);
    }
    let body = Buffer.concat(chunks);
    const type = response.headers.get('content-type') ?? 'application/octet-stream';
    if (/json|javascript|text/.test(type))
      body = Buffer.from(body.toString().replaceAll(config.securityCode, '[redacted]'));
    return new Response(body, {
      headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  } catch (e) {
    return new Response(e instanceof GalleryError ? e.message : '地图服务暂时不可用。', {
      status: e instanceof GalleryError ? e.status : 502,
    });
  } finally {
    if (entered) concurrent--;
  }
};
