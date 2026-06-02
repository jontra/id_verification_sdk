/**
 * Fuzzy number matching (DESIGN.md §7).
 *
 * Rule:
 *   1. Compare normalized strings (caller normalizes; for Israeli IDs that
 *      means digits-only, left-padded to 9 — see `normalizeForMatch`).
 *   2. Different lengths -> strong mismatch (difference = max length, mode 'none').
 *   3. Same length -> position-aware (Hamming) difference: count positions
 *      whose characters differ.
 *   4. 0 -> 'exact'; 1..tolerance -> 'fuzzy'; > tolerance -> 'none'.
 *
 * Position-aware (not Levenshtein) because OCR digit errors are overwhelmingly
 * in-place substitutions; shift-tolerant distances would cause false accepts.
 */
import type { MatchMode } from '../types.js';

export const DEFAULT_FUZZY_TOLERANCE = 2;

export interface NormalizeForMatchOptions {
  /** Keep A–Z and 0–9 (passport); otherwise digits only (Israeli ID). */
  alphanumeric?: boolean;
  /** Left-pad with '0' to this length when shorter (e.g. 9 for Israeli ID). */
  padLength?: number;
}

export function normalizeForMatch(
  input: string,
  options: NormalizeForMatchOptions = {},
): string {
  const { alphanumeric = false, padLength } = options;
  let s = input.toUpperCase();
  s = alphanumeric ? s.replace(/[^A-Z0-9]/g, '') : s.replace(/\D/g, '');
  if (padLength && s.length < padLength) s = s.padStart(padLength, '0');
  return s;
}

export interface FuzzyMatchResult {
  matched: boolean;
  mode: MatchMode;
  /** Count of differing positions (or max length when lengths differ). */
  difference: number;
}

/** Compare two already-normalized strings. */
export function fuzzyMatch(
  claimed: string,
  extracted: string,
  tolerance: number = DEFAULT_FUZZY_TOLERANCE,
): FuzzyMatchResult {
  if (claimed.length !== extracted.length) {
    return {
      matched: false,
      mode: 'none',
      difference: Math.max(claimed.length, extracted.length),
    };
  }

  let difference = 0;
  for (let i = 0; i < claimed.length; i++) {
    if (claimed[i] !== extracted[i]) difference++;
  }

  if (difference === 0) return { matched: true, mode: 'exact', difference };
  if (difference <= tolerance) return { matched: true, mode: 'fuzzy', difference };
  return { matched: false, mode: 'none', difference };
}
