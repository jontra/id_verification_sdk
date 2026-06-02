/**
 * SDK entry: createIdVerifier() + the verify() flow (DESIGN.md §3, §5).
 *
 * Flow: normalize image → extract (by document type) → authenticity → number
 * match → derive decision → shape result. Processing failures surface as an
 * `error` decision; only API misuse throws (DESIGN.md §3 — no silent fallbacks).
 */
import type {
  AuthenticitySignal,
  Decision,
  IdVerifier,
  IdVerifierOptions,
  NumberMatch,
  Reason,
  VerificationInput,
  VerificationResult,
  VerifyOptions,
} from './types.js';
import { ExtractorRegistry, type ExtractContext, type OcrRunner } from './extractors/extractor.js';
import type { NormalizedImage } from './image/image-input.js';
import type { ImageInput } from './types.js';
import { PassportMrzExtractor } from './extractors/passport-mrz.extractor.js';
import { IsraeliIdExtractor } from './extractors/israeli-id.extractor.js';
import { OcrEngine } from './ocr/ocr-engine.js';
import { toNormalizedImage, ImageDecodeError } from './image/image-input.js';
import { buildCertificate } from './authenticity/authenticity.js';
import { aspectRatioSignal } from './authenticity/signals.js';
import { fuzzyMatch, normalizeForMatch } from './matching/fuzzy-match.js';
import { reason, SdkInputError } from './utils/errors.js';
import { weightedScore } from './utils/confidence.js';

export const SDK_VERSION = '0.0.0';

const DEFAULT_LANGUAGES = ['heb', 'eng'];
const DEFAULT_MIN_OCR_CONFIDENCE = 0.5;
const DEFAULT_FUZZY_TOLERANCE = 2;

/**
 * Internal dependency-injection seam (tests only). Lets a test substitute the
 * OCR runner and image decode so the decision logic can be exercised without
 * Tesseract/canvas. Not part of the public contract.
 */
export interface VerifierDeps {
  ocr?: OcrRunner & Partial<{ warmup(): Promise<void>; dispose(): Promise<void> }>;
  decode?: (input: ImageInput) => Promise<NormalizedImage>;
}

