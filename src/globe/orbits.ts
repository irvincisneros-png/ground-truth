/**
 * Orbit and ground-track maths. Pure functions, no DOM, no three.js.
 *
 * Model: circular orbits in an Earth-centred inertial frame (X toward the Sun's right ascension at
 * epoch, Z toward the north pole). The plane's ascending node drifts at `raanRateDegPerDay`
 * (J2 regression; for sun-synchronous orbits it equals the Sun's apparent motion, 0.9856 deg/day).
 * The Earth turns at its sidereal rate underneath, so ground tracks shift correctly.
 *
 * Time `t` is seconds since the sim epoch (00:00 UTC on day 0).
 */

export const RE_KM = 6371.0088;
export const MU_KM3_S2 = 398600.4418;
export const J2 = 1.08263e-3;
/** Sidereal rotation rate of the Earth, rad/s. */
export const OMEGA_E = 7.2921159e-5;
export const SUN_RA_RATE_DEG_PER_DAY = 360 / 365.2422;
export const DAY_S = 86400;
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

/** Earth rotation angle at t = 0, chosen so the sub-solar longitude is 180 deg at 00:00 UTC. */
export const THETA0_RAD = -Math.PI;

export interface Orbit {
  /** Altitude above the mean surface, km. */
  altKm: number;
  /** Inclination, degrees (>90 is retrograde). */
  inclDeg: number;
  /** Nodal period, seconds. */
  periodS: number;
  /** Right ascension of the ascending node at t = 0, degrees. */
  raanDeg: number;
  /** Nodal regression, degrees per day. */
  raanRateDegPerDay: number;
  /** Argument of latitude at t = 0 (angle along the orbit from the ascending node), degrees. */
  u0Deg: number;
}

export interface LatLon { lat: number; lon: number }
export interface TrackPoint extends LatLon { t: number }
export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- orbit construction

export function keplerPeriodS(altKm: number): number {
  const a = RE_KM + altKm;
  return 2 * Math.PI * Math.sqrt((a * a * a) / MU_KM3_S2);
}

/** J2 nodal regression for a circular orbit, degrees per day (negative for prograde). */
export function nodalRegressionDegPerDay(altKm: number, inclDeg: number): number {
  const a = RE_KM + altKm;
  const n = Math.sqrt(MU_KM3_S2 / (a * a * a));
  const rate = -1.5 * n * J2 * (RE_KM / a) ** 2 * Math.cos(inclDeg * D2R); // rad/s
  return rate * R2D * DAY_S;
}

/** The inclination that makes the node precess with the Sun (sun-synchronous). */
export function sunSyncInclinationDeg(altKm: number): number {
  const a = RE_KM + altKm;
  const n = Math.sqrt(MU_KM3_S2 / (a * a * a));
  const target = SUN_RA_RATE_DEG_PER_DAY * D2R / DAY_S; // rad/s
  const c = -target / (1.5 * n * J2 * (RE_KM / a) ** 2);
  return Math.acos(c) * R2D;
}

/**
 * Nodal period that makes the ground track repeat exactly: `revs` orbits fit into `nodalDays` turns of the
 * Earth relative to the orbit plane.
 */
export function repeatPeriodS(revs: number, nodalDays: number, raanRateDegPerDay: number): number {
  const relRate = OMEGA_E - (raanRateDegPerDay * D2R) / DAY_S; // rad/s of Earth relative to the plane
  return (nodalDays * 2 * Math.PI) / relRate / revs;
}

/** Right ascension of the Sun (deg) at time t. */
export function sunRaDeg(t: number): number {
  return (SUN_RA_RATE_DEG_PER_DAY * t) / DAY_S;
}

/** RAAN at t = 0 for a sun-synchronous orbit whose ascending node crosses at the given local solar time. */
export function sunSyncRaanDeg(lstAscHours: number): number {
  return sunRaDeg(0) + (lstAscHours - 12) * 15;
}

export interface SunSyncSpec { altKm: number; lstAscHours: number; periodS?: number; u0Deg?: number }

export function sunSyncOrbit(s: SunSyncSpec): Orbit {
  return {
    altKm: s.altKm,
    inclDeg: sunSyncInclinationDeg(s.altKm),
    periodS: s.periodS ?? keplerPeriodS(s.altKm),
    raanDeg: sunSyncRaanDeg(s.lstAscHours),
    raanRateDegPerDay: SUN_RA_RATE_DEG_PER_DAY,
    u0Deg: s.u0Deg ?? 0,
  };
}

/** Geostationary: i = 0, period = one sidereal day, fixed over `lonDeg`. */
export function geostationaryOrbit(lonDeg: number): Orbit {
  return {
    altKm: 35786,
    inclDeg: 0,
    periodS: (2 * Math.PI) / OMEGA_E,
    raanDeg: 0,
    raanRateDegPerDay: 0,
    // sub-satellite lon = u - theta, with theta(0) = THETA0; so u0 = lon + theta0
    u0Deg: lonDeg + THETA0_RAD * R2D,
  };
}

