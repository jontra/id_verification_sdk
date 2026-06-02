# Design — Client-Side Identity Verification SDK

> Living design doc. We iterate here before writing code.
> Source requirements: [`clide_side_sdk.md`](./clide_side_sdk.md).

## 1. Goals & non-goals

**Goals**
- TS SDK, **100% client-side** (no image/data leaves device), works in Chrome + Safari desktop.
- Verify a *claimed* number against a document photo for 3 variants:
  1. Israeli ID card → Israeli 9-digit ID
  2. Israeli driver's license → Israeli 9-digit ID
  3. Foreign passport → passport number (MRZ)
- Return a structured, discriminated result: **authentic+matched / authentic+mismatch / not-authentic / error**, with confidence + reasons.
- Fuzzy match: accept ≤ 2 differing digits (rule defined in Section 7).
- Clean, framework-agnostic API, embeddable in a React SPA. Ship a demo.

**Non-goals (this assignment)**
- Live camera auto-capture (out of scope; still image only).
- Real anti-forgery / hologram / security-feature detection. Authenticity is an **honest heuristic** (Section 6).
- Server-side anything. No network during `verify()`.

## 2. Key insight driving the architecture

There are **two extraction regimes**, and they have very different reliability:

| Variant | Machine-readable? | Extraction | Reliability |
| :-- | :-- | :-- | :-- |
| Passport | **Yes — MRZ (TD3)** | parse MRZ band | High, deterministic, self-checksummed |
| Israeli ID card | No | OCR + check digit | Medium, OCR-dependent |
| Israeli driver's license | No | OCR + check digit | Medium, OCR-dependent |

So `documentType: 'passport'` → MRZ path. `documentType: 'id'` → OCR path (covers **both** ID card and driver's license — both just yield the same 9-digit Israeli ID, so we don't need to distinguish them).

The **Israeli check digit** is the linchpin: it both validates the extracted number *and* is our strongest cheap authenticity signal for the OCR path. A 9-digit run that OCRs *and* passes the checksum is very unlikely to be noise.

## 3. Public API

Factory pattern, because OCR (WASM + language data) and the MRZ parser must load **once** and be reused.

```ts
import { createIdVerifier } from '@org/id-verification-sdk';

const verifier = await createIdVerifier({
  // all optional, sensible defaults
  ocr?: { languages?: string[]; modelBaseUrl?: string };   // self-hosted traineddata
  minOcrConfidence?: number;        // default 0.5
  fuzzyTolerance?: number;          // default 2 (max differing digits)
});

const result = await verifier.verify(input, { signal?: AbortSignal });

verifier.dispose();   // free WASM workers
```

### Input

```ts
type DocumentType = 'id' | 'passport';
type ImageInput = Blob | File | ImageData;

interface VerificationInput {
  documentType: DocumentType;
  claimedNumber: string;
  image: ImageInput;
}
```

### Result (discriminated, but flat enough to consume)

```ts
type Decision = 'verified' | 'mismatch' | 'not_authentic' | 'error';

interface VerificationResult {
  decision: Decision;                 // primary discriminant
  overallConfidence: number;          // 0..1
  authenticity: AuthenticityCertificate;
  numberMatch: NumberMatch;
  reasons: Reason[];                  // structured, esp. for rejections
  meta: {
    documentType: DocumentType;
    sdkVersion: string;
    processedAt: string;              // ISO
    durationMs: number;
  };
}
```

**Decision derivation (single source of truth):**
- `error` — could not process (bad image, no number found, OCR failed). Never fake a pass.
- `not_authentic` — `authenticity.authentic === false`.
- `mismatch` — authentic **and** number did not match (incl. > tolerance).
- `verified` — authentic **and** number matched (exact or fuzzy).

### Authenticity certificate

```ts
interface AuthenticityCertificate {
  authentic: boolean;
  confidence: number;                 // 0..1
  signals: AuthenticitySignal[];      // what contributed + weights
  issuedAt: string;
}

interface AuthenticitySignal {
  kind: 'mrz_present' | 'mrz_checksums_valid' | 'check_digit_valid'
      | 'keywords_found' | 'ocr_quality' | 'aspect_ratio';
  passed: boolean;
  weight: number;
  detail?: string;
}
```

