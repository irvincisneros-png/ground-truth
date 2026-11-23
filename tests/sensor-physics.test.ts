import { describe, expect, it } from 'vitest';
import {
  BANDS, C_LIGHT, JASON_ALTITUDE_M, PIXEL_AREA_KM2, STANDARD_THRESHOLD, SURFACES, TB_TIE, brightnessTemperature, concentrationFromTb,
  cToK, delayFromHeight, extentCurve, gaussian, generateIceField, heightFromRange, iceAreaKm2, iceExtentKm2, kToC, mulberry32, ndvi, nbr,
  planckRadiance, rangeFromDelay, simulateMeasurements, simulateThermalPixel, splitWindowSst, standardError, stats, surfaceById, surfaceNbr,
  surfaceNdvi, tbFromConcentration, thermalQualityFlag, treeCover,
} from '../src/parts/sensor-lab/physics';

describe('thermal infrared', () => {
  it('Planck radiance for a 300 K surface at 10.8 um is about 9.5 W m-2 sr-1 um-1', () => {
    const L = planckRadiance(10.8, 300);
    expect(L).toBeGreaterThan(9.0);
    expect(L).toBeLessThan(10.2);
  });
  it('inverting Planck returns the temperature', () => {
    for (const t of [250, 288.15, 302.3]) expect(brightnessTemperature(10.8, planckRadiance(10.8, t))).toBeCloseTo(t, 6);
  });
  it('cold cloud tops would read far below sea temperature', () => {
    expect(kToC(brightnessTemperature(10.8, planckRadiance(10.8, 255)))).toBeCloseTo(-18.15, 1);
  });
  it('split-window correction recovers skin temperature (within 0.2 K) from humid-air BTs', () => {
    for (const wv of [1, 2, 3]) {
      const p = simulateThermalPixel(cToK(29.1), wv);
      expect(p.bt11).toBeLessThan(p.skinK);
      expect(Math.abs(p.sstK - p.skinK)).toBeLessThan(0.2);
    }
    expect(splitWindowSst(300, 298.6)).toBeCloseTo(301.96, 2);
  });
  it('quality flags: clear = 0, edge = 1, cloud = 3', () => {
    expect([0, 0.1, 0.3, 0.59, 0.6, 1].map(thermalQualityFlag)).toEqual([0, 0, 1, 1, 3, 3]);
  });
});

describe('radar altimeter', () => {
  it('range = c t / 2 and height = altitude - range', () => {
    const t = (2 * 1_335_999.6) / C_LIGHT;
    expect(rangeFromDelay(t)).toBeCloseTo(1_335_999.6, 4);
    expect(heightFromRange(JASON_ALTITUDE_M, rangeFromDelay(t))).toBeCloseTo(0.4, 4);
  });
  it('1 ns of delay is 15 cm of range; round trip is exact', () => {
    expect(rangeFromDelay(1e-9)).toBeCloseTo(0.1499, 3);
    expect(heightFromRange(JASON_ALTITUDE_M, rangeFromDelay(delayFromHeight(JASON_ALTITUDE_M, 0.37)))).toBeCloseTo(0.37, 6);
  });
  it('averaging: standard error shrinks as 1/sqrt(n); 100 readings of 3 cm scatter give ~3 mm', () => {
    expect(standardError(0.03, 100)).toBeCloseTo(0.003, 6);
    expect(standardError(0.03, 400)).toBeCloseTo(0.0015, 6);
    const xs = simulateMeasurements(0.4, 0.03, 400, 11);
    const s100 = stats(xs.slice(0, 100)), s400 = stats(xs);
    expect(s400.se).toBeLessThan(s100.se);
    expect(Math.abs(s400.mean - 0.4)).toBeLessThan(0.006);
    expect(s100.sd).toBeGreaterThan(0.024);
    expect(s100.sd).toBeLessThan(0.036);
  });
  it('seeded generator is reproducible and gaussian() is roughly standard', () => {
    const a = mulberry32(5), b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const r = mulberry32(9);
    const xs = Array.from({ length: 4000 }, () => gaussian(r));
    const s = stats(xs);
    expect(Math.abs(s.mean)).toBeLessThan(0.06);
    expect(s.sd).toBeGreaterThan(0.95);
    expect(s.sd).toBeLessThan(1.05);
  });
});

