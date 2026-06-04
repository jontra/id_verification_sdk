/**
 * Image input normalization: Blob | File | ImageData -> NormalizedImage.
 *
 * DIY decode (DESIGN.md §11): the target is desktop Chrome + Safari, where
 * `createImageBitmap(blob, { imageOrientation: 'from-image' })` handles EXIF
 * orientation natively. Older Safari falls back to HTMLImageElement + objectURL.
 * Throws `ImageDecodeError` on failure → the verify flow maps it to
 * IMAGE_DECODE_FAILED (no silent fallback).
 */

export interface NormalizedImage {
  /** RGBA pixels — accepted by Tesseract, canvas, and ONNX preprocessing. */
  pixels: ImageData;
  width: number;
  height: number;
  /** Reusable canvas so downstream stages don't redraw. */
  canvas?: HTMLCanvasElement | OffscreenCanvas;
}

export class ImageDecodeError extends Error {
  override readonly name = 'ImageDecodeError';
}

/** Longest-side cap; OCR doesn't need full-resolution phone photos. */
export const MAX_DIMENSION = 2000;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

interface CanvasCtx {
  canvas: AnyCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

function makeCanvas(width: number, height: number): CanvasCtx {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageDecodeError('OffscreenCanvas 2D context unavailable.');
    return { canvas, ctx };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageDecodeError('Canvas 2D context unavailable.');
    return { canvas, ctx };
  }
  throw new ImageDecodeError('No canvas implementation available in this environment.');
}

function clampSize(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

function loadHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new ImageDecodeError('HTMLImageElement is unavailable in this environment.'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageDecodeError('Failed to decode image.'));
    };
    img.src = url;
  });
}

async function decodeBlob(blob: Blob): Promise<NormalizedImage> {
  let source: ImageBitmap | HTMLImageElement;
  let srcW: number;
  let srcH: number;

  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      source = bitmap;
      srcW = bitmap.width;
      srcH = bitmap.height;
    } catch {
      const img = await loadHtmlImage(blob);
      source = img;
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
    }
  } else {
    const img = await loadHtmlImage(blob);
    source = img;
    srcW = img.naturalWidth;
    srcH = img.naturalHeight;
  }

  if (srcW === 0 || srcH === 0) {
    throw new ImageDecodeError('Decoded image has zero dimensions.');
  }

  const { w, h } = clampSize(srcW, srcH, MAX_DIMENSION);
  const { canvas, ctx } = makeCanvas(w, h);
  // drawImage accepts both ImageBitmap and HTMLImageElement.
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  if ('close' in source) source.close();

  const pixels = ctx.getImageData(0, 0, w, h);
  return { pixels, width: w, height: h, canvas };
}

/**
 * Rotate a NormalizedImage clockwise by 90/180/270 degrees (for orientation
 * retry — OCR engines read horizontal text, not text rotated a full 90°).
 * Throws `ImageDecodeError` if no canvas is available (e.g. non-browser test
 * env), which the caller treats as "this orientation can't be tried".
 */
export function rotateNormalizedImage(
  image: NormalizedImage,
  degrees: 90 | 180 | 270,
): NormalizedImage {
  const swap = degrees === 90 || degrees === 270;
  const outW = swap ? image.height : image.width;
  const outH = swap ? image.width : image.height;

  // Source drawable: reuse the existing canvas, or build one from the pixels.
  let source: CanvasImageSource;
  if (image.canvas) {
    source = image.canvas;
  } else {
    const src = makeCanvas(image.width, image.height);
    src.ctx.putImageData(image.pixels, 0, 0);
    source = src.canvas;
  }

  const { canvas, ctx } = makeCanvas(outW, outH);
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -image.width / 2, -image.height / 2);

  const pixels = ctx.getImageData(0, 0, outW, outH);
  return { pixels, width: outW, height: outH, canvas };
}

/** Normalize any supported input into decoded RGBA pixels. */
export async function toNormalizedImage(
  input: Blob | File | ImageData,
): Promise<NormalizedImage> {
  if (typeof ImageData !== 'undefined' && input instanceof ImageData) {
    return { pixels: input, width: input.width, height: input.height };
  }
  if (input instanceof Blob) {
    return decodeBlob(input);
  }
  throw new ImageDecodeError('Unsupported image input type.');
}
