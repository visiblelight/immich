/** Fictional content for the gated visual review. Never use for published statistics. */
export type RegionSample = {
  count: number;
  visits: number;
  period: string;
  cities: string[];
  center: [number, number];
};

export const chinaDemo: Record<string, RegionSample> = {
  'CN-BJ': {
    count: 48,
    visits: 2,
    period: '2025.04 — 2026.05',
    cities: ['北京'],
    center: [116.4074, 39.9042],
  },
  'CN-SH': {
    count: 32,
    visits: 2,
    period: '2024.11 — 2026.02',
    cities: ['上海'],
    center: [121.4737, 31.2304],
  },
  'CN-JS': {
    count: 75,
    visits: 3,
    period: '2024.03 — 2026.04',
    cities: ['南京', '苏州'],
    center: [118.7969, 32.0603],
  },
  'CN-ZJ': {
    count: 86,
    visits: 3,
    period: '2024.05 — 2026.05',
    cities: ['杭州', '宁波'],
    center: [120.1551, 30.2741],
  },
  'CN-FJ': {
    count: 128,
    visits: 5,
    period: '2023.10 — 2026.08',
    cities: ['福州', '泉州', '厦门'],
    center: [119.2965, 26.0745],
  },
  'CN-JX': {
    count: 62,
    visits: 2,
    period: '2025.03 — 2026.03',
    cities: ['景德镇', '上饶'],
    center: [115.8582, 28.6829],
  },
  'CN-SD': {
    count: 43,
    visits: 1,
    period: '2025.07',
    cities: ['青岛', '济南'],
    center: [117.1201, 36.6512],
  },
  'CN-HA': {
    count: 37,
    visits: 1,
    period: '2025.10',
    cities: ['洛阳', '郑州'],
    center: [113.6253, 34.7466],
  },
  'CN-HB': {
    count: 54,
    visits: 2,
    period: '2024.10 — 2026.04',
    cities: ['武汉', '宜昌'],
    center: [114.3054, 30.5931],
  },
  'CN-HN': {
    count: 67,
    visits: 2,
    period: '2024.09 — 2025.11',
    cities: ['长沙', '张家界'],
    center: [112.9388, 28.2282],
  },
  'CN-GD': {
    count: 93,
    visits: 4,
    period: '2023.12 — 2026.06',
    cities: ['广州', '深圳'],
    center: [113.2644, 23.1291],
  },
  'CN-SC': {
    count: 112,
    visits: 3,
    period: '2024.06 — 2026.07',
    cities: ['成都', '乐山'],
    center: [104.0665, 30.5723],
  },
  'CN-YN': {
    count: 96,
    visits: 2,
    period: '2024.08 — 2025.12',
    cities: ['昆明', '大理'],
    center: [102.8329, 24.8801],
  },
  'CN-HK': {
    count: 28,
    visits: 1,
    period: '2026.01',
    cities: ['香港'],
    center: [114.1694, 22.3193],
  },
};

export const chinaDemoTotal = Object.values(chinaDemo).reduce(
  (sum, sample) => sum + sample.count,
  0,
);
