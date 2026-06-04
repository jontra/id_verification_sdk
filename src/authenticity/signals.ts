/** Individual authenticity signal detectors (DESIGN.md §6). */
import type { AuthenticitySignal } from '../types.js';

/** ID-1 cards (~1.585) and passport pages (~1.42) are landscape-ish. Weak signal. */
export function aspectRatioSignal(width: number, height: number): AuthenticitySignal {
  const ratio = width >= height ? width / height : height / width;
  const passed = ratio >= 1.2 && ratio <= 1.8;
  return {
    kind: 'aspect_ratio',
    passed,
    weight: 0.1,
    detail: `ratio ${ratio.toFixed(2)}`,
  };
}
