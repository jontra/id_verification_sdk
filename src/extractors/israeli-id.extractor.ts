/**
 * Israeli ID extractor (documentType 'id') — covers both the ID card and the
 * driver's license, since both carry the same 9-digit Israeli ID. DESIGN.md §5.
 *
 * OCR (heb+eng) → find digit runs → keep the one that passes the check digit.
 * Pure helpers (candidate extraction, keyword detection) are exported for tests.
 */
import type { AuthenticitySignal, Reason } from '../types.js';
import type { NormalizedImage } from '../image/image-input.js';
import type {
  Extractor,
  ExtractContext,
  ExtractionOutput,
} from './extractor.js';
import { isValidIsraeliId, normalizeIsraeliId } from '../validation/israeli-id.js';
import { preprocessForOcr } from '../ocr/preprocess.js';
import { reason } from '../utils/errors.js';

/** Hebrew/English markers found on Israeli IDs and driver's licenses. */
const ID_KEYWORDS =
  /תעודת\s*זהות|רישיון\s*נהיגה|מדינת\s*ישראל|ISRAEL|IDENTITY\s*CARD|DRIVER/iu;

export function detectIdKeywords(text: string): boolean {
  return ID_KEYWORDS.test(text);
}

/** Extract candidate ID number strings (contiguous 5–10 digit runs). */
export function extractIdCandidates(text: string): string[] {
  const matches = text.match(/\d{5,10}/g) ?? [];
  return [...new Set(matches)];
}

/**
 * Pick the candidate that passes the Israeli check digit. If none pass, return
 * the longest candidate (normalized) so the flow can still report a mismatch.
 */
export function pickIsraeliId(
  candidates: string[],
): { number: string | null; valid: boolean } {
  for (const c of candidates) {
    if (isValidIsraeliId(c)) return { number: normalizeIsraeliId(c), valid: true };
  }
  const longest = candidates
    .slice()
    .sort((a, b) => b.length - a.length)[0];
  return { number: longest ? normalizeIsraeliId(longest) : null, valid: false };
}

export class IsraeliIdExtractor implements Extractor {
  readonly documentType = 'id' as const;

  async extract(
    image: NormalizedImage,
    ctx: ExtractContext,
  ): Promise<ExtractionOutput> {
    const prepared = safePreprocess(image);
    const ocr = await ctx.ocr.recognize(prepared, { languages: ['heb', 'eng'] });

    const candidates = extractIdCandidates(ocr.text);
    const { number, valid } = pickIsraeliId(candidates);
    const keywords = detectIdKeywords(ocr.text);
    const ocrOk = ocr.confidence >= ctx.minOcrConfidence;

    const signals: AuthenticitySignal[] = [
      { kind: 'check_digit_valid', passed: valid, weight: 0.5 },
      { kind: 'keywords_found', passed: keywords, weight: 0.3 },
      {
        kind: 'ocr_quality',
        passed: ocrOk,
        weight: 0.2,
        detail: `mean OCR confidence ${ocr.confidence.toFixed(2)}`,
      },
    ];

    const reasons: Reason[] = [];
    if (number === null) reasons.push(reason('NO_NUMBER_FOUND'));
    else if (!valid) reasons.push(reason('CHECK_DIGIT_INVALID'));
    if (!ocrOk) reasons.push(reason('LOW_OCR_CONFIDENCE'));

    const confidence =
      number === null ? 0 : valid ? Math.min(0.95, 0.6 + ocr.confidence * 0.35) : 0.25;

    return { number, confidence, signals, reasons };
  }
}

/** Binarize for OCR when ImageData is available; otherwise pass through. */
function safePreprocess(image: NormalizedImage): NormalizedImage {
  if (typeof ImageData === 'undefined') return image;
  try {
    return preprocessForOcr(image);
  } catch {
    return image;
  }
}
