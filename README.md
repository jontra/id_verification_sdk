# Identity Verification SDK

Verify an identity document against a claimed number — **entirely in the browser**. No image or document data ever leaves the device.

Supports three variants: **Israeli ID card**, **Israeli driver's license** (both → Israeli ID number), and **foreign passport** (→ passport number via MRZ).

> Architecture, design decisions, and trade-offs live in **[DESIGN.md](./DESIGN.md)**. This README is the consumer-facing summary.

## How extraction works (overview)

A single `verify()` call runs this pipeline, entirely in the browser:

1. **Decode** the photo (`Blob`/`File`/`ImageData`) to pixels, applying EXIF orientation.
2. **Read text with on-device OCR.** For an ID card / driver's license, **PaddleOCR (PP-OCR)** — a learned text *detector* + recognizer running on ONNX Runtime Web — locates and reads the text even on cluttered, guilloché, angled real-world photos (where classical OCR fails to *find* the number). For a passport, the same engine reads the **MRZ**.
3. **Collect candidate numbers** from the OCR text — all digit runs for an ID (a card shows several numbers); for a passport, the passport number and national ID parsed by position from MRZ line 2.
4. **Pick by the claim.** The flow selects the candidate with the smallest edit distance to the user's claimed number (claim-aware selection) and fuzzy-matches it (Levenshtein ≤ 2).
5. **Validate authenticity** from check digits / MRZ checksums plus document keywords — a weighted heuristic.
6. **Shape the result** into a discriminated `decision`: `verified` / `mismatch` / `not_authentic` / `error`, with confidence and reasons.

Details and the rationale for each choice are in the sections below and in [DESIGN.md](./DESIGN.md).

## Features

- 🔒 **Image never leaves the device** — OCR, parsing, and validation run locally in JS/WASM. No upload, no cloud OCR.
- 🪪 Reads real, casual phone photos: **PaddleOCR (PP-OCR)** via ONNX Runtime Web localizes the number on cluttered/guilloché/rotated cards.
- ✅ Israeli ID **check-digit** validation; passport **MRZ** (tolerant TD3 line-2) parsing.
- 🔁 **Fuzzy match** (Levenshtein ≤ 2 edits) — OCR insert/drop tolerant.
- 🧩 Engine-agnostic (`OcrRunner`); claim-aware candidate selection; discriminated result.
- 📦 Framework-agnostic; ships with a minimal React demo.

## Privacy guarantee

The hard constraint: **the document image never leaves the device.** No cloud OCR, no upload — all recognition runs locally on the pixels (PP-OCR via ONNX Runtime Web; Tesseract + an in-browser MRZ parser for passports).

