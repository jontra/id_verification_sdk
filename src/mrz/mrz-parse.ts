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

/**
 * MRZ check-digit (ICAO 9303): weights cycle 7,3,1; '<'=0, 0–9=value,
 * A–Z=10–35. Returns the computed check digit as a string '0'–'9'.
 */
export function mrzCheckDigit(field: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const c = field[i]!;
    let v: number;
    if (c >= '0' && c <= '9') v = c.charCodeAt(0) - 48;
    else if (c >= 'A' && c <= 'Z') v = c.charCodeAt(0) - 55; // 'A'->10
    else v = 0; // '<' and anything else
    sum += v * weights[i % 3]!;
  }
  return String(sum % 10);
}

export interface Td3Line2Fields {
  documentNumber: string;
  documentNumberValid: boolean;
  /** Personal number — for an Israeli passport this is the national ID. */
  personalNumber: string;
  personalNumberValid: boolean;
}

/**
 * Tolerant TD3 line-2 parser (DESIGN.md §9). PaddleOCR reads MRZ line 2 reliably
 * (incl. `<` fillers) even when line 1 is garbled, so we extract fields by
 * fixed position and validate each check digit independently — robust to a
 * mangled name line and to the strict `mrz` parser's exact-44-char requirement.
 *
 * TD3 line 2 layout (0-indexed):
 *   0–8 document number, 9 check, 10–12 nationality, 13–18 birth date,
 *   19 check, 20 sex, 21–26 expiry, 27 check, 28–41 personal number,
 *   42 check, 43 composite check.
 */
export function parseTd3Line2(line: string): Td3Line2Fields {
  const docField = line.slice(0, 9);
  const personalField = line.slice(28, 42);
  return {
    documentNumber: docField.replace(/</g, ''),
    documentNumberValid: line.length >= 10 && mrzCheckDigit(docField) === line[9],
    personalNumber: personalField.replace(/</g, ''),
    personalNumberValid: line.length >= 43 && mrzCheckDigit(personalField) === line[42],
  };
}

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
