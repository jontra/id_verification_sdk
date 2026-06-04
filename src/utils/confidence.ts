/** Confidence helpers — all values are clamped to [0, 1]. */

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Weighted average of {value, weight} pairs. Returns 0 if total weight is 0. */
export function weightedScore(
  items: ReadonlyArray<{ value: number; weight: number }>,
): number {
  let weighted = 0;
  let total = 0;
  for (const { value, weight } of items) {
    weighted += clamp01(value) * weight;
    total += weight;
  }
  return total === 0 ? 0 : clamp01(weighted / total);
}
