export type Scene = 'home' | 'country' | 'story' | 'collection' | 'states';
export const scenes: { id: Scene; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'country', label: '国家相册' },
  { id: 'story', label: '城市游记' },
  { id: 'collection', label: '照片集' },
  { id: 'states', label: '边界状态' },
];
export const photos = [
  {
    id: 'mountains',
    src: '/design-assets/mountains.jpg',
    width: 1800,
    height: 1350,
    title: '山的另一边',
    description: '云层散开的片刻，群山显露出不同的远近。我们在这里停了很久。',
    alt: '格鲁吉亚高加索山脉与山间聚落',
    location: '高加索山地',
    author: '',
  },
  {
    id: 'tbilisi',
    src: '/design-assets/tbilisi.jpg',
    width: 1280,
    height: 851,
    title: '沿着河流，走进旧城',
    description: '从河岸向山坡望去，房屋一层层叠起来。小路没有明确的目的地，转角总有新的风景。',
    alt: '第比利斯山坡上的建筑与城市景观',
    location: '第比利斯',
    author: '',
  },
  {
    id: 'street',
    src: '/design-assets/street.jpg',
    width: 1200,
    height: 1600,
    title: '在街角停一会儿',
    description: '下午的光落在立面上。车声慢慢远去，街道回到自己的节奏。',
    alt: '第比利斯街道上的多向路牌',
    location: '第比利斯',
    author: '',
  },
  {
    id: 'coast',
    src: '/design-assets/coast.jpg',
    width: 1600,
    height: 1067,
    title: '风从黑海来',
    description: '海风比想象中轻。沿着岸边慢慢走，直到天色从蓝色变成灰紫色。',
    alt: '巴统黑海岸边的落日与剪影',
    location: '巴统',
    author: '',
  },
  {
    id: 'detail',
    src: '/design-assets/detail.jpg',
    width: 1280,
    height: 851,
    title: '城市留下的时间',
    description: '墙面、窗户和日常使用的痕迹，让一座城市变得具体。',
    alt: '第比利斯城市建筑的近景',
    location: '第比利斯',
    author: '',
  },
  {
    id: 'dusk',
    src: '/design-assets/dusk.jpg',
    width: 1200,
    height: 1600,
    title: '海岸向远处延伸',
    description: '从绿色的山坡望向黑海，海岸线一直伸向远方。站在这里，想起旅途还没有结束。',
    alt: '巴统海边的绿色山坡与黑海海岸线',
    location: '巴统',
    author: '',
  },
];
export type Photo = (typeof photos)[number];
export const paragraphs = [
  '最初记住第比利斯，是从一条向上的路开始的。离开河岸，沿着窄窄的街道走，城市的声音一点点退到身后。房屋的阳台探向街面，树影落在旧墙上，远处偶尔传来教堂的钟声。',
  '没有安排太满的行程。早晨在街角喝一杯咖啡，然后挑一条没走过的小路。地图上短短的一段距离，常常要花掉整个下午。停下来拍一扇窗、一片光，或是等路过的人走出画面。',
  '城市最动人的部分，往往不在那些被反复标注的地方。一道半开的门，晾在阳台上的衣服，台阶边长出来的草。它们并不急着向人展示什么，却让短暂的停留有了真实的温度。',
  '傍晚再回到河边，白天看过的房屋已经换了一种颜色。从桥上望过去，山坡像一幅慢慢暗下来的画。旅行有时不需要再多一个目的地，能把这一天记住，就已经很好。',
];

export const cityPhotos = [photos[1]!, photos[2]!, photos[4]!];
export const coastPhotos = [photos[3]!, photos[5]!];
