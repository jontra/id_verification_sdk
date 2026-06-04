/**
 * Passport extractor (documentType 'passport') — DESIGN.md §5, §9.
 *
 * Strategy: OCR the page, find MRZ-shaped tokens, and parse TD3 **line 2**
 * tolerantly (`parseTd3Line2`) — line 2 holds the passport number + its check
 * digit (and the national ID in the personal-number field), and OCR reads it
 * reliably even when the name line is garbled. We pick the candidate whose
 * passport-number check digit validates.
 */
import type { AuthenticitySignal, Reason } from '../types.js';
import type { NormalizedImage } from '../image/image-input.js';
import type {
  Extractor,
  ExtractContext,
  ExtractionOutput,
} from './extractor.js';
import { findMrzCandidates } from '../mrz/mrz-locate.js';
import { parseTd3Line2, type Td3Line2Fields } from '../mrz/mrz-parse.js';
import { reason } from '../utils/errors.js';

export class PassportMrzExtractor implements Extractor {
  readonly documentType = 'passport' as const;

  async extract(
    image: NormalizedImage,
    ctx: ExtractContext,
  ): Promise<ExtractionOutput> {
    const ocr = await ctx.ocr.recognize(image);
    const candidates = findMrzCandidates(ocr.text);

    if (candidates.length === 0) {
      return fail([reason('MRZ_NOT_FOUND')]);
    }

    const parsed = candidates.map((line) => ({ line, fields: parseTd3Line2(line) }));
    // Prefer a candidate whose passport-number check digit validates.
    const valid = parsed.find((p) => p.fields.documentNumberValid);
    const chosen =
      valid ??
      // else the longest candidate, so we can report a mismatch rather than nothing.
      parsed.slice().sort((a, b) => b.line.length - a.line.length)[0]!;

    const fields: Td3Line2Fields = chosen.fields;
    if (!fields.documentNumber) {
      return fail([reason('MRZ_NOT_FOUND')]);
    }

    // MRZ line 2 carries both the passport number and (for Israeli passports)
    // the national ID in the personal-number field. Return both as candidates
    // so the flow matches whichever the user claimed.
    const candidateNumbers = [...new Set([fields.documentNumber, fields.personalNumber])].filter(
      (n) => n.length > 0,
    );
    const checksumsValid = fields.documentNumberValid || fields.personalNumberValid;

    const signals: AuthenticitySignal[] = [
      { kind: 'mrz_present', passed: true, weight: 0.4 },
      { kind: 'mrz_checksums_valid', passed: checksumsValid, weight: 0.6 },
    ];
    const reasons: Reason[] = checksumsValid ? [] : [reason('MRZ_CHECKSUM_FAILED')];

    return {
      candidates: candidateNumbers,
      confidence: checksumsValid ? 0.95 : 0.3,
      signals,
      reasons,
    };
  }
}

function fail(reasons: Reason[]): ExtractionOutput {
  return {
    candidates: [],
    confidence: 0,
    signals: [{ kind: 'mrz_present', passed: false, weight: 0.4 }],
    reasons,
  };
}
