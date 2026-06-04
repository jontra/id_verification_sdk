// @vitest-environment node
/**
 * Real-OCR integration test (fills the gap left by the stubbed-OCR unit tests).
 *
 * Runs actual PaddleOCR (PP-OCR via `@gutenye/ocr-node`) on a specimen Israeli
 * driving licence and feeds the output through the real IsraeliIdExtractor —
 * exercising the genuine OCR → extraction path with the engine we ship for the
 * `id` path. (Browser uses the same PP-OCR models via `@gutenye/ocr-browser`;
 * the canvas/decode plumbing is verified via the demo in a real browser.)
 *
 * The specimen's printed numbers are deliberately NOT valid Israeli IDs, so the
 * extractor correctly reports check_digit_valid = false.
 *
 * Note: only the specimen image is committed; real ID/passport photos are
 * git-ignored for privacy, so this test runs against the specimen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Ocr from '@gutenye/ocr-node';
import { IsraeliIdExtractor } from '../src/extractors/israeli-id.extractor.js';
import type {
  ExtractContext,
  ExtractionOutput,
  OcrResult,
} from '../src/extractors/extractor.js';
import type { NormalizedImage } from '../src/image/image-input.js';

const IMAGE_PATH = new URL('./driving_licence.jpg', import.meta.url).pathname;
const OCR_TIMEOUT_MS = 120_000;

let ocr: OcrResult;
let output: ExtractionOutput;

beforeAll(async () => {
  const engine = await Ocr.create();
  const lines = (await engine.detect(IMAGE_PATH)) as Array<{ text: string; mean?: number }>;
  ocr = {
    text: lines.map((l) => l.text).join('\n'),
    confidence: 0.9,
    words: lines.map((l) => ({ text: l.text, confidence: l.mean ?? 0.9 })),
  };

  // Feed the real PaddleOCR result through the actual extractor.
  const stubRunner = { recognize: async (): Promise<OcrResult> => ocr };
  const image: NormalizedImage = { pixels: {} as ImageData, width: 856, height: 540 };
  const ctx: ExtractContext = { minOcrConfidence: 0.5, ocr: stubRunner };
  output = await new IsraeliIdExtractor().extract(image, ctx);
}, OCR_TIMEOUT_MS);

describe('real OCR (PaddleOCR) — specimen Israeli driving licence', () => {
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
