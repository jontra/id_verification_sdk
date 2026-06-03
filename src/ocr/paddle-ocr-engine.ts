/**
 * PaddleOCR (PP-OCR) engine — the primary OCR for the `id`/licence path.
 *
 * PP-OCR pairs a learned text *detector* (DBNet) with a recognizer, so it
 * localizes the document number on cluttered/guilloché/rotated cards where
 * Tesseract's classical segmentation fails (see DESIGN.md §9 Findings). It runs
 * in-browser via ONNX Runtime Web (`@gutenye/ocr-browser`), with PP-OCR models
 * self-hosted (privacy).
 *
 * This wrapper is platform-agnostic: it depends only on a minimal `detect`
 * surface, injected as a factory. The browser app supplies an instance backed
 * by `@gutenye/ocr-browser`; Node tests can supply `@gutenye/ocr-node`.
 */
import type { OcrRunner, OcrResult } from '../extractors/extractor.js';
import type { NormalizedImage } from '../image/image-input.js';

/** One detected text line from PP-OCR. */
export interface DetectedLine {
  text: string;
  /** Mean recognition confidence in [0, 1], if the backend provides it. */
  mean?: number;
}

/**
 * Minimal PP-OCR detector surface (satisfied by `@gutenye/ocr-browser`).
 * `detect` takes an image source string — a data URL in the browser (built from
 * our decoded pixels), or a file path in Node tests.
 */
export interface PaddleDetector {
  detect(source: string): Promise<DetectedLine[]>;
}

export type PaddleDetectorFactory = () => Promise<PaddleDetector>;

export class PaddleOcrEngine implements OcrRunner {
  private detector: PaddleDetector | null = null;
  private initPromise: Promise<PaddleDetector> | null = null;

  constructor(private readonly createDetector: PaddleDetectorFactory) {}

  async warmup(): Promise<void> {
    await this.ensureDetector();
  }

  private ensureDetector(): Promise<PaddleDetector> {
    if (this.detector) return Promise.resolve(this.detector);
    if (!this.initPromise) {
      this.initPromise = this.createDetector().then((d) => {
        this.detector = d;
        return d;
      });
    }
    return this.initPromise;
  }

  async recognize(image: NormalizedImage): Promise<OcrResult> {
    const detector = await this.ensureDetector();
    const lines = await detector.detect(toDataUrl(image));

    const text = lines.map((l) => l.text).join('\n');
    const scored = lines.filter((l) => typeof l.mean === 'number');
    const confidence =
      scored.length > 0
        ? scored.reduce((s, l) => s + (l.mean as number), 0) / scored.length
        : lines.length > 0
          ? 0.9 // backend gave no score but did detect text
          : 0;

    return {
      text,
      confidence,
      words: lines.map((l) => ({ text: l.text, confidence: l.mean ?? 0.9 })),
    };
  }

  // PP-OCR backends hold no terminable workers in the way Tesseract does;
  // releasing the reference is enough for GC.
  async dispose(): Promise<void> {
    this.detector = null;
    this.initPromise = null;
  }
}

/** Render decoded pixels to a PNG data URL the detector can load. */
function toDataUrl(image: NormalizedImage): string {
  if (typeof document === 'undefined') {
    throw new Error('PaddleOcrEngine.recognize requires a browser DOM (document).');
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for OCR input.');
  ctx.putImageData(image.pixels, 0, 0);
  return canvas.toDataURL('image/png');
}
