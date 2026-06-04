import { describe, it, expect } from 'vitest';
import {
  isValidIsraeliId,
  normalizeIsraeliId,
  normalizeDigits,
} from '../src/validation/israeli-id.js';

describe('normalizeDigits', () => {
  it('strips non-digit characters', () => {
    expect(normalizeDigits('12-34 56/78')).toBe('12345678');
    expect(normalizeDigits('abc')).toBe('');
  });
});

describe('normalizeIsraeliId', () => {
  it('left-pads to 9 digits', () => {
    expect(normalizeIsraeliId('18')).toBe('000000018');
    expect(normalizeIsraeliId('123456782')).toBe('123456782');
  });

  it('ignores separators', () => {
    expect(normalizeIsraeliId('1-2-3-4')).toBe('000001234');
  });

  it('returns null for empty or too-long input', () => {
    expect(normalizeIsraeliId('')).toBeNull();
    expect(normalizeIsraeliId('abc')).toBeNull();
    expect(normalizeIsraeliId('1234567890')).toBeNull(); // 10 digits
  });
});

describe('isValidIsraeliId', () => {
  it('accepts numbers with a correct check digit', () => {
    expect(isValidIsraeliId('123456782')).toBe(true);
    expect(isValidIsraeliId('000000018')).toBe(true);
    expect(isValidIsraeliId('18')).toBe(true); // pads then validates
  });

  it('rejects numbers with an incorrect check digit', () => {
    expect(isValidIsraeliId('123456789')).toBe(false);
    expect(isValidIsraeliId('123456783')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidIsraeliId('')).toBe(false);
    expect(isValidIsraeliId('abc')).toBe(false);
    expect(isValidIsraeliId('1234567890')).toBe(false);
  });
});
