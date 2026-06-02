import { describe, it, expect } from 'vitest';
import {
  detectIdKeywords,
  extractIdCandidates,
  pickIsraeliId,
} from '../src/extractors/israeli-id.extractor.js';

describe('detectIdKeywords', () => {
  it('detects Hebrew ID/licence markers', () => {
    expect(detectIdKeywords('מדינת ישראל תעודת זהות')).toBe(true);
    expect(detectIdKeywords('רישיון נהיגה')).toBe(true);
  });
  it('detects English markers', () => {
    expect(detectIdKeywords('STATE OF ISRAEL IDENTITY CARD')).toBe(true);
  });
  it('returns false for unrelated text', () => {
    expect(detectIdKeywords('just a random photo of a cat')).toBe(false);
  });
});

describe('extractIdCandidates', () => {
  it('finds contiguous digit runs and dedupes', () => {
    expect(extractIdCandidates('id 123456782 dob 01011990 123456782')).toEqual([
      '123456782',
      '01011990',
    ]);
  });
  it('ignores short runs', () => {
    expect(extractIdCandidates('abc 12 34')).toEqual([]);
  });
});

describe('pickIsraeliId', () => {
  it('selects the candidate passing the check digit', () => {
    expect(pickIsraeliId(['01011990', '123456782'])).toEqual({
      number: '123456782',
      valid: true,
    });
  });
  it('falls back to the longest candidate when none validate', () => {
    expect(pickIsraeliId(['12345', '123456789'])).toEqual({
      number: '123456789',
      valid: false,
    });
  });
  it('returns null when there are no candidates', () => {
    expect(pickIsraeliId([])).toEqual({ number: null, valid: false });
  });
});