// ---------------------------------------------------------------- positions

export function earthRotationRad(t: number): number {
  return THETA0_RAD + OMEGA_E * t;
}

/** Position in the inertial frame in units of Earth radii. */
export function inertialPos(o: Orbit, t: number): Vec3 {
  const r = (RE_KM + o.altKm) / RE_KM;
  const u = (o.u0Deg * D2R) + (2 * Math.PI * t) / o.periodS;
  const raan = (o.raanDeg + (o.raanRateDegPerDay * t) / DAY_S) * D2R;
  const i = o.inclDeg * D2R;
  const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(i), si = Math.sin(i);
  return [r * (cO * cu - sO * ci * su), r * (sO * cu + cO * ci * su), r * (si * su)];
}

/** Orbit-plane unit vectors (P toward the ascending node, Q 90 deg ahead) in the inertial frame at time t. */
export function orbitPlaneBasis(o: Orbit, t: number): { p: Vec3; q: Vec3 } {
  const raan = (o.raanDeg + (o.raanRateDegPerDay * t) / DAY_S) * D2R;
  const i = o.inclDeg * D2R;
  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(i), si = Math.sin(i);
  return { p: [cO, sO, 0], q: [-sO * ci, cO * ci, si] };
}

export function toEarthFixed(v: Vec3, t: number): Vec3 {
  const th = earthRotationRad(t);
  const c = Math.cos(th), s = Math.sin(th);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
}

export function vecToLatLon(v: Vec3): LatLon {
  const r = Math.hypot(v[0], v[1], v[2]);
  return { lat: Math.asin(v[2] / r) * R2D, lon: Math.atan2(v[1], v[0]) * R2D };
}

export function latLonToVec(lat: number, lon: number): Vec3 {
  const la = lat * D2R, lo = lon * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export function subSatellitePoint(o: Orbit, t: number): LatLon {
  return vecToLatLon(toEarthFixed(inertialPos(o, t), t));
}

export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Ground track sampled every `stepS` seconds from t0 to t1 inclusive. */
export function groundTrack(o: Orbit, t0: number, t1: number, stepS = 30): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let t = t0; t <= t1 + 1e-6; t += stepS) {
    const p = subSatellitePoint(o, t);
    out.push({ t, lat: p.lat, lon: p.lon });
  }
  return out;
}

/** Split a track into segments that don't cross the antimeridian (for flat maps). */
export function splitAtAntimeridian<T extends LatLon>(pts: T[]): T[][] {
  const segs: T[][] = [];
  let cur: T[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && Math.abs(pts[i].lon - pts[i - 1].lon) > 180) {
      segs.push(cur);
      cur = [];
    }
    cur.push(pts[i]);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/** Times (s) of ascending equator crossings and their longitudes within [t0, t1]. */
export function ascendingNodes(o: Orbit, t0: number, t1: number): { t: number; lon: number }[] {
  const res: { t: number; lon: number }[] = [];
  const dt = o.periodS / 720;
  let prev = subSatellitePoint(o, t0).lat;
  for (let t = t0 + dt; t <= t1; t += dt) {
    const cur = subSatellitePoint(o, t).lat;
    if (prev < 0 && cur >= 0) {
      // linear refine
      const f = -prev / (cur - prev);
      const tc = t - dt + f * dt;
      res.push({ t: tc, lon: subSatellitePoint(o, tc).lon });
    }
    prev = cur;
  }
  return res;
}

// ---------------------------------------------------------------- spherical geometry on the surface

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * D2R, dLon = (b.lon - a.lon) * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * RE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const la1 = a.lat * D2R, la2 = b.lat * D2R, dLon = (b.lon - a.lon) * D2R;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

export function destination(p: LatLon, bearing: number, distKm: number): LatLon {
  const d = distKm / RE_KM, br = bearing * D2R, la1 = p.lat * D2R, lo1 = p.lon * D2R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  // at a pole the longitude is undefined: use the bearing as the meridian so rings and fans stay well-formed
  const lo2 = Math.abs(Math.cos(la1)) < 1e-9
    ? lo1 + br
    : lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 * R2D, lon: wrapLon(lo2 * R2D) };
}

/** Ring of points at an angular radius around a centre. */
export function circlePolygon(c: LatLon, radiusDeg: number, n = 96): LatLon[] {
  const km = radiusDeg * D2R * RE_KM;
  const out: LatLon[] = [];
  for (let i = 0; i < n; i++) out.push(destination(c, (360 * i) / n, km));
  return out;
}

/**
 * Earth-central angle (deg) from the sub-satellite point to the edge of what a satellite at `altKm` can see
 * at or above a minimum elevation angle.
 */
