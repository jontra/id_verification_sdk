/**
 * Extractor contract + registry (extensibility seam).
 * Adding a new document type = implement Extractor + register it. See DESIGN.md §4.
 */
import type { AuthenticitySignal, DocumentType, Reason } from '../types.js';
import type { NormalizedImage } from '../image/image-input.js';

/** Shared services handed to an extractor (OCR engine, options, abort signal). */
export interface ExtractContext {
  signal?: AbortSignal;
  minOcrConfidence: number;
  /** OCR runner; injected so extractors don't own engine lifecycle. */
  ocr: OcrRunner;
}

/** Minimal OCR surface an extractor depends on (keeps Tesseract details out). */
export interface OcrRunner {
  recognize(
    image: NormalizedImage,
    opts?: { languages?: string[] },
  ): Promise<OcrResult>;
}

export interface OcrResult {
  text: string;
  /** Mean word confidence in [0, 1]. */
  confidence: number;
  words: OcrWord[];
}

export interface OcrWord {
  text: string;
  confidence: number;
}

export interface ExtractionOutput {
  /** Normalized extracted number, or null if none found. */
  number: string | null;
  /** Extraction confidence in [0, 1]. */
  confidence: number;
  /** Authenticity evidence the extractor observed. */
  signals: AuthenticitySignal[];
  reasons: Reason[];
}

export interface Extractor {
  readonly documentType: DocumentType;
  extract(image: NormalizedImage, ctx: ExtractContext): Promise<ExtractionOutput>;
}

/** Simple registry keyed by document type. */
export class ExtractorRegistry {
  private readonly map = new Map<DocumentType, Extractor>();

  register(extractor: Extractor): this {
    this.map.set(extractor.documentType, extractor);
    return this;
  }

  get(type: DocumentType): Extractor | undefined {
    return this.map.get(type);
  }
}
