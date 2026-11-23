/**
 * Pure physics and simulation helpers for the four sensor-lab stations. No DOM.
 * Anything random uses a seeded generator so results are reproducible and testable.
 */

// ------------------------------------------------------------------ seeded random numbers
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller). */
export function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ------------------------------------------------------------------ 1. thermal infrared
export const H_PLANCK = 6.62607015e-34;
export const C_LIGHT = 299792458;
export const K_BOLTZ = 1.380649e-23;

/** Planck spectral radiance, W m^-2 sr^-1 um^-1, at wavelength (um) and temperature (K). */
export function planckRadiance(lambdaUm: number, tK: number): number {
  const lam = lambdaUm * 1e-6;
  const a = 2 * H_PLANCK * C_LIGHT * C_LIGHT / lam ** 5;
  const b = Math.expm1((H_PLANCK * C_LIGHT) / (lam * K_BOLTZ * tK));
  return (a / b) * 1e-6;
}

/** Invert Planck: the temperature of a blackbody that would give radiance L (W m^-2 sr^-1 um^-1). */
export function brightnessTemperature(lambdaUm: number, radiance: number): number {
  const lam = lambdaUm * 1e-6;
  const l = radiance * 1e6;
  const c1 = 2 * H_PLANCK * C_LIGHT * C_LIGHT, c2 = (H_PLANCK * C_LIGHT) / K_BOLTZ;
  return c2 / lam / Math.log1p(c1 / (lam ** 5 * l));
}

export const BAND_11_UM = 10.8;
export const BAND_12_UM = 12.0;

export interface ThermalPixel {
  /** True skin temperature, K. */
  skinK: number;
  /** Radiance the satellite records at 10.8 um. */
  radiance11: number;
  bt11: number;
  bt12: number;
  /** Split-window estimate of skin SST, K. */
  sstK: number;
}

/**
 * Simulate what a thermal-IR sensor records for a clear-sky pixel. Water vapour between the sea and the
 * satellite absorbs and re-emits, so the apparent (brightness) temperature is colder than the skin, and
 * more so at 12 um than at 10.8 um. The difference between the two bands lets us correct for it.
 * `wvK` is the 10.8 um atmospheric deficit in kelvin (about 1 K dry, 3 K very humid tropics).
 */
export function simulateThermalPixel(skinK: number, wvK: number, noiseK = 0): ThermalPixel {
  const bt11 = skinK - wvK + noiseK;
  const bt12 = skinK - 1.7 * wvK + noiseK * 0.9;
  return {
    skinK,
    radiance11: planckRadiance(BAND_11_UM, bt11),
    bt11,
    bt12,
    sstK: splitWindowSst(bt11, bt12),
  };
}

/** Split-window retrieval: SST = BT11 + k (BT11 - BT12). Illustrative coefficient (real ones are fitted). */
export function splitWindowSst(bt11: number, bt12: number, k = 1.4): number {
  return bt11 + k * (bt11 - bt12);
}

export const kToC = (k: number) => k - 273.15;
export const cToK = (c: number) => c + 273.15;

/** Quality flag for a thermal pixel from cloud opacity (0..1) at that pixel. */
export type QualityFlag = 0 | 1 | 3;
export function thermalQualityFlag(cloud: number): QualityFlag {
  if (cloud >= 0.6) return 3; // cloudy: no retrieval
  if (cloud >= 0.2) return 1; // thin cloud / edge: low quality
  return 0;
}

// ------------------------------------------------------------------ 2. radar altimeter
export const JASON_ALTITUDE_M = 1336000;

/** Two-way travel: range = c t / 2. */
export function rangeFromDelay(tSeconds: number): number {
  return (C_LIGHT * tSeconds) / 2;
}
export function heightFromRange(orbitAltitudeM: number, rangeM: number): number {
  return orbitAltitudeM - rangeM;
}
export function delayFromHeight(orbitAltitudeM: number, heightM: number): number {
  return (2 * (orbitAltitudeM - heightM)) / C_LIGHT;
}
export function standardError(sigma: number, n: number): number {
  return sigma / Math.sqrt(n);
}

