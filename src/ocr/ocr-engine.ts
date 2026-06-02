/**
 * Tesseract.js OCR engine (DESIGN.md §9, §10).
 *
 * - Lazy single-worker init; reused across calls. `warmup()` pre-loads.
 * - Loads heb+eng once; `recognize({ languages })` switches the active language
 *   via `reinitialize` (no re-download).
 * - Assets are loaded from `modelBaseUrl` when provided, so they can be
 *   self-hosted same-origin (privacy: no third-party CDN at runtime).
 */
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrRunner, OcrResult } from '../extractors/extractor.js';
import type { NormalizedImage } from '../image/image-input.js';

export interface OcrEngineConfig {
  languages: string[];
  modelBaseUrl?: string;
}

export class OcrEngine implements OcrRunner {
  private worker: Worker | null = null;
  private initPromise: Promise<Worker> | null = null;
  private activeLang = '';
  private readonly languages: string[];
  private readonly modelBaseUrl?: string;

  constructor(config: OcrEngineConfig) {
    this.languages = config.languages.length > 0 ? config.languages : ['eng'];
    this.modelBaseUrl = config.modelBaseUrl;
  }

  /** Pre-load the worker and language data. */
  async warmup(): Promise<void> {
    await this.ensureWorker();
  }

  private ensureWorker(): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);
    if (this.initPromise) return this.initPromise;

    const options = this.modelBaseUrl
      ? {
          workerPath: `${this.modelBaseUrl}/worker.min.js`,
          corePath: `${this.modelBaseUrl}/tesseract-core.wasm.js`,
          langPath: this.modelBaseUrl,
        }
      : undefined;

    this.initPromise = createWorker(this.languages, undefined, options).then((w) => {
      this.worker = w;
      this.activeLang = this.languages.join('+');
      return w;
    });
    return this.initPromise;
  }

  async recognize(
    image: NormalizedImage,
    opts?: { languages?: string[] },
  ): Promise<OcrResult> {
    const worker = await this.ensureWorker();

    const requested = (opts?.languages ?? this.languages).join('+');
    if (requested !== this.activeLang) {
      await worker.reinitialize(requested);
      this.activeLang = requested;
    }

    const imageLike = toRecognizable(image) as Parameters<Worker['recognize']>[0];
    const { data } = await worker.recognize(imageLike);

    return {
      text: data.text,
      confidence: clampConfidence(data.confidence),
      words: (data.words ?? []).map((w) => ({
        text: w.text,
        confidence: clampConfidence(w.confidence),
      })),
    };
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.initPromise = null;
    if (worker) await worker.terminate();
  }
}

/** Tesseract reports confidence as 0–100; normalize to [0, 1]. */
function clampConfidence(value: number): number {
  const n = value / 100;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Tesseract.js accepts a canvas/Blob/data-URL but NOT raw ImageData. Preprocessed
 * images carry only `pixels`, so draw them onto a canvas before recognition.
 */
function toRecognizable(image: NormalizedImage): OffscreenCanvas | HTMLCanvasElement {
  if (image.canvas) return image.canvas;
  const { width, height, pixels } = image;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable for OCR input.');
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for OCR input.');
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  }
  throw new Error('No canvas available to prepare the OCR input.');
}
