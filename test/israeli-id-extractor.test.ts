import { describe, it, expect } from 'vitest';
import {
  detectIdKeywords,
  extractIdCandidates,
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

  it('returns every distinct number on the card (ID + licence number)', () => {
    // The licence shows both the ID (field 8) and the licence number (field 4d).
    expect(extractIdCandidates('4d 6890768 ... 8. ID 034521971')).toEqual([
      '6890768',
      '034521971',
    ]);
  });
});
