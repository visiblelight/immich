import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { sql, type Kysely } from 'kysely';
import { ensure, uuid, type GalleryUser } from '@gallery/core';
import { countries } from '../../gallery-core/src/countries.ts';
import { getCountryLocator } from './countries.server.ts';

type Db = Kysely<unknown>;
type City = [string, string, string[], string, string, number, number];
type Gazetteer = {
  localized?: Record<string, { zh?: string; en?: string; aliases: string[] }>;
  version: string;
  admins: Record<string, [string, string]>;
  cities: City[];
};
export type Place = {
  id: string;
  name: string;
  english: string;
  kind: 'country' | 'region' | 'city';
  country: string;
  parent: string;
  aliases: string[];
};
type Label = {
  id: string;
  name_zh: string;
  name_en: string;
  aliases: string[];
  canonical_id: string | null;
  version: string;
};
type Source = {
  asset_id: string;
  album_id?: string;
  photo_id?: string;
  location_mode: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  manual_place: string | null;
};
const normalized = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
let dictionary: Promise<{ places: Map<string, Place>; cells: Map<string, City[]> }> | undefined;
const cell = (lat: number, lng: number) => `${Math.floor(lat)},${Math.floor(lng)}`;
export function distanceKm(a: number, b: number, c: number, d: number) {
  const rad = Math.PI / 180,
    h =
      Math.sin(((c - a) * rad) / 2) ** 2 +
      Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
async function gazetteer() {
  return (dictionary ??= (async () => {
    const data = JSON.parse(
      gunzipSync(await readFile(new URL('../data/places.json.gz', import.meta.url))).toString(),
    ) as Gazetteer;
    const places = new Map<string, Place>(),
      cells = new Map<string, City[]>();
    for (const c of countries)
      places.set('country:' + c.id, {
        id: 'country:' + c.id,
        name: c.zh,
        english: c.en,
        kind: 'country',
        country: c.id,
        parent: '',
        aliases: [],
      });
    // Keep dependency grouping identical to the existing world map. Unsupported ISO
    // areas are mapped only when their own populated-place coordinates resolve.
    const locate = await getCountryLocator();
    const countryIds = new Set(countries.map((c) => c.id));
    const countryGroups = new Map<string, string>();
    for (const c of data.cities) {
      if (!countryIds.has(c[3]) && !countryGroups.has(c[3])) {
        const group = locate(c[6], c[5]);
        if (group) countryGroups.set(c[3], group);
      }
    }
    const groupCountry = (code: string) => countryGroups.get(code) ?? code;
    for (const [id, [name, rawCountry]] of Object.entries(data.admins)) {
      const country = groupCountry(rawCountry);
      places.set('region:' + id, {
        id: 'region:' + id,
        name,
        english: name,
        kind: 'region',
        country,
        parent: 'country:' + country,
        aliases: [],
      });
    }
    for (const c of data.cities) {
      c[3] = groupCountry(c[3]);
      places.set('city:' + c[0], {
        id: 'city:' + c[0],
        name: c[1],
        english: c[1],
        kind: 'city',
        country: c[3],
        parent: c[4] ? 'region:' + c[4] : 'country:' + c[3],
        aliases: c[2],
      });
      const key = cell(c[5], c[6]);
      const list = cells.get(key) ?? [];
      list.push(c);
      cells.set(key, list);
    }
    for (const [id, names] of Object.entries(data.localized ?? {})) {
      const p = places.get('city:' + id) ?? places.get('region:' + id);
      if (p) {
        p.aliases = [...new Set([...p.aliases, p.english, ...names.aliases])];
        p.english = names.en || p.english;
        p.name = names.zh || p.english;
      }
    }
    const editorial = JSON.parse(
      await readFile(new URL('../data/places-editorial.json', import.meta.url), 'utf8'),
    ) as Record<string, { zh: string; aliases: string[] }>;
    for (const [id, label] of Object.entries(editorial)) {
      const p = places.get(id);
      if (p) {
        p.name = label.zh;
        p.aliases = [...new Set([...p.aliases, ...label.aliases])];
      }
    }
    return { places, cells };
  })());
}
export async function placeResolver(db: Db) {
  const [{ places, cells }, locate, labels] = await Promise.all([
    gazetteer(),
    getCountryLocator(),
    sql<Label>`SELECT * FROM gallery.public_place_label`.execute(db),
  ]);
  const overrides = new Map(labels.rows.map((l) => [l.id, l]));
  const get = (id: string): Place | null => {
    const original = places.get(id);
    const originalLabel = overrides.get(id);
    const visited = new Set<string>();
    while (overrides.get(id)?.canonical_id) {
      if (visited.has(id)) return null;
      visited.add(id);
      id = overrides.get(id)!.canonical_id!;
    }
    const p = places.get(id);
    if (!p) return null;
    const l = overrides.get(id);
    return {
      ...p,
      name: l?.name_zh || l?.name_en || p.name,
      english: l?.name_en || p.english,
      aliases: [
        ...p.aliases,
        ...(original?.aliases ?? []),
        original?.name ?? '',
        original?.english ?? '',
        ...(originalLabel?.aliases ?? []),
        ...(l?.aliases ?? []),
      ],
    };
  };
  const path = (id: string) => {
    const result: Place[] = [];
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const p = get(id);
      if (!p) break;
      result.unshift(p);
      id = p.parent;
    }
    return result;
  };
  const nearby = (latitude: number, longitude: number, country: string) => {
    const found: { place: Place; distance: number }[] = [];
    const span = Math.min(180, Math.ceil(0.25 / Math.max(0.01, Math.cos((latitude * Math.PI) / 180)))) + 1;
    for (let y = Math.floor(latitude) - 1; y <= Math.floor(latitude) + 1; y++)
      for (let x = Math.floor(longitude) - span; x <= Math.floor(longitude) + span; x++) {
        const wrap = ((((x + 180) % 360) + 360) % 360) - 180;
        for (const c of cells.get(`${y},${wrap}`) ?? []) {
          if (c[3] !== country) continue;
          const distance = distanceKm(latitude, longitude, c[5], c[6]);
          if (distance <= 25) {
            const place = get('city:' + c[0]);
            if (place) found.push({ place, distance });
          }
        }
      }
    return found.sort((a, b) => a.distance - b.distance);
  };
  const compute = (s: Source): Place[] => {
    if (s.latitude === null || s.longitude === null || s.location_mode === 'hidden') return [];
    const country = locate(s.longitude, s.latitude, s.location_mode === 'approximate');
    if (!country) return [];
    const base = path('country:' + country);
    if (s.location_mode !== 'exact') return base;
    const manual = s.manual_place ? get(s.manual_place) : null;
    if (manual?.country === country) return path(manual.id);
    // A populated-place point is not an administrative boundary. Require corroborating
    // source text AND nearby coordinates; otherwise expose only the reliable country.
    if (!s.city) return base;
    const name = normalized(s.city);
    const candidates = nearby(s.latitude, s.longitude, country).filter(({ place }) =>
      [place.name, place.english, ...place.aliases].some((n) => normalized(n) === name),
    );
    const unique = [...new Map(candidates.map((c) => [c.place.id, c.place])).values()];
    if (unique.length !== 1) return base;
    const p = unique[0]!;
    const parent = get(p.parent);
    if (
      s.state &&
      parent?.kind === 'region' &&
      ![parent.name, parent.english, ...parent.aliases].some((n) => normalized(n) === normalized(s.state!))
    )
      return base;
    return path(p.id);
  };
  const cache = new Map<string, Place[]>();
  const resolve = (s: Source) => {
    const key = JSON.stringify([s.latitude, s.longitude, s.location_mode, s.city, s.state, s.manual_place]);
    const old = cache.get(key);
    if (old) return old;
    const value = compute(s);
    if (cache.size < 10000) cache.set(key, value);
    return value;
  };
  return { get, path, nearby, resolve, all: places, labels: overrides, locate };
}
export async function publicPhotoPlaces(db: Db, albumId = '') {
  const [resolver, rows] = await Promise.all([
    placeResolver(db),
    sql<Source>`SELECT * FROM gallery.published_photo_place_source ${albumId ? sql`WHERE album_id=${uuid(albumId)}::uuid` : sql``}`.execute(
      db,
    ),
  ]);
  const byPhoto = new Map<string, Place[]>(),
    byAsset = new Map<string, Place[]>();
  const sources = new Map<string, Source>();
  const rank = (s: Source) => (s.location_mode === 'hidden' ? 2 : s.location_mode === 'approximate' ? 1 : 0);
  for (const s of rows.rows) {
    byPhoto.set(`${s.album_id}/${s.photo_id}`, resolver.resolve(s));
    const old = sources.get(s.asset_id);
    if (!old || rank(s) > rank(old)) sources.set(s.asset_id, s);
  }
  for (const [id, s] of sources) byAsset.set(id, resolver.resolve(s));
  return { byPhoto, byAsset, resolver };
}
export async function adminPlaces(db: Db, query = '') {
  ensure(query.length <= 120, '地点搜索过长。');
  const r = await placeResolver(db);
  const rows = (
    await sql<
      Source & { filename: string; version: string | null }
    >`SELECT s.asset_id,s.filename,s.latitude,s.longitude,s.city,s.state,'exact' AS location_mode,
 CASE WHEN o.latitude=s.latitude AND o.longitude=s.longitude THEN o.place_id END AS manual_place,o.version::text
 FROM gallery.admin_source_asset s LEFT JOIN gallery.photo_place o ON o.asset_id=s.asset_id
 WHERE EXISTS(SELECT 1 FROM gallery.album_photo p WHERE p.immich_asset_id=s.asset_id) AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL ORDER BY s.asset_id`.execute(
      db,
    )
  ).rows;
  const used = new Set<string>();
  const photos = rows.map((s) => {
    const places = r.resolve(s);
    for (const p of places) used.add(p.id);
    const country = r.locate(s.longitude!, s.latitude!);
    return {
      ...s,
      places,
      candidates:
        places.at(-1)?.kind === 'city'
          ? []
          : country
            ? r
                .nearby(s.latitude!, s.longitude!, country)
                .slice(0, 5)
                .map((c) => ({
                  id: c.place.id,
                  name: c.place.name,
                  distance: Math.round(c.distance * 10) / 10,
                }))
            : [],
    };
  });
  const q = normalized(query);
  const ids = q
    ? [...r.all.values()]
        .filter((p) => {
          const v = r.get(p.id)!;
          return [v.name, v.english, ...v.aliases].some((n) => normalized(n).includes(q));
        })
        .slice(0, 60)
        .map((p) => p.id)
    : [...new Set([...used, ...r.labels.keys()])];
  return {
    places: ids.map((id) => ({
      ...r.get(id)!,
      ...{
        nameZh: r.labels.get(id)?.name_zh ?? '',
        nameEn: r.labels.get(id)?.name_en ?? '',
        customAliases: r.labels.get(id)?.aliases ?? [],
        canonicalId: r.labels.get(id)?.canonical_id ?? '',
        version: r.labels.get(id)?.version ?? '0',
        sourceId: id,
        path: r
          .path(id)
          .map((p) => p.name)
          .join(' / '),
      },
    })),
    photos,
  };
}
export async function savePlace(db: Db, user: GalleryUser, input: Record<string, unknown>) {
  return db.transaction().execute(async (trx) => {
    ensure(
      (
        await sql`SELECT id FROM gallery."user" WHERE id=${user.id}::uuid AND status='active' AND role='admin' FOR SHARE`.execute(
          trx,
        )
      ).rows.length,
      '登录已失效。',
      401,
    );
    await sql`SELECT id FROM gallery.site WHERE id=1 FOR UPDATE`.execute(trx);
    const r = await placeResolver(trx);
    if (input.asset) {
      const asset = uuid(input.asset),
        place = r.get(String(input.place ?? ''));
      const s = (
        await sql<Source>`SELECT asset_id,latitude,longitude FROM gallery.admin_source_asset WHERE asset_id=${asset}::uuid AND EXISTS(SELECT 1 FROM gallery.album_photo WHERE immich_asset_id=${asset}::uuid)`.execute(
          trx,
        )
      ).rows[0];
      ensure(s && s.latitude !== null && s.longitude !== null, '照片位置不可用。');
      ensure(
        s.latitude === input.latitude && s.longitude === input.longitude,
        '照片位置已变化，请刷新后重新核对。',
        409,
      );
      const old = (
        await sql<{
          version: string;
        }>`SELECT version::text FROM gallery.photo_place WHERE asset_id=${asset}::uuid`.execute(trx)
      ).rows[0];
      ensure((old?.version ?? '0') === input.version, '归属已修改，请刷新。', 409);
      if (input.clear === true)
        await sql`DELETE FROM gallery.photo_place WHERE asset_id=${asset}::uuid`.execute(trx);
      else {
        ensure(
          place && place.country === r.locate(s.longitude!, s.latitude!),
          '请选择当前国家内的有效地点。',
        );
        await sql`INSERT INTO gallery.photo_place(asset_id,place_id,latitude,longitude) VALUES(${asset}::uuid,${place.id},${s.latitude},${s.longitude}) ON CONFLICT(asset_id) DO UPDATE SET place_id=excluded.place_id,latitude=excluded.latitude,longitude=excluded.longitude,version=gallery.photo_place.version+1,updated_at=now()`.execute(
          trx,
        );
      }
    } else {
      const id = String(input.id ?? ''),
        p = r.all.get(id);
      ensure(p, '地点不存在。');
      const old = (
        await sql<{ version: string }>`SELECT version::text FROM gallery.place_label WHERE id=${id}`.execute(
          trx,
        )
      ).rows[0];
      ensure((old?.version ?? '0') === input.version, '地点已修改，请刷新。', 409);
      const zh = String(input.nameZh ?? '').trim(),
        en = String(input.nameEn ?? '').trim(),
        canonical = String(input.canonicalId ?? '').trim();
      ensure(zh.length <= 120 && en.length <= 120, '名称最长 120 字。');
      ensure(
        Array.isArray(input.aliases) &&
          input.aliases.length <= 30 &&
          input.aliases.every((a) => typeof a === 'string' && a.length <= 120),
        '别名格式无效。',
      );
      if (canonical) {
        const target = r.get(canonical);
        ensure(
          target && target.id !== id && target.kind === p.kind && target.country === p.country,
          '合并目标须为同国家同级地点，且不能形成循环。',
        );
      }
      await sql`INSERT INTO gallery.place_label(id,name_zh,name_en,aliases,canonical_id) VALUES(${id},${zh},${en},${input.aliases as string[]}::text[],${canonical || null}) ON CONFLICT(id) DO UPDATE SET name_zh=excluded.name_zh,name_en=excluded.name_en,aliases=excluded.aliases,canonical_id=excluded.canonical_id,version=gallery.place_label.version+1,updated_at=now()`.execute(
        trx,
      );
    }
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${crypto.randomUUID()}::uuid,${user.id}::uuid,'place.save','place',${String(input.asset || input.id)})`.execute(
      trx,
    );
  });
}
