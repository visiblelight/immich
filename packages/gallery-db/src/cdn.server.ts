import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { imageContentType } from './image-metadata.server.ts';

export function cdnObjectKey(bytes: Buffer): string {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[imageContentType(bytes)];
  if (!extension) throw new Error('Unsupported CDN image');
  return `gallery/v1/${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
}

export function signCdnUrl(origin: string, key: string, secret: string, timestamp: number, nonce = randomBytes(16).toString('hex')) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin || !/^[A-Za-z0-9]{32,128}$/.test(secret) ||
      !/^gallery\/v1\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(key) || !Number.isSafeInteger(timestamp) ||
      !/^[a-f0-9]{1,64}$/.test(nonce)) throw new Error('Invalid CDN configuration');
  const uri = '/' + key;
  const token = `${timestamp}-${nonce}-0`;
  const digest = createHash('md5').update(`${uri}-${token}-${secret}`).digest('hex');
  return `${origin}${uri}?auth_key=${token}-${digest}`;
}

/** Call ONLY after current DB, source-path and image validation. The manifest grants no access.
 * The timestamp predates authorization, so a slow request cannot extend the revocation window.
 * Missing/stale/broken cloud state falls back to the already-authorized ECS derivative.
 */
export async function publishedCdnRedirect(bytes: Buffer, authorizedAt: number, directory = process.env.GALLERY_CDN_DIRECTORY): Promise<Response | null> {
  if (!directory || !path.isAbsolute(directory)) return null;
  try {
    const now = Date.now();
    if (authorizedAt > now || now - authorizedAt > 30_000) return null;
    const [config, manifest] = await Promise.all([
      readFile(path.join(directory, 'config.json'), 'utf8').then(JSON.parse),
      readFile(path.join(directory, 'ready.json'), 'utf8').then(JSON.parse),
    ]);
    if (config.enabled !== true || manifest.version !== 1 || !Number.isFinite(manifest.checkedAt) ||
        manifest.checkedAt > now || now - manifest.checkedAt > 180_000) return null;
    const key = cdnObjectKey(bytes);
    if (manifest.objects?.[key] !== true) return null;
    return new Response(null, { status: 302, headers: {
      location: signCdnUrl(config.origin, key, config.signingKey, Math.floor(authorizedAt / 1000)),
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    } });
  } catch { return null; }
}
