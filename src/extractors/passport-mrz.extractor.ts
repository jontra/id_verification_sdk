/**
 * Passport extractor (documentType 'passport') — DESIGN.md §5.
 * OCR the page, locate MRZ lines, parse, and extract the passport number.
 */
import type { AuthenticitySignal, Reason } from '../types.js';
import type { NormalizedImage } from '../image/image-input.js';
import type {
  Extractor,
  ExtractContext,
  ExtractionOutput,
} from './extractor.js';
import { findMrzLines, candidateMrzGroups } from '../mrz/mrz-locate.js';
import { parseMrz, type MrzParseResult } from '../mrz/mrz-parse.js';
import { reason } from '../utils/errors.js';

export class PassportMrzExtractor implements Extractor {
  readonly documentType = 'passport' as const;

  async extract(
    image: NormalizedImage,
    ctx: ExtractContext,
  ): Promise<ExtractionOutput> {
    const ocr = await ctx.ocr.recognize(image, { languages: ['eng'] });

    const candidates = findMrzLines(ocr.text);
    const groups = candidateMrzGroups(candidates);

    if (groups.length === 0) {
      return fail([reason('MRZ_NOT_FOUND')]);
    }

    // Try each grouping; prefer one whose check digits validate.
    let best: MrzParseResult | null = null;
    for (const group of groups) {
      const parsed = parseMrz(group);
      if (parsed.checkDigitsValid && parsed.documentNumber) {
        best = parsed;
        break;
      }
      if (!best && parsed.documentNumber) best = parsed;
    }

    if (!best || !best.documentNumber) {
      return fail([reason('MRZ_NOT_FOUND')]);
    }

    const signals: AuthenticitySignal[] = [
      { kind: 'mrz_present', passed: true, weight: 0.4, detail: best.format ?? undefined },
      {
        kind: 'mrz_checksums_valid',
        passed: best.checkDigitsValid,
        weight: 0.6,
      },
    ];

    const reasons: Reason[] = best.checkDigitsValid
      ? []
      : [reason('MRZ_CHECKSUM_FAILED')];

    return {
      number: best.documentNumber,
      confidence: best.checkDigitsValid ? 0.95 : 0.3,
      signals,
      reasons,
    };
  }
}

function fail(reasons: Reason[]): ExtractionOutput {
  return {
    number: null,
    confidence: 0,
    signals: [{ kind: 'mrz_present', passed: false, weight: 0.4 }],
    reasons,
  };
}
