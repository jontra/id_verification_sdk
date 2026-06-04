/**
 * Locate MRZ lines within OCR text (DESIGN.md §5).
 *
 * Pragmatic approach for the time box: instead of pixel-region detection, we
 * OCR the page and pick out the lines that have MRZ shape — a long run of
 * [A-Z0-9<] with filler '<' characters. MRZ formats:
 *   TD1: 3 lines × 30, TD2: 2 lines × 36, TD3 (passport): 2 lines × 44.
 */

const MRZ_CHARS = /[^A-Z0-9<]/g;

/** Normalize a raw OCR line to MRZ alphabet (uppercase, strip the rest). */
function normalizeLine(line: string): string {
  return line.toUpperCase().replace(/\s/g, '').replace(MRZ_CHARS, '');
}

/** Heuristic: does this normalized line look like an MRZ line? */
function looksLikeMrz(line: string): boolean {
  if (line.length < 28 || line.length > 48) return false;
  // Real MRZ lines are dense with fillers or all-caps alphanumerics.
  const fillerRatio = (line.match(/</g)?.length ?? 0) / line.length;
  return fillerRatio > 0 || /^[A-Z0-9]{28,}$/.test(line);
}

/** Return all MRZ-looking lines from OCR text (top-to-bottom order). */
export function findMrzLines(ocrText: string): string[] {
  return ocrText.split(/\r?\n/).map(normalizeLine).filter(looksLikeMrz);
}

/**
 * Return MRZ-looking tokens, splitting on any whitespace — not just newlines.
 * PaddleOCR often returns the whole MRZ region as one space-separated block
 * (`<line2> <line1> …`), so the individual 44-char MRZ lines are whitespace-
 * separated tokens rather than newline-separated lines.
 */
export function findMrzCandidates(ocrText: string): string[] {
  const tokens = ocrText
    .toUpperCase()
    .split(/\s+/)
    .map((t) => t.replace(MRZ_CHARS, ''))
    .filter(looksLikeMrz);
  return [...new Set(tokens)];
}

/**
 * From candidate MRZ lines, produce the line-groups worth trying to parse,
 * most-likely first. MRZ is 2 lines (TD2/TD3) or 3 lines (TD1), at the bottom.
 */
export function candidateMrzGroups(candidates: string[]): string[][] {
  const groups: string[][] = [];
  if (candidates.length >= 2) groups.push(candidates.slice(-2));
  if (candidates.length >= 3) groups.push(candidates.slice(-3));
  return groups;
}
