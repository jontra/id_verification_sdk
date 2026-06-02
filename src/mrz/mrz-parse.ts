/**
 * Thin wrapper over the `mrz` library (DESIGN.md §9).
 *
 * Design note: the library's top-level `valid` is over-strict for our needs —
 * it fails when the issuing-state code is unrecognized (e.g. the ICAO test
 * code "UTO"), even though every check digit passes. For authenticity we care
 * about the *check digits* (internal consistency), so we expose that separately
 * from country recognition.
 */
import { parse } from 'mrz';

export interface MrzParseResult {
  /** True if a recognized MRZ format was parsed at all. */
  parsed: boolean;
  format: string | null;
  documentNumber: string | null;
  /** ISO 3166-1 alpha-3 issuing state, or null if unrecognized. */
  issuingState: string | null;
  nationality: string | null;
  /** All MRZ check-digit fields validated (internal consistency). */
  checkDigitsValid: boolean;
  /** Raw `valid` from the library (also requires recognized country codes). */
  libraryValid: boolean;
}

const EMPTY: MrzParseResult = {
  parsed: false,
  format: null,
  documentNumber: null,
  issuingState: null,
  nationality: null,
  checkDigitsValid: false,
  libraryValid: false,
};

/** Parse MRZ lines (array of lines, or a single string with line breaks). */
export function parseMrz(input: string | string[]): MrzParseResult {
  let result;
  try {
    result = parse(input);
  } catch {
    return EMPTY;
  }

  const checkDigitFields = result.details.filter(
    (d) => typeof d.field === 'string' && d.field.endsWith('CheckDigit'),
  );
  const checkDigitsValid =
    checkDigitFields.length > 0 && checkDigitFields.every((d) => d.valid);

  return {
    parsed: true,
    format: result.format ?? null,
    documentNumber: result.fields.documentNumber ?? null,
    issuingState: result.fields.issuingState ?? null,
    nationality: result.fields.nationality ?? null,
    checkDigitsValid,
    libraryValid: result.valid,
  };
}