### Number match

```ts
interface NumberMatch {
  matched: boolean;
  mode: 'exact' | 'fuzzy' | 'none';
  digitDifference: number;            // count of differing digits
  extractedNumber: string | null;     // normalized, post-OCR
  claimedNumber: string;              // normalized
  confidence: number;
}
```

### Reasons

```ts
interface Reason {
  code: ReasonCode;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

type ReasonCode =
  | 'MRZ_NOT_FOUND' | 'MRZ_CHECKSUM_FAILED'
  | 'CHECK_DIGIT_INVALID' | 'NO_NUMBER_FOUND'
  | 'LOW_OCR_CONFIDENCE' | 'IMAGE_DECODE_FAILED'
  | 'NUMBER_MISMATCH' | 'FUZZY_WITHIN_TOLERANCE'
  | 'INSUFFICIENT_AUTH_SIGNALS' | 'UNSUPPORTED_INPUT';
```

> Throws (programmer errors): invalid `documentType`, empty `claimedNumber`, undecodable argument type. Processing failures → `decision: 'error'` result, **not** a throw.

## 4. Module structure

```
src/
  index.ts                     // public exports only
  sdk.ts                       // createIdVerifier(), lifecycle, + verify()
                               //   per-call flow: extract → authenticate → match → shape
                               //   (extract to its own file only if it outgrows sdk.ts)
  types.ts                     // all public types (Section 3)

  extractors/
    extractor.ts               // Extractor interface + registry (extensibility seam)
    passport-mrz.extractor.ts  // documentType 'passport'
    israeli-id.extractor.ts    // documentType 'id' (ID card + driver's license)

  ocr/
    ocr-engine.ts              // Tesseract.js wrapper: init/warmup, recognize, dispose
                               //   uses PSM.AUTO (see note below); no pre-binarization

  mrz/
    mrz-locate.ts              // find the MRZ band region
    mrz-parse.ts               // wrap `mrz` lib → {country, number, checks}

  validation/
    israeli-id.ts              // 9-digit check-digit algorithm (+ normalize/pad)

  authenticity/
    authenticity.ts            // combine signals → certificate (weighted)
    signals.ts                 // individual signal detectors

  detector/                    // STRETCH (Section 14) — implement last, if time permits
    detector.ts                // ONNX Runtime Web + id-card-yolo: card/face/text regions
    postprocess.ts             // NMS + map detections → id_structure / face_present signal

  matching/
    fuzzy-match.ts             // position-aware digit diff, tolerance (Section 7)

  image/
    image-input.ts             // Blob|File|ImageData → ImageData/canvas (cross-browser)

  utils/
    confidence.ts              // combine sub-confidences
    errors.ts                  // typed errors + reason builders

demo/                          // React SPA (upload, number, type, result viewer)
test/                          // unit tests (check digit, fuzzy, parse, result shaping)
```

**Extensibility seam:** `Extractor` interface + registry. Adding a new document type = add an extractor + register it; the `verify()` flow, authenticity, matching, and result shaping are untouched. This is the "extensible to new document types" the eval criteria wants.

```ts
interface Extractor {
  readonly documentType: DocumentType;
  extract(image: NormalizedImage, ctx: ExtractCtx): Promise<ExtractionOutput>;
}

interface ExtractionOutput {
  candidates: string[];           // ALL number strings found — extractor does not pick or compare
  confidence: number;             // extraction confidence
  signals: AuthenticitySignal[];  // claim-independent authenticity evidence
  reasons: Reason[];
}
```

**Separation of concerns (important):** the extractor only *finds* number strings; it does not decide which is "the" number, validate it against the claim, or pick by check digit. A document often shows several numbers (e.g. an Israeli licence prints both the ID and the licence number). The **flow** does claim-aware selection — it picks the candidate with the smallest fuzzy distance to the claimed number — so the right one is chosen without the extractor knowing anything about the claim. Validity (check digit / MRZ checksum) is reported only as a claim-independent **authenticity signal**, not used to pick the number.

