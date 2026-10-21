"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { EXTRACTOR } from "@/lib/ai/core";
import { browserEmbedding } from "@/lib/ai/browser";
import styles from "./ai.module.css";
type Product = {
  id: string;
  name: string;
  itemCode: string;
  brand?: { name: string };
  variants?: {
    id: string;
    name: string;
    barcode?: string | null;
    sku: string;
  }[];
};
type Prediction = {
  productId: string;
  variantId: string | null;
  score: number;
  product?: Product;
};
type ScanResult = {
  candidates: Prediction[];
  uncertain: boolean;
  reason: string;
  modelVersionId: string;
  predictionId: string;
};
type BarcodeReader = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${url}`, init),
    body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Request failed.");
  return body.data;
}
export default function Scanner({
  inspectionId,
  onSelect,
  testModelId,
}: {
  inspectionId?: string;
  onSelect: (productId: string, variantId?: string, predictionId?: string) => void;
  testModelId?: string;
}) {
  const [active, setActive] = useState(false),
    [frozen, setFrozen] = useState(false),
    [mode, setMode] = useState<"visual" | "barcode">("visual"),
    [model, setModel] = useState<{ id: string; version: number } | null>(null),
    [result, setResult] = useState<ScanResult | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(""),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Product[]>([]),
    [facing, setFacing] = useState<"environment" | "user">("environment"),
    [torch, setTorch] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    live = useRef(false),
    busy = useRef(false),
    captured = useRef<Blob | null>(null),
    frozenRef = useRef(false),
    barcodeMode = useRef(false),
    modelRef = useRef<{ id: string; version: number } | null>(null);
  const stop = useCallback(() => {
    live.current = false;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setActive(false);
    setFrozen(false);
    frozenRef.current = false;
  }, []);
  useEffect(() => {
    api<{ id: string; version: number } | null>(
      testModelId ? `/ai/models/${testModelId}` : "/ai/published",
    )
      .then((value) => {
        setModel(value);
        modelRef.current = value;
      })
      .catch((e) => setError(e.message));
    return stop;
  }, [stop, testModelId]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [stop]);
  const search = async (value = query) => {
    setError("");
    setLoading("Searching catalogue…");
    try {
      const products = await api<Product[]>(
        `/products?q=${encodeURIComponent(value)}&pageSize=25`,
      );
      setMatches(Array.isArray(products) ? products : []);
      if (!products.length)
        setMessage(
          "Unknown product — HAC approval not verified. Search another identifier or register an investigation from the inspection.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading("");
    }
  };
  const tick = useCallback(async () => {
    if (!live.current || busy.current || frozenRef.current) return;
    const current = video.current;
    if (!current || current.readyState < 2) {
      timer.current = setTimeout(() => void tick(), 500);
      return;
    }
    busy.current = true;
    try {
      if (barcodeMode.current) {
        const ctor = (
          window as unknown as {
            BarcodeDetector?: new (options?: {
              formats: string[];
            }) => BarcodeReader;
          }
        ).BarcodeDetector;
        if (!ctor) {
          setMessage(
            "This browser does not support native barcode scanning. Enter a barcode below or use a compatible Android browser.",
          );
        } else {
          const values = await new ctor({
            formats: [
              "ean_13",
              "ean_8",
              "upc_a",
              "upc_e",
              "code_128",
              "qr_code",
            ],
          }).detect(current);
          if (values[0]) {
            setQuery(values[0].rawValue);
            await search(values[0].rawValue);
            setFrozen(true);
            frozenRef.current = true;
            current.pause();
          }
        }
      } else if (modelRef.current) {
        setLoading("Analyzing with TensorFlow…");
        const embedding = await browserEmbedding(current);
        if (live.current) {
          const value = await api<ScanResult>("/ai/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embedding,
              extractorVersion: EXTRACTOR.version,
              inspectionId,
              modelVersionId: testModelId,
            }),
          });
          if (live.current) setResult(value);
        }
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Recognition unavailable. Use barcode or manual search.",
      );
    } finally {
      busy.current = false;
      setLoading("");
      if (live.current && !frozenRef.current)
        timer.current = setTimeout(() => void tick(), 1800);
    }
  }, [inspectionId, testModelId]);
  const start = async (nextFacing = facing) => {
    stop();
    setError("");
    setMessage("");
    setLoading("Opening camera…");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera requires HTTPS and a supported browser.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      stream.current = media;
      live.current = true;
      setActive(true);
      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current
            .play()
            .then(() => {
              timer.current = setTimeout(() => void tick(), 500);
            })
            .catch((e) => setError(e.message));
        }
      }, 0);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Camera unavailable: ${e.message}. Allow camera access in browser settings or upload an image.`
          : "Camera unavailable.",
      );
    } finally {
      setLoading("");
    }
  };
  const freeze = async () => {
    if (!video.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    captured.current = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.9),
    );
    video.current.pause();
    frozenRef.current = true;
    setFrozen(true);
  };
  const retake = () => {
    captured.current = null;
    setFrozen(false);
    frozenRef.current = false;
    void video.current?.play();
    timer.current = setTimeout(() => void tick(), 0);
  };
  const imageScan = async (file: File) => {
    if (!model)
      return setError(
        "No published model is available. Use barcode or manual search.",
      );
    setLoading("Analyzing uploaded image…");
    setError("");
    try {
      const image = new Image(),
        url = URL.createObjectURL(file);
      try {
        image.src = url;
        await image.decode();
        const embedding = await browserEmbedding(image);
        setResult(
          await api<ScanResult>("/ai/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embedding,
              extractorVersion: EXTRACTOR.version,
              inspectionId,
              modelVersionId: testModelId,
            }),
          }),
        );
        captured.current = file;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image analysis failed.");
    } finally {
      setLoading("");
    }
  };
  const select = (productId: string, variantId?: string, predictionId?: string) => {
    stop();
    onSelect(productId, variantId, predictionId);
  };
  const saveEvidence = async () => {
    setError("");
    if (!inspectionId || !captured.current) return;
    setLoading("Saving evidence…");
    try {
      const form = new FormData();
      form.set(
        "file",
        new File([captured.current], `product-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
      form.set("inspectionId", inspectionId);
      form.set("description", "Product packaging captured in scanner");
      await api("/evidence", { method: "POST", body: form });
      setMessage("Evidence saved to this inspection.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evidence could not be saved.");
    } finally {
      setLoading("");
    }
  };
  return (
    <div className={styles.studio}>
      {error && (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {error}
        </div>
      )}
      {message && (
        <div role="status" className={styles.message}>
          {message}
        </div>
      )}
      {!model && (
        <div className={styles.message}>
          No validated recognition model has been published. The camera and
          manual/barcode search remain available. No predictions are simulated.
        </div>
      )}
      {testModelId && (
        <div className={styles.message}>
          Administrator model test · v{model?.version}. Test predictions do not
          publish this model.
        </div>
      )}
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Live product scanner</h2>
          <div className={styles.videoWrap}>
            <video
              ref={video}
              className={styles.video}
              autoPlay
              playsInline
              muted
            />
            <span className={styles.guide} />
          </div>
          <div className={styles.toolbar}>
            <button
              className={`${styles.button} ${styles.primary}`}
              onClick={() => void start()}
            >
              {active ? "Restart camera" : "Start camera"}
            </button>
            <button className={styles.button} onClick={stop} disabled={!active}>
              Stop
            </button>
            <button
              className={styles.button}
              onClick={() => (frozen ? retake() : void freeze())}
              disabled={!active}
            >
              {frozen ? "Retake" : "Freeze frame"}
            </button>
            <button
              className={styles.button}
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                void start(next);
              }}
              disabled={!active}
            >
              Switch camera
            </button>
            <button
              className={styles.button}
              disabled={!active}
              onClick={async () => {
                try {
                  const track = stream.current?.getVideoTracks()[0];
                  if (!track) return;
                  if (
                    !(
                      track.getCapabilities() as MediaTrackCapabilities & {
                        torch?: boolean;
                      }
                    ).torch
                  ) {
                    setMessage("Torch is not available on this camera.");
                    return;
                  }
                  await track.applyConstraints({
                    advanced: [{ torch: !torch } as MediaTrackConstraintSet],
                  });
                  setTorch((v) => !v);
                } catch {
                  setMessage("Torch is not available on this camera.");
                }
              }}
            >
              {torch ? "Torch off" : "Torch"}
            </button>
          </div>
          <div className={styles.toolbar} style={{ marginTop: 10 }}>
            <label className={styles.label}>
              Scan mode
              <select
                className={styles.control}
                value={mode}
                onChange={(e) => {
                  const next = e.target.value as "visual" | "barcode";
                  setMode(next);
                  barcodeMode.current = next === "barcode";
                }}
              >
                <option value="visual">Visual recognition</option>
                <option value="barcode">Barcode / QR</option>
              </select>
            </label>
            <label className={styles.label}>
              Analyze a photograph
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void imageScan(file);
                  e.target.value = "";
                }}
              />
            </label>
            {inspectionId && (
              <button
                className={styles.button}
                disabled={!captured.current || !!loading}
                onClick={() => void saveEvidence()}
              >
                Save captured evidence
              </button>
            )}
          </div>
          <p className={styles.muted}>
            {loading ||
              (model
                ? `Published model v${model.version} · inference throttled to preserve battery`
                : "Manual identification available")}{" "}
            · Camera stops when you leave this page or switch apps.
          </p>
        </section>
        <section className={styles.panel}>
          <h2>Recognition suggestions</h2>
          {result ? (
            <>
              <div
                className={`${styles.message} ${result.uncertain ? styles.error : ""}`}
              >
                {result.uncertain ? "Identity Not Confirmed — " : ""}
                {result.reason}
              </div>
              {result.candidates.map((candidate) => (
                <button
                  key={`${candidate.productId}:${candidate.variantId}`}
                  className={styles.candidate}
                  onClick={() =>
                    select(
                      candidate.productId,
                      candidate.variantId || undefined,
                      result?.predictionId,
                    )
                  }
                >
                  <span>
                    <strong>
                      {candidate.product?.name || candidate.productId}
                    </strong>
                    <small>
                      {candidate.product?.brand?.name} ·{" "}
                      {candidate.product?.variants?.find(
                        (v) => v.id === candidate.variantId,
                      )?.name || "Confirm SKU / variant"}
                    </small>
                  </span>
                  <span className={styles.score}>
                    {(candidate.score * 100).toFixed(1)}%
                    <small>similarity</small>
                  </span>
                </button>
              ))}
              <p>
                Scores are visual similarity, not approval confidence. Select
                only after checking the physical identity; HAC records are
                verified separately.
              </p>
            </>
          ) : (
            <p>
              {model
                ? "Point the camera at one product or upload a photograph. Actual TensorFlow suggestions will appear here."
                : "Publish a genuinely trained and evaluated model from the AI Training Studio to enable visual recognition."}
            </p>
          )}
          <h2 style={{ marginTop: 24 }}>Barcode or manual search</h2>
          <form
            className={styles.toolbar}
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              className={styles.control}
              aria-label="Product search"
              placeholder="Barcode, item code, name or brand"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className={styles.button}
              disabled={!!loading || !query.trim()}
              type="submit"
            >
              Search
            </button>
          </form>
          {matches.map((product) => (
            <button
              className={styles.candidate}
              key={product.id}
              onClick={() =>
                select(
                  product.id,
                  product.variants?.find((v) => v.barcode === query.trim())?.id,
                )
              }
            >
              <span>
                <strong>{product.name}</strong>
                <small>
                  {product.brand?.name} · {product.itemCode}
                </small>
              </span>
              <span>Review →</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
