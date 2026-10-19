import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { sql, type Kysely } from 'kysely';
import {
  ensure,
  uuid,
  chinaRegions,
  regionByCode,
  type GalleryUser,
} from '@gallery/core';
import { countries } from '../../gallery-core/src/countries.ts';
import {
  getCountryLocator,
  getCoastalCountryLocator,
} from './countries.server.ts';
import { getRegionLocator } from './regions.server.ts';

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
  regionCode?: string;
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
  public_location_mode?: string | null;
};
const normalized = (s: string) =>
  s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
let dictionary:
  | Promise<{
      places: Map<string, Place>;
      cells: Map<string, City[]>;
      legacyRegions: Map<string, string>;
      visiblePlaces: Map<string, Place>;
      citySourceRegions: Map<string, string>;
    }>
  | undefined;
const cell = (lat: number, lng: number) =>
  `${Math.floor(lat)},${Math.floor(lng)}`;
export function distanceKm(a: number, b: number, c: number, d: number) {
  const rad = Math.PI / 180,
    h =
      Math.sin(((c - a) * rad) / 2) ** 2 +
      Math.cos(a * rad) *
        Math.cos(c * rad) *
        Math.sin(((d - b) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
async function gazetteer() {
  return (dictionary ??= (async () => {
    const data = JSON.parse(
      gunzipSync(
        await readFile(new URL('../data/places.json.gz', import.meta.url)),
      ).toString(),
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
      await readFile(
        new URL('../data/places-editorial.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, { zh: string; aliases: string[] }>;
    for (const [id, label] of Object.entries(editorial)) {
      const p = places.get(id);
      if (p) {
        p.name = label.zh;
        p.aliases = [...new Set([...p.aliases, ...label.aliases])];
      }
    }
    const legacyRegions = new Map<string, string>();
    for (const [id, [, country]] of Object.entries(data.admins)) {
      const code =
        country === 'HK'
          ? 'CN-HK'
          : country === 'MO'
            ? 'CN-MO'
            : country === 'TW'
              ? 'CN-TW'
              : chinaRegions.find((r) => r.geonamesId === id)?.code;
      if (code) legacyRegions.set('region:' + id, regionByCode(code)!.placeId);
    }
    for (const region of chinaRegions) {
      const old = region.geonamesId
        ? places.get('region:' + region.geonamesId)
        : null;
      places.set(region.placeId, {
        id: region.placeId,
        name: region.name,
        english: region.english,
        kind: 'region',
        country: region.country,
        parent: 'country:' + region.country,
        regionCode: region.code,
        aliases: [
          ...new Set([
            region.fullName,
            region.english,
            ...(old ? [old.name, old.english, ...old.aliases] : []),
          ]),
        ],
      });
    }
    const citySourceRegions = new Map<string, string>();
    for (const place of places.values()) {
      if (place.kind === 'city' && legacyRegions.has(place.parent)) {
        citySourceRegions.set(place.id, place.parent);
        place.parent = legacyRegions.get(place.parent)!;
      }
    }
    // Some GeoNames city points (notably Hong Kong itself) have no admin-1
    // reference. The photo resolver still requires its own GPS province proof.
    const locateRegion = await getRegionLocator();
    for (const city of data.cities) {
      const place = places.get('city:' + city[0])!;
      if (place.country === 'CN' && place.parent === 'country:CN') {
        const code = locateRegion(city[6], city[5]);
        if (code) place.parent = regionByCode(code)!.placeId;
      }
    }
    return {
      places,
      cells,
      legacyRegions,
      citySourceRegions,
      visiblePlaces: new Map(
        [...places].filter(([id]) => !legacyRegions.has(id)),
      ),
    };
  })());
}
export async function placeResolver(db: Db) {
  const labels =
    await sql<Label>`SELECT * FROM gallery.public_place_label`.execute(db);
  return createPlaceResolver(labels.rows);
}
export async function createPlaceResolver(labels: Label[] = []) {
  const [
    { places, cells, legacyRegions, visiblePlaces, citySourceRegions },
    locate,
    coastalCountry,
    locateRegion,
  ] = await Promise.all([
    gazetteer(),
    getCountryLocator(),
    getCoastalCountryLocator(),
    getRegionLocator(),
  ]);
  const overrides = new Map(labels.map((l) => [l.id, l]));
  // Existing GeoNames province URLs/manual records remain valid. Carry label
  // customizations forward without allowing a label merge to change geography.
  for (const [old, canonical] of legacyRegions) {
    const label = overrides.get(old);
    if (
      label &&
      chinaRegions.some((r) => 'region:' + r.geonamesId === old) &&
      !overrides.has(canonical)
    )
      overrides.set(canonical, {
        ...label,
        id: canonical,
        canonical_id: null,
        version: '0',
      });
  }
  const get = (id: string): Place | null => {
    const original = places.get(id);
    const originalLabel = overrides.get(id);
    id = legacyRegions.get(id) ?? id;
    const visited = new Set<string>();
    while (overrides.get(id)?.canonical_id && !places.get(id)?.regionCode) {
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
    const span =
      Math.min(
        180,
        Math.ceil(0.25 / Math.max(0.01, Math.cos((latitude * Math.PI) / 180))),
      ) + 1;
    for (let y = Math.floor(latitude) - 1; y <= Math.floor(latitude) + 1; y++)
      for (
        let x = Math.floor(longitude) - span;
        x <= Math.floor(longitude) + span;
        x++
      ) {
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
  const matchesState = (place: Place, state: string) => {
    const parent = get(place.parent);
    const legacy = places.get(citySourceRegions.get(place.id) ?? '');
    const legacyLabel = overrides.get(legacy?.id ?? '');
    const aliases = [
      parent?.name,
      parent?.english,
      ...(parent?.aliases ?? []),
      legacy?.name,
      legacy?.english,
      ...(legacy?.aliases ?? []),
      legacyLabel?.name_zh,
      legacyLabel?.name_en,
      ...(legacyLabel?.aliases ?? []),
    ];
    return aliases.some(
      (name) =>
        typeof name === 'string' && normalized(name) === normalized(state),
    );
  };
  const sourceRegion = (s: Source) =>
    s.latitude === null || s.longitude === null
      ? null
      : locate(s.longitude, s.latitude) === 'CN'
        ? locateRegion(s.longitude, s.latitude)
        : null;
  const manualRegionConflict = (s: Source) => {
    const automatic = sourceRegion(s);
    const manual = s.manual_place
      ? path(s.manual_place).find((p) => p.regionCode)?.regionCode
      : null;
    return !!automatic && !!manual && automatic !== manual;
  };
  const compute = (s: Source): Place[] => {
    if (
      s.latitude === null ||
      s.longitude === null ||
      s.location_mode === 'hidden'
    )
      return [];
    const country = locate(
      s.longitude,
      s.latitude,
      s.location_mode === 'approximate',
    );
    // Approximate sources must stop at the country: precise GPS, source names and
    // manual province records must not expose an otherwise hidden subdivision.
    if (s.location_mode !== 'exact')
      return country ? path('country:' + country) : [];
    const regionCode =
      country === 'CN' ? locateRegion(s.longitude, s.latitude) : null;
    const base = regionCode
      ? path(regionByCode(regionCode)!.placeId)
      : country
        ? path('country:' + country)
        : [];
    const manual = s.manual_place ? get(s.manual_place) : null;
    if (
      manual &&
      manual.country === (country ?? coastalCountry(s.longitude, s.latitude))
    ) {
      const manualPath = path(manual.id);
      const manualRegion = manualPath.find((p) => p.regionCode)?.regionCode;
      if (!regionCode || !manualRegion || manualRegion === regionCode) {
        // A confirmed country does not erase a reliable automatic province.
        if (manual.kind === 'country' || (regionCode && !manualRegion))
          return base.length ? base : manualPath;
        return manualPath;
      }
      // Changed boundary evidence or an old wrong manual city cannot override
      // the province proven by live GPS. Admin review exposes the conflict.
    }
    if (!country) return [];
    if (!s.city) return base;
    const name = normalized(s.city);
    const candidates = nearby(s.latitude, s.longitude, country).filter(
      ({ place }) =>
        [place.name, place.english, ...place.aliases].some(
          (n) => normalized(n) === name,
        ),
    );
    const unique = [
      ...new Map(candidates.map((c) => [c.place.id, c.place])).values(),
    ];
    if (unique.length !== 1) return base;
    const p = unique[0]!;
    const candidatePath = path(p.id);
    // Cities are populated-place points, not boundaries. Province proof is
    // independent and required even when a source city name matches perfectly.
    if (
      country === 'CN' &&
      (!regionCode ||
        candidatePath.find((p) => p.regionCode)?.regionCode !== regionCode)
    )
      return base;
    if (
      s.state &&
      get(p.parent)?.kind === 'region' &&
      !matchesState(p, s.state)
    )
      return base;
    return candidatePath;
  };
  const cache = new Map<string, Place[]>();
  const resolve = (s: Source) => {
    const key = JSON.stringify([
      s.latitude,
      s.longitude,
      s.location_mode,
      s.city,
      s.state,
      s.manual_place,
    ]);
    const old = cache.get(key);
    if (old) return old;
    const value = compute(s);
    if (cache.size < 10000) cache.set(key, value);
    return value;
  };
  return {
    get,
    path,
    nearby,
    resolve,
    all: visiblePlaces,
    sourceRegion,
    matchesState,
    manualRegionConflict,
    labels: overrides,
    locate,
    coastalCountry,
    locateRegion,
  };
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
  const rank = (s: Source) =>
    s.location_mode === 'hidden'
      ? 2
      : s.location_mode === 'approximate'
        ? 1
        : 0;
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
    >`WITH location_visibility AS MATERIALIZED (
 SELECT asset_id, CASE WHEN bool_or(location_mode='hidden') THEN 'hidden'
 WHEN bool_or(location_mode='approximate') THEN 'approximate' ELSE 'exact' END AS public_location_mode
 FROM gallery.published_photo_place_source GROUP BY asset_id
 )
 SELECT s.asset_id,s.filename,s.latitude,s.longitude,s.city,s.state,'exact' AS location_mode,
 CASE WHEN o.latitude=s.latitude AND o.longitude=s.longitude THEN o.place_id END AS manual_place,o.version::text,v.public_location_mode
 FROM gallery.admin_source_asset s LEFT JOIN gallery.photo_place o ON o.asset_id=s.asset_id
 LEFT JOIN location_visibility v ON v.asset_id=s.asset_id
 WHERE EXISTS(SELECT 1 FROM gallery.album_photo p WHERE p.immich_asset_id=s.asset_id) AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL ORDER BY s.asset_id`.execute(
      db,
    )
  ).rows;
  const used = new Set<string>();
  const photos = rows.map((s) => {
    const places = r.resolve(s);
    for (const p of places) used.add(p.id);
    const strictCountry = r.locate(s.longitude!, s.latitude!);
    const country =
      strictCountry ?? r.coastalCountry(s.longitude!, s.latitude!);
    const manualConfirmed =
      !!s.manual_place && places.at(-1)?.id === r.get(s.manual_place)?.id;
    const regionConflict = r.manualRegionConflict(s);
    const region = places.find((p) => p.regionCode);
    const regionCode = region?.regionCode ?? null;
    const privacyRestricted =
      country === 'CN' &&
      !!s.public_location_mode &&
      s.public_location_mode !== 'exact';
    const reviewCategory = regionConflict
      ? ('region' as const)
      : !places.length
        ? ('country' as const)
        : country === 'CN' && !regionCode
          ? ('region' as const)
          : manualConfirmed || places.at(-1)?.kind === 'city'
            ? ('resolved' as const)
            : ('city' as const);
    const needsReview = reviewCategory !== 'resolved';
    const suggestions = country
      ? r.nearby(s.latitude!, s.longitude!, country)
      : [];
    const matchesSource = (p: Place) =>
      !!s.city &&
      [p.name, p.english, ...p.aliases].some(
        (n) => normalized(n) === normalized(s.city!),
      ) &&
      (!s.state || r.matchesState(p, s.state));
    suggestions.sort(
      (a, b) =>
        Number(matchesSource(b.place)) - Number(matchesSource(a.place)) ||
        a.distance - b.distance,
    );
    return {
      ...s,
      places,
      needsReview,
      reviewCategory,
      regionConflict,
      regionCode,
      regionName: region?.name ?? '',
      privacyRestricted,
      regionCandidates: chinaRegions
        .filter((p) => p.country === country)
        .map((p) => ({ id: p.placeId, name: r.get(p.placeId)!.name })),
      manualConfirmed,
      country,
      countryName: country ? r.get('country:' + country)?.name : '',
      reviewReason: regionConflict
        ? '人工归属与当前省界判断不一致；暂按实时 GPS 的省级归属展示，请重新核对'
        : reviewCategory === 'region'
          ? '国家已识别，省级边界未得到可靠匹配；可直接确认省级地区'
          : manualConfirmed
            ? '已人工确认'
            : !needsReview
              ? '已自动匹配到城镇'
              : !strictCountry
                ? country
                  ? '国家边界未匹配，可能是海岸线精度问题；建议需人工确认'
                  : '国家边界未匹配，暂未找到可靠候选'
                : !s.city
                  ? `来源未提供城镇名称，目前已识别到${region ? '省级地区' : '国家'}`
                  : `来源地名与附近城镇未能一致匹配，目前已识别到${region ? '省级地区' : '国家'}`,
      candidates: suggestions.slice(0, 8).map((c) => ({
        id: c.place.id,
        name: r
          .path(c.place.id)
          .map((p) => p.name)
          .join(' › '),
        distance: Math.round(c.distance * 10) / 10,
        corroborated: matchesSource(c.place),
      })),
    };
  });
  const q = normalized(query);
  const ids = q
    ? [...r.all.values()]
        .filter((p) => {
          const v = r.get(p.id)!;
          return [v.name, v.english, ...v.aliases].some((n) =>
            normalized(n).includes(q),
          );
        })
        .slice(0, 60)
        .map((p) => p.id)
    : [...new Set([...used, ...r.labels.keys()])];
  return {
    places: [
      ...new Set(
        ids.map((id) => r.get(id)?.id).filter((id): id is string => !!id),
      ),
    ].map((id) => ({
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
export async function savePlace(
  db: Db,
  user: GalleryUser,
  input: Record<string, unknown>,
) {
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
    if (input.asset || input.assets) {
      const items = input.assets ?? [input];
      ensure(
        Array.isArray(items) && items.length > 0 && items.length <= 100,
        '每次请选择 1 至 100 张照片。',
      );
      ensure(
        items.every(
          (item) => !!item && typeof item === 'object' && !Array.isArray(item),
        ),
        '照片选择格式无效。',
      );
      const batch = items as Record<string, unknown>[];
      ensure(
        new Set(batch.map((item) => item.asset)).size === batch.length,
        '请勿重复选择照片。',
      );
      ensure(
        batch.every(
          (item) =>
            item.latitude === batch[0]!.latitude &&
            item.longitude === batch[0]!.longitude,
        ),
        '批量确认只适用于相同坐标的照片。',
      );
      for (const item of batch) {
        const asset = uuid(item.asset),
          place = r.get(String(input.place ?? ''));
        const s = (
          await sql<Source>`SELECT asset_id,latitude,longitude FROM gallery.admin_source_asset WHERE asset_id=${asset}::uuid AND EXISTS(SELECT 1 FROM gallery.album_photo WHERE immich_asset_id=${asset}::uuid)`.execute(
            trx,
          )
        ).rows[0];
        ensure(
          s && s.latitude !== null && s.longitude !== null,
          '照片位置不可用。',
        );
        ensure(
          s.latitude === item.latitude && s.longitude === item.longitude,
          '照片位置已变化，请刷新后重新核对。',
          409,
        );
        const old = (
          await sql<{
            version: string;
          }>`SELECT version::text FROM gallery.photo_place WHERE asset_id=${asset}::uuid`.execute(
            trx,
          )
        ).rows[0];
        ensure(
          (old?.version ?? '0') === item.version,
          '归属已修改，请刷新。',
          409,
        );
        if (input.clear === true)
          await sql`DELETE FROM gallery.photo_place WHERE asset_id=${asset}::uuid`.execute(
            trx,
          );
        else {
          ensure(
            place &&
              place.country ===
                (r.locate(s.longitude!, s.latitude!) ??
                  r.coastalCountry(s.longitude!, s.latitude!)),
            '请选择当前国家或经海岸线核对的候选国家内的有效地点。',
          );
          const automaticRegion = r.sourceRegion(s);
          const requestedRegion = r
            .path(place.id)
            .find((p) => p.regionCode)?.regionCode;
          ensure(
            !automaticRegion ||
              !requestedRegion ||
              automaticRegion === requestedRegion,
            `所选地点与当前 GPS 的${automaticRegion ? regionByCode(automaticRegion)!.name : ''}省级归属不一致，请核对 GPS 或选择一致的地点。`,
          );
          await sql`INSERT INTO gallery.photo_place(asset_id,place_id,latitude,longitude) VALUES(${asset}::uuid,${place.id},${s.latitude},${s.longitude}) ON CONFLICT(asset_id) DO UPDATE SET place_id=excluded.place_id,latitude=excluded.latitude,longitude=excluded.longitude,version=gallery.photo_place.version+1,updated_at=now()`.execute(
            trx,
          );
        }
        await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${crypto.randomUUID()}::uuid,${user.id}::uuid,'place.save','photo',${asset})`.execute(
          trx,
        );
      }
    } else {
      const id = String(input.id ?? ''),
        p = r.all.get(id);
      ensure(p, '地点不存在。');
      const old = (
        await sql<{
          version: string;
        }>`SELECT version::text FROM gallery.place_label WHERE id=${id}`.execute(
          trx,
        )
      ).rows[0];
      ensure(
        (old?.version ?? '0') === input.version,
        '地点已修改，请刷新。',
        409,
      );
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
        ensure(
          !p.regionCode,
          '固定省级地区不能合并到其它地区；可以维护名称和别名。',
        );
        const target = r.get(canonical);
        ensure(
          target &&
            target.id !== id &&
            target.kind === p.kind &&
            target.country === p.country,
          '合并目标须为同国家同级地点，且不能形成循环。',
        );
      }
      await sql`INSERT INTO gallery.place_label(id,name_zh,name_en,aliases,canonical_id) VALUES(${id},${zh},${en},${input.aliases as string[]}::text[],${canonical || null}) ON CONFLICT(id) DO UPDATE SET name_zh=excluded.name_zh,name_en=excluded.name_en,aliases=excluded.aliases,canonical_id=excluded.canonical_id,version=gallery.place_label.version+1,updated_at=now()`.execute(
        trx,
      );
    }
    if (!input.asset && !input.assets)
      await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${crypto.randomUUID()}::uuid,${user.id}::uuid,'place.save','place',${String(input.id)})`.execute(
        trx,
      );
  });
}