## 5. Pipeline flow

```
verify(input)
  1. normalize image           image/image-input.ts   → NormalizedImage (or IMAGE_DECODE_FAILED)
  2. select extractor          extractors/registry    → by documentType
  3. extract                   extractor.extract()    → {candidates[], confidence, signals, reasons}
       passport → MRZ locate → OCR → mrz-parse → [documentNumber]
       id       → OCR full page (PSM.AUTO) → all digit runs as candidates
  4. authenticity              authenticity.ts        → certificate (weighted signals)
  5. select + number match     fuzzy-match.ts         → candidate closest to claim → {matched, mode, digitDifference}
  6. derive decision + shape   verify()               → VerificationResult
```

If step 3 finds no usable number → `decision: 'error'`, reason `NO_NUMBER_FOUND` (no silent fallback).

## 6. Authenticity heuristic (be explicit about limits)

Weighted signal sum → `confidence`; `authentic = confidence >= threshold`.

**Passport path signals**
- `mrz_present` — a TD3 band was located.
- `mrz_checksums_valid` — MRZ field check digits pass (strong; the `mrz` lib computes these).

**Israeli ID path signals**
- `check_digit_valid` — extracted 9-digit number passes Israeli checksum (strong).
- `keywords_found` — Hebrew/English markers (`תעודת זהות`, `רישיון נהיגה`, `ISRAEL`).
- `ocr_quality` — mean OCR word confidence above floor.
- `aspect_ratio` — image roughly card/passport-shaped (weak).

**Optional visual signals (STRETCH, Section 14 — only if the detector is implemented)**
- `id_structure` — detector found the visual layout of an ID (card boundary + expected regions).
- `face_present` — a portrait/photo region was detected. **High weight**: defeats the pen-and-paper / text-only-paper forgery, which has no face. When the detector is enabled, absence of a face fails authenticity for the `id` path.

These signals are added to the `AuthenticitySignal.kind` union only if/when the detector ships; the baseline (OCR + check digit) works without them.

**What this does NOT guarantee (state in README):** even with the detector, it confirms the image *looks like* an ID (layout + face), not that the document is genuine — a realistic printout or photoshopped template can still pass. It does not detect forgery, photo substitution, holograms, or a screenshot of a real document. It asserts "the image presents as a valid-structured ID/passport with a self-consistent number," nothing more.

## 7. Fuzzy match rule (to justify in README)

1. **Normalize** both claimed and extracted to digits only; for Israeli ID, left-pad to canonical length 9.
2. **Length differs after normalization** → strong mismatch; `digitDifference = max(lenA, lenB)` (capped), `mode: 'none'`.
3. **Same length** → **position-aware (Hamming) difference**: count positions where digits differ.
4. `digitDifference === 0` → `exact`. `1..tolerance(=2)` → `fuzzy`. `> tolerance` → `none` (mismatch).

**Why position-aware, not Levenshtein:** OCR digit errors are overwhelmingly *substitutions in place* (8↔0, 1↔7), not insertions/deletions. Levenshtein would let a shifted sequence match too cheaply and create false accepts; position-aware Hamming on equal-length, zero-padded numbers reflects the real error model and is stricter. (Open question: do we want a small Levenshtein allowance for a single missing/extra digit? — discuss.)

## 8. Authenticity certificate — structured assertion only

The certificate is a **structured assertion** (the `AuthenticityCertificate` object): verdict + confidence + the signals behind it. **No cryptographic signature for now.**

Rationale: client-side signing can't be a trust anchor — the key would ship in the bundle, so anyone could forge it. A signature would only prove integrity *within* the app, not real attestation. Not worth the complexity for this assignment. (Signing — embedded-key HMAC or a consumer-injected signer — is a documented future option if a backend trust anchor is ever added.)

## 9. Library choices (justify in README)

| Concern | Choice | License | Note |
| :-- | :-- | :-- | :-- |
| OCR | **Tesseract.js** (WASM) | Apache-2.0 | `heb`+`eng` traineddata, self-hosted (privacy) |
| MRZ parse | **`mrz`** (npm) | MIT | pure parser; we feed OCR'd band text |
| MRZ band OCR | Tesseract `eng` / OCR-B | — | reuse OCR engine on located band |
| Build | tsup / Vite lib mode | — | ESM + types |
| Demo | Vite + React | — | minimal upload→result page |

