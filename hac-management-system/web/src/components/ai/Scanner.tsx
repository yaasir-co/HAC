"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  FlipHorizontal,
  Focus,
  Upload,
  Zap,
} from "lucide-react";
import { EXTRACTOR } from "@/lib/ai/core";
import { frameDifference } from "@/lib/ai/foreground";
import { browserEmbedding } from "@/lib/ai/browser";
import CataloguePicture from "../CataloguePicture";
import LiveProductSearch from "../LiveProductSearch";
import { api } from "../client";
import styles from "./ai.module.css";
type Product = {
  id: string;
  name: string;
  itemCode?: string;
  type?: string;
  imageUrl?: string | null;
  brand?: { name: string };
  variants?: { id: string; name: string; sku: string }[];
};
type Candidate = {
  productId: string;
  variantId: string | null;
  score: number;
  product?: Product;
};
type ScanResult = {
  candidates: Candidate[];
  predictionId: string;
  uncertain: boolean;
  reason: string;
  guidance?: string;
};
export default function Scanner({
  inspectionId,
  onSelect,
  onQuickSelect,
  testModelId,
  cameraOnly = false,
  inspectedProductIds = [],
}: {
  inspectionId?: string;
  onSelect: (id: string, variant?: string, prediction?: string) => void;
  onQuickSelect?: (
    id: string,
    variant?: string,
    prediction?: string,
    product?: Product,
  ) => Promise<void>;
  testModelId?: string;
  cameraOnly?: boolean;
  inspectedProductIds?: string[];
}) {
  const [aiDetection, setAiDetection] = useState(false),
    [guidance, setGuidance] = useState("");
  const aiMode = useRef(false),
    previous = useRef<Uint8Array | undefined>(undefined),
    stableFrames = useRef(0);
  const [model, setModel] = useState<{ id: string; version: number } | null>(
      null,
    ),
    [active, setActive] = useState(false),
    [busyLabel, setBusyLabel] = useState(""),
    [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null),
    [expanded, setExpanded] = useState(false),
    [holding, setHolding] = useState(false),
    [frozen, setFrozen] = useState(false),
    [selecting, setSelecting] = useState(false),
    [torch, setTorch] = useState(false),
    [hasTorch, setHasTorch] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0),
    live = useRef(false),
    paused = useRef(false),
    working = useRef(false),
    modelRef = useRef(model),
    facing = useRef("environment"),
    list = useRef<HTMLDivElement>(null),
    tick = useRef<() => Promise<void>>(async () => {}),
    mounted = useRef(true);
  const stop = useCallback(() => {
    generation.current++;
    live.current = false;
    paused.current = false;
    working.current = false;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    setActive(false);
    setBusyLabel("");
    setFrozen(false);
    setTorch(false);
    setHasTorch(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let current = true;
    api<{ id: string; version: number } | null>(
      testModelId ? `/ai/models/${testModelId}` : "/ai/published",
    )
      .then((value) => {
        if (current) {
          setModel(value);
          modelRef.current = value;
          if (cameraOnly) void start();
        }
      })
      .catch((e) => {
        if (current) setError(`Could not load the product model: ${e.message}`);
      });
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      current = false;
      mounted.current = false;
      document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, [stop, testModelId, cameraOnly]);
  function hold() {
    paused.current = true;
    setHolding(true);
    setExpanded(true);
    if (timer.current) clearTimeout(timer.current);
  }
  function resume() {
    stableFrames.current = 0;
    previous.current = undefined;
    setGuidance("");
    paused.current = false;
    setHolding(false);
    setFrozen(false);
    setExpanded(false);
    setResult(null);
    setError("");
    if (list.current) list.current.scrollTop = 0;
    void video.current?.play().catch(() => {});
    if (timer.current) clearTimeout(timer.current);
    if (live.current)
      timer.current = setTimeout(() => void tick.current(), 300);
  }
  async function analyze(
    source: HTMLCanvasElement | HTMLImageElement,
    token: number,
  ) {
    if (!modelRef.current) return;
    setBusyLabel("Finding matching products…");
    const embedding = await browserEmbedding(source);
    if (generation.current !== token) return;
    const value = await api<ScanResult>("/ai/predict", {
      method: "POST",
      body: JSON.stringify({
        embedding,
        extractorVersion: EXTRACTOR.version,
        inspectionId,
        modelVersionId: testModelId,
      }),
    });
    if (generation.current === token && !paused.current)
      setResult({
        ...value,
        candidates: value.candidates
          .filter((row) => Number.isFinite(row.score) && row.score >= 0.75)
          .slice(0, 10),
      });
  }
  async function captureAI(canvas: HTMLCanvasElement, token: number) {
    setBusyLabel("Capturing and checking product…");
    video.current?.pause();
    setFrozen(true);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob)
      throw new Error("Could not capture this frame. Show the product again.");
    const form = new FormData();
    form.set(
      "file",
      new File([blob], "live-capture.jpg", { type: "image/jpeg" }),
    );
    if (inspectionId) form.set("inspectionId", inspectionId);
    if (testModelId) form.set("modelVersionId", testModelId);
    const value = await api<ScanResult>("/ai/capture", {
      method: "POST",
      body: form,
    });
    if (token !== generation.current) return;
    const candidates = value.candidates
      .filter((row) => row.score >= 0.75)
      .slice(0, 10);
    setResult({ ...value, candidates });
    setGuidance(value.guidance || "");
    stableFrames.current = 0;
    if (candidates.length) {
      paused.current = true;
      setHolding(true);
    } else {
      setFrozen(false);
      void video.current?.play().catch(() => {});
    }
  }
  tick.current = async () => {
    if (!live.current || working.current || paused.current) return;
    const token = generation.current;
    working.current = true;
    try {
      const element = video.current;
      if (element && element.readyState >= 2 && element.videoWidth) {
        const canvas = document.createElement("canvas");
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        canvas.getContext("2d")?.drawImage(element, 0, 0);
        if (aiMode.current && modelRef.current) {
          const thumbnail = document.createElement("canvas");
          thumbnail.width = 24;
          thumbnail.height = 24;
          const context = thumbnail.getContext("2d")!;
          context.drawImage(element, 0, 0, 24, 24);
          const pixels = new Uint8Array(
            context.getImageData(0, 0, 24, 24).data,
          );
          const motion = frameDifference(previous.current, pixels);
          previous.current = pixels;
          stableFrames.current = motion < 0.035 ? stableFrames.current + 1 : 0;
          if (stableFrames.current >= 2) await captureAI(canvas, token);
          else
            setGuidance(
              "Show one product and hold it steady for automatic capture.",
            );
        } else await analyze(canvas, token);
      }
    } catch (e) {
      if (token === generation.current) {
        setError((e as Error).message);
        paused.current = true;
        setHolding(true);
      }
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusyLabel("");
        if (live.current && !paused.current)
          timer.current = setTimeout(() => void tick.current(), 1800);
      }
    }
  };
  async function start() {
    stop();
    stableFrames.current = 0;
    previous.current = undefined;
    setGuidance("");
    setResult(null);
    setExpanded(false);
    setHolding(false);
    setError("");
    const token = generation.current;
    setBusyLabel("Opening camera…");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Use HTTPS and allow camera access");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing.current },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      if (token !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      live.current = true;
      setActive(true);
      setHasTorch(
        !!(
          media
            .getVideoTracks()[0]
            ?.getCapabilities?.() as MediaTrackCapabilities & {
            torch?: boolean;
          }
        )?.torch,
      );
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      if (token === generation.current)
        timer.current = setTimeout(() => void tick.current(), 400);
    } catch (e) {
      if (token === generation.current) {
        stop();
        setError(
          `Camera unavailable: ${(e as Error).message}. Allow camera access or choose a photo.`,
        );
      }
    } finally {
      if (token === generation.current) setBusyLabel("");
    }
  }
  async function select(candidate: Candidate) {
    if (selecting || inspectedProductIds.includes(candidate.productId)) return;
    if (!onQuickSelect) {
      stop();
      onSelect(
        candidate.productId,
        candidate.variantId || undefined,
        result?.predictionId,
      );
      return;
    }
    paused.current = true;
    setSelecting(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      await onQuickSelect(
        candidate.productId,
        candidate.variantId || undefined,
        result?.predictionId,
        candidate.product,
      );
    } finally {
      if (mounted.current) {
        setSelecting(false);
        if (live.current && !document.hidden) resume();
      }
    }
  }
  async function upload(file: File) {
    stop();
    setResult(null);
    setError("");
    setExpanded(false);
    if (!modelRef.current) {
      setError(
        "An administrator must publish a product model first. Use catalogue search.",
      );
      return;
    }
    if (file.size > 8_000_000 || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Choose a JPEG, PNG or WebP image of at most 8 MB.");
      return;
    }
    const image = new Image(),
      url = URL.createObjectURL(file),
      token = generation.current;
    setBusyLabel("Opening photo…");
    try {
      image.src = url;
      await image.decode();
      if (image.width * image.height > 20_000_000)
        throw new Error("Choose a photo smaller than 20 megapixels.");
      await analyze(image, token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      URL.revokeObjectURL(url);
      if (token === generation.current) setBusyLabel("");
    }
  }
  const candidates = result?.candidates || [];
  return (
    <div className={`${styles.studio} ${cameraOnly ? styles.cameraOnly : ""}`}>
      {error && (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {error}
        </div>
      )}
      <section className={styles.panel}>
        <label className={styles.aiDetectionToggle}>
          <input
            type="checkbox"
            checked={aiDetection}
            disabled={selecting || !!busyLabel}
            onChange={(event) => {
              const enabled = event.target.checked;
              setAiDetection(enabled);
              aiMode.current = enabled;
              resume();
            }}
          />
          <span>
            <strong>AI detection mode</strong>
            <small>
              Automatic capture, foreground focus and a guided retry
            </small>
          </span>
        </label>
        <div className={styles.scanHeading}>
          <h2>Scan products</h2>
          <span className={styles.livePill}>
            {active ? "Camera on" : "Ready"}
          </span>
        </div>
        <div className={styles.videoWrap}>
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className={styles.video}
          />
          <span className={styles.guide} />
          {!active && !candidates.length && (
            <div className={styles.cameraEmpty}>
              <Camera size={34} />
              <strong>Point the camera at one item</strong>
              <span>Only matches with at least 75% similarity appear.</span>
            </div>
          )}
          <div
            className={styles.liveChoices}
            aria-label="Predicted products above 75 percent"
          >
            <div className={styles.predictionCaption}>
              {selecting
                ? "Confirm your item below"
                : holding
                  ? "Matches held while browsing"
                  : candidates.length
                    ? "Choose the item you see"
                    : guidance ||
                      "No match at 75% yet — show the product again"}
              {result?.uncertain && candidates.length > 0 && (
                <small>
                  Check identity carefully. Similarity does not confirm
                  approval.
                </small>
              )}
            </div>
            {!!candidates.length && (
              <>
                <div
                  ref={list}
                  className={`${styles.matchList} ${expanded ? styles.matchListExpanded : ""}`}
                  aria-label="Product matches"
                  onScroll={() => {
                    if ((list.current?.scrollTop || 0) > 1 && !expanded) hold();
                  }}
                >
                  {candidates.map((candidate, index) => (
                    <button
                      type="button"
                      className={styles.matchRow}
                      disabled={
                        selecting ||
                        inspectedProductIds.includes(candidate.productId)
                      }
                      key={`${result?.predictionId}:${candidate.productId}:${candidate.variantId}`}
                      onClick={() => void select(candidate)}
                    >
                      <CataloguePicture
                        src={candidate.product?.imageUrl}
                        name={candidate.product?.name || "Catalogue item"}
                      />
                      <span>
                        <strong>
                          {index + 1}.{" "}
                          {candidate.product?.name || "Catalogue item"}
                        </strong>
                        <small>
                          {candidate.product?.brand?.name ||
                            "Confirm physical identity"}
                        </small>
                      </span>
                      <span className={styles.matchScore}>
                        {(candidate.score * 100).toFixed(0)}%
                        <small>
                          {inspectedProductIds.includes(candidate.productId)
                            ? "Added"
                            : "similarity"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {candidates.length > 2 && (
                  <button
                    type="button"
                    className={styles.moreMatches}
                    onClick={() => (expanded ? resume() : hold())}
                    disabled={selecting}
                  >
                    {expanded
                      ? "Refresh live matches"
                      : `More matches · ${candidates.length} — swipe up`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className={styles.cameraActions}>
          <button
            className={`${styles.button} ${styles.primary}`}
            disabled={selecting}
            onClick={() => void start()}
          >
            <Camera size={18} />
            {active ? "Restart camera" : "Start camera"}
          </button>
          <button
            className={styles.button}
            disabled={!active || selecting}
            onClick={() => {
              if (frozen || holding) resume();
              else {
                paused.current = true;
                setFrozen(true);
                setHolding(true);
                video.current?.pause();
              }
            }}
          >
            <Focus size={18} />
            {frozen || holding ? "Resume scan" : "Freeze frame"}
          </button>
          <label className={`${styles.button} ${styles.uploadButton}`}>
            <Upload size={18} />
            Upload photo
            <input
              aria-label="Upload photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={selecting}
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
          {active && (
            <>
              <button
                className={styles.button}
                disabled={selecting}
                onClick={stop}
              >
                <CameraOff size={18} />
                Stop camera
              </button>
              <button
                className={styles.button}
                disabled={selecting}
                onClick={() => {
                  facing.current =
                    facing.current === "environment" ? "user" : "environment";
                  void start();
                }}
              >
                <FlipHorizontal size={18} />
                Switch camera
              </button>
              {hasTorch && (
                <button
                  className={styles.button}
                  disabled={selecting}
                  aria-pressed={torch}
                  onClick={async () => {
                    try {
                      await stream.current
                        ?.getVideoTracks()[0]
                        ?.applyConstraints({
                          advanced: [
                            { torch: !torch } as MediaTrackConstraintSet,
                          ],
                        });
                      setTorch(!torch);
                    } catch {
                      setError("Torch is not available on this camera.");
                    }
                  }}
                >
                  <Zap size={18} />
                  Light
                </button>
              )}
            </>
          )}
        </div>
        <div className={styles.scanStatus} role="status">
          {busyLabel ||
            guidance ||
            (!model
              ? "No published product model. Catalogue search is available."
              : "75% minimum similarity · confirm the physical item before adding.")}
        </div>
      </section>
      {!cameraOnly && (
        <section className={styles.panel}>
          <LiveProductSearch
            inspectedProductIds={inspectedProductIds}
            select={(id, variant, product) => {
              if (onQuickSelect)
                void onQuickSelect(id, variant, undefined, product as Product);
              else {
                stop();
                onSelect(id, variant);
              }
            }}
          />
        </section>
      )}
    </div>
  );
}