export interface RunningStats { n: number; mean: number; sd: number; se: number }
export function stats(xs: number[]): RunningStats {
  const n = xs.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, se: NaN };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  return { n, mean, sd, se: n > 1 ? sd / Math.sqrt(n) : NaN };
}

/** Simulated repeated height measurements: truth + Gaussian noise (sigma, metres). */
export function simulateMeasurements(truthM: number, sigmaM: number, n: number, seed: number): number[] {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => truthM + sigmaM * gaussian(r));
}

// ------------------------------------------------------------------ 3. optical multispectral
export interface Band { id: string; name: string; um: number }
export const BANDS: Band[] = [
  { id: 'B1', name: 'Coastal', um: 0.443 },
  { id: 'B2', name: 'Blue', um: 0.482 },
  { id: 'B3', name: 'Green', um: 0.562 },
  { id: 'B4', name: 'Red', um: 0.655 },
  { id: 'B5', name: 'Near-IR', um: 0.865 },
  { id: 'B6', name: 'SWIR 1', um: 1.609 },
  { id: 'B7', name: 'SWIR 2', um: 2.201 },
];

export type SurfaceId = 'forest' | 'burnt' | 'bare' | 'cloud' | 'water';
export interface Surface { id: SurfaceId; label: string; blurb: string; refl: number[]; color: string }

/** Typical (approximate) surface reflectance in Landsat 8/9 OLI bands B1..B7. Textbook-style curves, not measurements. */
export const SURFACES: Surface[] = [
  { id: 'forest', label: 'Healthy forest', blurb: 'Leaves absorb red light for photosynthesis but bounce near-infrared strongly.', refl: [0.020, 0.025, 0.065, 0.035, 0.46, 0.20, 0.09], color: '#4cc38a' },
  { id: 'burnt', label: 'Burnt ground', blurb: 'Charcoal and ash: dark in near-infrared, relatively bright in the shortwave infrared.', refl: [0.035, 0.040, 0.050, 0.065, 0.095, 0.17, 0.15], color: '#c97b5a' },
  { id: 'bare', label: 'Cleared bare soil', blurb: 'Brightens steadily from blue to shortwave infrared, with no red-edge jump.', refl: [0.060, 0.070, 0.095, 0.135, 0.195, 0.290, 0.300], color: '#e0b36b' },
  { id: 'cloud', label: 'Cloud', blurb: 'Bright and flat across the visible and near-infrared. It blocks the view of whatever is below.', refl: [0.70, 0.70, 0.70, 0.69, 0.66, 0.36, 0.20], color: '#d7e2f5' },
  { id: 'water', label: 'Water', blurb: 'Dark everywhere, and almost black in the infrared.', refl: [0.060, 0.065, 0.055, 0.030, 0.012, 0.005, 0.003], color: '#4a8fe0' },
];

export const surfaceById = (id: SurfaceId): Surface => SURFACES.find((s) => s.id === id)!;
const band = (id: string) => BANDS.findIndex((b) => b.id === id);

export function ndvi(nir: number, red: number): number {
  const d = nir + red;
  return d === 0 ? 0 : (nir - red) / d;
}
/** Normalised Burn Ratio: separates burnt ground using the shortwave infrared. */
export function nbr(nir: number, swir2: number): number {
  const d = nir + swir2;
  return d === 0 ? 0 : (nir - swir2) / d;
}
export function surfaceNdvi(s: Surface): number { return ndvi(s.refl[band('B5')], s.refl[band('B4')]); }
export function surfaceNbr(s: Surface): number { return nbr(s.refl[band('B5')], s.refl[band('B7')]); }

