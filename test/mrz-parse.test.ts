import { describe, it, expect } from 'vitest';
import { parseMrz, mrzCheckDigit, parseTd3Line2 } from '../src/mrz/mrz-parse.js';

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

describe('mrzCheckDigit', () => {
  it('computes ICAO 9303 check digits', () => {
    expect(mrzCheckDigit('22441264<')).toBe('1');
    expect(mrzCheckDigit('L898902C3')).toBe('6'); // ICAO TD3 specimen
  });
});

describe('parseTd3Line2 (tolerant line-2 parser)', () => {
  // Real Israeli passport MRZ line 2: passport no. 22441264, national ID 034521971.
  const LINE2 = '22441264<1ISR7712234M25082230<3452197<1<<<26';

  it('extracts and validates the passport number', () => {
    const f = parseTd3Line2(LINE2);
    expect(f.documentNumber).toBe('22441264');
    expect(f.documentNumberValid).toBe(true);
  });

  it('extracts the national ID from the personal-number field', () => {
    const f = parseTd3Line2(LINE2);
    expect(f.personalNumber).toBe('034521971');
    expect(f.personalNumberValid).toBe(true);
  });

  it('flags a corrupted passport-number check digit', () => {
    // Change the check digit (index 9) from 1 to 9.
    const bad = LINE2.slice(0, 9) + '9' + LINE2.slice(10);
    expect(parseTd3Line2(bad).documentNumberValid).toBe(false);
  });
});
