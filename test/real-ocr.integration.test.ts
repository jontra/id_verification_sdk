// @vitest-environment node
/**
 * Real-OCR integration test (fills the gap left by the stubbed-OCR unit tests).
 *
 * Runs actual Tesseract.js on a specimen Israeli driving licence image and feeds
 * the output through the real IsraeliIdExtractor. This exercises the genuine
 * OCR → extraction path that stubs cannot.
 *
 * Notes:
 *  - Runs in the Node environment (Tesseract accepts a Buffer directly), so the
 *    canvas/decode plumbing is not covered here — that is verified via the demo
 *    in a real browser.
 *  - First run downloads eng+heb traineddata (needs network); hence the long
 *    timeout. The specimen's printed numbers are deliberately NOT valid Israeli
 *    IDs, so the extractor correctly reports check_digit_valid = false.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker, type Worker } from 'tesseract.js';
import { readFileSync } from 'node:fs';
import { IsraeliIdExtractor } from '../src/extractors/israeli-id.extractor.js';
import type {
  ExtractContext,
  ExtractionOutput,
  OcrResult,
} from '../src/extractors/extractor.js';
import type { NormalizedImage } from '../src/image/image-input.js';

const IMAGE_URL = new URL('./driving_licence.jpg', import.meta.url);
const OCR_TIMEOUT_MS = 120_000;

let worker: Worker;
let ocr: OcrResult;
let output: ExtractionOutput;

beforeAll(async () => {
  worker = await createWorker(['eng', 'heb']);
  const buf = readFileSync(IMAGE_URL);
  const { data } = await worker.recognize(buf);
  ocr = {
    text: data.text,
    confidence: data.confidence / 100,
    words: (data.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence / 100 })),
  };

  // Feed the real OCR result through the actual extractor.
  const stubRunner = { recognize: async (): Promise<OcrResult> => ocr };
  const image: NormalizedImage = { pixels: {} as ImageData, width: 856, height: 540 };
  const ctx: ExtractContext = { minOcrConfidence: 0.5, ocr: stubRunner };
  output = await new IsraeliIdExtractor().extract(image, ctx);
}, OCR_TIMEOUT_MS);

afterAll(async () => {
  await worker?.terminate();
});

describe('real OCR — specimen Israeli driving licence', () => {
  it('OCRs Israeli document text', () => {
    expect(ocr.text).toMatch(/ISRAEL/i);
  });

  it('extracts the printed 9-digit ID number as a candidate', () => {
    expect(output.candidates).toContain('123456789');
  });

  it('detects ID/licence keywords', () => {
    const kw = output.signals.find((s) => s.kind === 'keywords_found');
    expect(kw?.passed).toBe(true);
  });

  it('flags the specimen number as failing the check digit', () => {
    const cd = output.signals.find((s) => s.kind === 'check_digit_valid');
    expect(cd?.passed).toBe(false);
    expect(output.reasons.some((r) => r.code === 'CHECK_DIGIT_INVALID')).toBe(true);
  });
});
