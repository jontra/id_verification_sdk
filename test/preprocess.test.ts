import { describe, it, expect } from 'vitest';
import {
  toGrayscale,
  otsuThreshold,
  preprocessForOcr,
} from '../src/ocr/preprocess.js';
import type { NormalizedImage } from '../src/image/image-input.js';

/** Build an ImageData-like object (jsdom lacks the real ImageData). */
function fakeImageData(rgba: number[], width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(rgba),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

describe('toGrayscale', () => {
  it('maps white→255 and black→0 via luma weights', () => {
    const img = fakeImageData([255, 255, 255, 255, 0, 0, 0, 255], 2, 1);
    const gray = toGrayscale(img);
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });
});

describe('otsuThreshold', () => {
  it('separates a bimodal distribution between the two clusters', () => {
    const gray = new Uint8ClampedArray([10, 12, 8, 240, 245, 250]);
    const t = otsuThreshold(gray);
    // Threshold must separate the two clusters: low ones ≤ t, high ones > t.
    expect(t).toBeGreaterThanOrEqual(12);
    expect(t).toBeLessThan(240);
  });
});

describe('preprocessForOcr', () => {
  it.skipIf(typeof ImageData === 'undefined')(
    'binarizes to pure black/white',
    () => {
      const src: NormalizedImage = {
        pixels: fakeImageData([200, 200, 200, 255, 20, 20, 20, 255], 2, 1),
        width: 2,
        height: 1,
      };
      const out = preprocessForOcr(src);
      const d = out.pixels.data;
      // every channel is either 0 or 255
      for (let i = 0; i < d.length; i += 4) {
        expect([0, 255]).toContain(d[i]);
      }
    },
  );
});
