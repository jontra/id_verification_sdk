/**
 * Typed errors + reason builders.
 *
 * Convention (DESIGN.md §3):
 *  - Programmer errors (bad arguments) → throw `SdkInputError`.
 *  - Processing failures (bad image, no number) → NOT thrown; surfaced as a
 *    `Reason` and an `error` decision by the verify flow.
 */
import type { Reason, ReasonCode, ReasonSeverity } from '../types.js';

/** Thrown for invalid arguments (misuse of the API). */
export class SdkInputError extends Error {
  override readonly name = 'SdkInputError';
  constructor(message: string) {
    super(message);
  }
}

const DEFAULT_MESSAGES: Record<ReasonCode, string> = {
  MRZ_NOT_FOUND: 'No machine-readable zone (MRZ) was found in the image.',
  MRZ_CHECKSUM_FAILED: 'The MRZ was found but its check digits did not validate.',
  CHECK_DIGIT_INVALID: 'The extracted number failed the Israeli ID check digit.',
  NO_NUMBER_FOUND: 'No candidate document number could be extracted from the image.',
  LOW_OCR_CONFIDENCE: 'OCR confidence was too low to trust the extracted text.',
  IMAGE_DECODE_FAILED: 'The provided image could not be decoded.',
  NUMBER_MISMATCH: 'The claimed number does not match the extracted number.',
  FUZZY_WITHIN_TOLERANCE: 'The claimed number matched within the fuzzy tolerance.',
  INSUFFICIENT_AUTH_SIGNALS: 'Not enough authenticity signals passed.',
  UNSUPPORTED_INPUT: 'The input is not supported.',
};

const DEFAULT_SEVERITY: Record<ReasonCode, ReasonSeverity> = {
  MRZ_NOT_FOUND: 'error',
  MRZ_CHECKSUM_FAILED: 'error',
  CHECK_DIGIT_INVALID: 'error',
  NO_NUMBER_FOUND: 'error',
  LOW_OCR_CONFIDENCE: 'warning',
  IMAGE_DECODE_FAILED: 'error',
  NUMBER_MISMATCH: 'error',
  FUZZY_WITHIN_TOLERANCE: 'info',
  INSUFFICIENT_AUTH_SIGNALS: 'error',
  UNSUPPORTED_INPUT: 'error',
};

/** Build a structured Reason; message/severity default per code. */
export function reason(
  code: ReasonCode,
  overrides?: { message?: string; severity?: ReasonSeverity },
): Reason {
  return {
    code,
    message: overrides?.message ?? DEFAULT_MESSAGES[code],
    severity: overrides?.severity ?? DEFAULT_SEVERITY[code],
  };
}