/** True colour (red, green, blue) for a surface, with a gentle stretch so dark scenes read well. */
export function trueColour(s: Surface, gain = 1): string {
  const f = (r: number) => Math.round(255 * Math.min(1, Math.pow(Math.min((r * gain) / 0.28, 1), 0.62)));
  return `rgb(${f(s.refl[band('B4')])},${f(s.refl[band('B3')])},${f(s.refl[band('B2')])})`;
}

export const TREE_NDVI_THRESHOLD = 0.6;
export interface TreeCover { trees: number; valid: number; total: number; percent: number }
/** Tree cover = share of valid pixels whose NDVI is at or above the threshold. Cloud pixels are no-data. */
export function treeCover(grid: SurfaceId[], night: boolean): TreeCover {
  if (night) return { trees: 0, valid: 0, total: grid.length, percent: NaN };
  let trees = 0, valid = 0;
  for (const id of grid) {
    if (id === 'cloud') continue;
    valid++;
    if (surfaceNdvi(surfaceById(id)) >= TREE_NDVI_THRESHOLD) trees++;
  }
  return { trees, valid, total: grid.length, percent: valid ? (100 * trees) / valid : NaN };
}

// ------------------------------------------------------------------ 4. passive microwave sea ice
/** Approximate 19 GHz brightness temperature tie points, kelvin. */
export const TB_TIE = {
  water: { h: 100, v: 175 },
  ice: { h: 235, v: 250 },
};
export const PIXEL_KM = 25;
export const PIXEL_AREA_KM2 = PIXEL_KM * PIXEL_KM;
export const STANDARD_THRESHOLD = 15;

export function tbFromConcentration(c: number, pol: 'h' | 'v', noiseK = 0): number {
  const t = TB_TIE;
  return c * t.ice[pol] + (1 - c) * t.water[pol] + noiseK;
}
/** Invert the linear mixing of the two surfaces using the 19 GHz horizontal channel. */
export function concentrationFromTb(tbH: number): number {
  const c = (tbH - TB_TIE.water.h) / (TB_TIE.ice.h - TB_TIE.water.h);
  return Math.max(0, Math.min(1, c));
}

export interface IceField {
  n: number;
  /** Concentration, percent, per pixel; -1 for land / ice sheet (masked). */
  conc: Float32Array;
  /** Brightness temperature (19 GHz, H) per pixel, K (0 where masked). */
  tbH: Float32Array;
  tbV: Float32Array;
}

