# Identity Verification SDK

Verify an identity document against a claimed number — **entirely in the browser**. No image or document data ever leaves the device.

Supports three variants: **Israeli ID card**, **Israeli driver's license** (both → Israeli ID number), and **foreign passport** (→ passport number via MRZ).

> Architecture, design decisions, and trade-offs live in **[DESIGN.md](./DESIGN.md)**. This README is the consumer-facing summary.

## Features

- 🔒 **100% client-side** — OCR, parsing, and validation run in JS/WASM. Zero network during verification.
- 🪪 Extracts the document number, verifies it against the user's claimed number.
- ✅ Israeli ID **check-digit** validation; passport **MRZ** parsing.
- 🔁 **Fuzzy match** tolerating up to 2 differing digits (OCR-error aware).
- 📦 Framework-agnostic; ships with a minimal React demo.

## Privacy guarantee

The hard constraint: **no image/document data leaves the device.** No cloud OCR, no upload, no third-party API.

How it's enforced and made verifiable:
- All processing is local (Tesseract.js WASM + an in-browser MRZ parser).
- Model/WASM assets are **self-hosted** (same origin), never a runtime third-party CDN.
- A test asserts **zero** `fetch`/`XHR`/`sendBeacon` calls across a full `verify()`.

See [DESIGN.md § Privacy enforcement](./DESIGN.md#10-privacy-enforcement-must-be-demonstrable).

## Install

```bash
npm install id-verification-sdk
```

## Quick start

```ts
import { createIdVerifier } from 'id-verification-sdk';

const verifier = await createIdVerifier();

const result = await verifier.verify({
  documentType: 'id',          // 'id' | 'passport'
  claimedNumber: '123456782',
  image: file,                 // Blob | File | ImageData
});

if (result.decision === 'verified') {
  // authentic document AND number matches
}

verifier.dispose();            // free WASM workers when done
```

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

- **Passport** → locate + parse the **MRZ** (self-checksummed, deterministic).
- **ID / driver's license** → OCR (Tesseract.js) → find the 9-digit number → validate with the **Israeli check digit**.

The check digit both validates the number and serves as a strong authenticity signal. Details, pipeline diagram, and library choices: [DESIGN.md](./DESIGN.md#2-key-insight-driving-the-architecture).

## Fuzzy matching

Claimed vs. extracted numbers are compared with a **position-aware (Hamming) difference** on zero-padded digits; **0** = exact, **1–2** = fuzzy match, **>2** = mismatch. Chosen because OCR digit errors are overwhelmingly in-place substitutions. Rationale: [DESIGN.md § Fuzzy match rule](./DESIGN.md#7-fuzzy-match-rule-to-justify-in-readme).

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
