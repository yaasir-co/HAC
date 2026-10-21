"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./ai.module.css";
import Scanner from "./Scanner";
type Product = {
  id: string;
  name: string;
  brand?: { name: string };
  variants?: { id: string; name: string; sku: string }[];
};
type Image = {
  id: string;
  productId: string | null;
  label: string;
  captureGroup: string;
  split: string;
  quality?: { warnings?: string[] };
};
type Metrics = {
  passed: boolean;
  test: {
    accuracy: number;
    top3Accuracy: number | null;
    falseIdentificationRate: number | null;
    sampleCount: number;
    confusionMatrix: Record<string, Record<string, number>>;
    perClass: {
      label: string;
      support: number;
      precision: number;
      recall: number;
      f1: number;
    }[];
  };
  split: { train: number; validation: number; test: number };
};
type Model = {
  id: string;
  version: number;
  status: string;
  metrics: Metrics | null;
  createdAt: string;
  publishedAt?: string;
};
type Dataset = {
  id: string;
  name: string;
  version: number;
  status: string;
  images?: Image[];
  models?: Model[];
  _count?: { images: number };
};
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${url}`, init);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error?.message || "The operation failed.");
  return body.data;
}
export default function TrainingStudio() {
  const [datasets, setDatasets] = useState<Dataset[]>([]),
    [dataset, setDataset] = useState<Dataset | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [productId, setProductId] = useState(""),
    [variantId, setVariantId] = useState(""),
    [newName, setNewName] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [camera, setCamera] = useState(false),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState(""),
    [continuous, setContinuous] = useState(false),
    [intervalMs, setIntervalMs] = useState(1500);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    captureGroup = useRef(crypto.randomUUID()),
    uploading = useRef(false),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
    setContinuous(false);
    if (timer.current) clearInterval(timer.current);
  }, []);
  const refresh = async (id?: string) => {
    const list = await call<Dataset[]>("/ai/datasets");
    setDatasets(list);
    if (id) setDataset(await call<Dataset>(`/ai/datasets/${id}`));
  };
  useEffect(() => {
    Promise.all([
      call<Dataset[]>("/ai/datasets"),
      call<Product[]>("/products?pageSize=100"),
    ])
      .then(([d, p]) => {
        setDatasets(d);
        setProducts(Array.isArray(p) ? p : []);
      })
      .catch((e) => setError(e.message));
    return stop;
  }, [stop]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [stop]);
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy("");
    }
  };
  const start = async () => {
    stop();
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: device
          ? { deviceId: { exact: device } }
          : { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      stream.current = media;
      setCamera(true);
      captureGroup.current = crypto.randomUUID();
      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => {});
        }
      }, 0);
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Camera unavailable: ${e.message}. Allow camera access in browser settings or upload images.`
          : "Camera unavailable. Upload images instead.",
      );
    }
  };
  const upload = useCallback(
    async (file: File, group: string) => {
      if (!dataset) throw new Error("Create or select a dataset first.");
      const form = new FormData();
      form.set("file", file);
      form.set("productId", productId);
      form.set("variantId", variantId);
      form.set("captureGroup", group);
      await call(`/ai/datasets/${dataset.id}/images`, {
        method: "POST",
        body: form,
      });
    },
    [dataset, productId, variantId],
  );
  const capture = useCallback(async () => {
    if (!video.current || !stream.current || uploading.current) return;
    uploading.current = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      if (!canvas.width)
        throw new Error("Wait until the camera preview is ready.");
      canvas.getContext("2d")!.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Could not capture this frame.");
      await upload(
        new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }),
        captureGroup.current,
      );
      await refresh(dataset?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image capture failed.");
    } finally {
      uploading.current = false;
    }
  }, [dataset?.id, upload]);
  useEffect(() => {
    if (continuous) {
      timer.current = setInterval(() => void capture(), intervalMs);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [continuous, intervalMs, capture]);
  const uploadFiles = (files: FileList | File[]) =>
    run("Uploading images", async () => {
      for (const file of Array.from(files))
        await upload(file, crypto.randomUUID());
      await refresh(dataset?.id);
      setMessage(
        "Images stored securely. Review focus, labels and viewpoint diversity before training.",
      );
    });
  const latest = dataset?.models?.[0],
    selected = products.find((p) => p.id === productId),
    images = dataset?.images ?? [];
  const classes = [...new Set(images.map((i) => i.label))];
  return (
    <div className={styles.studio}>
      <div className={styles.message}>
        Recognition suggests product identity. Only the authoritative HAC
        verification engine can evaluate approval. No trained model or accuracy
        is assumed.
      </div>
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
      <section className={styles.panel}>
        <h2>Product training datasets</h2>
        <div className={styles.toolbar}>
          <select
            aria-label="Training dataset"
            className={styles.control}
            value={dataset?.id ?? ""}
            onChange={(e) =>
              void run("Loading dataset", () => refresh(e.target.value))
            }
          >
            <option value="">Choose dataset</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d._count?.images ?? 0} images
              </option>
            ))}
          </select>
          <input
            aria-label="New dataset name"
            className={styles.control}
            placeholder="New dataset name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className={styles.button}
            disabled={!!busy || newName.length < 3}
            onClick={() =>
              void run("Creating dataset", async () => {
                const d = await call<Dataset>("/ai/datasets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: newName }),
                });
                await refresh(d.id);
                setNewName("");
              })
            }
          >
            Create dataset
          </button>
        </div>
      </section>
      {dataset && (
        <>
          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2>Collect product examples</h2>
              <p>
                Capture different angles, distances, backgrounds and lighting.
                Stop and restart the camera for each independent capture
                session. At least three independent groups per class are needed
                to keep training, validation and test data separate.
              </p>
              <div className={styles.toolbar}>
                <label className={styles.label}>
                  Product class
                  <select
                    className={styles.control}
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      setVariantId("");
                      captureGroup.current = crypto.randomUUID();
                    }}
                  >
                    <option value="">Unknown / background</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.brand ? ` · ${p.brand.name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {selected?.variants?.length ? (
                  <label className={styles.label}>
                    SKU / variant
                    <select
                      className={styles.control}
                      value={variantId}
                      onChange={(e) => {
                        setVariantId(e.target.value);
                        captureGroup.current = crypto.randomUUID();
                      }}
                    >
                      <option value="">Whole product</option>
                      {selected.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sku} · {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
              </div>
              <div className={styles.toolbar}>
                <button
                  className={`${styles.button} ${styles.primary}`}
                  onClick={() => void start()}
                >
                  {camera ? "Restart camera" : "Start camera"}
                </button>
                <button
                  className={styles.button}
                  disabled={!camera}
                  onClick={stop}
                >
                  Stop
                </button>
                <button
                  className={styles.button}
                  disabled={!camera}
                  onClick={() => void capture()}
                >
                  Capture image
                </button>
                <button
                  className={styles.button}
                  disabled={!camera}
                  onClick={() => setContinuous((v) => !v)}
                >
                  {continuous ? "Stop collection" : "Collect continuously"}
                </button>
              </div>
              <div className={styles.toolbar} style={{ marginTop: 10 }}>
                <label className={styles.label}>
                  Capture interval
                  <select
                    className={styles.control}
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value))}
                  >
                    <option value={1000}>1 second</option>
                    <option value={1500}>1.5 seconds</option>
                    <option value={3000}>3 seconds</option>
                  </select>
                </label>
                {devices.length > 1 && (
                  <label className={styles.label}>
                    Camera
                    <select
                      className={styles.control}
                      value={device}
                      onChange={(e) => {
                        setDevice(e.target.value);
                        stop();
                      }}
                    >
                      <option value="">Preferred rear camera</option>
                      {devices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div
                className={styles.drop}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void uploadFiles(e.dataTransfer.files);
                }}
              >
                <label className={styles.label}>
                  Upload multiple images or drop them here
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={!!busy}
                    onChange={(e) => {
                      if (e.target.files) void uploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </section>
            <section className={styles.panel}>
              <h2>
                Dataset review{" "}
                <span className={styles.count}>{images.length} images</span>
              </h2>
              <p>
                {classes.length} classes · dataset revision {dataset.version}.
                Similar images are grouped automatically. Blurred images show a
                warning; review and remove poor examples. More frames do not
                guarantee recognition accuracy.
              </p>
              <div className={styles.thumbs}>
                {images.slice(0, 120).map((image) => (
                  <div className={styles.thumb} key={image.id}>
                    <img
                      loading="lazy"
                      alt={`${image.label} training example`}
                      src={`/api/v1/ai/images/${image.id}`}
                    />
                    <button
                      aria-label={`Remove ${image.label} image`}
                      onClick={() =>
                        void run("Removing image", async () => {
                          await call(`/ai/images/${image.id}`, {
                            method: "DELETE",
                          });
                          await refresh(dataset.id);
                        })
                      }
                    >
                      ×
                    </button>
                    <small title={image.label}>{image.label}</small>
                    <small>
                      {image.split}{" "}
                      {image.quality?.warnings?.length ? "⚠ Review" : ""}
                    </small>
                  </div>
                ))}
              </div>
              {!images.length && (
                <p>
                  No samples yet. Select a product, then capture or upload
                  genuine packaging photographs. Also collect a background
                  class.
                </p>
              )}
            </section>
          </div>
          <section className={styles.panel}>
            <h2>Train and evaluate</h2>
            <p>
              Transfer learning uses actual TensorFlow MobileNet features and
              builds a versioned similarity index. Evaluation uses independent
              grouped validation and test samples. Training may take several
              minutes on CPU. The official model must be reachable at
              storage.googleapis.com.
            </p>
            <div className={styles.toolbar}>
              <button
                className={`${styles.button} ${styles.primary}`}
                disabled={!!busy}
                onClick={() =>
                  void run(
                    "Extracting TensorFlow features and evaluating held-out images…",
                    async () => {
                      const model = await call<Model>(
                        `/ai/datasets/${dataset.id}/train`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: "{}",
                        },
                      );
                      await refresh(dataset.id);
                      setMessage(
                        `Model version ${model.version}: ${model.status}. Review the measured test results before publishing.`,
                      );
                    },
                  )
                }
              >
                {busy || "Train model"}
              </button>
              <span className={styles.muted}>
                Nothing is published automatically.
              </span>
            </div>
            {latest?.metrics && (
              <>
                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <strong>
                      {(latest.metrics.test.accuracy * 100).toFixed(1)}%
                    </strong>
                    <span>Held-out top-1 accuracy</span>
                  </div>
                  <div className={styles.metric}>
                    <strong>
                      {latest.metrics.test.top3Accuracy === null
                        ? "N/A"
                        : `${(latest.metrics.test.top3Accuracy * 100).toFixed(1)}%`}
                    </strong>
                    <span>Held-out top-3 accuracy</span>
                  </div>
                  <div className={styles.metric}>
                    <strong>{latest.metrics.test.sampleCount}</strong>
                    <span>Test samples</span>
                  </div>
                  <div className={styles.metric}>
                    <strong>
                      {latest.metrics.test.falseIdentificationRate === null
                        ? "N/A"
                        : `${(latest.metrics.test.falseIdentificationRate * 100).toFixed(1)}%`}
                    </strong>
                    <span>Unknown false identification</span>
                  </div>
                  <div className={styles.metric}>
                    <strong>{latest.metrics.split.train}</strong>
                    <span>Training samples</span>
                  </div>
                  <div className={styles.metric}>
                    <strong>{latest.status.replaceAll("_", " ")}</strong>
                    <span>Version {latest.version}</span>
                  </div>
                </div>
                <p>
                  These measurements describe this held-out dataset. Independent
                  field validation on representative packaging and devices is
                  still required.
                </p>
                <div className={styles.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Samples</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.metrics.test.perClass.map((row) => (
                        <tr key={row.label}>
                          <td>
                            {products.find((p) => row.label.startsWith(p.id))
                              ?.name ?? row.label}
                          </td>
                          <td>{row.support}</td>
                          <td>{row.precision.toFixed(3)}</td>
                          <td>{row.recall.toFixed(3)}</td>
                          <td>{row.f1.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details>
                  <summary>Confusion matrix</summary>
                  <pre style={{ overflow: "auto" }}>
                    {JSON.stringify(
                      latest.metrics.test.confusionMatrix,
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            )}
          </section>
          {latest?.metrics && (
            <details className={styles.panel}>
              <summary onClick={stop}>
                Test latest trained model with real images
              </summary>
              <Scanner
                testModelId={latest.id}
                onSelect={(id) =>
                  setMessage(
                    `Selected candidate ${products.find((p) => p.id === id)?.name ?? id}. Test selection does not change HAC approval records.`,
                  )
                }
              />
            </details>
          )}
          <section className={styles.panel}>
            <h2>Model version history</h2>
            {dataset.models?.length ? (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Deployment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.models.map((model) => (
                      <tr key={model.id}>
                        <td>v{model.version}</td>
                        <td>{model.status.replaceAll("_", " ")}</td>
                        <td>
                          {new Date(model.createdAt).toLocaleString("en-LK", {
                            timeZone: "Asia/Colombo",
                          })}
                        </td>
                        <td>
                          {["VALIDATED", "SUPERSEDED"].includes(model.status) &&
                          model.metrics?.passed ? (
                            <button
                              className={styles.button}
                              disabled={!!busy}
                              onClick={() =>
                                void run("Publishing model", async () => {
                                  await call(
                                    `/ai/models/${model.id}/${model.status === "SUPERSEDED" ? "rollback" : "publish"}`,
                                    { method: "POST" },
                                  );
                                  await refresh(dataset.id);
                                  setMessage(
                                    `Model v${model.version} published by authorized administrator.`,
                                  );
                                })
                              }
                            >
                              {model.status === "SUPERSEDED"
                                ? "Restore this version"
                                : "Approve and publish"}
                            </button>
                          ) : model.status === "PUBLISHED" ? (
                            "Active scanner model"
                          ) : model.status === "ARCHIVED" ? (
                            "Archived — retained for audit"
                          ) : (
                            "Requires validation"
                          )}
                          {model.status !== "ARCHIVED" && (
                            <details>
                              <summary>Archive model</summary>
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const reason = String(
                                    new FormData(event.currentTarget).get(
                                      "reason",
                                    ) || "",
                                  );
                                  void run("Archiving model", async () => {
                                    await call(
                                      `/ai/models/${model.id}/archive`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({ reason }),
                                      },
                                    );
                                    await refresh(dataset.id);
                                    setMessage(
                                      `Model v${model.version} archived. Its training provenance is retained.`,
                                    );
                                  });
                                }}
                              >
                                <label>
                                  Reason
                                  <input
                                    name="reason"
                                    required
                                    minLength={5}
                                    maxLength={2000}
                                  />
                                </label>
                                <button
                                  disabled={!!busy}
                                  className={styles.button}
                                >
                                  Archive
                                </button>
                              </form>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No model has been trained for this dataset.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
