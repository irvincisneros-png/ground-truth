/** Pure maths for charts and trend fits. No DOM, so it is unit-tested directly. */

export interface XY {
  x: number;
  y: number;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  n: number;
  r2: number;
}

/** Ordinary least squares over points whose x is within [x0, x1] (inclusive). Returns null if fewer than 2 points. */
export function linearFit(points: XY[], x0 = -Infinity, x1 = Infinity): LinearFit | null {
  const p = points.filter((q) => q.x >= x0 && q.x <= x1 && Number.isFinite(q.y));
  const n = p.length;
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (const q of p) { sx += q.x; sy += q.y; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const q of p) {
    sxx += (q.x - mx) ** 2;
    sxy += (q.x - mx) * (q.y - my);
    syy += (q.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, n, r2 };
}

/** "Nice" tick values covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(min / step - 1e-9) * step;
  const dp = Math.min(10, Math.max(0, 1 - Math.floor(Math.log10(step))));
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(+(Math.round(v / step) * step).toFixed(dp) + 0);
  return out;
}

/** Expand [min, max] to tidy round bounds for an axis. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const t = niceTicks(min, max, count);
  if (t.length < 2) return [min, max];
  const step = t[1] - t[0];
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Index of the point whose x is nearest to `x`. Points must be sorted by x. */
export function nearestIndex(points: XY[], x: number): number {
  if (!points.length) return -1;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid; else hi = mid;
  }
  return Math.abs(points[lo].x - x) <= Math.abs(points[hi].x - x) ? lo : hi;
}

/** Thin a long series for drawing, keeping first, last and per-bucket min and max so peaks survive. */
export function decimate(points: XY[], maxPoints: number): XY[] {
  if (points.length <= maxPoints || maxPoints < 4) return points;
  const buckets = Math.floor((maxPoints - 2) / 2);
  const size = (points.length - 2) / buckets;
  const out: XY[] = [points[0]];
  for (let b = 0; b < buckets; b++) {
    const a = 1 + Math.floor(b * size), z = Math.min(points.length - 1, 1 + Math.floor((b + 1) * size));
    let lo = points[a], hi = points[a];
    for (let i = a; i < z; i++) {
      if (points[i].y < lo.y) lo = points[i];
      if (points[i].y > hi.y) hi = points[i];
    }
    if (lo.x <= hi.x) out.push(lo, hi); else out.push(hi, lo);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Trend over a window expressed as a rate, with the window fit line's end points. */
export function trendSegment(points: XY[], x0: number, x1: number): { fit: LinearFit; a: XY; b: XY } | null {
  const fit = linearFit(points, x0, x1);
  if (!fit) return null;
  const xs = points.filter((p) => p.x >= x0 && p.x <= x1).map((p) => p.x);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return { fit, a: { x: lo, y: fit.intercept + fit.slope * lo }, b: { x: hi, y: fit.intercept + fit.slope * hi } };
}

export function fmt(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(dp).replace('-', '−');
}

/** Integer-year ticks inside [x0, x1], thinned to at most `max` labels. */
export function yearTicks(x0: number, x1: number, max = 8): number[] {
  const a = Math.ceil(x0 - 1e-9), b = Math.floor(x1 + 1e-9);
  if (b < a) return [];
  let step = 1;
  for (const s of [1, 2, 5, 10, 20]) { step = s; if ((b - a) / s + 1 <= max) break; }
  const out: number[] = [];
  for (let y = Math.ceil(a / step) * step; y <= b; y += step) out.push(y);
  return out;
}
