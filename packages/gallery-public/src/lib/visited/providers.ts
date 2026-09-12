import type { MapViewport, PhotoCluster } from '@gallery/core';
export interface Provider {
  provider: 'osm' | 'google' | 'amap';
  browserKey: string;
  tileUrl: string;
  attribution: string;
  isDefault: boolean;
}
export interface View {
  longitude: number;
  latitude: number;
  zoom: number;
}
export interface PhotoMap {
  view(): Promise<View>;
  viewport(): Promise<MapViewport>;
  move(view: View): Promise<void>;
  markers(clusters: PhotoCluster[], click: (c: PhotoCluster) => void): Promise<void>;
  destroy(): void;
}
// Third-party globals are deliberately confined to this bridge. No SDK type or
// browser global is imported by a server entrypoint.
type SDK = any;
const scripts = new Map<string, Promise<void>>();
function script(src: string, callback?: string) {
  if (scripts.has(src)) return scripts.get(src)!;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.onerror = null;
      if (callback) (window as SDK)[callback] = () => {};
      if (error) {
        el.remove();
        scripts.delete(src);
        reject(error);
      } else resolve();
    };
    if (callback) (window as SDK)[callback] = () => finish();
    else el.onload = () => finish();
    el.onerror = () => finish(new Error('地图服务未能加载，请切换底图或重试。'));
    el.async = true;
    el.src = src;
    timer = setTimeout(() => finish(new Error('地图服务连接超时，请切换底图。')), 20000);
    document.head.append(el);
  });
  scripts.set(src, promise);
  return promise;
}
const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
function bounds(west: number, south: number, east: number, north: number, zoom: number): MapViewport {
  return {
    west: east - west >= 359.99 ? -180 : wrap(west),
    east: east - west >= 359.99 ? 180 : wrap(east),
    south: Math.max(-90, south),
    north: Math.min(90, north),
    zoom: Math.max(0, Math.min(20, zoom)),
  };
}
function pin(c: PhotoCluster, click: (c: PhotoCluster) => void) {
  const button = document.createElement('button');
  button.className = 'photo-map-pin';
  button.type = 'button';
  button.setAttribute('aria-label', `${c.count} 张照片，${c.photo.title}`);
  const img = document.createElement('img');
  img.src = c.photo.thumbnail;
  img.alt = '';
  button.append(img);
  const count = document.createElement('span');
  count.textContent = String(c.count);
  button.append(count);
  button.onclick = (e) => {
    e.stopPropagation();
    click(c);
  };
  return button;
}
export async function createPhotoMap(
  container: HTMLElement,
  p: Provider,
  initial: View,
  changed: () => void,
  failed: (message: string) => void,
): Promise<PhotoMap> {
  if (p.provider === 'osm') {
    const base = '/vendor/maplibre-6.9.0/';
    if (!document.querySelector('link[data-gallery-maplibre]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = base + 'maplibre-gl.css';
      css.dataset.galleryMaplibre = '1';
      document.head.append(css);
    }
    const url = base + 'maplibre-gl.mjs';
    const sdk = await import(/* @vite-ignore */ url);
    const attribution = document.createElement('span');
    attribution.textContent = p.attribution;
    const copyright = document.createElement('a');
    copyright.href = 'https://www.openstreetmap.org/copyright';
    copyright.target = '_blank';
    copyright.rel = 'noopener';
    copyright.textContent = '许可';
    attribution.append(' · ', copyright);
    const map = new sdk.Map({
      container,
      center: [initial.longitude, initial.latitude],
      zoom: initial.zoom,
      maxZoom: 19,
      renderWorldCopies: true,
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: [p.tileUrl], tileSize: 256, attribution: attribution.innerHTML } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    });
    map.addControl(new sdk.NavigationControl({ showCompass: false }), 'top-right');
    map.on('moveend', changed);
    map.on('load', changed);
    map.on('error', () => failed('底图暂时加载失败，可重试或切换底图；照片列表仍可查看。'));
    let markers: SDK[] = [];
    return {
      async view() {
        const c = map.getCenter();
        return { longitude: wrap(c.lng), latitude: c.lat, zoom: map.getZoom() };
      },
      async viewport() {
        const b = map.getBounds();
        return bounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), map.getZoom());
      },
      async move(v) {
        map.easeTo({ center: [v.longitude, v.latitude], zoom: v.zoom });
      },
      async markers(items, click) {
        markers.forEach((m) => m.remove());
        markers = items.map((c) =>
          new sdk.Marker({ element: pin(c, click) }).setLngLat([c.longitude, c.latitude]).addTo(map),
        );
      },
      destroy() {
        markers.forEach((m) => m.remove());
        map.remove();
      },
    };
  }
  if (p.provider === 'google') {
    await script(
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(p.browserKey)}&v=quarterly&loading=async&callback=galleryGoogleReady&libraries=marker`,
      'galleryGoogleReady',
    );
    const sdk = (window as SDK).google.maps;
    (window as SDK).gm_authFailure = () => failed('Google 地图授权失败，请检查 Key 的来源限制或切换底图。');
    const map = new sdk.Map(container, {
      center: { lng: initial.longitude, lat: initial.latitude },
      zoom: initial.zoom,
      mapId: 'DEMO_MAP_ID',
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      maxZoom: 20,
    });
    const listener = map.addListener('idle', changed);
    let markers: SDK[] = [];
    return {
      async view() {
        const c = map.getCenter();
        return { longitude: c.lng(), latitude: c.lat(), zoom: map.getZoom() };
      },
      async viewport() {
        const b = map.getBounds();
        if (!b) throw new Error('地图仍在加载。');
        const sw = b.getSouthWest(),
          ne = b.getNorthEast();
        return bounds(sw.lng(), sw.lat(), ne.lng(), ne.lat(), map.getZoom());
      },
      async move(v) {
        map.setCenter({ lng: v.longitude, lat: v.latitude });
        map.setZoom(v.zoom);
      },
      async markers(items, click) {
        markers.forEach((m) => (m.map = null));
        markers = items.map(
          (c) =>
            new sdk.marker.AdvancedMarkerElement({
              map,
              position: { lng: c.longitude, lat: c.latitude },
              content: pin(c, click),
              title: c.photo.title,
            }),
        );
      },
      destroy() {
        listener.remove();
        markers.forEach((m) => (m.map = null));
        sdk.event.clearInstanceListeners(map);
        container.replaceChildren();
      },
    };
  }
  (window as SDK)._AMapSecurityConfig = { serviceHost: location.origin + '/_AMapService' };
  await script(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(p.browserKey)}`);
  const sdk = (window as SDK).AMap;
  type Point = [number, number];
  // Use the provider's conversion, including overseas coordinates. Inversion
  // uses repeated forward conversion instead of a China bounding-box heuristic.
  const convert = async (points: Point[]): Promise<Point[]> => {
    const result: Point[] = [];
    for (let i = 0; i < points.length; i += 40)
      result.push(
        ...(await new Promise<Point[]>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('高德坐标转换超时。')), 12000);
          sdk.convertFrom(points.slice(i, i + 40), 'gps', (status: string, value: SDK) => {
            clearTimeout(timer);
            if (status === 'complete' && value.locations?.length === Math.min(40, points.length - i))
              resolve(value.locations.map((p: SDK) => [p.getLng(), p.getLat()]));
            else reject(new Error('高德坐标转换失败，请切换底图。'));
          });
        })),
      );
    return result;
  };
  const inverse = async (target: Point[]): Promise<Point[]> => {
    let guess = target.map((p) => [...p] as Point);
    for (let i = 0; i < 4; i++) {
      const forward = await convert(guess);
      let error = 0;
      guess = guess.map((p, j) => {
        const dx = target[j]![0] - forward[j]![0],
          dy = target[j]![1] - forward[j]![1];
        error = Math.max(error, Math.abs(dx), Math.abs(dy));
        return [p[0] + dx, p[1] + dy];
      });
      if (error < 1e-7) return guess;
    }
    const verified = await convert(guess);
    if (verified.some((p, i) => Math.abs(p[0] - target[i]![0]) > 1e-5 || Math.abs(p[1] - target[i]![1]) > 1e-5))
      throw new Error('当前区域坐标转换未收敛，请切换底图。');
    return guess;
  };
  const center = (await convert([[initial.longitude, initial.latitude]]))[0]!;
  const map = new sdk.Map(container, { center, zoom: initial.zoom, zooms: [2, 20], viewMode: '2D' });
  map.on('moveend', changed);
  map.on('zoomend', changed);
  map.on('complete', changed);
  let markers: SDK[] = [];
  let alive = true,
    revision = 0;
  return {
    async view() {
      const c = map.getCenter(),
        p = (await inverse([[c.getLng(), c.getLat()]]))[0]!;
      return { longitude: p[0], latitude: p[1], zoom: map.getZoom() };
    },
    async viewport() {
      const b = map.getBounds(),
        sw = b.getSouthWest(),
        ne = b.getNorthEast(),
        points = await inverse([
          [sw.getLng(), sw.getLat()],
          [ne.getLng(), ne.getLat()],
        ]);
      return bounds(points[0]![0], points[0]![1], points[1]![0], points[1]![1], map.getZoom());
    },
    async move(v) {
      const center = (await convert([[v.longitude, v.latitude]]))[0]!;
      if (alive) map.setZoomAndCenter(v.zoom, center);
    },
    async markers(items, click) {
      const seq = ++revision,
        positions = await convert(items.map((c) => [c.longitude, c.latitude]));
      if (!alive || seq !== revision) return;
      map.remove(markers);
      markers = items.map(
        (c, i) => new sdk.Marker({ position: positions[i], content: pin(c, click), anchor: 'bottom-center' }),
      );
      map.add(markers);
    },
    destroy() {
      alive = false;
      revision++;
      map.destroy();
    },
  };
}
