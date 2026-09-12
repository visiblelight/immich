/** Original regional review drawing, authored for Gallery. Coordinates are schematic,
 * never geographic. Russia/Kazakhstan and western/southern neighbors are cropped.
 * Borders are split into common atomic segments before drawing exactly once.
 */
export type Point = readonly [number, number];
export interface ReviewCountry {
  id: string;
  name: string;
  label: Point;
  size?: number;
  lines?: string[];
  points: Point[];
}
export const mapSize = { width: 1320, height: 1040 };
export const countries: ReviewCountry[] = [
  {
    id: 'UA',
    name: '乌克兰',
    label: [235, 88],
    points: [
      [20, 10],
      [400, 10],
      [400, 150],
      [130, 150],
      [130, 200],
      [20, 200],
    ],
  },
  {
    id: 'RU',
    name: '俄罗斯',
    label: [605, 90],
    points: [
      [400, 10],
      [860, 10],
      [860, 130],
      [700, 170],
      [700, 250],
      [630, 230],
      [590, 190],
      [470, 190],
      [400, 150],
    ],
  },
  {
    id: 'KZ',
    name: '哈萨克斯坦',
    label: [1070, 140],
    points: [
      [860, 10],
      [1280, 10],
      [1280, 260],
      [1000, 260],
      [1000, 310],
      [820, 310],
      [820, 230],
      [780, 170],
      [700, 170],
      [860, 130],
    ],
  },
  {
    id: 'RO',
    name: '罗马尼亚',
    label: [75, 221],
    size: 15,
    points: [
      [20, 200],
      [130, 200],
      [130, 240],
      [20, 240],
    ],
  },
  {
    id: 'BG',
    name: '保加利亚',
    label: [74, 262],
    size: 14,
    points: [
      [20, 240],
      [130, 240],
      [150, 260],
      [80, 280],
      [20, 280],
    ],
  },
  {
    id: 'GR',
    name: '希腊',
    label: [50, 342],
    size: 15,
    lines: ['希', '腊'],
    points: [
      [20, 280],
      [80, 280],
      [80, 380],
      [60, 400],
      [60, 440],
      [20, 420],
    ],
  },
  {
    id: 'TR',
    name: '土耳其',
    label: [290, 333],
    points: [
      [80, 280],
      [150, 260],
      [470, 260],
      [540, 290],
      [540, 350],
      [470, 410],
      [240, 410],
      [160, 380],
      [80, 380],
    ],
  },
  {
    id: 'GE',
    name: '格鲁吉亚',
    label: [550, 242],
    size: 17,
    points: [
      [470, 190],
      [590, 190],
      [630, 230],
      [630, 290],
      [540, 290],
      [470, 260],
    ],
  },
  {
    id: 'AM',
    name: '亚美尼亚',
    label: [585, 323],
    size: 17,
    points: [
      [540, 290],
      [630, 290],
      [630, 350],
      [540, 350],
    ],
  },
  {
    id: 'AZ',
    name: '阿塞拜疆',
    label: [665, 301],
    size: 16,
    lines: ['阿塞', '拜疆'],
    points: [
      [630, 230],
      [700, 250],
      [700, 350],
      [630, 350],
      [630, 290],
    ],
  },
  {
    id: 'UZ',
    name: '乌兹别克斯坦',
    label: [1120, 347],
    size: 18,
    points: [
      [1000, 260],
      [1280, 260],
      [1280, 430],
      [1090, 430],
      [1090, 370],
      [900, 370],
      [820, 330],
      [820, 310],
      [1000, 310],
    ],
  },
  {
    id: 'TM',
    name: '土库曼斯坦',
    label: [956, 434],
    size: 18,
    points: [
      [820, 330],
      [900, 370],
      [1090, 370],
      [1090, 480],
      [860, 480],
      [780, 430],
      [820, 390],
    ],
  },
  {
    id: 'IR',
    name: '伊朗',
    label: [713, 505],
    points: [
      [540, 350],
      [700, 350],
      [700, 390],
      [780, 430],
      [860, 480],
      [920, 480],
      [920, 620],
      [920, 700],
      [860, 660],
      [760, 610],
      [650, 580],
      [560, 540],
      [540, 480],
      [470, 410],
    ],
  },
  {
    id: 'AF',
    name: '阿富汗',
    label: [1105, 555],
    points: [
      [1090, 430],
      [1280, 430],
      [1280, 650],
      [1100, 680],
      [920, 620],
      [920, 480],
      [1090, 480],
    ],
  },
  {
    id: 'PK',
    name: '巴基斯坦',
    label: [1160, 738],
    points: [
      [920, 620],
      [1100, 680],
      [1280, 650],
      [1280, 860],
      [1200, 860],
      [1060, 780],
      [960, 740],
      [920, 700],
    ],
  },
  {
    id: 'CY',
    name: '塞浦路斯',
    label: [139, 456],
    size: 14,
    points: [
      [95, 435],
      [175, 435],
      [185, 455],
      [165, 475],
      [95, 475],
    ],
  },
  {
    id: 'SY',
    name: '叙利亚',
    label: [345, 466],
    size: 18,
    points: [
      [240, 410],
      [470, 410],
      [400, 450],
      [400, 520],
      [300, 520],
      [260, 480],
      [200, 480],
      [200, 410],
    ],
  },
  {
    id: 'IQ',
    name: '伊拉克',
    label: [505, 533],
    points: [
      [470, 410],
      [540, 480],
      [560, 540],
      [650, 580],
      [600, 650],
      [510, 620],
      [400, 520],
      [400, 450],
    ],
  },
  {
    id: 'LB',
    name: '黎巴嫩',
    label: [237, 519],
    size: 15,
    points: [
      [200, 480],
      [260, 480],
      [280, 500],
      [280, 540],
      [200, 540],
    ],
  },
  {
    id: 'IL',
    name: '以色列',
    label: [226, 575],
    size: 14,
    lines: ['以色', '列'],
    points: [
      [200, 540],
      [250, 540],
      [250, 610],
      [200, 610],
    ],
  },
  {
    id: 'PS',
    name: '巴勒斯坦',
    label: [275, 576],
    size: 14,
    lines: ['巴勒', '斯坦'],
    points: [
      [250, 540],
      [300, 540],
      [300, 610],
      [250, 610],
    ],
  },
  {
    id: 'JO',
    name: '约旦',
    label: [345, 593],
    size: 18,
    points: [
      [280, 500],
      [300, 520],
      [400, 520],
      [510, 620],
      [440, 680],
      [300, 650],
      [300, 610],
      [300, 540],
      [280, 540],
    ],
  },
  {
    id: 'KW',
    name: '科威特',
    label: [646, 619],
    size: 12,
    points: [
      [600, 650],
      [640, 594],
      [680, 600],
      [680, 630],
      [650, 650],
    ],
  },
  {
    id: 'SA',
    name: '沙特阿拉伯',
    label: [610, 771],
    points: [
      [440, 680],
      [510, 620],
      [600, 650],
      [650, 650],
      [700, 680],
      [745, 710],
      [760, 745],
      [780, 730],
      [850, 820],
      [760, 880],
      [540, 860],
      [450, 780],
    ],
  },
  {
    id: 'BH',
    name: '巴林',
    label: [730, 653],
    size: 14,
    points: [
      [710, 635],
      [750, 635],
      [750, 670],
      [710, 670],
    ],
  },
  {
    id: 'QA',
    name: '卡塔尔',
    label: [772, 714],
    size: 12,
    lines: ['卡塔', '尔'],
    points: [
      [745, 710],
      [765, 685],
      [805, 710],
      [780, 730],
      [760, 745],
    ],
  },
  {
    id: 'AE',
    name: '阿联酋',
    label: [829, 784],
    size: 14,
    points: [
      [780, 730],
      [820, 735],
      [880, 770],
      [850, 820],
    ],
  },
  {
    id: 'OM',
    name: '阿曼',
    label: [899, 800],
    size: 18,
    points: [
      [820, 735],
      [850, 710],
      [920, 740],
      [940, 820],
      [900, 880],
      [850, 820],
      [880, 770],
    ],
  },
  {
    id: 'YE',
    name: '也门',
    label: [725, 908],
    size: 18,
    points: [
      [540, 860],
      [760, 880],
      [850, 820],
      [900, 880],
      [830, 930],
      [600, 930],
    ],
  },
  {
    id: 'EG',
    name: '埃及',
    label: [177, 721],
    points: [
      [80, 600],
      [180, 600],
      [200, 610],
      [250, 610],
      [300, 610],
      [300, 650],
      [270, 680],
      [300, 760],
      [300, 820],
      [80, 820],
    ],
  },
  {
    id: 'SD',
    name: '苏丹',
    label: [215, 929],
    points: [
      [80, 820],
      [300, 820],
      [390, 900],
      [390, 1030],
      [80, 1030],
    ],
  },
  {
    id: 'ER',
    name: '厄立特里亚',
    label: [428, 985],
    size: 12,
    lines: ['厄立特', '里亚'],
    points: [
      [390, 900],
      [460, 940],
      [490, 1030],
      [390, 1030],
    ],
  },
];
export const seas = [
  { name: '黑 海', en: 'BLACK SEA', x: 295, y: 208 },
  { name: '里 海', en: 'CASPIAN SEA', x: 755, y: 294, vertical: true },
  { name: '地 中 海', en: 'MEDITERRANEAN SEA', x: 120, y: 530 },
  { name: '红 海', en: 'RED SEA', x: 383, y: 793, angle: 48 },
  { name: '波 斯 湾', en: 'PERSIAN GULF', x: 822, y: 690, angle: 30, compact: true },
  { name: '阿 拉 伯 海', en: 'ARABIAN SEA', x: 1110, y: 835 },
  { name: '亚 丁 湾', en: 'GULF OF ADEN', x: 693, y: 998 },
];
export const countryPath = (country: ReviewCountry) =>
  country.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ') + ' Z';