export function footprintRadiusDeg(altKm: number, minElevDeg = 0): number {
  const e = minElevDeg * D2R;
  const ratio = RE_KM / (RE_KM + altKm);
  return (Math.acos(ratio * Math.cos(e)) - e) * R2D;
}

export interface SwathEdges { centre: TrackPoint[]; left: LatLon[]; right: LatLon[] }

/** Edges of a swath of full width `widthKm` centred on the ground track (left/right of the direction of travel). */
export function swathEdges(o: Orbit, t0: number, t1: number, widthKm: number, stepS = 30): SwathEdges {
  const centre = groundTrack(o, t0, t1, stepS);
  const left: LatLon[] = [], right: LatLon[] = [];
  const half = widthKm / 2;
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)];
    const hdg = bearingDeg(a, b);
    left.push(destination(centre[i], hdg - 90, half));
    right.push(destination(centre[i], hdg + 90, half));
  }
  return { centre, left, right };
}

/**
 * The swath as a grid: one row per time step, `cols + 1` points from the left edge to the right edge.
 * (Meshes need interior points: a flat quad across a 1500 km swath would dip below the globe.)
 */
export function swathGrid(o: Orbit, t0: number, t1: number, widthKm: number, stepS = 30, cols = 4): LatLon[][] {
  const centre = groundTrack(o, t0, t1, stepS);
  const rows: LatLon[][] = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)];
    const hdg = bearingDeg(a, b);
    const row: LatLon[] = [];
    for (let j = 0; j <= cols; j++) {
      const off = (j / cols - 0.5) * widthKm; // negative = left of travel
      row.push(Math.abs(off) < 1e-6 ? { lat: centre[i].lat, lon: centre[i].lon } : destination(centre[i], hdg + (off > 0 ? 90 : -90), Math.abs(off)));
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- the Sun

/** Unit vector toward the Sun in the inertial frame. */
export function sunDirection(t: number, decDeg: number): Vec3 {
  const a = sunRaDeg(t) * D2R, d = decDeg * D2R;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export function subSolarPoint(t: number, decDeg: number): LatLon {
  return vecToLatLon(toEarthFixed(sunDirection(t, decDeg), t));
}

/** Local mean solar time in hours at a longitude (from the sub-solar longitude). */
export function localSolarHours(lon: number, t: number, decDeg = 0): number {
  const ss = subSolarPoint(t, decDeg).lon;
  return (((12 + (lon - ss) / 15) % 24) + 24) % 24;
}

// ---------------------------------------------------------------- the real spacecraft in this lab

export interface SatSpec {
  id: string;
  name: string;
  orbit: Orbit;
  /** Instrument swath width, km (0 for none). */
  swathKm: number;
  /** Nominal pixel / footprint size, m. */
  pixelM: number;
  note: string;
}

const JASON_REVS = 127, JASON_NODAL_DAYS = 10;
const jasonIncl = 66.04;
const jasonRaanRate = nodalRegressionDegPerDay(1336, jasonIncl);
export const JASON_REPEAT_S = JASON_REVS * repeatPeriodS(JASON_REVS, JASON_NODAL_DAYS, jasonRaanRate);

const landsatPeriod = repeatPeriodS(233, 16, SUN_RA_RATE_DEG_PER_DAY);

export const SATELLITES: Record<string, SatSpec> = {
  himawari9: {
    id: 'himawari9', name: 'Himawari-9', swathKm: 0, pixelM: 2000,
    orbit: geostationaryOrbit(140.7),
    note: 'Geostationary, 35 786 km up, fixed over 140.7 E',
  },
  noaa20: {
    id: 'noaa20', name: 'NOAA-20 (VIIRS)', swathKm: 3060, pixelM: 750,
    orbit: sunSyncOrbit({ altKm: 824, lstAscHours: 13.4, periodS: 101.4 * 60, u0Deg: 40 }),
    note: 'Sun-synchronous polar orbit, 824 km, crosses the equator about 13:30 local time',
  },
  jason3: {
    id: 'jason3', name: 'Sentinel-6 / Jason-3', swathKm: 0, pixelM: 6000,
    orbit: {
      altKm: 1336, inclDeg: jasonIncl,
      periodS: repeatPeriodS(JASON_REVS, JASON_NODAL_DAYS, jasonRaanRate),
      raanDeg: 20, raanRateDegPerDay: jasonRaanRate, u0Deg: 0,
    },
    note: 'Inclination 66 deg, 1336 km, ground track repeats every 9.9 days (127 orbits)',
  },
  landsat8: {
    id: 'landsat8', name: 'Landsat 8', swathKm: 185, pixelM: 30,
    orbit: sunSyncOrbit({ altKm: 705, lstAscHours: 22.0, periodS: landsatPeriod, u0Deg: 20 }),
    note: 'Sun-synchronous, 705 km, 16-day repeat, crosses the equator at about 10:00 local time (descending)',
  },
  landsat9: {
    id: 'landsat9', name: 'Landsat 9', swathKm: 185, pixelM: 30,
    orbit: sunSyncOrbit({ altKm: 705, lstAscHours: 22.0, periodS: landsatPeriod, u0Deg: 200 }),
    note: 'Same orbit as Landsat 8, half an orbit apart, so together they revisit every 8 days',
  },
  amsr2: {
    id: 'amsr2', name: 'GCOM-W / AMSR2', swathKm: 1450, pixelM: 25000,
    orbit: sunSyncOrbit({ altKm: 700, lstAscHours: 13.5, u0Deg: 100 }),
    note: 'Sun-synchronous, 700 km, 1450 km swath, microwave radiometer',
  },
};

/** Longitudes (0..360) where the ground track crosses the equator (either direction) in [t0, t1]. */
export function equatorCrossingLons(o: Orbit, t0: number, t1: number): number[] {
  const out: number[] = [];
  const dt = Math.min(10, o.periodS / 400);
  let prev = subSatellitePoint(o, t0).lat;
  for (let t = t0 + dt; t <= t1; t += dt) {
    const p = subSatellitePoint(o, t);
    if (prev * p.lat < 0) out.push(((p.lon % 360) + 360) % 360);
    prev = p.lat;
  }
  return out;
}

/** Largest east-west gap (km at the equator) between neighbouring ground tracks, given their crossing longitudes. */
export function maxEquatorGapKm(lons: number[]): number {
  if (lons.length < 2) return (2 * Math.PI * RE_KM);
  const s = [...lons].sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < s.length; i++) max = Math.max(max, (s[(i + 1) % s.length] - s[i] + 360) % 360 || 360);
  return (max * 2 * Math.PI * RE_KM) / 360;
}

/** Argument of latitude (u0 at t = 0) that puts the satellite at `latDeg` at time `t` on an ascending or descending leg. */
export function phaseU0(o: Orbit, t: number, latDeg: number, ascending = true): number {
  const si = Math.sin(o.inclDeg * D2R);
  const u1 = Math.asin(Math.max(-1, Math.min(1, Math.sin(latDeg * D2R) / si))) * R2D;
  const u = ascending ? u1 : 180 - u1;
  return u - (360 * t) / o.periodS;
}

/** Return a copy of an orbit re-phased so the satellite is at `latDeg` (ascending or descending) at time t. */
export function withPass(o: Orbit, t: number, latDeg: number, ascending: boolean): Orbit {
  return { ...o, u0Deg: phaseU0(o, t, latDeg, ascending) };
}

/** True where the sub-point of the sampled position is on the day side (Sun above the horizon). */
export function isDaylit(lat: number, lon: number, t: number, sunDecDeg: number): boolean {
  const ss = subSolarPoint(t, sunDecDeg);
  const a = latLonToVec(lat, lon), b = latLonToVec(ss.lat, ss.lon);
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0;
}

/** Equator crossings in one direction only. */
export function equatorCrossings(o: Orbit, t0: number, t1: number, dir: 'asc' | 'desc'): { t: number; lon: number }[] {
  const out: { t: number; lon: number }[] = [];
  const dt = Math.min(10, o.periodS / 400);
  let prev = subSatellitePoint(o, t0).lat;
  for (let t = t0 + dt; t <= t1; t += dt) {
    const p = subSatellitePoint(o, t);
    if ((dir === 'asc' ? prev < 0 && p.lat >= 0 : prev > 0 && p.lat <= 0)) out.push({ t, lon: p.lon });
    prev = p.lat;
  }
  return out;
}

/** Fraction (0..1) of the equator covered by swaths of width widthKm centred on the given crossing longitudes. */
export function equatorCoverage(lons: number[], widthKm: number): number {
  const half = (widthKm / 2 / (2 * Math.PI * RE_KM)) * 360;
  const iv = lons.map((l) => ((l % 360) + 360) % 360).sort((a, b) => a - b).map((l) => [l - half, l + half] as [number, number]);
  const segs: [number, number][] = [];
  for (const [a, b] of iv) {
    if (a < 0) { segs.push([0, b], [a + 360, 360]); } else if (b > 360) { segs.push([a, 360], [0, b - 360]); } else segs.push([a, b]);
  }
  segs.sort((x, y) => x[0] - y[0]);
  let total = 0, curA = -1, curB = -1;
  for (const [a, b] of segs) {
    if (a > curB) { if (curB > curA) total += curB - curA; curA = a; curB = b; } else curB = Math.max(curB, b);
  }
  if (curB > curA) total += curB - curA;
  return Math.min(1, total / 360);
}
