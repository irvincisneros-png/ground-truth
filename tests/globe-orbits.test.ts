import { describe, expect, it } from 'vitest';
import {
  SATELLITES, JASON_REPEAT_S, DAY_S, RE_KM, ascendingNodes, destination, footprintRadiusDeg, groundTrack,
  haversineKm, keplerPeriodS, localSolarHours, splitAtAntimeridian, subSatellitePoint, subSolarPoint,
  sunSyncInclinationDeg, swathEdges, geostationaryOrbit, circlePolygon, wrapLon,
} from '../src/globe/orbits';

const maxAbsLat = (o: Parameters<typeof groundTrack>[0], t1: number) =>
  Math.max(...groundTrack(o, 0, t1, 20).map((p) => Math.abs(p.lat)));

describe('ground-track latitude limits', () => {
  it('prograde: max |lat| equals the inclination (Jason 66 deg never exceeds +/-66)', () => {
    const o = SATELLITES.jason3.orbit;
    const m = maxAbsLat(o, 10 * DAY_S);
    expect(m).toBeLessThanOrEqual(o.inclDeg + 0.02);
    expect(m).toBeGreaterThan(o.inclDeg - 0.2);
    expect(o.inclDeg).toBeCloseTo(66, 0);
  });

  it('retrograde sun-synchronous: max |lat| = 180 - i', () => {
    for (const id of ['landsat8', 'noaa20', 'amsr2']) {
      const o = SATELLITES[id].orbit;
      expect(o.inclDeg).toBeGreaterThan(90);
      const m = maxAbsLat(o, 2 * DAY_S);
      expect(m).toBeLessThanOrEqual(180 - o.inclDeg + 0.02);
      expect(m).toBeGreaterThan(180 - o.inclDeg - 0.2);
    }
  });

  it('sun-synchronous inclinations match the real missions', () => {
    expect(sunSyncInclinationDeg(705)).toBeCloseTo(98.2, 0);
    expect(sunSyncInclinationDeg(824)).toBeCloseTo(98.7, 0);
  });
});

describe('geostationary', () => {
  it('sub-satellite point is fixed over 140.7 E on the equator', () => {
    const o = SATELLITES.himawari9.orbit;
    for (const t of [0, 3600, 40000, 2 * DAY_S, 7 * DAY_S + 123]) {
      const p = subSatellitePoint(o, t);
      expect(Math.abs(p.lat)).toBeLessThan(0.01);
      expect(Math.abs(wrapLon(p.lon - 140.7))).toBeLessThan(0.01);
    }
    expect(geostationaryOrbit(0).periodS).toBeCloseTo(86164.09, 0);
  });
  it('disc radius at zero elevation is about 81.3 deg', () => {
    expect(footprintRadiusDeg(35786, 0)).toBeCloseTo(81.3, 1);
  });
});

describe('repeat cycles', () => {
  it('Jason repeats after 127 orbits = 9.9 days', () => {
    const o = SATELLITES.jason3.orbit;
    expect(JASON_REPEAT_S / DAY_S).toBeCloseTo(9.9156, 2);
    const a = subSatellitePoint(o, 5000), b = subSatellitePoint(o, 5000 + JASON_REPEAT_S);
    expect(haversineKm(a, b)).toBeLessThan(2);
  });
  it('Jason adjacent equatorial tracks are ~315 km apart (360/127 deg)', () => {
    const o = SATELLITES.jason3.orbit;
    const nodes = ascendingNodes(o, 0, JASON_REPEAT_S - 10).map((n) => ((n.lon % 360) + 360) % 360).sort((x, y) => x - y);
    expect(nodes.length).toBeGreaterThanOrEqual(126);
    const gaps = nodes.slice(1).map((v, i) => v - nodes[i]);
    const kmPerDeg = (2 * Math.PI * RE_KM) / 360;
    const spacing = (360 / 127) * kmPerDeg;
    expect(spacing).toBeGreaterThan(300);
    expect(spacing).toBeLessThan(330);
    // one crossing may fall just outside the window, leaving a single double gap
    const small = gaps.filter((g) => g * kmPerDeg < spacing * 1.5);
    expect(gaps.length - small.length).toBeLessThanOrEqual(1);
    for (const g of small) {
      expect(g * kmPerDeg).toBeGreaterThan(spacing * 0.9);
      expect(g * kmPerDeg).toBeLessThan(spacing * 1.1);
    }
  });
  it('Landsat repeats after 16 days (233 orbits); Landsat 9 sits on the same track 8 days later', () => {
    const l8 = SATELLITES.landsat8.orbit, l9 = SATELLITES.landsat9.orbit;
    expect(haversineKm(subSatellitePoint(l8, 777), subSatellitePoint(l8, 777 + 16 * DAY_S))).toBeLessThan(3);
    expect(haversineKm(subSatellitePoint(l8, 777 + 8 * DAY_S), subSatellitePoint(l9, 777))).toBeLessThan(3);
    expect(l8.periodS / 60).toBeCloseTo(98.9, 1);
  });
});

describe('sun-synchronous local time', () => {
  it('NOAA-20 crosses the equator northward at about 13:30 local time every day', () => {
    const o = SATELLITES.noaa20.orbit;
    const nodes = ascendingNodes(o, 0, 6 * DAY_S);
    const lsts = nodes.map((n) => localSolarHours(n.lon, n.t, 0));
    for (const h of lsts) expect(Math.abs(h - 13.4)).toBeLessThan(0.35);
  });
});

describe('geometry helpers', () => {
  it('destination and haversine agree', () => {
    const p = { lat: -20, lon: 150 };
    for (const [b, d] of [[0, 500], [90, 1000], [210, 2500]]) {
      expect(haversineKm(p, destination(p, b, d))).toBeCloseTo(d, 0);
    }
  });
  it('swath edges are the requested distance apart', () => {
    const e = swathEdges(SATELLITES.landsat8.orbit, 0, 600, 185, 30);
    const i = 8;
    expect(haversineKm(e.left[i], e.right[i])).toBeGreaterThan(180);
    expect(haversineKm(e.left[i], e.right[i])).toBeLessThan(190);
  });
  it('antimeridian splitting', () => {
    const segs = splitAtAntimeridian([{ lat: 0, lon: 170 }, { lat: 1, lon: 179 }, { lat: 2, lon: -178 }, { lat: 3, lon: -170 }]);
    expect(segs.length).toBe(2);
  });
  it('circle polygon points sit at the radius', () => {
    const c = { lat: 0, lon: 140 };
    for (const p of circlePolygon(c, 10, 12)) expect(haversineKm(c, p)).toBeCloseTo(10 * (2 * Math.PI * RE_KM) / 360, 0);
  });
  it('kepler period of 705 km is ~99 min; sub-solar point is at 180 E at 00:00 UTC', () => {
    expect(keplerPeriodS(705) / 60).toBeCloseTo(98.8, 0);
    expect(Math.abs(Math.abs(subSolarPoint(0, 0).lon) - 180)).toBeLessThan(0.01);
    expect(subSolarPoint(12 * 3600, 0).lon).toBeCloseTo(0, 0);
  });
});
