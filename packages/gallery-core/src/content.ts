export type TextBlock = { kind: 'paragraph' | 'heading' | 'quote'; text: string };
export type Location = 'hidden' | 'approximate' | 'exact';
export interface DraftPhoto {
  id: string;
  asset: string;
  title: string;
  description: string;
  alt: string;
  location: Location | 'inherit';
}
export interface AlbumContent {
  title: string;
  slug: string;
  parent: string;
  position: number;
  summary: string;
  blocks: TextBlock[];
  photos: DraftPhoto[];
  cover: string;
  location: Location;
  showExif: boolean;
}
export interface ManagedAlbum {
  id: string;
  version: string;
  draftVersion: string;
  releaseVersion: string | null;
  publishedParent: string | null;
  status: 'draft' | 'published' | 'offline';
  visible: boolean;
  draft: AlbumContent;
}
export interface GallerySite {
  name: string;
  tagline: string;
  version: string;
  treeVersion: string;
}
export interface GalleryUser {
  id: string;
  email: string;
  displayName: string;
}
export interface SourcePhoto {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  takenAt: string;
  city: string | null;
  exif: Record<string, string | number | null>;
}
export interface DisplayPhoto {
  id: string;
  src: string;
  thumbnail: string;
  title: string;
  description: string;
  alt: string;
  exif: Record<string, string | number | null> | null;
  latitude: number | null;
  longitude: number | null;
}
export interface DisplayAlbum {
  id: string;
  slug: string;
  title: string;
  summary: string;
  parent: string;
  blocks: TextBlock[];
  cover: string | null;
  count: number;
  photos: DisplayPhoto[];
}
export class GalleryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new GalleryError(status, message);
}
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function uuid(value: unknown): string {
  ensure(isUuid(value), '无效的资源标识。');
  return value;
}
const text = (value: unknown, max: number, label: string) => {
  ensure(typeof value === 'string' && value.length <= max, `${label}格式或长度无效。`);
  return value;
};
export function validateContent(input: unknown): AlbumContent {
  ensure(!!input && typeof input === 'object', '无效的相册内容。');
  const c = input as Record<string, unknown>;
  const title = text(c.title, 200, '标题');
  const slug = text(c.slug, 120, '访问地址');
  ensure(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug), '访问地址请使用小写字母、数字和连字符。');
  const parent = c.parent === '' ? '' : uuid(c.parent);
  ensure(Number.isSafeInteger(c.position) && Number(c.position) >= 0, '相册排序无效。');
  ensure(['hidden', 'approximate', 'exact'].includes(String(c.location)), '位置公开策略无效。');
  ensure(typeof c.showExif === 'boolean', 'EXIF 设置无效。');
  ensure(Array.isArray(c.blocks) && c.blocks.length <= 200, '正文最多 200 个文字块。');
  const blocks = c.blocks.map((b: unknown): TextBlock => {
    ensure(!!b && typeof b === 'object', '正文结构无效。');
    const block = b as Record<string, unknown>;
    ensure(
      ['paragraph', 'heading', 'quote'].includes(String(block.kind)) &&
        Object.keys(block).every((key) => ['kind', 'text'].includes(key)),
      '介绍只支持段落、小标题和引用，不允许图片或 HTML 块。',
    );
    return { kind: block.kind as TextBlock['kind'], text: text(block.text, 10000, '正文') };
  });
  ensure(JSON.stringify(blocks).length <= 250000, '正文过长。');
  ensure(Array.isArray(c.photos) && c.photos.length <= 1000, '单册最多 1000 张照片。');
  const photos = c.photos.map((p: unknown): DraftPhoto => {
    ensure(!!p && typeof p === 'object', '照片格式无效。');
    const photo = p as Record<string, unknown>;
    ensure(['inherit', 'hidden', 'approximate', 'exact'].includes(String(photo.location)), '照片位置策略无效。');
    return {
      id: uuid(photo.id),
      asset: uuid(photo.asset),
      title: text(photo.title, 200, '照片标题'),
      description: text(photo.description, 10000, '照片描述'),
      alt: text(photo.alt, 500, '替代文本'),
      location: photo.location as DraftPhoto['location'],
    };
  });
  ensure(
    new Set(photos.map((p) => p.asset)).size === photos.length &&
      new Set(photos.map((p) => p.id)).size === photos.length,
    '同一相册不能重复收录照片。',
  );
  return {
    title,
    slug,
    parent,
    position: Number(c.position),
    summary: text(c.summary, 2000, '简介'),
    blocks,
    photos,
    cover: c.cover === '' ? '' : uuid(c.cover),
    location: c.location as Location,
    showExif: c.showExif,
  };
}
export function emptyAlbum(title: string, slug: string, parent = ''): AlbumContent {
  return {
    title,
    slug,
    parent,
    position: 0,
    summary: '',
    blocks: [],
    photos: [],
    cover: '',
    location: 'hidden',
    showExif: false,
  };
}
export function assertTree(parents: Map<string, string>): void {
  for (const id of parents.keys()) {
    const seen = new Set<string>();
    let cursor = id;
    while (cursor) {
      ensure(!seen.has(cursor), '相册层级不能形成循环。', 409);
      seen.add(cursor);
      ensure(parents.has(cursor), '父相册不存在。', 409);
      cursor = parents.get(cursor)!;
    }
  }
}
