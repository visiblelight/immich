import { photos, paragraphs } from './content';

export type Album = {
  id: string;
  title: string;
  cover: string;
  subtitle: string;
  photoIds: string[];
  children: string[];
  parent?: string;
  intro: string[];
};
export const albums: Album[] = [
  {
    id: 'georgia',
    title: '格鲁吉亚',
    cover: 'mountains',
    subtitle: '山间、城市与黑海沿岸',
    photoIds: ['mountains', 'tbilisi', 'coast', 'street', 'detail', 'dusk'],
    children: ['tbilisi', 'batumi'],
    intro: [
      '这次旅行从第比利斯开始，经过高加索的山地，最后来到黑海边的巴统。这里放的是旅途中的一些照片，也留下一点关于这段路的记录。',
      '我把城市里漫步的片刻和海边的日常分别整理成子相册。这一册则收录了整段旅程中想要留下的画面。',
      ...paragraphs.slice(0, 2),
    ],
  },
  {
    id: 'mountain-days',
    title: '山间的日子',
    cover: 'mountains',
    subtitle: '沿着山路，走走停停',
    photoIds: ['mountains'],
    children: [],
    intro: [
      '离开城市，沿着山路向北走。天气变化很快，云影从山坡掠过，远处的村庄时隐时现。',
      '这一册记录在山间停留的片刻。没有特别的行程，看到喜欢的光，就停下来。',
    ],
  },
  {
    id: 'black-sea',
    title: '黑海沿岸',
    cover: 'coast',
    subtitle: '从日落到海风',
    photoIds: ['coast', 'dusk'],
    children: [],
    intro: ['沿着黑海慢慢走。白天去看海岸线，傍晚等一场日落。', '照片里没有太多故事，更多的是当时的天气、光线和心情。'],
  },
  {
    id: 'city-notes',
    title: '城市札记',
    cover: 'tbilisi',
    subtitle: '两段关于城市的记录',
    photoIds: [],
    children: ['old-town', 'coast-walk'],
    intro: ['把不同地方的日常放在一起，慢慢翻看。这是一本只有子相册的目录，每个子相册都有自己的照片和介绍。'],
  },
  {
    id: 'everyday',
    title: '日常的细节',
    cover: 'detail',
    subtitle: '窗户、阳台与街角',
    photoIds: ['detail', 'street', 'tbilisi'],
    children: [],
    intro: ['比起地标，更容易记住的是街上的小事。一扇窗、一处阳台，或一条走过两次的小路。', paragraphs[2]!],
  },
  {
    id: 'by-the-water',
    title: '在水边',
    cover: 'dusk',
    subtitle: '留一点时间给远处',
    photoIds: ['dusk', 'coast'],
    children: [],
    intro: ['站在岸边看很久，海面每一刻都不太一样。这里收录和水有关的照片。'],
  },
  {
    id: 'tbilisi',
    title: '第比利斯',
    cover: 'tbilisi',
    subtitle: '沿着河流，走进旧城',
    photoIds: ['tbilisi', 'street', 'detail'],
    children: ['sololaki'],
    parent: 'georgia',
    intro: paragraphs,
  },
  {
    id: 'batumi',
    title: '巴统',
    cover: 'coast',
    subtitle: '海风与落日',
    photoIds: ['coast', 'dusk'],
    children: [],
    parent: 'georgia',
    intro: [
      '这段旅程的最后几天，在巴统。城市靠着黑海，沿岸散步就能消磨一个下午。',
      '傍晚的光线很好，等天色暗下来，再慢慢走回去。',
    ],
  },
  {
    id: 'sololaki',
    title: '索洛拉基',
    cover: 'detail',
    subtitle: '老街区的一个下午',
    photoIds: ['detail', 'street'],
    children: [],
    parent: 'tbilisi',
    intro: [paragraphs[1]!, paragraphs[2]!],
  },
  {
    id: 'old-town',
    title: '旧城散步',
    cover: 'street',
    subtitle: '那些没有计划的小路',
    photoIds: ['street', 'detail'],
    children: [],
    parent: 'city-notes',
    intro: [paragraphs[0]!],
  },
  {
    id: 'coast-walk',
    title: '海岸散步',
    cover: 'dusk',
    subtitle: '沿着岸边一直走',
    photoIds: ['dusk', 'coast'],
    children: [],
    parent: 'city-notes',
    intro: ['傍晚再到海边走一走，看看沿岸的树，也看看远处的城市。'],
  },
];
export const roots = albums.filter((album) => !album.parent);
export const photoById = (id: string) => photos.find((photo) => photo.id === id)!;
export const albumById = (id: string) => albums.find((album) => album.id === id)!;
export function ancestors(album: Album): Album[] {
  return album.parent ? [...ancestors(albumById(album.parent)), albumById(album.parent)] : [];
}
// Illustration only: these values are not the source photographs' actual EXIF.
export const sampleExif = [
  ['相机', 'SONY α7R IV'],
  ['镜头', 'FE 24–70mm F2.8 GM'],
  ['焦距', '35 mm'],
  ['光圈', 'ƒ/8'],
  ['快门', '1/250 s'],
  ['ISO', '100'],
];
