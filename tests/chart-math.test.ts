import { describe, expect, it } from 'vitest';
import { decimate, fmt, linearFit, linearScale, nearestIndex, niceDomain, niceTicks, trendSegment, yearTicks } from '../src/ui/chart-math';
import { geometryToPath, haversineKm, makeProjection, ringsToPath } from '../src/ui/map-math';

const line = (n: number, m: number, b: number, x0 = 0) => Array.from({ length: n }, (_, i) => ({ x: x0 + i, y: m * (x0 + i) + b }));

describe('linearFit', () => {
  it('recovers slope and intercept of an exact line', () => {
    const f = linearFit(line(20, 2.5, -4))!;
    expect(f.slope).toBeCloseTo(2.5, 10);
    expect(f.intercept).toBeCloseTo(-4, 10);
    expect(f.r2).toBeCloseTo(1, 10);
    expect(f.n).toBe(20);
  });
  it('restricts to a window (inclusive)', () => {
    const pts = [...line(10, 1, 0), ...line(10, 5, 0, 10).map((p) => ({ x: p.x, y: p.y - 40 }))];
    const early = linearFit(pts, 0, 9)!;
    const late = linearFit(pts, 10, 19)!;
    expect(early.slope).toBeCloseTo(1, 10);
    expect(late.slope).toBeCloseTo(5, 10);
    expect(early.n).toBe(10);
  });
  it('shows acceleration: a later window has a larger slope on a curve', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0.05 * i * i }));
    expect(linearFit(pts, 30, 39)!.slope).toBeGreaterThan(linearFit(pts, 0, 9)!.slope * 5);
  });
  it('returns null with fewer than two points or no x spread', () => {
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(linearFit([{ x: 1, y: 1 }, { x: 1, y: 3 }])).toBeNull();
    expect(linearFit(line(5, 1, 0), 100, 200)).toBeNull();
  });
  it('ignores non-finite y values', () => {
    const pts = [...line(5, 2, 0), { x: 5, y: NaN }];
    expect(linearFit(pts)!.slope).toBeCloseTo(2, 10);
  });
  it('gives a flat line r2 of 1 and slope 0', () => {
    const f = linearFit([{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }])!;
    expect(f.slope).toBe(0);
    expect(f.r2).toBe(1);
  });
  it('r2 falls with noise', () => {
    const noisy = line(20, 1, 0).map((p, i) => ({ x: p.x, y: p.y + (i % 2 ? 6 : -6) }));
    expect(linearFit(noisy)!.r2).toBeLessThan(0.9);
  });
});

describe('trendSegment', () => {
  it('runs from the first to the last x in the window on the fitted line', () => {
    const seg = trendSegment(line(10, 2, 1), 2, 6)!;
    expect(seg.a).toEqual({ x: 2, y: 5 });
    expect(seg.b).toEqual({ x: 6, y: 13 });
    expect(seg.fit.slope).toBeCloseTo(2, 10);
  });
  it('returns null for an empty window', () => {
    expect(trendSegment(line(5, 1, 0), 50, 60)).toBeNull();
  });
});

describe('ticks and scales', () => {
  it('produces round tick values inside the range', () => {
    const t = niceTicks(0, 97, 5);
    expect(t[0]).toBe(0);
    expect(t.every((v) => v >= 0 && v <= 97)).toBe(true);
    expect(t[1] - t[0]).toBe(20);
  });
  it('handles fractional ranges without float noise', () => {
    const t = niceTicks(0, 0.5, 5);
    expect(t).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });
  it('handles a degenerate range and bad input', () => {
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(NaN, 3)).toEqual([]);
  });
  it('niceDomain expands to cover the data', () => {
    const [a, b] = niceDomain(1.2, 9.3, 5);
    expect(a).toBeLessThanOrEqual(1.2);
    expect(b).toBeGreaterThanOrEqual(9.3);
  });
  it('linearScale maps the domain ends to the range ends', () => {
    const s = linearScale(10, 20, 0, 100);
    expect(s(10)).toBe(0);
    expect(s(20)).toBe(100);
    expect(s(15)).toBe(50);
    expect(linearScale(5, 5, 0, 10)(5)).toBe(0);
  });
  it('fmt uses a real minus sign and survives NaN', () => {
    expect(fmt(-2.34, 1)).toBe('−2.3');
    expect(fmt(NaN)).toBe('–');
  });
});

