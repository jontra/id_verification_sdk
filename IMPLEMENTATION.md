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
- [ ] Fill README placeholders (package name, license) — _intentionally left as placeholders per request_

## Phase 8 — STRETCH (only if time permits) — [DESIGN.md §14](./DESIGN.md#14-stretch--on-device-detector-does-it-look-like-a-real-id)
- [ ] `detector/` — ONNX Runtime Web + `id-card-yolo`; `id_structure` / `face_present` signals
