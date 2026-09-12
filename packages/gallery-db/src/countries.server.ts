import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

type Point = [number, number];
type Box = [number, number, number, number];
type Edge = [Point, Point];
type Ring = { box: Box; points: Point[]; bands: Map<number, Edge[]> };
type Polygon = { country: string; box: Box; rings: Ring[] };
export type BoundaryData = { version: string; regions: Record<string, number[][][][]> };
const cell = (x: number, y: number) => `${((Math.floor((x + 180) / 5) % 72) + 72) % 72}:${Math.floor((y + 90) / 5)}`;
const overlaps = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function ring(source: number[][]): Ring {
  const points: Point[] = [];
  for (const [rawX, rawY] of source) {
    let x = rawX!;
    const y = rawY!;
    if (points.length) {
      const previous = points.at(-1)![0];
      while (x - previous > 180) x -= 360;
      while (x - previous < -180) x += 360;
    }
    points.push([x, y]);
  }
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  const bands = new Map<number, Edge[]>();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    for (let band = Math.floor(Math.min(a[1], b[1]) / 5); band <= Math.floor(Math.max(a[1], b[1]) / 5); band++) {
      const edges = bands.get(band) ?? [];
      edges.push([a, b]);
      bands.set(band, edges);
    }
  }
  return { points, box, bands };
}
// null means on an uncertain boundary, not an arbitrary assignment to either side.
function inRing(x: number, y: number, r: Ring): boolean | null {
  if (x < r.box[0] || x > r.box[2] || y < r.box[1] || y > r.box[3]) return false;
  let inside = false;
  for (const [a, b] of r.bands.get(Math.floor(y / 5)) ?? []) {
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    if (
      Math.abs(cross) < 1e-10 &&
      x >= Math.min(a[0], b[0]) &&
      x <= Math.max(a[0], b[0]) &&
      y >= Math.min(a[1], b[1]) &&
      y <= Math.max(a[1], b[1])
    )
      return null;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function inPolygon(x: number, y: number, p: Polygon): boolean | null {
  const outer = inRing(x, y, p.rings[0]!);
  if (outer !== true) return outer;
  for (const hole of p.rings.slice(1)) {
    const contained = inRing(x, y, hole);
    if (contained === null) return null;
    if (contained) return false;
  }
  return true;
}
function edgeMeetsBox(a: Point, b: Point, box: Box) {
  let lo = 0,
    hi = 1;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - box[0]],
    [dx, box[2] - a[0]],
    [-dy, a[1] - box[1]],
    [dy, box[3] - a[1]],
  ]) {
    if (p === 0) {
      if (q! < 0) return false;
      continue;
    }
    const t = q! / p!;
    if (p! < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return false;
  }
  return true;
}
export function createCountryLocator(data: BoundaryData) {
  const cells = new Map<string, Polygon[]>();
  for (const [country, polygons] of Object.entries(data.regions))
    for (const source of polygons) {
      const rings = source.map(ring),
        p = { country, rings, box: rings[0]!.box };
      const seen = new Set<string>();
      for (let x = Math.floor(p.box[0] / 5) * 5; x <= p.box[2]; x += 5)
        for (let y = Math.floor(p.box[1] / 5) * 5; y <= p.box[3]; y += 5) {
          const key = cell(x, y);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = cells.get(key) ?? [];
          list.push(p);
          cells.set(key, list);
        }
    }
  const cache = new Map<string, string | null>();
  const candidates = (x: number, y: number) => cells.get(cell(x, y)) ?? [];
  const exact = (x: number, y: number) => {
    const found = new Set<string>();
    for (const p of candidates(x, y))
      for (const shift of [0, -360, 360]) {
        const inside = inPolygon(x + shift, y, p);
        if (inside === null) return null;
        if (inside) found.add(p.country);
      }
    return found.size === 1 ? [...found][0]! : null;
  };
  return (longitude: number, latitude: number, approximate = false): string | null => {
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    )
      return null;
    const key = `${longitude}:${latitude}:${approximate}`;
    if (cache.has(key)) return cache.get(key)!;
    let result = exact(longitude, latitude);
    if (result && approximate) {
      const box: Box = [
        longitude - 0.01,
        Math.max(-90, latitude - 0.01),
        longitude + 0.01,
        Math.min(90, latitude + 0.01),
      ];
      const nearby = new Set<Polygon>();
      for (const x of [box[0], longitude, box[2]])
        for (const y of [box[1], latitude, box[3]]) for (const p of candidates(x, y)) nearby.add(p);
      // Including another country's boundary (even a tiny enclave fully within the
      // cell) is ambiguous. Never reveal which exact side the source GPS falls on.
      for (const p of nearby) {
        if (p.country === result) continue;
        for (const shift of [0, -360, 360]) {
          const shifted: Box = [box[0] + shift, box[1], box[2] + shift, box[3]];
          if (!overlaps(shifted, p.box)) continue;
          if (
            inPolygon(shifted[0], shifted[1], p) ||
            p.rings.some((r) => {
              for (let band = Math.floor(box[1] / 5); band <= Math.floor(box[3] / 5); band++)
                if ((r.bands.get(band) ?? []).some(([a, b]) => edgeMeetsBox(a, b, shifted))) return true;
              return false;
            })
          ) {
            result = null;
            break;
          }
        }
        if (!result) break;
      }
    }
    if (cache.size >= 50000) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  };
}
let locator: Promise<ReturnType<typeof createCountryLocator>> | undefined;
export const getCountryLocator = () =>
  (locator ??= (async () =>
    createCountryLocator(
      JSON.parse(gunzipSync(await readFile(new URL('../data/countries-5.1.2.json.gz', import.meta.url))).toString()),
    ))());
