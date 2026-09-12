import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, type GalleryUser } from '@gallery/core';
export type MapProviderId = 'osm' | 'google' | 'amap';
export interface MapProvider {
  provider: MapProviderId;
  enabled: boolean;
  isDefault: boolean;
  browserKey: string;
  tileUrl: string;
  attribution: string;
}
function key(master: string | undefined) {
  ensure(master && /^[0-9a-f]{64}$/i.test(master), '地图安全密钥存储尚未配置，请设置 GALLERY_MAP_SECRET_KEY。', 503);
  return Buffer.from(master, 'hex');
}
export function encryptMapSecret(value: string, master: string | undefined) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(master), iv);
  cipher.setAAD(Buffer.from('gallery-amap-v1'));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((p) => p.toString('base64url')).join('.');
}
export function decryptMapSecret(value: string, master: string | undefined) {
  const parts = value.split('.');
  ensure(parts.length === 3, '地图安全配置无效。', 503);
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(master), iv!);
  decipher.setAAD(Buffer.from('gallery-amap-v1'));
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString('utf8');
}
export async function publicMapSettings(db: Kysely<unknown>) {
  const settings = (
    await sql<{
      version: number;
      visit_gap_days: number;
    }>`SELECT version,visit_gap_days FROM gallery.map_settings WHERE id=1`.execute(db)
  ).rows[0]!;
  const providers = (
    await sql<MapProvider>`SELECT provider,enabled,is_default AS "isDefault",browser_key AS "browserKey",tile_url AS "tileUrl",attribution
    FROM gallery.map_provider_config WHERE enabled ORDER BY is_default DESC,provider`.execute(db)
  ).rows;
  return { gapDays: settings.visit_gap_days, providers };
}
export async function adminMapSettings(db: Kysely<unknown>, master: string | undefined) {
  const settings = (
    await sql<{
      version: number;
      visit_gap_days: number;
    }>`SELECT version,visit_gap_days FROM gallery.map_settings WHERE id=1`.execute(db)
  ).rows[0]!;
  const providers = (
    await sql<
      MapProvider & { hasSecret: boolean }
    >`SELECT provider,enabled,is_default AS "isDefault",browser_key AS "browserKey",tile_url AS "tileUrl",attribution,
    secret_ciphertext IS NOT NULL AS "hasSecret" FROM gallery.map_provider_config ORDER BY CASE provider WHEN 'osm' THEN 0 WHEN 'google' THEN 1 ELSE 2 END`.execute(
      db,
    )
  ).rows;
  return {
    version: settings.version,
    gapDays: settings.visit_gap_days,
    providers,
    secretStorageReady: !!master && /^[0-9a-f]{64}$/i.test(master),
  };
}
export function validateMapProvider(raw: unknown): MapProvider & { securityCode: string; clearSecret: boolean } {
  ensure(raw && typeof raw === 'object', '底图配置无效。');
  const p = raw as Record<string, unknown>;
  ensure(['osm', 'google', 'amap'].includes(String(p.provider)), '底图类型无效。');
  ensure(typeof p.enabled === 'boolean' && typeof p.isDefault === 'boolean', '底图启用状态无效。');
  const browserKey = String(p.browserKey ?? '').trim(),
    tileUrl = String(p.tileUrl ?? '').trim(),
    attribution = String(p.attribution ?? '').trim();
  const securityCode = String(p.securityCode ?? '').trim();
  ensure(browserKey.length <= 256 && (!browserKey || /^[a-zA-Z0-9_-]+$/.test(browserKey)), 'API Key 格式无效。');
  ensure(attribution.length <= 300 && securityCode.length <= 256, '底图配置过长。');
  ensure(!p.isDefault || p.enabled, '默认底图必须启用。');
  if (p.provider === 'osm') {
    ensure(
      ['{z}', '{x}', '{y}'].every((token) => tileUrl.includes(token)) && tileUrl.length <= 1000,
      '瓦片地址需要包含 {z}、{x}、{y}。',
    );
    let url: URL;
    try {
      url = new URL(tileUrl);
    } catch {
      ensure(false, '瓦片地址格式无效。');
    }
    ensure(url.protocol === 'https:' && !url.username && !url.password, '瓦片地址必须使用 HTTPS 且不包含登录信息。');
    ensure(attribution, '请填写底图署名。');
  } else if (p.enabled) ensure(browserKey, '启用此底图前请填写 API Key。');
  ensure(!securityCode || p.provider === 'amap', '此底图不接受安全密钥。');
  return {
    provider: p.provider as MapProviderId,
    enabled: p.enabled,
    isDefault: p.isDefault,
    browserKey,
    tileUrl,
    attribution,
    securityCode,
    clearSecret: p.clearSecret === true,
  };
}
export async function saveMapSettings(
  db: Kysely<unknown>,
  user: GalleryUser,
  input: Record<string, unknown>,
  master: string | undefined,
) {
  ensure(Array.isArray(input.providers) && input.providers.length === 3, '请提供完整的底图配置。');
  const providers = input.providers.map(validateMapProvider);
  ensure(
    new Set(providers.map((p) => p.provider)).size === 3 && providers.filter((p) => p.isDefault).length === 1,
    '需要且只能指定一个默认底图。',
  );
  const gap = Number(input.gapDays);
  ensure(Number.isInteger(gap) && gap >= 1 && gap <= 365, '到访间隔需要为 1–365 天。');
  await db.transaction().execute(async (trx) => {
    const state = (
      await sql<{ version: number }>`SELECT version FROM gallery.map_settings WHERE id=1 FOR UPDATE`.execute(trx)
    ).rows[0]!;
    ensure(state.version === input.version, '地图设置已被修改，请重新载入。', 409);
    await sql`UPDATE gallery.map_provider_config SET is_default=false`.execute(trx);
    for (const p of providers) {
      const previous = (
        await sql<{
          secret_ciphertext: string | null;
        }>`SELECT secret_ciphertext FROM gallery.map_provider_config WHERE provider=${p.provider}`.execute(trx)
      ).rows[0]!;
      const secret = p.securityCode
        ? encryptMapSecret(p.securityCode, master)
        : p.clearSecret
          ? null
          : previous.secret_ciphertext;
      ensure(p.provider !== 'amap' || !p.enabled || secret, '启用高德前请填写安全密钥。');
      if (p.provider === 'amap' && p.enabled) {
        try {
          decryptMapSecret(secret!, master);
        } catch {
          ensure(false, '高德安全密钥无法读取，请重新配置。', 503);
        }
      }
      await sql`UPDATE gallery.map_provider_config SET enabled=${p.enabled},is_default=${p.isDefault},browser_key=${p.browserKey},
        tile_url=${p.tileUrl},attribution=${p.attribution},secret_ciphertext=${secret} WHERE provider=${p.provider}`.execute(
        trx,
      );
    }
    await sql`UPDATE gallery.map_settings SET version=version+1,visit_gap_days=${gap},updated_at=now() WHERE id=1`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()},${user.id},'map.settings','map','settings')`.execute(
      trx,
    );
  });
}
export async function amapProxySecret(db: Kysely<unknown>, master: string | undefined) {
  const config = (
    await sql<{
      secret_ciphertext: string;
      browser_key: string;
    }>`SELECT secret_ciphertext,browser_key FROM gallery.map_provider_config WHERE provider='amap' AND enabled`.execute(
      db,
    )
  ).rows[0];
  ensure(config, '高德底图未启用。', 404);
  return { key: config.browser_key, securityCode: decryptMapSecret(config.secret_ciphertext, master) };
}
