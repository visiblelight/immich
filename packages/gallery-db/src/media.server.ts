import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import sharp from 'sharp';

export type MediaVariant = 'preview' | 'thumbnail';
export interface MediaRoot {
  sourceRoot: string;
  mountedRoot: string;
}
interface MediaRow {
  asset_id: string;
  is_edited: boolean;
  asset_update_id: string;
  preview_id: string;
  preview_path: string;
  preview_update_id: string;
  thumbnail_id: string;
  thumbnail_path: string;
  thumbnail_update_id: string;
}

/** Admin caller must authenticate first; source scope is still enforced here. */
export async function readSourceDerivative(
  db: Kysely<unknown>,
  assetId: string,
  variant: MediaVariant,
  root: MediaRoot,
): Promise<Buffer> {
  if (variant !== 'preview' && variant !== 'thumbnail') throw new Error('Media unavailable');
  const media = (
    await sql<MediaRow>`SELECT asset_id,is_edited,asset_update_id,preview_id,preview_path,preview_update_id,thumbnail_id,thumbnail_path,thumbnail_update_id FROM gallery.admin_source_asset WHERE asset_id=${assetId}::uuid`.execute(
      db,
    )
  ).rows[0];
  if (!media) throw new Error('Media unavailable');
  const filePath = await resolveDerivedPath(media[`${variant}_path`], root);
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Media unavailable');
    return await file.readFile();
  } finally {
    await file.close();
  }
}
// Process-local sanitized output cache. Callers must authorize and read the source first.
// Content hashing also invalidates a replaced derivative with unchanged DB metadata.
const sanitized = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
let pendingBytes = 0;
let encoding = 0;
const queue: (() => void)[] = [];
const MAX_CACHE = 64 * 1024 * 1024;
async function encodingSlot() {
  if (encoding >= 2) {
    if (queue.length >= 32) throw new Error('Media busy');
    await new Promise<void>((resolve) => queue.push(resolve));
  } else encoding++;
  return () => {
    const next = queue.shift();
    if (next) next();
    else encoding--;
  };
}
/** Bounded re-encoding without EXIF/XMP/IPTC/GPS; originals are never served. */
export async function sanitizeImage(bytes: Buffer, variant: MediaVariant): Promise<Buffer> {
  const key = variant + ':' + createHash('sha256').update(bytes).digest('hex');
  const cached = sanitized.get(key);
  if (cached) {
    sanitized.delete(key);
    sanitized.set(key, cached);
    return cached;
  }
  const running = pending.get(key);
  if (running) return running;
  if (pendingBytes + bytes.length > 64 * 1024 * 1024) throw new Error('Media busy');
  pendingBytes += bytes.length;
  const work = (async () => {
    const release = await encodingSlot();
    try {
      const result = await encodeImage(bytes, variant);
      if (result.length <= MAX_CACHE) {
        sanitized.set(key, result);
        cacheBytes += result.length;
        while (cacheBytes > MAX_CACHE || sanitized.size > 256) {
          const oldest = sanitized.keys().next().value!;
          cacheBytes -= sanitized.get(oldest)!.length;
          sanitized.delete(oldest);
        }
      }
      return result;
    } finally {
      release();
    }
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
    pendingBytes -= bytes.length;
  }
}
async function encodeImage(bytes: Buffer, variant: MediaVariant): Promise<Buffer> {
  return sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' })
    .rotate()
    .resize({
      width: variant === 'thumbnail' ? 600 : 2560,
      height: variant === 'thumbnail' ? 600 : 2560,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: variant === 'thumbnail' ? 78 : 88 })
    .toBuffer();
}
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** Only a trusted derived-image root can be mapped; original directories are never a fallback. */
export async function resolveDerivedPath(sourcePath: string, root: MediaRoot): Promise<string> {
  if (
    !path.isAbsolute(sourcePath) ||
    !path.isAbsolute(root.sourceRoot) ||
    !path.isAbsolute(root.mountedRoot) ||
    sourcePath.includes('\0') ||
    sourcePath.includes('\\') ||
    sourcePath.split('/').includes('..')
  )
    throw new Error('Media unavailable');
  const sourceRoot = path.resolve(root.sourceRoot);
  const normalized = path.resolve(sourcePath);
  if (!inside(sourceRoot, normalized)) throw new Error('Media unavailable');
  const mountedRoot = await realpath(root.mountedRoot);
  const candidate = path.resolve(mountedRoot, path.relative(sourceRoot, normalized));
  const actual = await realpath(candidate);
  if (!inside(mountedRoot, actual)) throw new Error('Media unavailable');
  return actual;
}

/** Internal pipeline input, never an HTTP response. Phase E strips metadata and resizes.
 * Every call reauthorizes in the DB before any filesystem or future cache access.
 */
export async function readPublishedDerivative(
  db: Kysely<unknown>,
  albumId: string,
  photoId: string,
  variant: MediaVariant,
  root: MediaRoot,
): Promise<{ bytes: Buffer; sourceVersion: string }> {
  if (variant !== 'preview' && variant !== 'thumbnail') throw new Error('Media unavailable');
  const { rows } = await sql<MediaRow>`SELECT asset_id, is_edited, asset_update_id,
    preview_id, preview_path, preview_update_id, thumbnail_id, thumbnail_path, thumbnail_update_id
    FROM gallery.published_media WHERE album_id = ${albumId}::uuid AND photo_id = ${photoId}::uuid`.execute(db);
  const media = rows[0];
  if (!media) throw new Error('Media unavailable');
  const filePath = await resolveDerivedPath(media[`${variant}_path`], root);
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Media unavailable');
    return {
      bytes: await file.readFile(),
      sourceVersion: [
        media.asset_id,
        media.is_edited,
        media.asset_update_id,
        media[`${variant}_id`],
        media[`${variant}_update_id`],
        stat.size,
        stat.mtimeMs,
      ].join(':'),
    };
  } finally {
    await file.close();
  }
}
