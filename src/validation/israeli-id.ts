/**
 * Israeli ID (Teudat Zehut) number validation.
 *
 * The number is up to 9 digits; shorter numbers are left-padded with zeros to 9.
 * Validation uses the standard check-digit (Luhn-like) algorithm:
 *   - weight digits alternately by 1, 2, 1, 2, ... (left to right over 9 digits)
 *   - if a weighted value > 9, sum its two digits (equivalently subtract 9)
 *   - the total must be divisible by 10
 *
 * See DESIGN.md §6 — the check digit is both a validity test and a strong
 * authenticity signal for the OCR path.
 */

export const ISRAELI_ID_LENGTH = 9;

/** Strip everything except digits. */
export function normalizeDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Normalize an Israeli ID to canonical 9-digit form (left-padded with zeros).
 * Returns null if it has no digits or more than 9.
 */
export function normalizeIsraeliId(input: string): string | null {
  const digits = normalizeDigits(input);
  if (digits.length === 0 || digits.length > ISRAELI_ID_LENGTH) return null;
  return digits.padStart(ISRAELI_ID_LENGTH, '0');
}

/** Validate an Israeli ID via its check digit. Accepts unpadded input. */
export function isValidIsraeliId(input: string): boolean {
  const id = normalizeIsraeliId(input);
  if (id === null) return false;

  let sum = 0;
  for (let i = 0; i < ISRAELI_ID_LENGTH; i++) {
    const digit = id.charCodeAt(i) - 48; // '0' === 48
    const weighted = digit * ((i % 2) + 1); // weights: 1,2,1,2,...
    sum += weighted > 9 ? weighted - 9 : weighted;
  }
  return sum % 10 === 0;
}
