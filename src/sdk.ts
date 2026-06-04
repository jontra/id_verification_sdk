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
import {
  ExtractorRegistry,
  type ExtractContext,
  type Extractor,
  type ExtractionOutput,
  type OcrRunner,
} from './extractors/extractor.js';
import { toNormalizedImage, rotateNormalizedImage, ImageDecodeError } from './image/image-input.js';
import type { NormalizedImage } from './image/image-input.js';
import type { DocumentType, ImageInput } from './types.js';
import { PassportMrzExtractor } from './extractors/passport-mrz.extractor.js';
import { IsraeliIdExtractor } from './extractors/israeli-id.extractor.js';
import { OcrEngine } from './ocr/ocr-engine.js';
import { buildCertificate } from './authenticity/authenticity.js';
import { aspectRatioSignal } from './authenticity/signals.js';
import {
  fuzzyMatch,
  normalizeForMatch,
  levenshtein,
  type FuzzyMatchResult,
} from './matching/fuzzy-match.js';
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
  // OCR engine resolution: public `ocrEngine` option (e.g. a PaddleOcrEngine)
  // wins; then the internal test seam; else the built-in Tesseract engine.
  const ocr =
    options.ocrEngine ??
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

    // 2. Extract, with orientation retry. OCR engines read horizontal text but
    //    not text rotated a full 90°/270°, so a sideways capture only reads at
    //    the right orientation. Try 0/90/270/180 and keep the best read; stop
    //    early once we get a checksum-valid number (a successful read).
    const extractor = registry.get(input.documentType)!;
    const ctx: ExtractContext = { signal, minOcrConfidence, ocr };
    const extraction = await extractWithOrientation(
      extractor,
      image,
      ctx,
      claimedNorm,
      input.documentType,
      fuzzyTolerance,
    );
    throwIfAborted(signal);

    const signals = [
      ...extraction.signals,
      aspectRatioSignal(image.width, image.height),
    ];

    // 3. No number extracted → processing error (never a fake pass).
    if (extraction.candidates.length === 0) {
      return finish('error', signals, noMatch(claimedNorm), extraction.reasons, 0);
    }

    // 4. Claim-aware selection: pick the candidate that best matches the claim
    //    (a document may show several numbers, e.g. ID vs licence number).
    const best = selectBestMatch(
      claimedNorm,
      extraction.candidates.map((c) => normalizeExtracted(input.documentType, c)),
      fuzzyTolerance,
    );
    const numberMatch: NumberMatch = {
      matched: best.fm.matched,
      mode: best.fm.mode,
      digitDifference: best.fm.difference,
      extractedNumber: best.value,
      claimedNumber: claimedNorm,
      confidence: best.fm.matched ? (best.fm.mode === 'exact' ? 0.99 : 0.85) : 0.2,
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

const ROTATIONS = [90, 270, 180] as const;

/**
 * Run extraction across orientations and keep the best read. Orientation 0 is
 * tried first; if it yields a checksum-valid number we stop (a successful read).
 * Otherwise we rotate the image 90/270/180 and retry — OCR can't read text
 * rotated a full 90°. Rotation needs a canvas; where unavailable (e.g. tests)
 * the rotate throws and that orientation is simply skipped.
 */
async function extractWithOrientation(
  extractor: Extractor,
  image: NormalizedImage,
  ctx: ExtractContext,
  claimedNorm: string,
  documentType: DocumentType,
  tolerance: number,
): Promise<ExtractionOutput> {
  let best: { extraction: ExtractionOutput; score: number } | null = null;

  const consider = (extraction: ExtractionOutput): boolean => {
    const score = scoreExtraction(extraction, claimedNorm, documentType, tolerance);
    if (!best || score > best.score) best = { extraction, score };
    return hasValidChecksum(extraction); // early-exit signal: successful read
  };

  if (consider(await extractor.extract(image, ctx))) return best!.extraction;

  for (const deg of ROTATIONS) {
    let rotated: NormalizedImage;
    try {
      rotated = rotateNormalizedImage(image, deg);
    } catch {
      continue; // can't rotate in this environment
    }
    if (consider(await extractor.extract(rotated, ctx))) break;
  }
  return best!.extraction;
}

function hasValidChecksum(e: ExtractionOutput): boolean {
  return e.signals.some(
    (s) => (s.kind === 'check_digit_valid' || s.kind === 'mrz_checksums_valid') && s.passed,
  );
}

/** Rank an orientation's read: valid+claim-match > valid > claim-match > any > none. */
function scoreExtraction(
  e: ExtractionOutput,
  claimedNorm: string,
  documentType: DocumentType,
  tolerance: number,
): number {
  const valid = hasValidChecksum(e);
  const matched = e.candidates.some(
    (c) => levenshtein(claimedNorm, normalizeExtracted(documentType, c)) <= tolerance,
  );
  if (valid && matched) return 5;
  if (valid) return 4;
  if (matched) return 3;
  return e.candidates.length > 0 ? 1 : 0;
}

/**
 * Pick the candidate closest to the claimed number (smallest digit difference).
 * `candidates` must be non-empty and already normalized for comparison.
 */
function selectBestMatch(
  claim: string,
  candidates: string[],
  tolerance: number,
): { value: string; fm: FuzzyMatchResult } {
  let best: { value: string; fm: FuzzyMatchResult } | null = null;
  for (const value of candidates) {
    const fm = fuzzyMatch(claim, value, tolerance);
    if (!best || fm.difference < best.fm.difference) best = { value, fm };
  }
  return best!;
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
