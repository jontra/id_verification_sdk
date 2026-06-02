# Home Assignment — Client-Side Identity Verification SDK

## Overview

Build a TypeScript SDK that performs **identity document verification entirely in the browser**. The SDK accepts a claimed ID number and a photo of an identity document, then verifies that the document is authentic and that the claimed number matches the document.

**Hard constraint:** all processing (OCR, validation, image analysis) must run client-side. **No image or document data may ever leave the device.** This rules out cloud OCR/verification APIs — the work happens in JS/WASM in the browser.

The SDK will later power our community onboarding identity verification flow (the production integration will reuse the same SDK without the auto-capture step), so the public API should be clean, framework-agnostic, and embeddable in a React SPA.

## Inputs

A single verification call receives:

| Field | Type | Description |
| :---- | :---- | :---- |
| `documentType` | `'id' | 'passport'` | Which document the user is submitting |
| `claimedNumber` | `string` | The Israeli ID number or passport number the user claims |
| `image` | `Blob | File | ImageData` | A photo of the document |

Supported document variants:

1. **Israeli driver's license** — extract the Israeli ID number from it.  
2. **Israeli ID card** — extract the Israeli ID number from it.  
3. **Foreign passport** — extract the passport number (MRZ).

## Required Capabilities

1. **Extract** the Israeli ID number from an Israeli driver's license.  
2. **Extract** the Israeli ID number from an Israeli ID card.  
3. **Extract** the passport number from a foreign passport.  
4. **Verify** the claimed number matches the extracted number.  
5. **Validate** that the uploaded photo is a genuine ID card / passport (not a random image, screenshot of text, etc.).  
6. **Fuzzy match:** accept the claim as valid when the extracted number is *close enough* to the claimed number — tolerate up to **2 differing digits** (define and justify your matching rule, e.g. position-aware edit distance).

## Output

The SDK returns a structured verification result containing at minimum:

1. **Authenticity certificate** — a signed/structured assertion that the image was validated as an authentic passport / ID card.  
2. **Number match** — confirmation that the claimed number is verified against the document, including the matching mode used (exact vs. fuzzy) and the digit-difference count.

Design the result type so a consumer can clearly distinguish: authentic \+ matched, authentic \+ mismatch, and not-authentic. Include confidence scores and the reasons behind any rejection.

## Constraints

- **Client-side only.** No uploading images/documents to any server or third-party API. State this clearly in the README and make it verifiable (e.g. no network calls during verification).  
- **Browsers:** must work in current **Chrome and Safari** (desktop).  
- **Integration:** ships as a library consumable by a **React SPA**. Provide a minimal React demo page that wires up the SDK.  
- **Israeli ID validation:** the 9-digit Israeli ID has a check digit — use it.  
- Follow our no-fallbacks principle: on failure, return an explicit error/rejection result — never silently return fake "valid" data.

## Deliverables

1. The SDK source (TypeScript) with a documented public API.  
2. A small React demo SPA that lets a reviewer upload a document, enter a number, pick a type, and see the result.  
3. `README.md` covering: architecture & key decisions, how OCR/validation runs in-browser, the fuzzy-matching rule, how the privacy constraint is enforced, browser support notes, and how to run the demo.  
4. Tests for the core logic (number extraction, Israeli ID check digit, fuzzy match, result shaping).

## Evaluation Criteria

- **Architecture & API design** — clean separation, extensible to new document types, ergonomic for a React consumer.  
- **Correctness** — extraction, check-digit and fuzzy-match logic, sensible authenticity heuristics.  
- **Privacy guarantee** — the no-upload constraint is genuinely enforced and demonstrable.  
- **Cross-browser** — verified working on Chrome and Safari.  
- **Code quality** — types, error handling (no silent fallbacks), tests, readable structure.  
- **Judgment** — reasonable handling of ambiguity, clear documentation of trade-offs and assumptions.

## Notes & Assumptions

- You may choose any in-browser OCR/ML approach (e.g. WASM Tesseract, an MRZ parser, an on-device model). Justify the choice.  
- "Authenticity" can be a heuristic given the time box — be explicit about what your check does and does not guarantee.  
- Auto-capture (live camera capture) is **out of scope** for this assignment; assume a still image is provided.  
- Suggested time box: keep it focused; prioritize a working end-to-end path over breadth.

