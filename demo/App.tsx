import { useRef, useState } from 'react';
import { createIdVerifier } from '../src/index.js';
import type { DocumentType, IdVerifier, VerificationResult } from '../src/index.js';
import { PaddleOcrEngine, type PaddleDetector } from '../src/ocr/paddle-ocr-engine.js';

// DEV demo: load the ORT wasm from the official CDN (matches the installed
// version). This is a runtime fetch, not image data — the no-upload guarantee
// is about the document image. A production deployment should self-host these
// (see DESIGN §9 / §10); doing so cleanly under Vite needs an asset-copy step.
const ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';

/** PP-OCR engine backed by @gutenye/ocr-browser, models self-hosted under /assets. */
function createPaddleEngine(): PaddleOcrEngine {
  return new PaddleOcrEngine(async () => {
    // Point onnxruntime-web at the self-hosted wasm (same module instance gutenye uses).
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = ORT_WASM_CDN;
    ort.env.wasm.numThreads = 1; // avoid SharedArrayBuffer/COOP-COEP requirement in dev
    const Ocr = (await import('@gutenye/ocr-browser')).default;
    const ocr = await Ocr.create({
      models: {
        detectionPath: '/assets/ch_PP-OCRv4_det_infer.onnx',
        recognitionPath: '/assets/ch_PP-OCRv4_rec_infer.onnx',
        dictionaryPath: '/assets/ppocr_keys_v1.txt',
      },
    });
    return ocr as unknown as PaddleDetector;
  });
}

const DECISION_COLORS: Record<VerificationResult['decision'], string> = {
  verified: '#1a7f37',
  mismatch: '#9a6700',
  not_authentic: '#cf222e',
  error: '#57606a',
};

/** Image formats every target browser (Chrome + Safari) can decode reliably. */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');
const SUPPORTED_LABEL = 'JPEG, PNG, WebP';

export function App() {
  const verifierRef = useRef<IdVerifier | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('id');
  const [claimedNumber, setClaimedNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function getVerifier(): IdVerifier {
    if (!verifierRef.current) {
      // Inject PaddleOCR (PP-OCR) — the engine that reads real card photos.
      verifierRef.current = createIdVerifier({}, { ocr: createPaddleEngine() });
    }
    return verifierRef.current;
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && !ACCEPTED_TYPES.includes(f.type)) {
      setError(
        `Unsupported file type${f.type ? ` (${f.type})` : ''}. Supported: ${SUPPORTED_LABEL}. HEIC is not supported.`,
      );
      setFile(null);
      e.target.value = '';
      return;
    }
    setError(null);
    setFile(f);
  }

  async function onVerify() {
    setError(null);
    setResult(null);
    if (!file) {
      setError('Please choose an image.');
      return;
    }
    if (!claimedNumber.trim()) {
      setError('Please enter a claimed number.');
      return;
    }
    setBusy(true);
    try {
      const r = await getVerifier().verify({ documentType, claimedNumber, image: file });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Identity Verification SDK</h1>
      <p style={{ color: '#57606a' }}>
        Everything runs in your browser — the image never leaves this device.
      </p>

      <section style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
        <label>
          Document type{' '}
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
            <option value="id">Israeli ID / driver's license</option>
            <option value="passport">Foreign passport</option>
          </select>
        </label>

        <label>
          Claimed number{' '}
          <input
            value={claimedNumber}
            onChange={(e) => setClaimedNumber(e.target.value)}
            placeholder={documentType === 'id' ? '9-digit Israeli ID' : 'Passport number'}
          />
        </label>

        <label>
          Document image{' '}
          <input type="file" accept={ACCEPT_ATTR} onChange={onFileChange} />
          <div style={{ color: '#57606a', fontSize: '0.85em', marginTop: '0.25rem' }}>
            Supported formats: {SUPPORTED_LABEL}. HEIC (iPhone) is not supported — convert to
            JPEG/PNG first.
          </div>
        </label>

        <button onClick={onVerify} disabled={busy} style={{ padding: '0.5rem 1rem', width: 'fit-content' }}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </section>

      {error && <p style={{ color: '#cf222e' }}>⚠️ {error}</p>}

      {result && (
        <section style={{ marginTop: '1.5rem' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: 6,
              color: 'white',
              background: DECISION_COLORS[result.decision],
              fontWeight: 600,
            }}
          >
            {result.decision.toUpperCase()}
          </div>
          <p>
            Overall confidence: {(result.overallConfidence * 100).toFixed(0)}% · Authentic:{' '}
            {String(result.authenticity.authentic)} · Match: {result.numberMatch.mode} (
            {result.numberMatch.digitDifference} diff)
          </p>
          <pre style={{ background: '#f6f8fa', padding: '1rem', borderRadius: 6, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
