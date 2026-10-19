import { json } from '@sveltejs/kit';
import { regionPhotos } from '@gallery/db/server';
import { GalleryError, ensure, validMapViewport, type MapViewport } from '@gallery/core';
import { getRuntime } from '$lib/server/runtime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const q = url.searchParams;
    const scope = q.get('scope') ?? 'region';
    ensure(scope === 'region' || scope === 'country' || scope === 'all', '照片范围无效。');
    const fields = ['west', 'south', 'east', 'north', 'zoom'] as const;
    let viewport: MapViewport | undefined;
    if (fields.some(k => q.has(k))) {
      ensure(fields.every(k => q.has(k) && q.get(k)?.trim()), '地图范围不完整。');
      viewport = Object.fromEntries(fields.map(k => [k, Number(q.get(k))])) as unknown as MapViewport;
      ensure(validMapViewport(viewport), '地图范围无效。');
    }
    return json(await regionPhotos(getRuntime().db, params.region, {
      scope, viewport, visitId: q.get('visit'), cluster: q.get('cluster'), page: Number(q.get('page') ?? 1),
    }));
  } catch (e) {
    return json({ message: e instanceof GalleryError ? e.message : '暂时无法加载照片。' },
      { status: e instanceof GalleryError ? e.status : 503 });
  }
};
