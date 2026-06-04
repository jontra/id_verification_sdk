# Implementation Plan

Build order + checklist. Detail lives in [DESIGN.md](./DESIGN.md). Boxes get ticked as work lands.

## Phase 0 — Project setup
- [x] `package.json`, TypeScript config, build (tsup → ESM + types)
- [x] Test runner (Vitest); lint/format deferred
- [x] Folder skeleton per [DESIGN.md §4](./DESIGN.md#4-module-structure)

## Phase 1 — Types & contracts
- [x] `types.ts` — `VerificationInput`, `VerificationResult`, `Decision`, `AuthenticityCertificate`, `NumberMatch`, `Reason`/`ReasonCode`
- [x] `Extractor` interface + `ExtractionOutput`
- [x] `utils/errors.ts` — typed errors + reason builders

## Phase 2 — Core logic (pure, no I/O — high test value)
- [x] `validation/israeli-id.ts` — check digit + normalize/pad — **tests** (7)
- [x] `matching/fuzzy-match.ts` — position-aware Hamming, ≤2 tolerance — **tests** (8)
- [x] `mrz/mrz-parse.ts` — wrap `mrz` lib → `{country, number, checks}` — **tests** (4)
- [x] `utils/confidence.ts` — combine sub-confidences

## Phase 3 — Image & OCR
- [x] `image/image-input.ts` — `Blob|File|ImageData` → `NormalizedImage` (DIY decode + EXIF + size cap)
- [x] `ocr/ocr-engine.ts` — Tesseract.js wrapper (init/warmup/recognize/dispose, self-hosted assets)
- [x] `ocr/preprocess.ts` — grayscale / Otsu threshold — **tests** (3)

## Phase 4 — Extractors
- [x] `extractors/extractor.ts` — registry (built in Phase 1)
- [x] `extractors/passport-mrz.extractor.ts` — locate band → OCR → parse
- [x] `extractors/israeli-id.extractor.ts` — OCR → 9-digit runs → check-digit filter — **tests** (8)
- [x] `mrz/mrz-locate.ts` — find MRZ lines in OCR text (+ grouping)

## Phase 5 — Authenticity & assembly
- [x] `authenticity/signals.ts` + `authenticity.ts` — weighted signals → certificate
- [x] `sdk.ts` — `createIdVerifier()`, lifecycle, `verify()` flow (extract → authenticate → match → shape)
- [x] `index.ts` — public exports; library builds (ESM + d.ts)
- [x] **tests** — result shaping per `Decision` branch; reason codes present (10)

## Phase 6 — Privacy & cross-browser
- [x] **test** — zero `fetch`/`XHR`/`sendBeacon` during `verify()`
- [ ] Verify Chrome + Safari (image decode + Tesseract worker load) — _pending: needs real browsers; check via the demo_

## Phase 7 — Demo & docs
- [x] React demo SPA (upload + number + type → result viewer); bundles clean
- [x] Fill README placeholders (package name `id-verification-sdk`, license UNLICENSED)

## Phase 8 — STRETCH (only if time permits) — [DESIGN.md §14](./DESIGN.md#14-stretch--on-device-detector-does-it-look-like-a-real-id)
- [ ] `detector/` — ONNX Runtime Web + `id-card-yolo`; `id_structure` / `face_present` signals

## Phase 9 — Real-photo robustness (validated against actual phone photos; see [DESIGN.md §9 Findings](./DESIGN.md#9-ocr-engines--library-choices-justify-in-readme))

Validated in Node: PaddleOCR reads `034521971` from the casual ID-card/licence photos that defeated Tesseract; Tesseract+MRZ-charset reads passport MRZ line 2 (passport no. `22441264` + valid check digit). Now productionize:

- [x] Switch fuzzy match → **Levenshtein ≤2** (tolerates OCR insert/drop, e.g. `224412264` vs `22441264`) — **tests**
- [x] **PaddleOCR engine** (`PaddleOcrEngine`): PP-OCR via injected detector (`@gutenye/ocr-browser`); implements `OcrRunner`; public `ocrEngine` option. **tests** (line-join)
- [x] **Passport MRZ (robust)**: reused PaddleOCR — `findMrzCandidates` + tolerant `parseTd3Line2`; returns passport number **and** national ID; check-digit validated. **tests**
- [x] Wire engine via public `ocrEngine` option; demo injects PaddleOCR. All 3 types verify in the demo.
- [x] **Integration test** (PaddleOCR via `@gutenye/ocr-node`) on the specimen; real images validated manually (gitignored for privacy).
- [x] Demo: self-hosted PP-OCR models (`/assets`); ORT wasm via CDN (dev) — production self-host pending.
- [x] Cleanup: removed `@zxing/library`, `zxing-wasm`; `sharp`/`@gutenye/ocr-node` kept dev-only.
- [x] **Orientation-retry** (shared, 0/90/270/180): `verify()` retries rotations, keeps best read, early-exits on a checksum-valid number. Works for left/right-rotated captures.
- [ ] Self-host ORT wasm in the demo (Vite asset-copy) for full no-CDN privacy.
