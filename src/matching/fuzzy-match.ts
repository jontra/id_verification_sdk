/**
 * Fuzzy number matching (DESIGN.md §7).
 *
 * Rule: compare normalized strings with **Levenshtein edit distance**:
 *   0 -> 'exact'; 1..tolerance -> 'fuzzy'; > tolerance -> 'none'.
 *
 * Edit distance (not position-aware Hamming) because real OCR errors include
 * **inserted/dropped characters**, not just in-place substitutions — e.g. a
 * passport number `224412264` read as `22441264` (one deletion) must still
 * match. Tolerance 2 keeps it strict (≤2 edits on a ~9-char number). The caller
 * normalizes first (digits-only + left-pad to 9 for Israeli IDs, alphanumeric
 * for passports — see `normalizeForMatch`).
 */
import type { MatchMode } from '../types.js';

export const DEFAULT_FUZZY_TOLERANCE = 2;

/** Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

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
  /** Edit distance between the normalized claimed and extracted numbers. */
  difference: number;
}

/** Compare two already-normalized strings by edit distance. */
export function fuzzyMatch(
  claimed: string,
  extracted: string,
  tolerance: number = DEFAULT_FUZZY_TOLERANCE,
): FuzzyMatchResult {
  const difference = levenshtein(claimed, extracted);
  if (difference === 0) return { matched: true, mode: 'exact', difference };
  if (difference <= tolerance) return { matched: true, mode: 'fuzzy', difference };
  return { matched: false, mode: 'none', difference };
}