**OCR configuration (learned from real photos):**
- **Page segmentation = `PSM.AUTO`.** Tesseract.js defaults to `SINGLE_BLOCK`, which assumes one uniform block of text and fails on multi-field ID/licence layouts — especially angled real-world photos (it returned zero digits on a real licence). `AUTO` segments the page into regions and reliably finds the document number.
- **No pre-binarization.** We feed Tesseract the decoded image and rely on its internal adaptive binarization. A global Otsu threshold (an earlier idea) hurts on uneven lighting / busy backgrounds; Tesseract's adaptive method is better. (This is why there is no `preprocess.ts`.)
- **Known limit:** heavily rotated / cropped-out / low-contrast captures still read poorly. Robustness there needs document detection + deskew/crop — overlaps with the Section 14 stretch detector and is out of baseline scope.

**Baseline (v1) ships without an on-device detector** — authenticity is the heuristic in Section 6. The detector is a **stretch goal (Section 14)**, implemented last if time permits, and added via these libs:

| Concern | Choice | License | Note |
| :-- | :-- | :-- | :-- |
| Detector runtime | **ONNX Runtime Web** | MIT | WASM backend works in Chrome + Safari |
| Detector model | **`id-card-yolo`** (ONNX) | AGPL-3.0 ⚠️ | regions: card / face / barcode / text |

Trade-offs to document: **AGPL** (fine for the assignment; commercial use needs an Ultralytics commercial license or a permissive model — RT-DETR / YOLO-NAS / self-trained); **bundle/cold-start** (~few MB ORT-Web WASM + 3–15 MB model, loaded lazily at warmup); **self-hosted** model files (keeps the no-upload privacy guarantee intact).

## 10. Privacy enforcement (must be demonstrable)

- **Zero network in `verify()`.** All deps bundled or loaded at `createIdVerifier()` from same origin; no `fetch`/`XHR`/`sendBeacon` during verification.
- Traineddata/WASM **self-hosted**, never a third-party CDN at runtime.
- **Test**: spy on `fetch`/`XMLHttpRequest`/`navigator.sendBeacon` and assert zero calls across a full `verify()`. README points to this test as the proof.

## 11. Cross-browser notes

- Image decode via `createImageBitmap` + `OffscreenCanvas` where available; fall back to `<canvas>` (Safari quirks). Centralized in `image/image-input.ts`.
- Tesseract.js workers: verify worker/WASM loading config works under Safari.

### Image normalization — `NormalizedImage` and buy-vs-build

`image/image-input.ts` turns the `Blob | File | ImageData` union into one uniform decoded form:

```ts
interface NormalizedImage {
  pixels: ImageData;                              // RGBA — accepted by Tesseract, canvas, ONNX preprocessing
  width: number;
  height: number;
  canvas?: HTMLCanvasElement | OffscreenCanvas;   // reused downstream so we don't redraw
}
```

Flow: `ImageData` → pass through; `Blob`/`File` → decode to pixels, apply **EXIF orientation**, cap to a max dimension (~2000px) for memory/perf, then `getImageData`. Decode failure → typed error → `IMAGE_DECODE_FAILED` (no silent fallback).

**Decision: DIY decode, with `blueimp-load-image` (MIT) as the fallback option.**

