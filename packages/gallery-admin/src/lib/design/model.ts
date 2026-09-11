export type Block = { kind: 'paragraph' | 'heading' | 'quote'; text: string };
export type Photo = {
  asset: string;
  title: string;
  description: string;
  alt: string;
  location: 'hidden' | 'approximate' | 'precise';
};
export type Content = {
  title: string;
  slug: string;
  parent: string;
  summary: string;
  blocks: Block[];
  photos: Photo[];
  cover: string;
};
export type Album = {
  id: string;
  draft: Content;
  saved: Content;
  release: Content | null;
  offline: boolean;
  version: number;
};
export const assets = [
  {
    id: 'mountains',
    name: 'DSC_1042.jpg',
    source: '高加索山地',
    tag: '风景',
    place: '卡兹别克',
    date: '2025-06-08',
    available: true,
  },
  {
    id: 'tbilisi',
    name: 'DSC_2081.jpg',
    source: '第比利斯',
    tag: '城市',
    place: '第比利斯',
    date: '2025-06-11',
    available: true,
  },
  {
    id: 'street',
    name: 'DSC_2096.jpg',
    source: '第比利斯',
    tag: '街道',
    place: '第比利斯',
    date: '2025-06-12',
    available: true,
  },
  {
    id: 'detail',
    name: 'DSC_2110.jpg',
    source: '第比利斯',
    tag: '城市',
    place: '第比利斯',
    date: '2025-06-12',
    available: true,
  },
  {
    id: 'coast',
    name: 'DSC_3012.jpg',
    source: '巴统与黑海',
    tag: '风景',
    place: '巴统',
    date: '2025-06-16',
    available: true,
  },
  {
    id: 'dusk',
    name: 'DSC_3058.jpg',
    source: '巴统与黑海',
    tag: '风景',
    place: '巴统',
    date: '2025-06-17',
    available: false,
  },
];
export const source = (id: string) => assets.find((asset) => asset.id === id)!;
export const image = (id: string) => `/design-assets/${id}-small.jpg`;
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
export function blankPhoto(asset: string): Photo {
  return { asset, title: '', description: '', alt: '', location: 'hidden' };
}
export function emptyContent(): Content {
  return { title: '', slug: '', parent: '', summary: '', blocks: [], photos: [], cover: '' };
}
export function initialAlbums(): Album[] {
  const create = (id: string, title: string, parent: string, ids: string[], published: boolean): Album => {
    const draft: Content = {
      title,
      parent,
      slug: id,
      summary: '把旅行中的风景和日常，慢慢收进一本相册。',
      cover: ids[0] ?? '',
      blocks: [
        { kind: 'heading', text: '在路上的日子' },
        {
          kind: 'paragraph',
          text: '六月的格鲁吉亚，山里的风和城市的光都还留在记忆里。没有把行程排满，沿着河岸慢慢走，遇到喜欢的街角就停下来。',
        },
        { kind: 'quote', text: '有时候，停留比抵达更值得记住。' },
      ],
      photos: ids.map((asset, index) => ({
        ...blankPhoto(asset),
        title: ['沿着光，慢慢走', '在街角停一会儿', '城市留下的时间'][index % 3]!,
        description: '旅途中停下来的一个瞬间。',
      })),
    };
    return {
      id,
      draft,
      saved: copy(draft),
      release: published ? copy(draft) : null,
      offline: false,
      version: published ? 1 : 0,
    };
  };
  const result = [
    create('georgia', '格鲁吉亚 · 山海之间', '', ['mountains'], true),
    create('tbilisi', '第比利斯，沿着光走', 'georgia', ['tbilisi', 'street', 'detail'], true),
    create('batumi', '巴统，等一场日落', 'georgia', ['coast'], false),
    create('sololaki', '索洛拉基的午后', 'tbilisi', ['detail'], true),
    create('notes', '日常拾光', '', [], false),
  ];
  result[1]!.draft.summary = '穿过旧城的街巷，把一个缓慢的下午留在这里。';
  result[1]!.saved = copy(result[1]!.draft);
  return result;
}
export function descendants(albums: Album[], id: string, published = false): Album[] {
  const result: Album[] = [];
  const visit = (parent: string) => {
    for (const a of albums) {
      const content = published ? a.release : a.draft;
      if (content?.parent === parent && !result.includes(a)) {
        result.push(a);
        visit(a.id);
      }
    }
  };
  visit(id);
  return result;
}
export function accessible(albums: Album[], album: Album): boolean {
  let current: Album | undefined = album;
  const visited = new Set<string>();
  while (current) {
    if (!current.release || current.offline || visited.has(current.id)) return false;
    visited.add(current.id);
    if (!current.release.parent) return true;
    current = albums.find((a) => a.id === current!.release!.parent);
  }
  return false;
}
export function validation(albums: Album[], album: Album): string[] {
  const c = album.draft;
  const errors: string[] = [];
  if (!c.title.trim()) errors.push('请填写相册标题。');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) errors.push('访问地址请使用小写字母、数字和连字符。');
  if (albums.some((a) => a.id !== album.id && (a.draft.slug === c.slug || a.release?.slug === c.slug)))
    errors.push('这个访问地址已被其他相册使用。');
  if (
    c.parent === album.id ||
    descendants(albums, album.id).some((a) => a.id === c.parent) ||
    descendants(albums, album.id, true).some((a) => a.id === c.parent)
  )
    errors.push('父相册不能是自己或自己的草稿／公开后代。');
  if (c.parent && !albums.some((a) => a.id === c.parent && accessible(albums, a)))
    errors.push('请先发布并恢复父相册，再发布当前相册。');
  if (c.photos.some((p) => !source(p.asset)?.available)) errors.push('有来源不可用的照片，请先移除。');
  if (c.cover && !c.photos.some((p) => p.asset === c.cover && source(p.asset)?.available))
    errors.push('封面照片已失效，请重新选择。');
  return errors;
}
