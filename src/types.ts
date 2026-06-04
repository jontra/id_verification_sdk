/**
 * Public types for the Identity Verification SDK.
 * See DESIGN.md §3 (Public API).
 */
import type { OcrRunner } from './extractors/extractor.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type DocumentType = 'id' | 'passport';

export type ImageInput = Blob | File | ImageData;

export interface VerificationInput {
  documentType: DocumentType;
  claimedNumber: string;
  image: ImageInput;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Primary discriminant of a verification result. */
export type Decision = 'verified' | 'mismatch' | 'not_authentic' | 'error';

export interface VerificationResult {
  decision: Decision;
  /** Overall confidence in [0, 1]. */
  overallConfidence: number;
  authenticity: AuthenticityCertificate;
  numberMatch: NumberMatch;
  /** Structured reasons, especially for rejections. */
  reasons: Reason[];
  meta: VerificationMeta;
}

export interface VerificationMeta {
  documentType: DocumentType;
  sdkVersion: string;
  /** ISO timestamp. */
  processedAt: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Authenticity
// ---------------------------------------------------------------------------

export interface AuthenticityCertificate {
  authentic: boolean;
  /** Confidence in [0, 1]. */
  confidence: number;
  signals: AuthenticitySignal[];
  /** ISO timestamp. */
  issuedAt: string;
}

export type AuthenticitySignalKind =
  | 'mrz_present'
  | 'mrz_checksums_valid'
  | 'check_digit_valid'
  | 'keywords_found'
  | 'ocr_quality'
  | 'aspect_ratio';

export interface AuthenticitySignal {
  kind: AuthenticitySignalKind;
  passed: boolean;
  /** Relative contribution weight (>= 0). */
  weight: number;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Number match
// ---------------------------------------------------------------------------

export type MatchMode = 'exact' | 'fuzzy' | 'none';

export interface NumberMatch {
  matched: boolean;
  mode: MatchMode;
  /** Count of differing digits (see DESIGN.md §7). */
  digitDifference: number;
  /** Normalized number extracted from the document, or null if none found. */
  extractedNumber: string | null;
  /** Normalized claimed number. */
  claimedNumber: string;
  /** Confidence in [0, 1]. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

export type ReasonCode =
  | 'MRZ_NOT_FOUND'
  | 'MRZ_CHECKSUM_FAILED'
  | 'CHECK_DIGIT_INVALID'
  | 'NO_NUMBER_FOUND'
  | 'LOW_OCR_CONFIDENCE'
  | 'IMAGE_DECODE_FAILED'
  | 'NUMBER_MISMATCH'
  | 'FUZZY_WITHIN_TOLERANCE'
  | 'INSUFFICIENT_AUTH_SIGNALS'
  | 'UNSUPPORTED_INPUT';

export type ReasonSeverity = 'info' | 'warning' | 'error';

export interface Reason {
  code: ReasonCode;
  message: string;
  severity: ReasonSeverity;
}

// ---------------------------------------------------------------------------
// SDK options
// ---------------------------------------------------------------------------

export interface OcrOptions {
  /** OCR languages, e.g. ['heb', 'eng']. */
  languages?: string[];
  /** Same-origin base URL for self-hosted Tesseract assets (privacy). */
  modelBaseUrl?: string;
}

/** An OCR engine the SDK can drive (e.g. PaddleOcrEngine or the Tesseract one). */
export type OcrEngine = OcrRunner &
  Partial<{ warmup(): Promise<void>; dispose(): Promise<void> }>;

export interface IdVerifierOptions {
  /**
   * OCR engine to use. Inject a `PaddleOcrEngine` (recommended — reads real
   * card photos) here. If omitted, the SDK falls back to a built-in Tesseract
   * engine configured via `ocr` below.
   */
  ocrEngine?: OcrEngine;
  /** Tesseract fallback config (used only when `ocrEngine` is not provided). */
  ocr?: OcrOptions;
  /** Minimum mean OCR word confidence to trust extraction. Default 0.5. */
  minOcrConfidence?: number;
  /** Max differing digits accepted as a fuzzy match. Default 2. */
  fuzzyTolerance?: number;
}

export interface VerifyOptions {
  signal?: AbortSignal;
}

/** Public SDK instance. */
export interface IdVerifier {
  verify(input: VerificationInput, options?: VerifyOptions): Promise<VerificationResult>;
  /** Optionally pre-load heavy assets (OCR WASM/traineddata). */
  warmup(): Promise<void>;
  /** Release WASM workers. */
  dispose(): Promise<void>;
}
