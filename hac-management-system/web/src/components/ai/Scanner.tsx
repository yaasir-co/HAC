"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, FlipHorizontal, Focus, ScanLine, Upload, Zap } from "lucide-react";
import { EXTRACTOR } from "@/lib/ai/core";
import { browserEmbedding } from "@/lib/ai/browser";
import { classifyTestObject, OBJECT_TEST_EXTRACTOR, SCAN_TEST_NAMES, type ObjectTestArtifact } from "@/lib/ai/object-test-core";
import { normalize } from "@/lib/ai/core";
import LiveProductSearch from "../LiveProductSearch";
import { api, type Row } from "../client";
import styles from "./ai.module.css";

type Mode = "visual" | "barcode" | "objects";
type Product = { id: string; name: string; itemCode: string; brand?: { name: string }; variants?: { id: string; name: string; barcode?: string | null; sku: string }[] };
type ScanResult = { candidates: { productId: string; variantId: string | null; score: number; product?: Product }[]; uncertain: boolean; reason: string; modelVersionId: string; predictionId: string };
type TestConfig = { artifact: ObjectTestArtifact; products: Product[]; evaluation: { sourceImageCount: number; test: { sampleCount: number; top1Accuracy: number } } };
let objectModel: Promise<Awaited<ReturnType<typeof import("@/lib/ai/visual-model").loadVisualModel>>> | undefined;
async function objectEmbedding(source: HTMLImageElement | HTMLCanvasElement) {
  objectModel ??= import("@/lib/ai/visual-model").then(async ({ loadVisualModel }) => {
    const tf = await import("@tensorflow/tfjs"); await tf.ready(); return loadVisualModel(OBJECT_TEST_EXTRACTOR.url);
  }).catch(error => { objectModel = undefined; throw error; });
  const model = await objectModel, features = model.infer(source);
  try { return normalize(Array.from(await features.data())); } finally { features.dispose(); }
}
function cameraFrame(video: HTMLVideoElement, center = false) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  if (!context) return null;
  const side = Math.min(video.videoWidth, video.videoHeight) * 0.8;
  canvas.width = center ? Math.round(side) : video.videoWidth;
  canvas.height = center ? Math.round(side) : video.videoHeight;
  context.drawImage(video, center ? (video.videoWidth - side) / 2 : 0, center ? (video.videoHeight - side) / 2 : 0, center ? side : video.videoWidth, center ? side : video.videoHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export default function Scanner({ inspectionId, onSelect, testModelId, canManageTests = false }: {
  inspectionId?: string; onSelect: (productId: string, variantId?: string, predictionId?: string) => void; testModelId?: string; canManageTests?: boolean;
}) {
  const [active, setActive] = useState(false), [frozen, setFrozen] = useState(false);
  const [mode, setMode] = useState<Mode>(testModelId ? "visual" : "objects");
  const [model, setModel] = useState<{ id: string; version: number } | null>(null);
  const [test, setTest] = useState<TestConfig | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [objectResult, setObjectResult] = useState<ReturnType<typeof classifyTestObject> | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [loading, setLoading] = useState(""), [barcode, setBarcode] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torch, setTorch] = useState(false), [torchAvailable, setTorchAvailable] = useState(false);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), revision = useRef(0);
  const live = useRef(false), busy = useRef(false), paused = useRef(false), captured = useRef<Blob | null>(null);
  const modeRef = useRef(mode), modelRef = useRef(model), testRef = useRef(test);
  const tickRef = useRef<() => Promise<void>>(async () => {});
  const stop = useCallback(() => {
    revision.current++; live.current = false; busy.current = false; paused.current = false;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) { video.current.pause(); video.current.srcObject = null; }
    setActive(false); setFrozen(false); setTorch(false); setTorchAvailable(false); setLoading("");
  }, []);
  useEffect(() => {
    let current = true;
    api<{ id: string; version: number } | null>(testModelId ? `/ai/models/${testModelId}` : "/ai/published")
      .then(value => { if (current) { setModel(value); modelRef.current = value; } })
      .catch(failure => { if (current && testModelId) setError(failure.message); });
    api<TestConfig>("/ai/scan-test").then(value => { if (current) { setTest(value); testRef.current = value; } })
      .catch(failure => { if (current) setError(`Scan test unavailable: ${failure.message}. Catalogue search is available below.`); });
    return () => { current = false; stop(); };
  }, [stop, testModelId]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [stop]);
  async function analyze(source: HTMLCanvasElement | HTMLImageElement, generation: number) {
    const selectedMode = modeRef.current;
    if (selectedMode === "objects") {
      const config = testRef.current;
      if (!config) throw new Error("Scan test is loading. Retry shortly or use catalogue search.");
      setLoading("Checking test object…");
      const embedding = await objectEmbedding(source);
      if (revision.current === generation) setObjectResult(classifyTestObject(embedding, config.artifact));
    } else {
      if (!modelRef.current) throw new Error("No product model is published. Try Test objects, barcode or catalogue search.");
      setLoading("Checking product image…");
      const embedding = await browserEmbedding(source);
      if (revision.current !== generation) return;
      const value = await api<ScanResult>("/ai/predict", { method: "POST", body: JSON.stringify({ embedding, extractorVersion: EXTRACTOR.version, inspectionId, modelVersionId: testModelId }) });
      if (revision.current === generation) setResult(value);
    }
  }
  tickRef.current = async () => {
    if (!live.current || busy.current || paused.current) return;
    const generation = revision.current;
    busy.current = true;
    try {
      if (modeRef.current === "barcode") {
        const detector = (window as unknown as { BarcodeDetector?: new () => { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (!detector) { setMessage("Barcode scanning is not supported by this browser. Type the barcode in product search below."); paused.current = true; setFrozen(true); video.current?.pause(); }
        else if (video.current && video.current.readyState >= 2) {
          const values = await new detector().detect(video.current);
          if (revision.current === generation && values[0]) { setBarcode(values[0].rawValue); setMessage("Barcode found. Select its catalogue match below."); paused.current = true; setFrozen(true); video.current.pause(); }
        }
      } else if (video.current) {
        const frame = cameraFrame(video.current, modeRef.current === "objects");
        if (frame) await analyze(frame, generation);
      }
    } catch (failure) {
      if (revision.current === generation) { setError((failure as Error).message); paused.current = true; setFrozen(true); video.current?.pause(); }
    } finally {
      if (revision.current === generation) {
        busy.current = false; setLoading("");
        if (live.current && !paused.current) timer.current = setTimeout(() => void tickRef.current(), 2200);
      }
    }
  };
  async function start(nextFacing = facing) {
    stop(); setError(""); setMessage(""); setResult(null); setObjectResult(null);
    const generation = revision.current; setLoading("Opening camera…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs HTTPS and a supported browser");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (revision.current !== generation) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; live.current = true; setActive(true);
      setTorchAvailable(!!(media.getVideoTracks()[0]?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean })?.torch);
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      if (revision.current === generation) timer.current = setTimeout(() => void tickRef.current(), 500);
    } catch (failure) {
      if (revision.current === generation) { stop(); setError(`Camera unavailable: ${(failure as Error).message}. Allow camera access in browser settings, or upload a photograph below.`); }
    } finally { if (revision.current === generation) setLoading(""); }
  }
  async function freeze() {
    if (!video.current) return;
    const canvas = cameraFrame(video.current, modeRef.current === "objects");
    paused.current = true; setFrozen(true); video.current.pause();
    if (canvas) {
      captured.current = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!busy.current && modeRef.current !== "barcode") {
        const generation = revision.current;
        busy.current = true;
        try { await analyze(canvas, generation); }
        catch (failure) { if (generation === revision.current) setError((failure as Error).message); }
        finally { if (generation === revision.current) { busy.current = false; setLoading(""); } }
      }
    }
  }
  function resume() {
    paused.current = false; setFrozen(false); setError("");
    void video.current?.play().then(() => { if (!busy.current && live.current) void tickRef.current(); });
  }
  async function imageScan(file: File) {
    stop(); setError(""); setMessage(""); setResult(null); setObjectResult(null);
    if (file.size > 8_000_000) { setError("Choose an image smaller than 8 MB."); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Choose a JPEG, PNG or WebP photograph."); return; }
    const generation = revision.current, image = new Image(), url = URL.createObjectURL(file);
    setLoading("Opening photograph…");
    try {
      image.src = url; await image.decode();
      if (image.width * image.height > 20_000_000) throw new Error("Choose a photograph smaller than 20 megapixels.");
      if (revision.current !== generation) return;
      await analyze(image, generation);
      if (revision.current === generation) captured.current = file;
    } catch (failure) { if (revision.current === generation) setError((failure as Error).message); }
    finally { URL.revokeObjectURL(url); if (revision.current === generation) setLoading(""); }
  }
  const select = (id: string, variant?: string, prediction?: string) => { stop(); onSelect(id, variant, prediction); };
  async function addTestProducts() {
    setLoading("Adding test catalogue…"); setError("");
    try {
      await api("/ai/scan-test", { method: "POST" }); const config = await api<TestConfig>("/ai/scan-test");
      setTest(config); testRef.current = config; setMessage("Five clearly marked test objects were added to the catalogue. No certificates were created. Person detections stay camera tests only.");
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(""); }
  }
  async function saveEvidence() {
    if (!captured.current || !inspectionId) return;
    setLoading("Saving photograph…"); setError("");
    try {
      const form = new FormData(), blob = captured.current;
      form.set("file", new File([blob], "scan-capture" + (blob.type === "image/png" ? ".png" : blob.type === "image/webp" ? ".webp" : ".jpg"), { type: blob.type }));
      form.set("inspectionId", inspectionId); form.set("description", mode === "objects" ? "Scanner object test capture" : "Product scanner capture");
      await api("/evidence", { method: "POST", body: form }); setMessage("Photograph saved to this inspection.");
    } catch (failure) { setError((failure as Error).message); } finally { setLoading(""); }
  }
  return <div className={styles.studio}>
    {error && <div role="alert" className={`${styles.message} ${styles.error}`}>{error}</div>}
    {message && <div role="status" className={styles.message}>{message}</div>}
    <div className={styles.grid}>
      <section className={styles.panel}>
        <div className={styles.scanHeading}><div><span className={styles.scanEyebrow}>CAMERA WORKSPACE</span><h2>{mode === "objects" ? "Try the live scanner" : "Identify a product"}</h2></div><span className={styles.livePill}>{active ? "Camera on" : "Ready"}</span></div>
        <label className={styles.label}>What are you scanning?<select className={styles.control} value={mode} onChange={event => { stop(); const next = event.target.value as Mode; modeRef.current = next; setMode(next); setResult(null); setObjectResult(null); setError(""); }}>
          <option value="objects">Test objects: laptop, phone, person, pen, pencil, book</option><option value="visual">HAC product recognition{!model ? " (model not published)" : ` · v${model.version}`}</option><option value="barcode">Product barcode / QR</option>
        </select></label>
        <div className={styles.videoWrap}>
          <video ref={video} className={styles.video} autoPlay playsInline muted aria-label="Live camera preview" />
          {!active && <div className={styles.cameraEmpty}><Camera size={42} /><strong>Place one item in the frame</strong><span>Use good light and keep the object close.</span></div>}
          <span className={styles.guide} aria-hidden="true" />
        </div>
        <div className={styles.cameraActions}><button className={`${styles.button} ${styles.primary}`} disabled={!!loading && !active} onClick={() => void start()}><Camera size={19} />{active ? "Restart camera" : "Start camera"}</button>
          {active && <button className={styles.button} disabled={!!loading} onClick={() => frozen ? resume() : void freeze()}><Focus size={19} />{frozen ? "Resume scan" : "Freeze frame"}</button>}
          <label className={`${styles.button} ${styles.uploadButton}`}><Upload size={19} />Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void imageScan(file); event.target.value = ""; }} /></label>
        </div>
        {active && <div className={styles.toolbar}>
          <button className={styles.button} onClick={stop}><CameraOff size={17} />Stop camera</button>
          <button className={styles.button} onClick={() => { const next = facing === "environment" ? "user" : "environment"; setFacing(next); void start(next); }}><FlipHorizontal size={17} />Switch camera</button>
          {torchAvailable && <button className={styles.button} onClick={async () => { try { await stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(value => !value); } catch { setMessage("Torch is unavailable on this camera."); } }}><Zap size={17} />Torch {torch ? "off" : "on"}</button>}
        </div>}
        <p className={styles.scanStatus} role="status" aria-live="polite">{loading || (active ? "Live scan updates automatically. Camera stops when you switch apps." : "Camera or photograph · manual search is always available below.")}</p>
        {inspectionId && <button className={styles.button} disabled={!captured.current || !!loading || mode === "objects"} onClick={() => void saveEvidence()}>Save captured product photo</button>}
        {mode === "objects" && <p className={styles.muted}>Camera testing only. Includes a person category, without identifying anyone. Test suggestions do not establish HAC approval.</p>}
      </section>
      <section className={styles.panel}>
        <h2>{mode === "objects" ? "Test object suggestions" : "Product suggestions"}</h2>
        {mode === "objects" ? <>
          <p className={styles.muted}>Laptop · mobile phone · person · pen · pencil · book. Fill the center guide with one object.</p>
          {objectResult ? <><div className={`${styles.message} ${objectResult.uncertain ? styles.error : ""}`}>{objectResult.reason}</div>
            {objectResult.candidates.filter(candidate => candidate.label !== "background").map(candidate => {
              const product = test?.products.find(item => item.id === `scan-test-${candidate.label}`);
              return <div className={styles.objectCandidate} key={candidate.label}><div><strong>{SCAN_TEST_NAMES[candidate.label]}</strong><small>{(candidate.score * 100).toFixed(0)}% model score · test suggestion</small></div>
                {candidate.label === "person" ? <span className={styles.testOnly}>Camera test only</span> : product ? <button className={styles.button} onClick={() => select(product.id)}>Select test item</button> : <span className={styles.testOnly}>Test catalogue not added</span>}
              </div>;
            })}</> : <div className={styles.emptyScan}><ScanLine size={32} /><h3>Ready when you are</h3><p>Start the camera or upload a photograph to see actual model suggestions.</p></div>}
          {test && <p className={styles.muted}>{test.evaluation.sourceImageCount} training/evaluation images · experimental model. Similar objects and unfamiliar backgrounds can be uncertain.</p>}
          {canManageTests && <button className={styles.button} disabled={!!loading} onClick={() => void addTestProducts()}>Add five scan test items to catalogue</button>}
        </> : mode === "barcode" ? <p>Scan a barcode, then choose the matching product below. You can also enter it manually.</p> : result ? <>
          <div className={`${styles.message} ${result.uncertain ? styles.error : ""}`}>{result.uncertain ? "Identity not confirmed. " : ""}{result.reason}</div>
          {result.candidates.map(candidate => <button className={styles.candidate} key={`${candidate.productId}:${candidate.variantId}`} onClick={() => select(candidate.productId, candidate.variantId || undefined, result.predictionId)}><span><strong>{candidate.product?.name || candidate.productId}</strong><small>{candidate.product?.brand?.name} · confirm physical packaging</small></span><span className={styles.score}>{(candidate.score * 100).toFixed(1)}%<small>similarity</small></span></button>)}
          <p>Visual similarity suggests identity. Confirm the physical item; HAC records are checked separately.</p>
        </> : <p>{model ? `Product model v${model.version}. Point the camera at one product.` : "An administrator must train and publish a product model for HAC packaging. Test objects and catalogue search are available now."}</p>}
        {testModelId && <p className={styles.message}>Administrator test of model v{model?.version}. This does not publish the model.</p>}
      </section>
    </div>
    <section className={styles.panel}><LiveProductSearch initialQuery={barcode} select={(id, variant) => select(id, variant)} /></section>
  </div>;
}
