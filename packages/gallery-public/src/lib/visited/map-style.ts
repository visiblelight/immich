import { osmStyleUrl, OSM_RASTER_TILES } from '@gallery/core';
import { englishNames } from './map-language.ts';

export const MAP_FALLBACK_MESSAGE = '矢量底图暂时不可用，已切换为标准底图（地名使用当地语言）。';
// Style expressions have a heterogeneous schema; keep them at the SDK boundary.
type Style = Record<string, any>;
export function rasterStyle(tileUrl: string, attribution: string): Style {
  return {
    version: 8,
    sources: { osm: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}
export async function loadOsmStyle(
  tileUrl: string,
  attribution: string,
  language: 'en' | 'local',
  origin: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(osmStyleUrl(tileUrl), origin);
  const fallback = rasterStyle(OSM_RASTER_TILES, attribution);
  if (!url.pathname.endsWith('.json'))
    return { style: rasterStyle(tileUrl, attribution), vector: false, fallback, warning: '' };
  try {
    const response = await fetcher(url.href, {
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Map style unavailable');
    const style: Style = await response.json();
    if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources)
      throw new Error('Invalid map style');
    const absolute = (value: string) =>
      new URL(value, response.url || url.href).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
    if (style.glyphs) style.glyphs = absolute(style.glyphs);
    if (typeof style.sprite === 'string') style.sprite = absolute(style.sprite);
    else if (Array.isArray(style.sprite))
      style.sprite = style.sprite.map((sprite: Style) => ({ ...sprite, url: absolute(sprite.url) }));
    for (const source of Object.values(style.sources) as Style[]) {
      if (source.url) source.url = absolute(source.url);
      if (source.tiles) source.tiles = source.tiles.map(absolute);
    }
    if (language === 'en')
      for (const layer of style.layers) {
        if (layer.layout?.['text-field'])
          layer.layout['text-field'] = englishNames(layer.layout['text-field']);
      }
    return { style, vector: true, fallback, warning: '' };
  } catch {
    return { style: fallback, vector: false, fallback, warning: MAP_FALLBACK_MESSAGE };
  }
}
