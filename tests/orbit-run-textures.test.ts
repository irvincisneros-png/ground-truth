import { describe, expect, it } from 'vitest';
import { TILE, TILE_MARGIN, EDGE_W, fbm } from '../src/orbit-run/textures';

describe('orbit run textures', () => {
  it('noise wraps horizontally, so ground tiles have no seam', () => {
    for (const px of [4, 6, 18, 85, 128]) for (const y of [0.3, 7.9, 41.2]) for (const x of [0, 0.37, 2.5, px - 0.01]) {
      expect(fbm(x + px, y, px, 4, 11)).toBeCloseTo(fbm(x, y, px, 4, 11), 9);
      expect(fbm(x - px, y, px, 3, 61)).toBeCloseTo(fbm(x, y, px, 3, 61), 9);
    }
  });
  it('noise stays in 0..1 and is deterministic', () => {
    for (let i = 0; i < 400; i++) {
      const n = fbm(i * 0.37, i * 0.11, 16, 5, 91);
      expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1);
      expect(fbm(i * 0.37, i * 0.11, 16, 5, 91)).toBe(n);
    }
  });
  it('the tile margin covers the widest strip and a whole coast patch', () => {
    expect(TILE_MARGIN).toBeGreaterThanOrEqual(96);
    expect(TILE_MARGIN).toBeGreaterThanOrEqual(EDGE_W);
    expect(TILE).toBeGreaterThan(TILE_MARGIN * 4);
  });
});
