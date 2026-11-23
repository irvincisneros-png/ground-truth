// Builds public/data/geo/au-land.json: Natural Earth 1:50m land (public domain),
// clipped to the Australia / Coral Sea window and simplified. Run: node tools/geo/build-geo.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const URL_50M = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';
const BBOX = [108, -46, 162, -7]; // w, s, e, n
const TOL = 0.004; // degrees, Douglas-Peucker

const res = await fetch(URL_50M);
if (!res.ok) throw new Error('download failed ' + res.status);
const gj = await res.json();

function clipEdge(pts, inside, intersect) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inside(a), ib = inside(b);
    if (ia && ib) out.push(b);
    else if (ia && !ib) out.push(intersect(a, b));
    else if (!ia && ib) { out.push(intersect(a, b)); out.push(b); }
  }
  return out;
}
function clipRect(ring, [w, s, e, n]) {
  let p = ring;
  const stages = [
    [(q) => q[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(q) => q[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(q) => q[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [(q) => q[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ];
  for (const [ins, inter] of stages) { if (!p.length) break; p = clipEdge(p, ins, inter); }
  return p;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r2 = (v) => Math.round(v * 100) / 100;
const polys = [];
for (const f of gj.features) {
  const g = f.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of list) {
    const outer = poly[0];
    const xs = outer.map((p) => p[0]), ys = outer.map((p) => p[1]);
    if (Math.max(...xs) < BBOX[0] || Math.min(...xs) > BBOX[2] || Math.max(...ys) < BBOX[1] || Math.min(...ys) > BBOX[3]) continue;
    const clipped = clipRect(outer.slice(0, -1), BBOX);
    if (clipped.length < 3) continue;
    const s = dp(clipped, TOL).map((p) => [r2(p[0]), r2(p[1])]);
    if (s.length >= 3) polys.push(s.flat());
  }
}
mkdirSync('public/data/geo', { recursive: true });
const out = {
  bbox: BBOX,
  note: 'Land polygons, flat [lon,lat,lon,lat,...] rings. Clipped and simplified for display only.',
  sources: [{
    name: 'Natural Earth 1:50m Land',
    url: 'https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/',
    licence: 'Public domain',
    citation: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
    retrieved: new Date().toISOString().slice(0, 10),
  }],
  polygons: polys,
};
const txt = JSON.stringify(out);
writeFileSync('public/data/geo/au-land.json', txt);
console.log(polys.length, 'polygons,', (txt.length / 1024).toFixed(1), 'KB');
