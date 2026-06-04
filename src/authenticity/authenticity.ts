/**
 * Combine weighted authenticity signals into a certificate (DESIGN.md §6).
 *
 * confidence = weighted average of passed signals.
 * authentic  = at least one signal AND confidence >= threshold.
 *
 * The default threshold (0.55) is tuned so that, on the `id` path, a number that
 * fails the check digit cannot reach "authentic" on keywords + OCR alone — the
 * check digit (weight 0.5) is effectively necessary. On the passport path, a
 * failed MRZ checksum (0.4) likewise falls below threshold.
 */
import type { AuthenticityCertificate, AuthenticitySignal } from '../types.js';
import { weightedScore } from '../utils/confidence.js';

export const DEFAULT_AUTH_THRESHOLD = 0.55;

export function buildCertificate(
  signals: AuthenticitySignal[],
  issuedAt: string,
  threshold: number = DEFAULT_AUTH_THRESHOLD,
): AuthenticityCertificate {
  const confidence = weightedScore(
    signals.map((s) => ({ value: s.passed ? 1 : 0, weight: s.weight })),
  );
  const authentic = signals.length > 0 && confidence >= threshold;
  return { authentic, confidence, signals, issuedAt };
}