Rationale — DIY is cheap *because the target is narrow* (desktop Chrome + Safari only):
- Modern browsers handle the hard part natively: `createImageBitmap(blob, { imageOrientation: 'from-image' })` applies EXIF orientation (Safari 16+, Chrome). The from-scratch code is ~40 lines, mostly the older-Safari `HTMLImageElement` + objectURL fallback.
- Fewer deps = smaller bundle + cleaner privacy story (one less third-party package to vet/self-host).
- Decode isn't where the assignment's risk or grade lives (that's check-digit / MRZ / fuzzy match / result shaping).

When to switch to **`blueimp-load-image`** instead: if the Safari fallback path gets fiddly, or we'd rather spend the time box on verification logic than canvas-orientation quirks. It does `File/Blob` → canvas + EXIF orientation + resize in one. Alternatives if only one concern arises: **`exifr`** (orientation only), **`pica`** (high-quality downscale). Either DIY or blueimp is a defensible, low-risk choice for this scope.

### Supported formats & HEIC (future work)

**Supported: JPEG, PNG, WebP** — formats both target browsers decode natively via `createImageBitmap`/canvas. **HEIC** (default iPhone format) is intentionally **out of scope**: Chrome has no HEIC codec, so decode throws and we surface `IMAGE_DECODE_FAILED`. (Safari can decode HEIC natively, so behavior would otherwise be inconsistent across the two target browsers.) The demo's file picker is restricted to the supported types and rejects others with an explicit message; the SDK fails fast — never a silent pass.

**To add HEIC support later** (all client-side, preserves the no-upload guarantee):
1. Add a WASM HEIC decoder — **`heic2any`** (wraps **libheif**). Note **libheif is LGPL** (cf. the AGPL note for the YOLO detector in Section 9) — fine to use, but flag it if statically bundling into a closed product.
2. In `image/image-input.ts`, before the existing decode, detect HEIC (`type` is `image/heic`/`image/heif`, or a `.heic`/`.heif` filename) and convert:
   ```ts
   if (isHeic(input)) input = await heic2any({ blob: input, toType: 'image/jpeg' });
   // …then fall through to the normal createImageBitmap/canvas path
   ```
3. **Lazy-import** `heic2any` so the multi-MB WASM only loads when a HEIC is actually provided (zero cost for the common JPEG/PNG path).

Trade-offs: libheif WASM adds a few MB; conversion is an extra decode + JPEG re-encode (lossy, slower) before OCR. Cheaper non-goal alternative: keep the explicit "convert to JPEG/PNG" error and let users/iOS handle conversion.

## 12. Open questions (to resolve while iterating)

1. Fuzzy match — allow a single insert/delete (Levenshtein-1) or strict Hamming only?
2. Authenticity threshold + per-signal weights — set now or tune against sample images?
3. Should `id` extractor try to *classify* ID-card vs driver's-license (for better keyword signals), or stay agnostic?
4. Do we expose intermediate artifacts (OCR text, located MRZ) in the result for debugging, behind a `debug` flag?

## 13. Test plan (deliverable)

- Israeli check digit: known-valid + known-invalid numbers, padding edge cases.
- Fuzzy match: 0/1/2/3 diff, length mismatch, non-digit junk.
- MRZ parse: valid TD3 sample, corrupted checksum.
- Result shaping: each `Decision` branch, reason codes present.
- Privacy: no-network assertion during `verify()`.

## 14. STRETCH — on-device detector ("does it look like a real ID?")

> **Implement last, only if time permits, after everything else works.** The baseline must ship and pass eval without this.

**Motivation.** The OCR baseline can be fooled by a hand-written / printed paper that just contains a checksum-valid number and the right keywords (the check digit is a public formula). A visual detector raises the forgery bar by requiring the *structure* of an ID — most importantly a **portrait/face region**, which pen-and-paper text lacks.

**Approach.**
- `id-card-yolo` (ONNX) via ONNX Runtime Web, self-hosted, lazy-loaded at `warmup()`.
- Run on the `id` path; produce detections → NMS → map to authenticity signals:
  - `id_structure` (card boundary + expected regions present)
  - `face_present` (**high weight**; no face → authenticity fails for `id`)
- Pluggable + optional: enabled via an SDK option (e.g. `detector: 'id-card-yolo' | false`), default off so the baseline stays light. Adds the two `kind`s to the signal union when enabled.

**Honest limits (carry into README).** Confirms *looks like an ID* (layout + face), **not** genuineness — a realistic printout or photoshopped template still passes. No hologram/UV/microprint/liveness detection; those are infeasible from a single still client-side and remain non-goals.

**Costs.** AGPL model license; ~few MB ORT-Web WASM + 3–15 MB model on first warmup; extra Safari/Chrome verification of the ORT-Web WASM load path.
