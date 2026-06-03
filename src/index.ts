/** Public API for the Identity Verification SDK. */

export { createIdVerifier, SDK_VERSION } from './sdk.js';
export { SdkInputError } from './utils/errors.js';
export { PaddleOcrEngine } from './ocr/paddle-ocr-engine.js';
export type {
  PaddleDetector,
  PaddleDetectorFactory,
  DetectedLine,
} from './ocr/paddle-ocr-engine.js';

export type {
  DocumentType,
  ImageInput,
  VerificationInput,
  VerificationResult,
  VerificationMeta,
  Decision,
  AuthenticityCertificate,
  AuthenticitySignal,
  AuthenticitySignalKind,
  NumberMatch,
  MatchMode,
  Reason,
  ReasonCode,
  ReasonSeverity,
  OcrOptions,
  IdVerifierOptions,
  VerifyOptions,
  IdVerifier,
} from './types.js';
