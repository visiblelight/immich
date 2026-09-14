import type {
  ArticleDocument,
  ArticleNode,
  ArticleImageResolver,
} from '../../../gallery-core/src/article';
export type ArticleSample = {
  id: string;
  title: string;
  summary: string;
  date: string;
  cover: string;
  listed: boolean;
  document: ArticleDocument;
  albums: string[];
};
const p = (text: string): ArticleNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const h = (text: string): ArticleNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const photo = (ref: string, caption: string): ArticleNode => ({
  type: 'galleryImage',
  attrs: { kind: 'photo', ref, album: 'georgia' },
  content: [{ type: 'text', text: caption }],
});
export const samplePhotos = [
  { id: 'tbilisi', title: '沿着河流，走进旧城', album: '第比利斯' },
  { id: 'mountains', title: '山的另一边', album: '高加索山地' },
  { id: 'street', title: '在街角停一会儿', album: '第比利斯' },
  { id: 'coast', title: '风从黑海来', album: '巴统' },
  { id: 'detail', title: '城市留下的时间', album: '第比利斯' },
  { id: 'dusk', title: '海岸向远处延伸', album: '巴统' },
];
export const resolveSampleImage: ArticleImageResolver = (node) => {
  const photo = samplePhotos.find((p) => p.id === node.attrs?.ref);
  return photo
    ? {
        src: `/design-assets/${photo.id}-small.jpg`,
        preview: `/design-assets/${photo.id}-small.jpg`,
        alt: photo.title,
        width: ['street', 'dusk'].includes(photo.id) ? 1200 : 1800,
        height: ['street', 'dusk'].includes(photo.id)
          ? 1600
          : photo.id === 'mountains'
            ? 1350
            : 1200,
      }
    : null;
};
export const sampleArticles: ArticleSample[] = [
  {
    id: 'a-road-through-georgia',
    title: '从第比利斯出发，沿着山路向北',
    summary:
      '穿过旧城的阳台与河流，走进高加索的云雾。记下旅途中那些没有写进行程表的片刻。',
    date: '2025-06-18',
    cover: 'mountains',
    listed: true,
    albums: ['第比利斯', '高加索山地'],
    document: {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          p(
            '旅行结束之后，最先想起的往往不是某个地标，而是一条走过的路。早晨的面包香、山坡上突然起的风，还有那些可以停下来、什么也不做的下午。',
          ),
          h('先在旧城走一走'),
          p(
            '在第比利斯，我们没有安排太满的行程。离开河岸，沿着窄窄的街道向上走，阳台探向街面，树影落在旧墙上。地图上短短的一段距离，常常要花掉整个下午。',
          ),
          photo('tbilisi', '从河的另一边回望旧城，房屋沿着山坡慢慢展开。'),
          p(
            '我开始习惯收起地图，选一条没走过的小路。停下来拍一扇窗、一片光，或是等路过的人走出画面。城市让人记住的，原来是这些没有名字的地方。',
          ),
          h('向北，去山的另一边'),
          p(
            '驶出城市之后，公路开始沿着河谷上升。云层压得很低，远处的山峰时隐时现。我们在一个转弯处停下，等了很久，终于看见阳光从云缝里落在山坡上。',
          ),
          photo('mountains', '抵达山间时，云正在散开。'),
          {
            type: 'blockquote',
            content: [p('有时候，停下来本身，就是旅途里最值得记住的一件事。')],
          },
          p(
            '相册记录了这些地方的样子。文字则让我重新回到那一天，记起照片之外的声音、温度，还有当时为什么想按下快门。',
          ),
          h('留一点没有计划的时间'),
          p(
            '回程的路上没有再增加目的地。找一家小店坐下，整理照片，把一些短句写在本子里。比起把每一天都填满，我更愿意给下一次偶然的相遇留一点空间。',
          ),
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [p('每天留出一段可以随意走走的时间。')],
              },
              {
                type: 'listItem',
                content: [p('照片及时归档，想记住的话也及时写下来。')],
              },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'a-little-time-for-nothing',
    title: '给无所事事留一点时间',
    summary: '关于散步、阅读，以及不必被安排好的一个下午。',
    date: '2025-05-24',
    cover: '',
    listed: true,
    albums: [],
    document: {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          p('最近开始练习一件很小的事：周末出门的时候，不给自己安排目的地。'),
          h('慢一点也没有关系'),
          p(
            '走到哪里就在哪里停一停。没有需要完成的清单，也没有必须带回来的照片。一杯咖啡、一段读到一半的文字，足够填满一个下午。',
          ),
          p(
            '记录不一定要来自远方。有些日常当下看起来很普通，过了一阵子，反倒成了最想重新回去的时刻。',
          ),
        ],
      },
    },
  },
  {
    id: 'about',
    title: '你好，我在这里记录旅途与日常',
    summary: '关于这个小小的摄影与文字空间。',
    date: '2025-05-01',
    cover: '',
    listed: false,
    albums: [],
    document: {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          p(
            '喜欢摄影，也喜欢慢慢走路。这个网站用来整理旅行中拍下的照片，以及一些想留下来的文字。',
          ),
          h('照片之外'),
          p(
            '相册是看风景的一种方式，文字是另一种。有时它们讲的是同一段旅途，有时只是一个普通下午的想法。',
          ),
          h('保持联系'),
          p('如果这些照片和文字让你想起了某个地方，欢迎以后再来看看。'),
        ],
      },
    },
  },
];
