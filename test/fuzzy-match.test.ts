import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  normalizeForMatch,
} from '../src/matching/fuzzy-match.js';

describe('normalizeForMatch', () => {
  it('keeps digits only by default and pads', () => {
    expect(normalizeForMatch('12-34', { padLength: 9 })).toBe('000001234');
  });

  it('keeps alphanumerics for passports, uppercased', () => {
    expect(normalizeForMatch('a1234567', { alphanumeric: true })).toBe('A1234567');
    expect(normalizeForMatch('a1-234', { alphanumeric: true })).toBe('A1234');
  });
});

describe('fuzzyMatch', () => {
  const claim = '123456782';

  it('exact match → mode exact, difference 0', () => {
    expect(fuzzyMatch(claim, '123456782')).toEqual({
      matched: true,
      mode: 'exact',
      difference: 0,
    });
  });

  it('1 differing digit → fuzzy match', () => {
    expect(fuzzyMatch(claim, '123456702')).toMatchObject({
      matched: true,
      mode: 'fuzzy',
      difference: 1,
    });
  });

  it('2 differing digits → fuzzy match (boundary)', () => {
    expect(fuzzyMatch(claim, '123056702')).toMatchObject({
      matched: true,
      mode: 'fuzzy',
      difference: 2,
    });
  });

  it('3 differing digits → no match', () => {
    expect(fuzzyMatch(claim, '120056702')).toMatchObject({
      matched: false,
      mode: 'none',
      difference: 3,
    });
  });

  it('different lengths → strong mismatch', () => {
    expect(fuzzyMatch(claim, '12345678')).toEqual({
      matched: false,
      mode: 'none',
      difference: 9,
    });
  });

  it('respects a custom tolerance', () => {
    expect(fuzzyMatch(claim, '120056702', 3)).toMatchObject({
      matched: true,
      mode: 'fuzzy',
      difference: 3,
    });
  });
});
