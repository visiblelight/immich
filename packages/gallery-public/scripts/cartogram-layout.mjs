import { regionalProfiles, regionalWaters } from './regional-waters.mjs';
/** Independently authored orthogonal cartogram. No reference SVG or coordinates used.
 * A 10px construction grid gives neighbouring countries identical shared edges.
 * Water remains empty; bounded gaps on each mainland are absorbed by bordering land.
 */
export const STEP = 10,
  COLS = 200,
  ROWS = 124;
const key = (x, y) => y * COLS + x;
const point = (k) => [k % COLS, Math.floor(k / COLS)];
const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const profiles = {
  CY: [rect(30, 25.5, 1.5, 1)],
  BH: [rect(37.5, 31, 1.5, 1)],
  SG: [rect(46.5, 33, 1.5, 1)],
  TO: [rect(72, 40, 3, 2)],
  OM: [rect(38, 34, 2, 2)],
  LK: [rect(41, 32, 2, 2)],
  MV: [rect(35, 36, 2, 2)],
  RU: [
    rect(38, 11, 1, 2.5),
    [
      [25, 7],
      [30, 7],
      [30, 5],
      [56, 5],
      [56, 11],
      [51, 11],
      [51, 16],
      [49, 16],
      [49, 11],
      [29, 11],
      [29, 13],
      [26, 13],
      [26, 12],
      [25, 12],
    ],
  ],
  CN: [
    rect(38, 13.5, 1, 0.5),
    [
      [38, 14],
      [45, 14],
      [45, 15],
      [49, 15],
      [49, 18],
      [48, 18],
      [48, 20],
      [49, 20],
      [49, 22],
      [43, 22],
      [43, 21],
      [38, 21],
    ],
  ],
  IN: [
    [
      [37, 24],
      [43, 24],
      [43, 27],
      [42, 27],
      [42, 29],
      [41, 29],
      [41, 31],
      [40, 31],
      [40, 30],
      [39, 30],
      [39, 28],
      [38, 28],
      [38, 26],
      [37, 26],
    ],
  ],
  IT: [
    [
      [19, 23],
      [21, 23],
      [21, 24],
      [22, 24],
      [22, 26],
      [23, 26],
      [23, 28],
      [21, 28],
      [21, 27],
      [20, 27],
      [20, 25],
      [19, 25],
    ],
  ],
  VA: [rect(20, 26, 1, 1)],
  SM: [rect(21, 24, 1, 1)],
  GB: [
    [
      [11, 12],
      [13, 12],
      [13, 17],
      [10, 17],
      [10, 15],
      [11, 15],
    ],
  ],
  IE: [rect(7, 14, 2.5, 2)],
  JP: [
    [
      [54, 15],
      [56, 15],
      [56, 22],
      [53, 22],
      [53, 19],
      [54, 19],
    ],
  ],
  VN: [
    [
      [47, 22],
      [49, 22],
      [49, 24],
      [51, 24],
      [51, 30],
      [49, 30],
      [49, 27],
      [47, 27],
    ],
  ],
  MY: [rect(45, 30, 2, 2.5), rect(49, 31, 2, 1)],
  ID: [
    [
      [43, 32.5],
      [44, 32.5],
      [44, 33.5],
      [45, 33.5],
      [45, 36],
      [44, 36],
      [44, 35],
      [43, 35],
    ],
    rect(45.5, 36.5, 5, 1),
    rect(49, 32, 3, 3),
    [
      [53, 32],
      [54, 32],
      [54, 33],
      [55, 33],
      [55, 34],
      [54, 34],
      [54, 35],
      [53, 35],
    ],
    rect(57, 35, 2, 2.5),
    rect(54, 38, 1, 1.5),
  ],
  PG: [
    [
      [59, 35],
      [62, 35],
      [62, 36],
      [63, 36],
      [63, 38],
      [61, 38],
      [61, 37.5],
      [59, 37.5],
    ],
  ],
  PH: [
    [
      [54, 24],
      [56, 24],
      [56, 26],
      [55, 26],
      [55, 27],
      [54, 27],
    ],
    [
      [53, 27.5],
      [55, 27.5],
      [55, 28],
      [56, 28],
      [56, 29],
      [53, 29],
    ],
  ],
  CA: [
    [
      [66, 8],
      [80, 8],
      [80, 9],
      [83, 9],
      [83, 13],
      [80, 13],
      [80, 14],
      [66, 14],
    ],
  ],
  US: [
    [
      [66, 14],
      [80, 14],
      [80, 15],
      [81, 15],
      [81, 18],
      [80, 18],
      [80, 20],
      [79, 20],
      [79, 21],
      [78, 21],
      [78, 20],
      [70, 20],
      [70, 19],
      [68, 19],
      [68, 18],
      [66, 18],
    ],
  ],
  MX: [
    [
      [68, 20],
      [74, 20],
      [74, 22],
      [75, 22],
      [75, 24],
      [74, 24],
      [74, 25],
      [72, 25],
      [72, 24],
      [70, 24],
      [70, 22],
      [68, 22],
    ],
  ],
  CO: [rect(79, 33, 4, 4), rect(79, 37, 1, 2)],
  BR: [
    [
      [80, 39],
      [84, 39],
      [84, 40],
      [86, 40],
      [86, 45],
      [85, 45],
      [85, 47],
      [83, 47],
      [83, 48],
      [80, 48],
    ],
  ],
  AR: [
    [
      [76, 50],
      [80, 50],
      [80, 52],
      [79, 52],
      [79, 54],
      [78, 54],
      [78, 57],
      [76, 57],
    ],
  ],
  AU: [
    [
      [52, 42],
      [56, 42],
      [56, 41],
      [63, 41],
      [63, 46],
      [60, 46],
      [60, 47],
      [52, 47],
    ],
  ],
  NZ: [
    [
      [67, 48],
      [69, 48],
      [69, 50],
      [68.5, 50],
      [68.5, 51],
      [67, 51],
      [67, 50],
      [66.5, 50],
      [66.5, 49],
      [67, 49],
    ],
    [
      [66, 51.5],
      [68, 51.5],
      [68, 52.5],
      [67, 52.5],
      [67, 53.5],
      [65, 53.5],
      [65, 52.5],
      [66, 52.5],
    ],
  ],
  SO: [
    [
      [34, 39],
      [37, 39],
      [37, 40],
      [36, 40],
      [36, 42],
      [35, 42],
      [35, 44],
      [34, 44],
    ],
  ],
};
const islandIds = new Set(
  'IS GB IE MT CY JP PH ID BN SG LK MV BH TL CV ST MG MU SC KM BS CU JM HT DO KN AG DM LC VC BB GD TT AU NZ PG PW FM MH NR KI SB VU FJ TV WS TO'.split(
    ' ',
  ),
);
export function groupFor(c, x) {
  if (c.id === 'MY') return x < 960 ? 'eurasia' : null;
  if (islandIds.has(c.id)) return null;
  if (c.region === 'EU' || c.region === 'AS') return 'eurasia';
  if (c.region === 'AF') return 'africa';
  if (c.region === 'NA' || c.region === 'SA') return 'americas';
  return null;
}
function inside(x, y, poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      yes = !yes;
  }
  return yes;
}
function allowedWater(x, y, group) {
  // Preserve the Adriatic, Persian Gulf and the Gulf of Thailand, even when narrow.
  if (
    group === 'eurasia' &&
    ((x >= 460 && x < 480 && y >= 475 && y < 600) ||
      (x >= 740 && x < 780 && y >= 560 && y < 620) ||
      (x >= 940 && x < 980 && y >= 580 && y < 650))
  )
    return false;
  return true;
}
function neighbours(k) {
  const [x, y] = point(k);
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]
    .filter(([a, b]) => a >= 0 && a < COLS && b >= 0 && b < ROWS)
    .map(([a, b]) => key(a, b));
}
/** Trace the exposed raster edges into closed orthogonal polygons. */
export function trace(cells) {
  const edges = new Map();
  const add = (a, b) => {
    const k = a.join(',');
    const list = edges.get(k) || [];
    list.push(b);
    edges.set(k, list);
  };
  for (const k of cells) {
    const [x, y] = point(k);
    if (!cells.has(key(x, y - 1))) add([x, y], [x + 1, y]);
    if (!cells.has(key(x + 1, y))) add([x + 1, y], [x + 1, y + 1]);
    if (!cells.has(key(x, y + 1))) add([x + 1, y + 1], [x, y + 1]);
    if (!cells.has(key(x - 1, y))) add([x, y + 1], [x, y]);
  }
  const paths = [];
  while (edges.size) {
    const start = [...edges.keys()][0];
    let current = start;
    const loop = [];
    do {
      const p = current.split(',').map(Number);
      loop.push(p);
      const list = edges.get(current);
      if (!list?.length) throw new Error('Unclosed coastline');
      const next = list.pop();
      if (!list.length) edges.delete(current);
      current = next.join(',');
    } while (current !== start);
    // Remove collinear vertices so paths read like designed polygons rather than grid pixels.
    const compact = loop.filter((p, i) => {
      const a = loop[(i + loop.length - 1) % loop.length],
        b = loop[(i + 1) % loop.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    paths.push(
      'M' + compact.map(([x, y]) => `${x * STEP},${y * STEP}`).join('L') + 'Z',
    );
  }
  return paths.join('');
}
function labelBox(cells) {
  const coords = [...cells].map(point);
  const minX = Math.min(...coords.map((p) => p[0])),
    maxX = Math.max(...coords.map((p) => p[0])),
    minY = Math.min(...coords.map((p) => p[1])),
    maxY = Math.max(...coords.map((p) => p[1]));
  const heights = Array(maxX - minX + 1).fill(0);
  let best = { x: 0, y: 0, w: 0, h: 0 },
    score = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++)
      heights[x - minX] = cells.has(key(x, y)) ? heights[x - minX] + 1 : 0;
    const stack = [];
    for (let i = 0; i <= heights.length; i++) {
      const height = heights[i] || 0;
      while (stack.length && heights[stack.at(-1)] > height) {
        const h = heights[stack.pop()],
          left = stack.length ? stack.at(-1) + 1 : 0,
          w = i - left;
        const s = w * h * Math.min(1, Math.min(w, h) / 2);
        if (s > score) {
          score = s;
          best = {
            x: (minX + left) * STEP,
            y: (y - h + 1) * STEP,
            w: w * STEP,
            h: h * STEP,
          };
        }
      }
      stack.push(i);
    }
  }
  return best;
}
export function buildCartogram(countries) {
  const owners = new Map(),
    byId = new Map(countries.map((c) => [c.id, c]));
  // Small enclave seeds take precedence over the containing country's land.
  for (const c of [...countries].sort((a, b) => b.w * b.h - a.w * a.h)) {
    const baseProfiles = { ...profiles, ...regionalProfiles };
    // Southern Russia links the north coasts of both inland basins.
    baseProfiles.RU = [...profiles.RU, rect(28, 13, 1, 3), rect(29, 15, 4, 3)];
    const polygons = baseProfiles[c.id] || [
      rect(c.x / 20, c.y / 20, (c.w + 4) / 20, (c.h + 4) / 20),
    ];
    for (const poly of polygons) {
      const xs = poly.map((p) => p[0] * 2),
        ys = poly.map((p) => p[1] * 2);
      for (let y = Math.min(...ys); y < Math.max(...ys); y++)
        for (let x = Math.min(...xs); x < Math.max(...xs); x++)
          if (inside((x + 0.5) / 2, (y + 0.5) / 2, poly))
            owners.set(key(x, y), c.id);
    }
  }
  const waterMasks = new Map();
  const protectedWater = new Set();
  for (const sea of regionalWaters) {
    const cells = new Set();
    for (const poly of sea.polygons) {
      const xs = poly.map((p) => p[0] * 2),
        ys = poly.map((p) => p[1] * 2);
      for (let y = Math.min(...ys); y < Math.max(...ys); y++)
        for (let x = Math.min(...xs); x < Math.max(...xs); x++) {
          const k = key(x, y);
          if (
            inside((x + 0.5) / 2, (y + 0.5) / 2, poly) &&
            !sea.islands.includes(owners.get(k))
          ) {
            cells.add(k);
            protectedWater.add(k);
            owners.delete(k);
          }
        }
    }
    waterMasks.set(sea.id, cells);
  }
  for (const group of ['eurasia', 'africa', 'americas']) {
    const seeds = new Set(
      [...owners]
        .filter(
          ([k, id]) => groupFor(byId.get(id), (k % COLS) * STEP) === group,
        )
        .map(([k]) => k),
    );
    const mask = new Set(seeds);
    const shorelineGuard = new Set(
      [...owners]
        .filter(
          ([k, id]) => groupFor(byId.get(id), (k % COLS) * STEP) !== group,
        )
        .flatMap(([k]) => neighbours(k))
        .filter((k) => !owners.has(k)),
    );

    // Seal small accidental fissures, without spanning named water corridors or islands.
    for (let pass = 0; pass < 3; pass++)
      for (const vertical of [false, true]) {
        const outer = vertical ? COLS : ROWS,
          inner = vertical ? ROWS : COLS;
        for (let a = 0; a < outer; a++) {
          let last = -1;
          for (let b = 0; b < inner; b++) {
            const k = vertical ? key(a, b) : key(b, a);
            if (!mask.has(k)) continue;
            if (last >= 0 && b - last <= 5) {
              const gap = [];
              for (let n = last + 1; n < b; n++)
                gap.push(vertical ? key(a, n) : key(n, a));
              if (
                gap.every(
                  (k) =>
                    !owners.has(k) &&
                    !protectedWater.has(k) &&
                    !shorelineGuard.has(k) &&
                    allowedWater(
                      (k % COLS) * STEP,
                      Math.floor(k / COLS) * STEP,
                      group,
                    ),
                )
              )
                gap.forEach((k) => mask.add(k));
            }
            last = b;
          }
        }
      }
    // Fill only enclosed inland holes. Exterior ocean remains connected to the canvas edge.
    const outside = new Set(),
      queue = [];
    for (let x = 0; x < COLS; x++) queue.push(key(x, 0), key(x, ROWS - 1));
    for (let y = 0; y < ROWS; y++) queue.push(key(0, y), key(COLS - 1, y));
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      if (outside.has(k) || mask.has(k)) continue;
      outside.add(k);
      for (const n of neighbours(k))
        if (!outside.has(n) && !mask.has(n)) queue.push(n);
    }
    for (let k = 0; k < COLS * ROWS; k++)
      if (
        !outside.has(k) &&
        !owners.has(k) &&
        !protectedWater.has(k) &&
        !shorelineGuard.has(k) &&
        allowedWater((k % COLS) * STEP, Math.floor(k / COLS) * STEP, group)
      )
        mask.add(k);
    // Shared additions grow from existing territory, so a new sliver cannot become detached.
    const frontier = [...seeds];
    for (let i = 0; i < frontier.length; i++) {
      const k = frontier[i];
      for (const n of neighbours(k))
        if (mask.has(n) && !owners.has(n) && !protectedWater.has(n)) {
          owners.set(n, owners.get(k));
          frontier.push(n);
        }
    }
  }
  const geometries = {};
  for (const c of countries) {
    const cells = new Set(
      [...owners].filter(([, id]) => id === c.id).map(([k]) => k),
    );
    if (!cells.size) throw new Error(`Missing country: ${c.id}`);
    geometries[c.id] = {
      path: trace(cells),
      label: labelBox(cells),
      area: cells.size * STEP * STEP,
    };
  }
  const waters = regionalWaters.map((sea) => ({
    id: sea.id,
    zh: sea.zh,
    en: sea.en,
    path: trace(waterMasks.get(sea.id)),
    label: sea.label,
  }));
  return {
    geometries,
    coastline: trace(new Set(owners.keys())),
    waters,
    owners,
    waterMasks,
  };
}
