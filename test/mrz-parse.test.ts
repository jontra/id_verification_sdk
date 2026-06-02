import { describe, it, expect } from 'vitest';
import { parseMrz } from '../src/mrz/mrz-parse.js';

// Standard ICAO TD3 specimen. All check digits are valid; the issuing state
// "UTO" is fictional, so issuingState is null but checkDigitsValid is true.
const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
];

describe('parseMrz', () => {
  it('parses a valid TD3 MRZ and extracts the document number', () => {
    const r = parseMrz(TD3);
    expect(r.parsed).toBe(true);
    expect(r.format).toBe('TD3');
    expect(r.documentNumber).toBe('L898902C3');
    expect(r.checkDigitsValid).toBe(true);
  });

  it('accepts a single newline-joined string', () => {
    const r = parseMrz(TD3.join('\n'));
    expect(r.documentNumber).toBe('L898902C3');
    expect(r.checkDigitsValid).toBe(true);
  });

  it('flags corrupted check digits', () => {
    // Corrupt the document-number check digit (10th char of line 2: 6 -> 0).
    const corrupted = [TD3[0]!, 'L898902C30UTO7408122F1204159ZE184226B<<<<<10'];
    const r = parseMrz(corrupted);
    expect(r.checkDigitsValid).toBe(false);
  });

  it('returns an empty result for non-MRZ junk', () => {
    const r = parseMrz(['hello world', 'not an mrz']);
    expect(r.checkDigitsValid).toBe(false);
  });
});
