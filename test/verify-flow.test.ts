import { describe, it, expect } from 'vitest';
import { createIdVerifier } from '../src/sdk.js';
import { SdkInputError } from '../src/utils/errors.js';
import { ImageDecodeError, type NormalizedImage } from '../src/image/image-input.js';
import type { OcrResult } from '../src/extractors/extractor.js';
import type { DocumentType } from '../src/types.js';

const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

function fakeImage(width = 856, height = 540): NormalizedImage {
  return { pixels: {} as ImageData, width, height };
}

/** Build a verifier whose OCR returns canned text, bypassing Tesseract/canvas. */
function verifierWith(text: string, confidence = 0.9) {
  const ocr = {
    recognize: async (): Promise<OcrResult> => ({ text, confidence, words: [] }),
  };
  return createIdVerifier({}, { ocr, decode: async () => fakeImage() });
}

function run(text: string, documentType: DocumentType, claimedNumber: string, conf = 0.9) {
  return verifierWith(text, conf).verify({
    documentType,
    claimedNumber,
    image: new Blob(),
  });
}

describe('verify() — Israeli ID path', () => {
  const card = 'מדינת ישראל תעודת זהות 123456782';

  it('verified: authentic + exact number match', async () => {
    const r = await run(card, 'id', '123456782');
    expect(r.decision).toBe('verified');
    expect(r.numberMatch.mode).toBe('exact');
    expect(r.authenticity.authentic).toBe(true);
  });

  it('verified (fuzzy): claimed differs by 1 digit', async () => {
    const r = await run(card, 'id', '123456702');
    expect(r.decision).toBe('verified');
    expect(r.numberMatch.mode).toBe('fuzzy');
    expect(r.numberMatch.digitDifference).toBe(1);
    expect(r.reasons.some((x) => x.code === 'FUZZY_WITHIN_TOLERANCE')).toBe(true);
  });

  it('mismatch: authentic doc, but claimed is a different number', async () => {
    const r = await run(card, 'id', '000000018');
    expect(r.decision).toBe('mismatch');
    expect(r.reasons.some((x) => x.code === 'NUMBER_MISMATCH')).toBe(true);
  });

  it('not_authentic: invalid check digit, no keywords, low OCR', async () => {
    const r = await run('random text 111111111', 'id', '111111111', 0.2);
    expect(r.decision).toBe('not_authentic');
    expect(r.authenticity.authentic).toBe(false);
  });

  it('error: no number found', async () => {
    const r = await run('no digits in this image', 'id', '123456782');
    expect(r.decision).toBe('error');
    expect(r.reasons.some((x) => x.code === 'NO_NUMBER_FOUND')).toBe(true);
  });

  it('selects the ID, not the licence number, when both are present', async () => {
    // Real-licence bug: card shows licence no. 6890768 AND ID 034521971.
    const text = 'מדינת ישראל רישיון נהיגה 4d 6890768 8. ID 034521971';
    const r = await run(text, 'id', '034521971');
    expect(r.numberMatch.extractedNumber).toBe('034521971');
    expect(r.decision).toBe('verified');
  });
});

describe('verify() — passport path', () => {
  it('verified: MRZ parses, checksums valid, number matches', async () => {
    const r = await run(TD3, 'passport', 'L898902C3');
    expect(r.decision).toBe('verified');
    expect(r.numberMatch.extractedNumber).toBe('L898902C3');
    expect(r.authenticity.signals.some((s) => s.kind === 'mrz_checksums_valid' && s.passed)).toBe(
      true,
    );
  });

  it('error: no MRZ present', async () => {
    const r = await run('just a vacation photo', 'passport', 'L898902C3');
    expect(r.decision).toBe('error');
    expect(r.reasons.some((x) => x.code === 'MRZ_NOT_FOUND')).toBe(true);
  });
});

describe('verify() — failures', () => {
  it('error: image decode failure → IMAGE_DECODE_FAILED', async () => {
    const ocr = { recognize: async (): Promise<OcrResult> => ({ text: '', confidence: 0, words: [] }) };
    const verifier = createIdVerifier(
      {},
      { ocr, decode: () => Promise.reject(new ImageDecodeError('bad')) },
    );
    const r = await verifier.verify({ documentType: 'id', claimedNumber: '1', image: new Blob() });
    expect(r.decision).toBe('error');
    expect(r.reasons.some((x) => x.code === 'IMAGE_DECODE_FAILED')).toBe(true);
  });

  it('throws SdkInputError on bad documentType', async () => {
    const v = verifierWith('x');
    await expect(
      // @ts-expect-error testing runtime guard
      v.verify({ documentType: 'drivers', claimedNumber: '1', image: new Blob() }),
    ).rejects.toBeInstanceOf(SdkInputError);
  });

  it('throws SdkInputError on empty claimedNumber', async () => {
    const v = verifierWith('x');
    await expect(
      v.verify({ documentType: 'id', claimedNumber: '   ', image: new Blob() }),
    ).rejects.toBeInstanceOf(SdkInputError);
  });
});
