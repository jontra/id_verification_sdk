# Implementation Plan

Build order + checklist. Detail lives in [DESIGN.md](./DESIGN.md). Boxes get ticked as work lands.

## Phase 0 — Project setup
- [ ] `package.json`, TypeScript config, build (tsup/Vite lib mode → ESM + types)
- [ ] Test runner (Vitest), lint/format
- [ ] Folder skeleton per [DESIGN.md §4](./DESIGN.md#4-module-structure)

## Phase 1 — Types & contracts
- [ ] `types.ts` — `VerificationInput`, `VerificationResult`, `Decision`, `AuthenticityCertificate`, `NumberMatch`, `Reason`/`ReasonCode`
- [ ] `Extractor` interface + `ExtractionOutput`
- [ ] `utils/errors.ts` — typed errors + reason builders

## Phase 2 — Core logic (pure, no I/O — high test value)
- [ ] `validation/israeli-id.ts` — check digit + normalize/pad — **tests**
- [ ] `matching/fuzzy-match.ts` — position-aware Hamming, ≤2 tolerance — **tests**
- [ ] `mrz/mrz-parse.ts` — wrap `mrz` lib → `{country, number, checks}` — **tests**
- [ ] `utils/confidence.ts` — combine sub-confidences

## Phase 3 — Image & OCR
- [ ] `image/image-input.ts` — `Blob|File|ImageData` → `NormalizedImage` (DIY decode + EXIF + size cap)
- [ ] `ocr/ocr-engine.ts` — Tesseract.js wrapper (init/warmup/recognize/dispose, self-hosted assets)
- [ ] `ocr/preprocess.ts` — grayscale / threshold / resize / light deskew

## Phase 4 — Extractors
- [ ] `extractors/extractor.ts` — registry
- [ ] `extractors/passport-mrz.extractor.ts` — locate band → OCR → parse
- [ ] `extractors/israeli-id.extractor.ts` — OCR → 9-digit runs → check-digit filter
- [ ] `mrz/mrz-locate.ts` — find MRZ band region

## Phase 5 — Authenticity & assembly
- [ ] `authenticity/signals.ts` + `authenticity.ts` — weighted signals → certificate
- [ ] `sdk.ts` — `createIdVerifier()`, lifecycle, `verify()` flow (extract → authenticate → match → shape)
- [ ] `index.ts` — public exports
- [ ] **tests** — result shaping per `Decision` branch; reason codes present

## Phase 6 — Privacy & cross-browser
- [ ] **test** — zero `fetch`/`XHR`/`sendBeacon` during `verify()`
- [ ] Verify Chrome + Safari (image decode + Tesseract worker load)

## Phase 7 — Demo & docs
- [ ] React demo SPA (upload + number + type → result viewer)
- [ ] Fill README placeholders (package name, scripts, license)

## Phase 8 — STRETCH (only if time permits) — [DESIGN.md §14](./DESIGN.md#14-stretch--on-device-detector-does-it-look-like-a-real-id)
- [ ] `detector/` — ONNX Runtime Web + `id-card-yolo`; `id_structure` / `face_present` signals