function valueNoise(seed: number, size = 64) {
  const r = mulberry32(seed);
  const g = Float32Array.from({ length: size * size }, () => r());
  const at = (x: number, y: number) => g[((y % size) + size) % size * size + (((x % size) + size) % size)];
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * An illustrative sea-ice concentration map on a 25 km polar grid (n x n pixels centred on the pole).
 * Not a real day: a smooth continent, a wavy ice edge, a soft marginal ice zone, and a few polynyas.
 */
export function generateIceField(seed = 4143, n = 320): IceField {
  const noiseA = valueNoise(seed, 64), noiseB = valueNoise(seed + 1, 64), noiseC = valueNoise(seed + 2, 64);
  const r = mulberry32(seed + 9);
  const polys = Array.from({ length: 7 }, () => ({ a: r() * Math.PI * 2, d: 0.35 + r() * 0.5, rad: 40 + r() * 70 }));
  const conc = new Float32Array(n * n), tbH = new Float32Array(n * n), tbV = new Float32Array(n * n);
  const noiseTb = mulberry32(seed + 77);
  const mid = (n - 1) / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - mid) * PIXEL_KM, dy = (y - mid) * PIXEL_KM;
      const rr = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      // continent: smooth blob plus a peninsula
      const dth = ((th + 2.1 + Math.PI) % (2 * Math.PI)) - Math.PI;
      const pen = 520 * Math.exp(-((dth / 0.11) ** 2));
      const dr = ((th - 1.0 + Math.PI) % (2 * Math.PI)) - Math.PI, dw = ((th + 0.15 + Math.PI) % (2 * Math.PI)) - Math.PI;
      const bays = 380 * Math.exp(-((dr / 0.34) ** 2)) + 330 * Math.exp(-((dw / 0.3) ** 2)); // two embayments
      const rc = 2050 + 150 * Math.sin(2 * th + 0.8) + 110 * Math.sin(3 * th + 2.1) + pen - bays;
      const idx = y * n + x;
      if (rr < rc) { conc[idx] = -1; continue; }
      // ice edge radius with large-scale waviness
      const re = 3180 + 330 * Math.sin(2 * th + 0.3) + 230 * Math.sin(3 * th + 1.1) + 160 * Math.sin(5 * th + 0.4);
      const w = 120 + 90 * noiseA(x * 0.05, y * 0.05); // marginal ice zone half-width, km
      const edge = Math.min(1, Math.max(0, (re + w - rr) / (2 * w)));
      let c = 100 * edge * edge * (3 - 2 * edge);
      // interior concentration is high but never exactly 100, and patchy
      c *= (0.84 + 0.15 * noiseB(x * 0.08, y * 0.08)) - 0.05 * noiseC(x * 0.3, y * 0.3);
      for (const p of polys) {
        const px = Math.cos(p.a) * (rc + (re - rc) * p.d), py = Math.sin(p.a) * (rc + (re - rc) * p.d);
        const dd = Math.hypot(dx - px, dy - py);
        if (dd < p.rad) c *= 0.35 + 0.65 * (dd / p.rad) ** 2;
      }
      // small-scale open-water leads and slush
      c = Math.max(0, Math.min(100, c + (noiseC(x * 0.55, y * 0.55) - 0.5) * 7 * (c > 5 && c < 98 ? 1.6 : 0.5)));
      conc[idx] = c;
      const f = c / 100;
      tbH[idx] = tbFromConcentration(f, 'h', 2.2 * gaussian(noiseTb));
      tbV[idx] = tbFromConcentration(f, 'v', 1.6 * gaussian(noiseTb));
    }
  }
  return { n, conc, tbH, tbV };
}

/** Smooth 0..1 noise sampled on an n x n grid (for cloud masks). */
export function valueNoiseField(seed: number, n: number, scale = 0.035): Float32Array {
  const f = valueNoise(seed, 64);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = 0.65 * f(x * scale, y * scale) + 0.35 * f(x * scale * 3.1 + 17, y * scale * 3.1 + 5);
  return out;
}

/** Ice extent: the area of all ocean pixels at or above the concentration threshold (percent). */
export function iceExtentKm2(field: IceField, thresholdPct: number): number {
  let count = 0;
  const c = field.conc;
  for (let i = 0; i < c.length; i++) if (c[i] >= thresholdPct) count++;
  return count * PIXEL_AREA_KM2;
}
export function iceCount(field: IceField, thresholdPct: number): number {
  return iceExtentKm2(field, thresholdPct) / PIXEL_AREA_KM2;
}
/** Ice area: sum of concentration x pixel area (a different, smaller number than extent). */
export function iceAreaKm2(field: IceField): number {
  let s = 0;
  const c = field.conc;
  for (let i = 0; i < c.length; i++) if (c[i] > 0) s += (c[i] / 100) * PIXEL_AREA_KM2;
  return s;
}
/** Extent for a set of thresholds in one pass (for the sensitivity curve). */
export function extentCurve(field: IceField, thresholds: number[]): number[] {
  const out = thresholds.map(() => 0);
  const c = field.conc;
  for (let i = 0; i < c.length; i++) {
    if (c[i] < 0) continue;
    for (let k = 0; k < thresholds.length; k++) if (c[i] >= thresholds[k]) out[k]++;
  }
  return out.map((cnt) => cnt * PIXEL_AREA_KM2);
}