describe('yearTicks', () => {
  it('returns whole years inside the range', () => {
    expect(yearTicks(2020.4, 2024.2)).toEqual([2021, 2022, 2023, 2024]);
  });
  it('thins long ranges to at most the limit', () => {
    const t = yearTicks(1979, 2025, 8);
    expect(t.length).toBeLessThanOrEqual(8);
    expect(t.every((y) => Number.isInteger(y))).toBe(true);
  });
  it('is empty when no whole year falls inside', () => {
    expect(yearTicks(2020.2, 2020.8)).toEqual([]);
  });
});

describe('nearestIndex and decimate', () => {
  const pts = [0, 1, 2, 3, 10].map((x) => ({ x, y: x }));
  it('finds the nearest point', () => {
    expect(nearestIndex(pts, 2.4)).toBe(2);
    expect(nearestIndex(pts, 2.6)).toBe(3);
    expect(nearestIndex(pts, -5)).toBe(0);
    expect(nearestIndex(pts, 99)).toBe(4);
    expect(nearestIndex([], 1)).toBe(-1);
  });
  it('decimate keeps the end points and the extremes', () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) }));
    big[2500] = { x: 2500, y: 50 };
    const d = decimate(big, 200);
    expect(d.length).toBeLessThanOrEqual(210);
    expect(d[0]).toEqual(big[0]);
    expect(d[d.length - 1]).toEqual(big[4999]);
    expect(Math.max(...d.map((p) => p.y))).toBe(50);
    for (let i = 1; i < d.length; i++) expect(d[i].x).toBeGreaterThanOrEqual(d[i - 1].x);
  });
  it('decimate leaves short series alone', () => {
    expect(decimate(pts, 100)).toBe(pts);
  });
});

describe('map projection', () => {
  const bbox: [number, number, number, number] = [140, -25, 155, -10];
  it('round-trips lon/lat', () => {
    const p = makeProjection(bbox, 800);
    const [x, y] = p.project(147.5, -17.5);
    const [lon, lat] = p.unproject(x, y);
    expect(lon).toBeCloseTo(147.5, 8);
    expect(lat).toBeCloseTo(-17.5, 8);
  });
  it('maps corners to corners with north at the top', () => {
    const p = makeProjection(bbox, 800);
    expect(p.project(140, -10)).toEqual([0, 0]);
    const [x, y] = p.project(155, -25);
    expect(x).toBeCloseTo(800, 8);
    expect(y).toBeCloseTo(p.height, 8);
  });
  it('keeps shapes right: height follows cos(latitude)', () => {
    const p = makeProjection(bbox, 800);
    const k = Math.cos((-17.5 * Math.PI) / 180);
    expect(p.height).toBeCloseTo((800 * 15) / (15 * k), 6);
  });
  it('builds paths from flat rings and GeoJSON', () => {
    const p = makeProjection(bbox, 100);
    expect(ringsToPath([[140, -10, 155, -10, 155, -25]], p)).toMatch(/^M0\.0 0\.0L100\.0 0\.0L100\.0 .*Z$/);
    const d = geometryToPath({ type: 'Polygon', coordinates: [[[140, -10], [155, -10], [155, -25], [140, -10]]] }, p);
    expect(d.startsWith('M0.0 0.0')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(geometryToPath({ type: 'Point', coordinates: [1, 2] }, p)).toBe('');
  });
  it('haversine is about 111 km per degree of latitude', () => {
    expect(haversineKm(150, -20, 150, -21)).toBeGreaterThan(110);
    expect(haversineKm(150, -20, 150, -21)).toBeLessThan(112);
  });
});
