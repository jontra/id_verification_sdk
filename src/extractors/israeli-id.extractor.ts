/**
 * Israeli ID extractor (documentType 'id') — covers both the ID card and the
 * driver's license, since both carry the same 9-digit Israeli ID. DESIGN.md §5.
 *
 * Responsibility: pull candidate number strings out of the image. It does NOT
 * choose which one is "the" ID or compare to the claim — that is the flow's job.
 * Validity (check digit) is reported only as a claim-independent authenticity
 * signal. Pure helpers are exported for tests.
 */
import type { AuthenticitySignal, Reason } from '../types.js';
import type { NormalizedImage } from '../image/image-input.js';
import type {
  Extractor,
  ExtractContext,
  ExtractionOutput,
} from './extractor.js';
import { isValidIsraeliId } from '../validation/israeli-id.js';
import { reason } from '../utils/errors.js';

/** Hebrew/English markers found on Israeli IDs and driver's licenses. */
const ID_KEYWORDS =
  /תעודת\s*זהות|רישיון\s*נהיגה|מדינת\s*ישראל|ISRAEL|IDENTITY\s*CARD|DRIVER/iu;

export function detectIdKeywords(text: string): boolean {
  return ID_KEYWORDS.test(text);
}

/**
 * Extract candidate ID number strings. Returns two interpretations, unioned:
 *  - contiguous digit runs (`\d{5,10}`) — licence numbers, already-joined IDs.
 *  - space-grouped runs collapsed to digits, kept only when exactly 9 digits
 *    (the Israeli ID length): `0 3452197 1` → `034521971`.
 *
 * The exact-9 filter is what prevents over-merging — two unrelated numbers
 * separated by a single space (e.g. `01011990 123456782`) strip to ≠ 9 digits
 * and are discarded. Emitting both interpretations is safe: the flow's
 * claim-aware selection picks the one matching the claim; noise is ignored.
 */
export function extractIdCandidates(text: string): string[] {
  const contiguous = text.match(/\d{5,10}/g) ?? [];
  const grouped = (text.match(/\d[\d ]*\d/g) ?? [])
    .map((s) => s.replace(/ /g, ''))
    .filter((s) => s.length === 9);
  return [...new Set([...contiguous, ...grouped])];
}

export class IsraeliIdExtractor implements Extractor {
  readonly documentType = 'id' as const;

  async extract(
    image: NormalizedImage,
    ctx: ExtractContext,
  ): Promise<ExtractionOutput> {
    // Feed Tesseract the decoded image directly — it performs its own adaptive
    // binarization, which beats a global threshold on uneven real-world photos.
    const ocr = await ctx.ocr.recognize(image, { languages: ['heb', 'eng'] });

    const candidates = extractIdCandidates(ocr.text);
    const anyValid = candidates.some(isValidIsraeliId);
    const keywords = detectIdKeywords(ocr.text);
    const ocrOk = ocr.confidence >= ctx.minOcrConfidence;

    const signals: AuthenticitySignal[] = [
      { kind: 'check_digit_valid', passed: anyValid, weight: 0.5 },
      { kind: 'keywords_found', passed: keywords, weight: 0.3 },
      {
        kind: 'ocr_quality',
        passed: ocrOk,
        weight: 0.2,
        detail: `mean OCR confidence ${ocr.confidence.toFixed(2)}`,
      },
    ];

    const reasons: Reason[] = [];
    if (candidates.length === 0) reasons.push(reason('NO_NUMBER_FOUND'));
    else if (!anyValid) reasons.push(reason('CHECK_DIGIT_INVALID'));
    if (!ocrOk) reasons.push(reason('LOW_OCR_CONFIDENCE'));

    const confidence =
      candidates.length === 0
        ? 0
        : anyValid
          ? Math.min(0.95, 0.6 + ocr.confidence * 0.35)
          : 0.25;

    return { candidates, confidence, signals, reasons };
  }
}
