import { describe, it, expect } from 'vitest';
import { linesToOcrResult } from '../src/ocr/paddle-ocr-engine.js';

describe('linesToOcrResult', () => {
  it('joins detected lines into newline-separated text', () => {
    const r = linesToOcrResult([{ text: 'STATE OF ISRAEL' }, { text: '034521971' }]);
    expect(r.text).toBe('STATE OF ISRAEL\n034521971');
    expect(r.words).toHaveLength(2);
  });

  it('averages line scores into confidence', () => {
    const r = linesToOcrResult([
      { text: 'a', mean: 0.8 },
      { text: 'b', mean: 0.6 },
    ]);
    expect(r.confidence).toBeCloseTo(0.7);
  });

  it('defaults confidence to 0.9 when the backend gives no scores', () => {
    expect(linesToOcrResult([{ text: 'x' }]).confidence).toBe(0.9);
  });

  it('reports zero confidence when nothing was detected', () => {
    const r = linesToOcrResult([]);
    expect(r.confidence).toBe(0);
    expect(r.text).toBe('');
  });
});
