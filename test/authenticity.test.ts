import { describe, it, expect } from 'vitest';
import { buildCertificate, DEFAULT_AUTH_THRESHOLD } from '../src/authenticity/authenticity.js';
import type { AuthenticitySignal } from '../src/types.js';

const ISO = '2026-01-01T00:00:00.000Z';

describe('buildCertificate', () => {
  it('is authentic when weighted passed signals clear the threshold', () => {
    const signals: AuthenticitySignal[] = [
      { kind: 'check_digit_valid', passed: true, weight: 0.5 },
      { kind: 'keywords_found', passed: true, weight: 0.3 },
      { kind: 'ocr_quality', passed: true, weight: 0.2 },
    ];
    const cert = buildCertificate(signals, ISO);
    expect(cert.authentic).toBe(true);
    expect(cert.confidence).toBeCloseTo(1);
  });

  it('is not authentic when the dominant signal fails (check digit invalid)', () => {
    const signals: AuthenticitySignal[] = [
      { kind: 'check_digit_valid', passed: false, weight: 0.5 },
      { kind: 'keywords_found', passed: true, weight: 0.3 },
      { kind: 'ocr_quality', passed: true, weight: 0.2 },
    ];
    const cert = buildCertificate(signals, ISO);
    expect(cert.confidence).toBeLessThan(DEFAULT_AUTH_THRESHOLD);
    expect(cert.authentic).toBe(false);
  });

  it('is not authentic with no signals', () => {
    expect(buildCertificate([], ISO).authentic).toBe(false);
  });

  it('carries the signals and issued timestamp through', () => {
    const signals: AuthenticitySignal[] = [
      { kind: 'mrz_present', passed: true, weight: 0.4 },
      { kind: 'mrz_checksums_valid', passed: true, weight: 0.6 },
    ];
    const cert = buildCertificate(signals, ISO);
    expect(cert.issuedAt).toBe(ISO);
    expect(cert.signals).toHaveLength(2);
    expect(cert.authentic).toBe(true);
  });
});