describe('optical multispectral', () => {
  it('has the Landsat visible-NIR-SWIR bands and one reflectance per band', () => {
    expect(BANDS.map((b) => b.id)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
    for (const s of SURFACES) expect(s.refl.length).toBe(BANDS.length);
  });
  it('NDVI = (NIR - Red) / (NIR + Red)', () => {
    expect(ndvi(0.5, 0.1)).toBeCloseTo(0.6667, 4);
    expect(ndvi(0.2, 0.2)).toBe(0);
    expect(nbr(0.4, 0.1)).toBeCloseTo(0.6, 6);
  });
  it('forest has high NDVI, burnt/bare/cloud low, water negative', () => {
    expect(surfaceNdvi(surfaceById('forest'))).toBeGreaterThan(0.75);
    expect(surfaceNdvi(surfaceById('burnt'))).toBeLessThan(0.25);
    expect(surfaceNdvi(surfaceById('bare'))).toBeLessThan(0.3);
    expect(Math.abs(surfaceNdvi(surfaceById('cloud')))).toBeLessThan(0.05);
    expect(surfaceNdvi(surfaceById('water'))).toBeLessThan(0);
  });
  it('burnt ground is separable from bare soil with the shortwave infrared (NBR)', () => {
    expect(surfaceNbr(surfaceById('burnt'))).toBeLessThan(-0.1);
    expect(surfaceNbr(surfaceById('forest'))).toBeGreaterThan(0.6);
  });
  it('tree cover counts forest only, drops clouds from the denominator, and is no-data at night', () => {
    const g = ['forest', 'forest', 'bare', 'cloud', 'burnt', 'forest'] as const;
    const tc = treeCover([...g], false);
    expect(tc.trees).toBe(3);
    expect(tc.valid).toBe(5);
    expect(tc.percent).toBeCloseTo(60, 6);
    expect(Number.isNaN(treeCover([...g], true).percent)).toBe(true);
  });
});

describe('passive microwave sea ice', () => {
  const field = generateIceField();
  it('brightness temperature mixes linearly and inverts back to concentration', () => {
    for (const c of [0, 0.25, 0.8, 1]) expect(concentrationFromTb(tbFromConcentration(c, 'h'))).toBeCloseTo(c, 6);
    expect(TB_TIE.ice.h).toBeGreaterThan(TB_TIE.water.h);
  });
  it('is deterministic and the illustrative extent is of Antarctic size (15-22 million km2)', () => {
    const again = generateIceField();
    expect(again.conc[12345]).toBe(field.conc[12345]);
    const ext = iceExtentKm2(field, STANDARD_THRESHOLD);
    expect(ext).toBeGreaterThan(15e6);
    expect(ext).toBeLessThan(22e6);
    expect(ext % PIXEL_AREA_KM2).toBe(0);
  });
  it('extent falls as the threshold rises, and extent exceeds area', () => {
    const th = [5, 15, 30, 50, 80];
    const ext = extentCurve(field, th);
    for (let i = 1; i < ext.length; i++) expect(ext[i]).toBeLessThanOrEqual(ext[i - 1]);
    expect(ext[1]).toBe(iceExtentKm2(field, 15));
    expect(iceAreaKm2(field)).toBeLessThan(ext[1]);
    // a changing rule would change the answer noticeably
    expect((ext[0] - ext[3]) / ext[1]).toBeGreaterThan(0.03);
  });
  it('land is masked and never counted', () => {
    expect(field.conc[Math.floor(field.n / 2) * field.n + Math.floor(field.n / 2)]).toBe(-1);
  });
});
