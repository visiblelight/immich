import { ensure } from './content.ts';
export type PhotoFilters = {
  place: string;
  cameras: string[];
  lenses: string[];
  focalMin: number | null;
  focalMax: number | null;
};
export type FilterEvidence = {
  places: string[];
  camera: string;
  lens: string;
  focal: number | null;
  tags: string[];
  month: string;
};
export const equipmentKey = (v: unknown) =>
  typeof v === 'string' ? v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
export const equipmentName = (v: unknown) =>
  typeof v === 'string' ? v.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
export function photoFilters(input: Partial<PhotoFilters> = {}): PhotoFilters {
  const place = input.place ?? '';
  ensure(
    typeof place === 'string' && (!place || /^(country:[A-Z]{2}|(?:region|city):\d+)$/.test(place)),
    '地点筛选无效。',
  );
  const list = (values: unknown) => {
    ensure(
      Array.isArray(values) &&
        values.length <= 30 &&
        values.every((v) => typeof v === 'string' && v.length <= 250),
      '器材筛选无效。',
    );
    return [...new Set(values as string[])];
  };
  const min = input.focalMin ?? null,
    max = input.focalMax ?? null;
  for (const v of [min, max])
    ensure(v === null || (Number.isFinite(v) && v >= 0 && v <= 100000), '焦距范围无效。');
  ensure(min === null || max === null || min <= max, '最小焦距不能大于最大焦距。');
  return {
    place,
    cameras: list(input.cameras ?? []),
    lenses: list(input.lenses ?? []),
    focalMin: min,
    focalMax: max,
  };
}
export function matchesPhoto(
  p: FilterEvidence,
  f: PhotoFilters,
  tags: string[],
  month: string,
  exclude = '',
) {
  return (
    (exclude === 'place' || !f.place || p.places.includes(f.place)) &&
    (exclude === 'camera' || !f.cameras.length || f.cameras.includes(p.camera)) &&
    (exclude === 'lens' || !f.lenses.length || f.lenses.includes(p.lens)) &&
    (exclude === 'focal' ||
      (f.focalMin === null && f.focalMax === null) ||
      (p.focal !== null &&
        (f.focalMin === null || p.focal >= f.focalMin) &&
        (f.focalMax === null || p.focal <= f.focalMax))) &&
    (exclude === 'tag' || tags.every((t) => p.tags.includes(t))) &&
    (exclude === 'month' || !month || p.month === month)
  );
}
export function appendPhotoFilters(q: URLSearchParams, f?: Partial<PhotoFilters>) {
  if (f?.place) q.set('place', f.place);
  for (const c of f?.cameras ?? []) q.append('camera', c);
  for (const l of f?.lenses ?? []) q.append('lens', l);
  if (f?.focalMin !== null && f?.focalMin !== undefined) q.set('focalMin', String(f.focalMin));
  if (f?.focalMax !== null && f?.focalMax !== undefined) q.set('focalMax', String(f.focalMax));
  return q;
}

export type PlaceChoice = {
  id: string;
  name: string;
  path: string;
  kind: string;
  parent: string;
  count: number;
};
export type PlaceChoiceNode = PlaceChoice & { children: PlaceChoiceNode[] };
/** Stable IDs define hierarchy. Search keeps the ancestors of every matching place. */
export function placeChoiceTree(places: PlaceChoice[], search = ''): PlaceChoiceNode[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const included = new Set<string>();
  const query = search.trim().toLocaleLowerCase();
  for (const place of places) {
    if (!place.path.toLocaleLowerCase().includes(query)) continue;
    let id = place.id;
    const seen = new Set<string>();
    while (id && byId.has(id) && !seen.has(id)) {
      seen.add(id);
      included.add(id);
      id = byId.get(id)!.parent;
    }
  }
  const children = new Map<string, PlaceChoice[]>();
  for (const p of places) {
    if (!included.has(p.id)) continue;
    const parent = byId.has(p.parent) ? p.parent : '';
    children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  const visited = new Set<string>();
  const build = (parent: string): PlaceChoiceNode[] =>
    (children.get(parent) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id))
      .filter((p) => !visited.has(p.id))
      .map((p) => {
        visited.add(p.id);
        return { ...p, children: build(p.id) };
      });
  return build('');
}
