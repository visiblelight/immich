import { blocksMarkdown } from './markdown.ts';
export type TextBlock = { kind: 'paragraph' | 'heading' | 'quote'; text: string };
export type Location = 'hidden' | 'approximate' | 'exact';
export interface PhotoGroup {
  id: string;
  title: string;
  description: string;
  cover: string;
}
export type PhotoTag = { id: string; name: string };
export interface DraftPhoto {
  photoVersion?: string;
  tags?: string[];
  group?: string;
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
  markdown?: string;
  groups?: PhotoGroup[];
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
  hasUnpublishedChanges?: boolean;
  publishedParent: string | null;
  status: 'draft' | 'published' | 'offline';
  visible: boolean;
  draft: AlbumContent;
}
export type ContactLink = { label: string; url: string };
export interface GallerySite {
  contactLinks: ContactLink[];
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
  galleryPhoto?: Pick<DraftPhoto, 'title' | 'description' | 'alt' | 'tags' | 'photoVersion'>;
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  takenAt: string;
  city: string | null;
  exif: Record<string, string | number | null>;
}
export interface DisplayPhoto {
  tags?: PhotoTag[];
  group?: PhotoGroup;
  takenAt?: string | null;
  localTakenAt?: string | null;
  timeZone?: string | null;
  addedAt?: string | null;
  addedEstimated?: boolean;
  albumId?: string;
  albumSlug?: string;
  albumTitle?: string;
  occurrences?: { albumSlug: string; albumTitle: string; photoId: string }[];
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
  markdown?: string;
  groups?: PhotoGroup[];
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
      photoVersion: photo.photoVersion === undefined ? undefined : text(photo.photoVersion, 30, '照片版本'),
      tags: validateTagIds(photo.tags ?? []),
      group: photo.group ? uuid(photo.group) : '',
      id: uuid(photo.id),
      asset: uuid(photo.asset),
      title: text(photo.title, 200, '照片标题'),
      description: text(photo.description, 50000, '照片描述'),
      alt: text(photo.alt, 500, '替代文本'),
      location: photo.location as DraftPhoto['location'],
    };
  });
  ensure(
    new Set(photos.map((p) => p.asset)).size === photos.length &&
      new Set(photos.map((p) => p.id)).size === photos.length,
    '同一相册不能重复收录照片。',
  );
  ensure(c.groups === undefined || Array.isArray(c.groups), '照片组格式无效。');
  const groups: PhotoGroup[] = Array.isArray(c.groups)
    ? c.groups.map((input: unknown) => {
        ensure(!!input && typeof input === 'object', '照片组格式无效。');
        const g = input as Record<string, unknown>;
        const group = {
          id: uuid(g.id),
          title: text(g.title, 200, '照片组标题'),
          description: text(g.description, 10000, '照片组说明'),
          cover: uuid(g.cover),
        };
        const members = photos.filter((p) => p.group === group.id);
        ensure(
          members.length >= 2 && members.some((p) => p.id === group.cover),
          '照片组至少需要两张照片，封面必须属于该组。',
        );
        return group;
      })
    : [];
  ensure(groups.length <= 500 && new Set(groups.map((g) => g.id)).size === groups.length, '照片组数量或标识无效。');
  ensure(
    photos.every((p) => !p.group || groups.some((g) => g.id === p.group)),
    '照片所属的照片组不存在。',
  );
  const markdown = c.markdown === undefined ? blocksMarkdown(blocks) : text(c.markdown, 250000, 'Markdown');
  ensure(
    new TextEncoder().encode(JSON.stringify({ markdown, groups })).length <= 1000000,
    '相册正文和照片组说明合计过长，请适当缩短。',
  );
  // Flatten groups at their first appearance so every group remains one ordered item.
  const ordered: DraftPhoto[] = [];
  for (const p of photos)
    if (!ordered.includes(p)) ordered.push(...(p.group ? photos.filter((x) => x.group === p.group) : [p]));
  return {
    title,
    slug,
    parent,
    position: Number(c.position),
    summary: text(c.summary, 2000, '简介'),
    blocks,
    markdown,
    groups,
    photos: ordered,
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
    markdown: '',
    groups: [],
    photos: [],
    cover: '',
    location: 'exact',
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

export function validateContactLinks(value: unknown): ContactLink[] {
  ensure(Array.isArray(value) && value.length <= 10, '联系链接最多 10 条。');
  return value.map((entry: unknown) => {
    ensure(!!entry && typeof entry === 'object', '联系链接格式无效。');
    const link = entry as Record<string, unknown>;
    const label = text(link.label, 100, '链接名称').trim();
    const url = text(link.url, 2000, '链接地址').trim();
    ensure(label && !/[\u0000-\u0020]/.test(url), '请填写链接名称及完整地址。');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new GalleryError(400, '链接地址无效。');
    }
    ensure(
      ['https:', 'http:', 'mailto:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
      '联系链接只支持 HTTP、HTTPS 或 mailto。',
    );
    ensure(parsed.protocol === 'mailto:' ? !!parsed.pathname : !!parsed.hostname, '链接地址无效。');
    return { label, url };
  });
}

export function validateTagIds(value: unknown): string[] {
  ensure(Array.isArray(value) && value.length <= 30, '每张照片最多关联 30 个标签。');
  return [...new Set(value.map(uuid))].sort();
}
