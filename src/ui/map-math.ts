/** Equirectangular projection helpers. Longitude is scaled by cos(mid-latitude) so shapes look right at this latitude. */

export type BBox = [number, number, number, number]; // west, south, east, north

export interface Projection {
  width: number;
  height: number;
  project(lon: number, lat: number): [number, number];
  unproject(x: number, y: number): [number, number];
}

export function makeProjection(bbox: BBox, width: number): Projection {
  const [w, s, e, n] = bbox;
  const midLat = (s + n) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const dx = (e - w) * k, dy = n - s;
  const height = (width * dy) / dx;
  return {
    width,
    height,
    project: (lon, lat) => [((lon - w) / (e - w)) * width, ((n - lat) / (n - s)) * height],
    unproject: (x, y) => [w + (x / width) * (e - w), n - (y / height) * (n - s)],
  };
}

export function ringsToPath(rings: number[][], proj: Projection): string {
  let d = '';
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const [x, y] = proj.project(r[i], r[i + 1]);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += 'Z';
  }
  return d;
}

/** Path for GeoJSON Polygon / MultiPolygon / LineString coordinates. */
export function geometryToPath(g: { type: string; coordinates: unknown }, proj: Projection): string {
  const ring = (r: number[][], close: boolean) =>
    r.map((p, i) => { const [x, y] = proj.project(p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + (close ? 'Z' : '');
  const c = g.coordinates as any;
  switch (g.type) {
    case 'Polygon': return (c as number[][][]).map((r) => ring(r, true)).join('');
    case 'MultiPolygon': return (c as number[][][][]).map((poly) => poly.map((r) => ring(r, true)).join('')).join('');
    case 'LineString': return ring(c as number[][], false);
    case 'MultiLineString': return (c as number[][][]).map((r) => ring(r, false)).join('');
    default: return '';
  }
}

/** Distance in km between two points (haversine); used for the scale bar. */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
