import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIdVerifier } from '../src/sdk.js';
import type { NormalizedImage } from '../src/image/image-input.js';
import type { OcrResult } from '../src/extractors/extractor.js';

/**
 * Privacy guarantee (DESIGN.md §10): a full verify() must make ZERO network
 * calls. We spy on every egress primitive and assert none fire.
 *
 * Note: real OCR assets are loaded at warmup() from a self-hosted (same-origin)
 * URL — never during verify(), and never from a third-party host.
 */
describe('privacy — no network during verify()', () => {
  const calls: string[] = [];
  const original = {
    fetch: globalThis.fetch,
    xhrOpen: globalThis.XMLHttpRequest?.prototype.open,
    sendBeacon: globalThis.navigator?.sendBeacon,
  };

  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = vi.fn(() => {
      calls.push('fetch');
      return Promise.reject(new Error('network blocked in test'));
    }) as unknown as typeof fetch;

    if (globalThis.XMLHttpRequest) {
      globalThis.XMLHttpRequest.prototype.open = function () {
        calls.push('xhr');
      } as unknown as typeof XMLHttpRequest.prototype.open;
    }
    if (globalThis.navigator) {
      globalThis.navigator.sendBeacon = () => {
        calls.push('sendBeacon');
        return true;
      };
    }
  });

  afterEach(() => {
    globalThis.fetch = original.fetch;
    if (globalThis.XMLHttpRequest && original.xhrOpen) {
      globalThis.XMLHttpRequest.prototype.open = original.xhrOpen;
    }
    if (globalThis.navigator && original.sendBeacon) {
      globalThis.navigator.sendBeacon = original.sendBeacon;
    }
  });

  it('makes no fetch/XHR/sendBeacon calls', async () => {
    const ocr = {
      recognize: async (): Promise<OcrResult> => ({
        text: 'מדינת ישראל תעודת זהות 123456782',
        confidence: 0.9,
        words: [],
      }),
    };
    const image: NormalizedImage = { pixels: {} as ImageData, width: 856, height: 540 };
    const verifier = createIdVerifier({}, { ocr, decode: async () => image });

    const result = await verifier.verify({
      documentType: 'id',
      claimedNumber: '123456782',
      image: new Blob(),
    });

    expect(result.decision).toBe('verified');
    expect(calls).toEqual([]);
  });
});