How it's enforced and made verifiable:
- **Zero network during `verify()`** — a test spies on `fetch`/`XHR`/`sendBeacon` and asserts no calls across a full verification.
- The only network is **one-time model/runtime asset loading at `warmup()`** (not image data). The SDK supports serving these **same-origin** (self-hosted) — the demo serves the PP-OCR models from `/assets`. ⚠️ The demo currently loads the onnxruntime-web *wasm* from a CDN for dev convenience; **production should self-host it too** (see [DESIGN.md §9/§10](./DESIGN.md#9-ocr-engines--library-choices-justify-in-readme)).

See [DESIGN.md § Privacy enforcement](./DESIGN.md#10-privacy-enforcement-must-be-demonstrable).

## Install

```bash
npm install id-verification-sdk
```

## Quick start

```ts
import { createIdVerifier, PaddleOcrEngine } from 'id-verification-sdk';

// Inject the PP-OCR engine (recommended — reads real card photos). Models and
// the ONNX runtime should be self-hosted; see demo/App.tsx for full wiring.
const ocrEngine = new PaddleOcrEngine(async () => {
  const Ocr = (await import('@gutenye/ocr-browser')).default;
  return Ocr.create({ models: { detectionPath, recognitionPath, dictionaryPath } });
});

const verifier = createIdVerifier({ ocrEngine });   // synchronous; assets load lazily
await verifier.warmup();                             // optional: preload models

const result = await verifier.verify({
  documentType: 'id',          // 'id' | 'passport'
  claimedNumber: '012345678',
  image: file,                 // Blob | File | ImageData
});

if (result.decision === 'verified') {
  // authentic document AND number matches
}

await verifier.dispose();
```

> Without an injected `ocrEngine`, the SDK falls back to a built-in Tesseract engine — fine for clean scans, but PaddleOCR is what reads casual real-world photos. The [demo](#demo) shows the complete browser wiring (model paths + ONNX wasm).

## Result

`verify()` resolves to a structured `VerificationResult`. The primary field is `decision`:

| `decision` | Meaning | Consumer action |
| :-- | :-- | :-- |
| `verified` | Authentic **and** number matches (exact or fuzzy) | Accept |
| `mismatch` | Authentic, but the number does not match | Reject / ask to re-check number |
| `not_authentic` | Did not pass authenticity heuristic | Reject |
| `error` | Could not process (bad image, no number found, …) | Ask to retry; never treated as valid |

It also carries `authenticity` (certificate + confidence + signals), `numberMatch` (mode + digit-difference), and structured `reasons`. Full types in [DESIGN.md § Public API](./DESIGN.md#3-public-api).

## How it works

Two extraction regimes, chosen by `documentType`:

- **ID card / driver's license** (`'id'`) → **PaddleOCR (PP-OCR)** localizes + reads text on the card → collect digit-run candidates → validate with the **Israeli check digit**.
- **Passport** (`'passport'`) → PaddleOCR reads the **MRZ**, parsed **tolerantly** from TD3 line 2 (passport number + check digit, *and* the national ID in the personal-number field — so either can be claimed).

The extractor only *finds* candidate numbers; the flow does **claim-aware selection** (the candidate closest to the claimed number wins) — so a card showing several numbers (e.g. ID + licence number) resolves correctly. Check digit / MRZ checksum feed authenticity, not selection. Details and the "why PaddleOCR" findings: [DESIGN.md §9](./DESIGN.md#9-ocr-engines--library-choices-justify-in-readme).

## Fuzzy matching

Claimed vs. extracted numbers are compared by **Levenshtein edit distance** (after normalizing — digits + left-pad to 9 for Israeli IDs, alphanumeric for passports): **0** = exact, **1–2** = fuzzy match, **>2** = mismatch. Edit distance (not Hamming) because real OCR errors include inserted/dropped characters, not just substitutions. Rationale: [DESIGN.md § Fuzzy match rule](./DESIGN.md#7-fuzzy-match-rule-to-justify-in-readme).

## Authenticity — what it does and does not guarantee

Authenticity is a **heuristic** (valid number + document keywords + OCR quality). It confirms the image *presents as* a valid-structured ID/passport with a self-consistent number.

It does **not** detect forgery, photo substitution, holograms, or a printed/screenshot copy — and a hand-made document with a checksum-valid number can pass. Treat the result as plausibility screening, not proof of genuineness. Full threat discussion: [DESIGN.md § Authenticity heuristic](./DESIGN.md#6-authenticity-heuristic-be-explicit-about-limits).

**Planned extension:** an optional on-device object detector (YOLO via ONNX Runtime Web) that checks the image actually *looks like* an ID — card layout plus a **portrait/face region**. This raises the bar against text-only forgeries (e.g. pen-and-paper), since a scribbled page has no face to detect. It still confirms "looks like an ID," not genuineness.

Beyond a generic detector, the model could be **fine-tuned on Israeli ID cards and driver's licenses** to recognize the specific template (expected layout and field positions) — strengthening the authenticity check and letting us crop the ID-number region for more reliable OCR. The main blocker is data: this requires a labeled dataset of real Israeli IDs, which is privacy-sensitive and hard to source. Details: [DESIGN.md § STRETCH — on-device detector](./DESIGN.md#14-stretch--on-device-detector-does-it-look-like-a-real-id).

## Browser support

Desktop **Chrome** and **Safari**. Uses `createImageBitmap`/`OffscreenCanvas` with a `<canvas>` fallback for Safari. See [DESIGN.md § Cross-browser notes](./DESIGN.md#11-cross-browser-notes).

### Supported image formats

**JPEG, PNG, WebP** — formats both target browsers decode natively. **HEIC** (the default iPhone format) is **not supported**: Chrome cannot decode it, so pass JPEG/PNG/WebP instead. Unsupported inputs fail fast with an explicit error (`IMAGE_DECODE_FAILED`) — never a silent pass. The demo's file picker is restricted to the supported types.

## Demo

A minimal React SPA to upload a document, enter a number, pick a type, and see the result.

```bash
npm install
npm run demo
```

## Development

```bash
npm test          # unit tests (check digit, fuzzy match, MRZ parse, result shaping)
npm run build     # build the library
```

## License

UNLICENSED — proprietary. Not licensed for redistribution.
