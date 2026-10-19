import test from 'node:test';
import assert from 'node:assert/strict';
import { chinaRegions } from '@gallery/core';
import {
  chinaLayout,
  type ChinaRegion,
} from '../src/lib/visited/china-layout.ts';

type Point = readonly [number, number];
type Triangle = readonly [Point, Point, Point];
const epsilon = 1e-7;
function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  assert.ok(value !== undefined, `Geometry index ${index} must exist`);
  return value;
}
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (points: readonly Point[]) =>
  points.reduce((sum, point, index) => {
    const next = at(points, (index + 1) % points.length);
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
const contains = (point: Point, vertices: readonly Point[]) => {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [x1, y1] = at(vertices, i);
    const [x2, y2] = at(vertices, j);
    if (
      y1 > point[1] !== y2 > point[1] &&
      point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1
    )
      inside = !inside;
  }
  return inside;
};
const insideTriangle = (point: Point, [a, b, c]: Triangle) =>
  cross(a, b, point) >= -epsilon &&
  cross(b, c, point) >= -epsilon &&
  cross(c, a, point) >= -epsilon;

// Ear clipping allows exact overlap checks for the concave province cells, without
// sampling gaps or installing a geometry package solely for this design fixture.
function triangles(region: ChinaRegion): Triangle[] {
  const points = region.vertices.filter(
    (point, index, vertices) =>
      Math.abs(
        cross(
          at(vertices, (index + vertices.length - 1) % vertices.length),
          point,
          at(vertices, (index + 1) % vertices.length),
        ),
      ) > epsilon,
  );
  if (area(points) < 0) points.reverse();
  const result: Triangle[] = [];
  while (points.length > 3) {
    const ear = points.findIndex((point, index) => {
      const before = (index + points.length - 1) % points.length;
      const after = (index + 1) % points.length;
      const triangle: Triangle = [at(points, before), point, at(points, after)];
      return (
        cross(...triangle) > epsilon &&
        !points.some(
          (candidate, other) =>
            other !== before &&
            other !== index &&
            other !== after &&
            insideTriangle(candidate, triangle),
        )
      );
    });
    assert.notEqual(
      ear,
      -1,
      `${region.id} must have a simple non-degenerate boundary`,
    );
    result.push([
      at(points, (ear + points.length - 1) % points.length),
      at(points, ear),
      at(points, (ear + 1) % points.length),
    ]);
    points.splice(ear, 1);
  }
  assert.equal(
    points.length,
    3,
    `${region.id} must end in a complete triangle`,
  );
  result.push([at(points, 0), at(points, 1), at(points, 2)]);
  assert.ok(
    Math.abs(
      result.reduce((sum, triangle) => sum + area(triangle), 0) -
        Math.abs(area(region.vertices)),
    ) < epsilon,
    `${region.id} triangulation must preserve area`,
  );
  return result;
}

function overlapArea(subject: Triangle, clip: Triangle): number {
  let polygon: Point[] = [...subject];
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = at(clip, edge);
    const b = at(clip, (edge + 1) % 3);
    const output: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const previous = at(polygon, (i + polygon.length - 1) % polygon.length);
      const current = at(polygon, i);
      const previousDistance = cross(a, b, previous);
      const currentDistance = cross(a, b, current);
      const previousInside = previousDistance >= -epsilon;
      const currentInside = currentDistance >= -epsilon;
      if (previousInside !== currentInside) {
        const fraction =
          previousDistance / (previousDistance - currentDistance);
        output.push([
          previous[0] + fraction * (current[0] - previous[0]),
          previous[1] + fraction * (current[1] - previous[1]),
        ]);
      }
      if (currentInside) output.push(current);
    }
    polygon = output;
  }
  return polygon.length >= 3 ? Math.abs(area(polygon)) : 0;
}

test('China review map contains all 34 unique province-level regions', () => {
  assert.deepEqual(chinaLayout.regions.map(region => region.id).sort(), chinaRegions.map(region => region.code).sort());
  const expected =
    'AH BJ CQ FJ GD GS GX GZ HA HB HE HI HK HL HN JL JS JX LN MO NM NX QH SC SD SH SN SX TJ TW XJ XZ YN ZJ'
      .split(' ')
      .map((id) => `CN-${id}`)
      .sort();
  assert.deepEqual(chinaLayout.regions.map(({ id }) => id).sort(), expected);
  assert.equal(new Set(chinaLayout.regions.map(({ name }) => name)).size, 34);
});

test('China regions have finite closed display geometry and readable label positions', () => {
  for (const region of chinaLayout.regions) {
    assert.ok(region.vertices.length >= 3, region.id);
    assert.ok(region.fullName.length >= region.name.length, region.id);
    const coordinates = [...region.vertices, region.label];
    for (const [x, y] of coordinates) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y), region.id);
      assert.ok(
        x >= 0 && x <= chinaLayout.width && y >= 0 && y <= chinaLayout.height,
        region.id,
      );
    }
    // The SVG path must describe exactly the tested polygon, including closure.
    const pathVertices = [
      ...region.path.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g),
    ].map(([, x, y]) => [Number(x), Number(y)]);
    assert.match(region.path, /^M[-\d.,L\s]+ Z$/, region.id);
    assert.deepEqual(pathVertices, region.vertices, region.id);
    assert.ok(
      contains(region.label, region.vertices),
      `${region.id} label stays inside its region`,
    );
    const xs = region.vertices.map(([x]) => x);
    const ys = region.vertices.map(([, y]) => y);
    // This is the geometry at its native viewBox scale. Mobile fit-to-screen needs
    // zoom or a separate province selector; this does not claim a 36 CSS px target.
    assert.ok(
      Math.max(...xs) - Math.min(...xs) >= 36,
      `${region.id} minimum map-unit width`,
    );
    assert.ok(
      Math.max(...ys) - Math.min(...ys) >= 36,
      `${region.id} minimum map-unit height`,
    );
    assert.ok(
      Math.abs(area(region.vertices)) >= 1200,
      `${region.id} minimum selectable polygon area`,
    );
  }
});

test('China cartogram keeps a restrained rectangular and trapezoid vocabulary', () => {
  assert.ok(
    chinaLayout.regions.filter(({ vertices }) => vertices.length <= 6).length >=
      24,
    'Most regions should have no more than six corners',
  );
  for (const { id, vertices } of chinaLayout.regions) {
    assert.ok(
      vertices.length <= 8,
      `${id} must not regain detailed coastline zigzags`,
    );
    for (const [index, point] of vertices.entries()) {
      const next = at(vertices, (index + 1) % vertices.length);
      const dx = Math.abs(next[0] - point[0]);
      const dy = Math.abs(next[1] - point[1]);
      assert.ok(
        dx === 0 || dy === 0 || dx === dy || dx === 2 * dy,
        `${id} edges use horizontal, vertical, 45 degree or 1:2 diagonals`,
      );
    }
  }
});

test('Adjacent China regions may share edges but never overlap in area', () => {
  const regions = chinaLayout.regions.map((region) => ({
    region,
    triangles: triangles(region),
  }));
  for (const [i, first] of regions.entries()) {
    for (const second of regions.slice(i + 1)) {
      for (const a of first.triangles) {
        for (const b of second.triangles) {
          assert.ok(
            overlapArea(a, b) < epsilon,
            `${first.region.id} overlaps ${second.region.id}`,
          );
        }
      }
    }
  }
});
