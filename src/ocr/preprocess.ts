/**
 * Lightweight OCR preprocessing (DESIGN.md §11): grayscale + Otsu binarization.
 * Pure pixel math (no DOM) so it is unit-testable on a raw ImageData.
 */
import type { NormalizedImage } from '../image/image-input.js';

/** Convert RGBA pixels to a grayscale intensity array (0–255), luma weights. */
export function toGrayscale(pixels: ImageData): Uint8ClampedArray {
  const { data } = pixels;
  const out = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0;
  }
  return out;
}

/** Otsu's method: pick the global threshold that maximizes inter-class variance. */
export function otsuThreshold(gray: Uint8ClampedArray): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    histogram[v] = histogram[v]! + 1;
  }

  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t]!;

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t]!;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t]!;
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const between =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (between > maxVariance) {
      maxVariance = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Return a binarized (black/white) copy of the image as a new NormalizedImage.
 * Does not mutate the input.
 */
export function preprocessForOcr(image: NormalizedImage): NormalizedImage {
  const gray = toGrayscale(image.pixels);
  const threshold = otsuThreshold(gray);

  const src = image.pixels.data;
  const out = new Uint8ClampedArray(src.length);
  for (let p = 0; p < gray.length; p++) {
    const v = gray[p]! > threshold ? 255 : 0;
    const i = p * 4;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }

  const pixels = new ImageData(out, image.width, image.height);
  return { pixels, width: image.width, height: image.height };
}