const pointKey = ([x, y]: Point) => `${x},${y}`;
const onSegment = (p: Point, a: Point, b: Point) =>
  Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) < 0.001 &&
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);

export function sharedBorders(data: ReviewCountry[]) {
  const vertices = [...new Map(data.flatMap((c) => c.points).map((p) => [pointKey(p), p])).values()];
  const segments = new Map<string, { a: Point; b: Point; countries: string[] }>();
  for (const country of data)
    for (let i = 0; i < country.points.length; i++) {
      const a = country.points[i]!,
        b = country.points[(i + 1) % country.points.length]!;
      const points = vertices
        .filter((p) => onSegment(p, a, b))
        .sort((p, q) => (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2 - ((q[0] - a[0]) ** 2 + (q[1] - a[1]) ** 2));
      for (let j = 1; j < points.length; j++) {
        const start = points[j - 1]!,
          end = points[j]!;
        const key = [pointKey(start), pointKey(end)].sort().join(':');
        const edge = segments.get(key) ?? { a: start, b: end, countries: [] };
        edge.countries.push(country.id);
        segments.set(key, edge);
      }
    }
  return [...segments.values()];
}
export const borders = sharedBorders(countries);

// Entirely fictional fixture. Never infer a user's journeys from this module.
export const sampleVisits: Record<string, { start: string; end: string; count: number }[]> = {
  GE: [
    { start: '2025.05.02', end: '2025.05.09', count: 82 },
    { start: '2023.10.14', end: '2023.10.18', count: 44 },
  ],
  AM: [{ start: '2025.05.10', end: '2025.05.13', count: 37 }],
  TR: [{ start: '2024.04.02', end: '2024.04.08', count: 96 }],
  JO: [{ start: '2022.11.03', end: '2022.11.09', count: 54 }],
};
