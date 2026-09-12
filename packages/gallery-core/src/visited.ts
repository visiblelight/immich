export interface VisitSummary {
  id: string;
  start: string | null;
  end: string | null;
  count: number;
  manual: boolean;
  label: string;
}
export interface VisitedCountry {
  id: string;
  name: string;
  count: number;
  visits: VisitSummary[];
}
export interface MapViewport {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}
export interface MapPhoto {
  id: string;
  albumId: string;
  albumSlug: string;
  title: string;
  thumbnail: string;
  latitude: number;
  longitude: number;
}
export interface PhotoCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  photo: MapPhoto;
}
export function validMapViewport(v: MapViewport) {
  return (
    Object.values(v).every(Number.isFinite) &&
    v.west >= -180 &&
    v.west <= 180 &&
    v.east >= -180 &&
    v.east <= 180 &&
    v.south >= -90 &&
    v.north <= 90 &&
    v.south <= v.north &&
    v.zoom >= 0 &&
    v.zoom <= 20
  );
}
export function mercatorY(latitude: number) {
  const sin = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}
/** Bound the number of cells using the complete viewport, without dropping photos. */
export function clusterPhotos<T extends { latitude: number; longitude: number }>(photos: T[], v: MapViewport) {
  if (!validMapViewport(v)) throw new Error('Invalid map viewport');
  const span = (v.east >= v.west ? v.east - v.west : 360 - v.west + v.east) / 360;
  const step = Math.max(90 / (256 * 2 ** v.zoom), span / 24, Math.abs(mercatorY(v.south) - mercatorY(v.north)) / 16);
  const groups = new Map<string, T[]>();
  for (const p of photos) {
    if (
      p.latitude < v.south ||
      p.latitude > v.north ||
      (v.west <= v.east ? p.longitude < v.west || p.longitude > v.east : p.longitude < v.west && p.longitude > v.east)
    )
      continue;
    const id = `${Math.floor((p.longitude + 180) / 360 / step)}:${Math.floor(mercatorY(p.latitude) / step)}`;
    const group = groups.get(id) ?? [];
    group.push(p);
    groups.set(id, group);
  }
  return groups;
}
export function photoBounds(photos: { latitude: number; longitude: number }[]): MapViewport {
  if (!photos.length) return { west: -180, south: -70, east: 180, north: 80, zoom: 1 };
  const lngs = photos.map((p) => p.longitude).sort((a, b) => a - b);
  let largestGap = -1,
    index = 0;
  for (let i = 0; i < lngs.length; i++) {
    const gap = (i + 1 < lngs.length ? lngs[i + 1]! : lngs[0]! + 360) - lngs[i]!;
    if (gap > largestGap) {
      largestGap = gap;
      index = i;
    }
  }
  return {
    west: lngs[(index + 1) % lngs.length]!,
    east: lngs[index]!,
    south: photos.reduce((n, p) => Math.min(n, p.latitude), 90),
    north: photos.reduce((n, p) => Math.max(n, p.latitude), -90),
    zoom: photos.length === 1 ? 10 : 5,
  };
}