/** Create a verifier instance. Heavy assets load lazily (or via warmup()). */
export function createIdVerifier(
  options: IdVerifierOptions = {},
  deps: VerifierDeps = {},
): IdVerifier {
  const ocr =
    deps.ocr ??
    new OcrEngine({
      languages: options.ocr?.languages ?? DEFAULT_LANGUAGES,
      modelBaseUrl: options.ocr?.modelBaseUrl,
    });
  const decode = deps.decode ?? toNormalizedImage;

  const registry = new ExtractorRegistry()
    .register(new PassportMrzExtractor())
    .register(new IsraeliIdExtractor());

  const minOcrConfidence = options.minOcrConfidence ?? DEFAULT_MIN_OCR_CONFIDENCE;
  const fuzzyTolerance = options.fuzzyTolerance ?? DEFAULT_FUZZY_TOLERANCE;

  async function verify(
    input: VerificationInput,
    verifyOptions: VerifyOptions = {},
  ): Promise<VerificationResult> {
    validateInput(input);
    const signal = verifyOptions.signal;
    throwIfAborted(signal);

    const started = Date.now();
    const issuedAt = new Date(started).toISOString();
    const finish = (
      decision: Decision,
      authSignals: AuthenticitySignal[],
      numberMatch: NumberMatch,
      reasons: Reason[],
      extractionConfidence: number,
    ): VerificationResult => {
      const authenticity = buildCertificate(authSignals, issuedAt);
      const overallConfidence =
        decision === 'error'
          ? 0
          : weightedScore([
              { value: authenticity.confidence, weight: 0.5 },
              { value: extractionConfidence, weight: 0.3 },
              { value: numberMatch.confidence, weight: 0.2 },
            ]);
      return {
        decision,
        overallConfidence,
        authenticity,
        numberMatch,
        reasons,
        meta: {
          documentType: input.documentType,
          sdkVersion: SDK_VERSION,
          processedAt: issuedAt,
          durationMs: Date.now() - started,
        },
      };
    };

    const claimedNorm = normalizeClaimed(input);

    // 1. Decode image.
    let image;
    try {
      image = await decode(input.image);
    } catch (err) {
      if (err instanceof ImageDecodeError) {
        return finish(
          'error',
          [],
          noMatch(claimedNorm),
          [reason('IMAGE_DECODE_FAILED')],
          0,
        );
      }
      throw err;
    }
    throwIfAborted(signal);

    // 2. Extract (registry always has both built-in types).
    const extractor = registry.get(input.documentType)!;
    const ctx: ExtractContext = { signal, minOcrConfidence, ocr };
    const extraction = await extractor.extract(image, ctx);
    throwIfAborted(signal);

    const signals = [
      ...extraction.signals,
      aspectRatioSignal(image.width, image.height),
    ];

    // 3. No number extracted → processing error (never a fake pass).
    if (extraction.number === null) {
      return finish('error', signals, noMatch(claimedNorm), extraction.reasons, 0);
    }

    // 4. Number match.
    const extractedNorm = normalizeExtracted(input.documentType, extraction.number);
    const fm = fuzzyMatch(claimedNorm, extractedNorm, fuzzyTolerance);
    const numberMatch: NumberMatch = {
      matched: fm.matched,
      mode: fm.mode,
      digitDifference: fm.difference,
      extractedNumber: extractedNorm,
      claimedNumber: claimedNorm,
      confidence: fm.matched ? (fm.mode === 'exact' ? 0.99 : 0.85) : 0.2,
    };

    // 5. Authenticity + decision.
    const authenticity = buildCertificate(signals, issuedAt);
    const reasons = [...extraction.reasons];

    let decision: Decision;
    if (!authenticity.authentic) {
      decision = 'not_authentic';
      reasons.push(reason('INSUFFICIENT_AUTH_SIGNALS'));
    } else if (numberMatch.matched) {
      decision = 'verified';
      if (numberMatch.mode === 'fuzzy') reasons.push(reason('FUZZY_WITHIN_TOLERANCE'));
    } else {
      decision = 'mismatch';
      reasons.push(reason('NUMBER_MISMATCH'));
    }

    return finish(decision, signals, numberMatch, reasons, extraction.confidence);
  }

  return {
    verify,
    warmup: () => ocr.warmup?.() ?? Promise.resolve(),
    dispose: () => ocr.dispose?.() ?? Promise.resolve(),
  };
}



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateInput(input: VerificationInput): void {
  if (input.documentType !== 'id' && input.documentType !== 'passport') {
    throw new SdkInputError(`Unsupported documentType: ${String(input.documentType)}`);
  }
  if (typeof input.claimedNumber !== 'string' || input.claimedNumber.trim() === '') {
    throw new SdkInputError('claimedNumber must be a non-empty string.');
  }
  if (input.image == null) {
    throw new SdkInputError('image is required.');
  }
}

function normalizeClaimed(input: VerificationInput): string {
  return input.documentType === 'passport'
    ? normalizeForMatch(input.claimedNumber, { alphanumeric: true })
    : normalizeForMatch(input.claimedNumber, { padLength: 9 });
}

function normalizeExtracted(
  documentType: VerificationInput['documentType'],
  extracted: string,
): string {
  return documentType === 'passport'
    ? normalizeForMatch(extracted, { alphanumeric: true })
    : normalizeForMatch(extracted, { padLength: 9 });
}

function noMatch(claimed: string): NumberMatch {
  return {
    matched: false,
    mode: 'none',
    digitDifference: claimed.length,
    extractedNumber: null,
    claimedNumber: claimed,
    confidence: 0,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Verification aborted.', 'AbortError');
  }
}
