"use client";
import { useEffect, useRef, useState } from "react";
import { api, type Row } from "../client";
import LiveProductSearch from "../LiveProductSearch";
import styles from "./ai.module.css";

export default function ProductTrainingLibrary() {
  const [datasets, setDatasets] = useState<Row[]>([]),
    [datasetId, setDatasetId] = useState(""),
    [name, setName] = useState("");
  const [product, setProduct] = useState<Row | null>(null),
    [library, setLibrary] = useState<Row>({ counts: [], images: [] });
  const [models, setModels] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, saved: 0 }),
    [failed, setFailed] = useState<File[]>([]);
  const cancel = useRef(false),
    pause = useRef(false),
    mounted = useRef(true),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    api<Row[]>("/ai/datasets")
      .then(setDatasets)
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
      cancel.current = true;
      pause.current = true;
      controller.current?.abort();
    };
  }, []);
  async function refresh(id = datasetId, selected = product) {
    if (!id) return;
    const [data, jobs] = await Promise.all([
      api<Row>(
        `/ai/training-library?datasetId=${encodeURIComponent(id)}&productId=${encodeURIComponent(selected?.id || "")}`,
      ),
      api<Row[]>(`/ai/training-jobs?datasetId=${encodeURIComponent(id)}`),
    ]);
    if (mounted.current) {
      setLibrary(data);
      setModels(jobs);
    }
  }
  useEffect(() => {
    if (datasetId) void refresh().catch((e) => setError(e.message));
  }, [datasetId, product?.id]); // selected label controls the private preview
  async function upload(files: File[]) {
    if (!files.length || !datasetId || busy || running) return;
    const id = datasetId,
      label = product?.id || "";
    setBusy(true);
    setError("");
    setFailed([]);
    cancel.current = false;
    let saved = 0;
    const failures: File[] = [];
    setProgress({ done: 0, total: files.length, saved: 0 });
    try {
      for (let index = 0; index < files.length && !cancel.current; index++) {
        const form = new FormData();
        form.set("file", files[index]);
        form.set("productId", label);
        form.set("captureGroup", crypto.randomUUID());
        controller.current = new AbortController();
        try {
          await api(`/ai/datasets/${id}/images`, {
            method: "POST",
            body: form,
            signal: controller.current.signal,
          });
          saved++;
        } catch (e) {
          failures.push(files[index]);
          if (!cancel.current)
            setError(`${files[index].name}: ${(e as Error).message}`);
        }
        setProgress({ done: index + 1, total: files.length, saved });
        if (cancel.current) failures.push(...files.slice(index + 1));
      }
      setFailed(failures);
      await refresh(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  async function train(existing?: Row) {
    if (running || busy) return;
    pause.current = false;
    setRunning(true);
    setError("");
    try {
      let job =
        existing ||
        (await api<Row>("/ai/training-jobs", {
          method: "POST",
          body: JSON.stringify({ action: "start", datasetId }),
        }));
      setModels((current) => [
        job,
        ...current.filter((row) => row.id !== job.id),
      ]);
      while (job.status === "TRAINING" && !pause.current && mounted.current) {
        if (job.busy) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          if (pause.current) break;
        }
        job = await api<Row>("/ai/training-jobs", {
          method: "POST",
          body: JSON.stringify({ action: "step", modelId: job.id }),
        });
        if (mounted.current)
          setModels((current) => [
            job,
            ...current.filter((row) => row.id !== job.id),
          ]);
      }
    } catch (e) {
      setError(
        `${(e as Error).message} Saved progress is retained; use Resume training.`,
      );
    } finally {
      if (mounted.current) {
        setRunning(false);
        void refresh().catch((e) => setError(e.message));
      }
    }
  }
  const count = library.counts.find(
    (row: Row) => row.productId === (product?.id || null),
  );
  return (
    <div className={styles.studio}>
      {error && (
        <p role="alert" className={`${styles.message} ${styles.error}`}>
          {error}
        </p>
      )}
      <section className={styles.panel}>
        <h2>Train products and materials</h2>
        <p>
          Add 100 or more varied photographs per item, plus unrelated background
          images. Use different lighting, angles and independent photo sessions.
          More images alone cannot guarantee accuracy.
        </p>
        <div className={styles.toolbar}>
          <select
            aria-label="Training library"
            className={styles.control}
            disabled={busy || running}
            value={datasetId}
            onChange={(e) => {
              setDatasetId(e.target.value);
              setProgress({ done: 0, total: 0, saved: 0 });
              setFailed([]);
            }}
          >
            <option value="">Choose library</option>
            {datasets.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <input
            aria-label="New library name"
            placeholder="New library name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.control}
          />
          <button
            className={styles.button}
            disabled={busy || running || name.trim().length < 3}
            onClick={async () => {
              try {
                const row = await api<Row>("/ai/datasets", {
                  method: "POST",
                  body: JSON.stringify({ name: name.trim() }),
                });
                setDatasets((current) => [row, ...current]);
                setDatasetId(row.id);
                setName("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Create library
          </button>
        </div>
      </section>
      {datasetId && (
        <>
          <section className={styles.panel}>
            <h2>1. Choose an item</h2>
            <fieldset
              disabled={busy || running}
              style={{ border: 0, padding: 0 }}
            >
              <LiveProductSearch
                select={(_id, _variant, row) => {
                  if (!busy && !running && row) {
                    setProduct(row);
                    setFailed([]);
                    setProgress({ done: 0, total: 0, saved: 0 });
                  }
                }}
              />
              <button
                className={styles.button}
                onClick={() => {
                  setProduct(null);
                  setFailed([]);
                  setProgress({ done: 0, total: 0, saved: 0 });
                }}
              >
                Unrelated / background photos
              </button>
            </fieldset>
            <h3>{product?.name || "Unrelated / background photos"}</h3>
            <p>
              {count?.count || 0} stored images · {count?.groups || 0}{" "}
              independent groups. At least 3 groups per class are required for
              separate training, validation and test sets.
            </p>
            <label className={styles.drop}>
              2. Add photos — select 100+ files at once
              <input
                aria-label="Upload training photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || running}
                onChange={(e) => {
                  void upload(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
            </label>
            {progress.total > 0 && (
              <div role="status">
                <progress max={progress.total} value={progress.done} />
                <p>
                  {progress.done} / {progress.total} processed ·{" "}
                  {progress.saved} saved
                  {failed.length ? ` · ${failed.length} need retry` : ""}
                </p>
              </div>
            )}
            {busy && (
              <button
                className={styles.button}
                onClick={() => {
                  cancel.current = true;
                  controller.current?.abort();
                }}
              >
                Stop upload
              </button>
            )}
            {!busy && failed.length > 0 && (
              <button
                className={styles.button}
                onClick={() => void upload(failed)}
              >
                Retry unsuccessful photos ({failed.length})
              </button>
            )}
            <div className={styles.thumbs}>
              {library.images.map((image: Row) => (
                <div className={styles.thumb} key={image.id}>
                  <img
                    loading="lazy"
                    alt={`${image.label} training example`}
                    src={`/api/v1/ai/images/${image.id}`}
                  />
                  <button
                    disabled={busy || running}
                    aria-label={`Remove ${image.label} image`}
                    onClick={async () => {
                      try {
                        await api(`/ai/images/${image.id}`, {
                          method: "DELETE",
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <details>
              <summary>Image counts by item</summary>
              {library.counts.map((row: Row) => (
                <p key={row.productId || "background"}>
                  {row.product?.name || "Unrelated / background"}: {row.count}{" "}
                  images · {row.groups} groups
                </p>
              ))}
            </details>
          </section>
          <section className={styles.panel}>
            <h2>3. Train and review</h2>
            <p>
              Progress is saved in small batches. Keep this page open while
              training; if interrupted, reopen this library and resume.
              Publishing requires measured test results and administrator
              approval.
            </p>
            <button
              className={`${styles.button} ${styles.primary}`}
              disabled={busy || running}
              onClick={() => void train()}
            >
              Train model
            </button>
            {running && (
              <button
                className={styles.button}
                onClick={() => {
                  pause.current = true;
                }}
              >
                Pause after this batch
              </button>
            )}
            {models.map((model) => {
              const metrics = model.metrics,
                job = metrics?.job;
              return (
                <div className={styles.message} key={model.id}>
                  <strong>
                    Version {model.version} ·{" "}
                    {model.status.replaceAll("_", " ")}
                  </strong>
                  {job && (
                    <>
                      <p>
                        {job.processed} / {job.total} images · {job.phase}
                      </p>
                      <progress max={job.total} value={job.processed} />
                      {job.error && <p>{job.error}</p>}
                    </>
                  )}
                  {metrics?.test && (
                    <p>
                      Held-out accuracy:{" "}
                      {(metrics.test.accuracy * 100).toFixed(1)}% · Top 3:{" "}
                      {metrics.test.top3Accuracy == null
                        ? "N/A"
                        : `${(metrics.test.top3Accuracy * 100).toFixed(1)}%`}{" "}
                      · Test images: {metrics.test.sampleCount} · Background
                      false identification:{" "}
                      {metrics.test.falseIdentificationRate == null
                        ? "N/A"
                        : `${(metrics.test.falseIdentificationRate * 100).toFixed(1)}%`}
                    </p>
                  )}
                  {model.status === "TRAINING" && (
                    <button
                      className={styles.button}
                      disabled={busy || running}
                      onClick={() => void train(model)}
                    >
                      Resume training
                    </button>
                  )}
                  {model.status === "VALIDATED" && metrics?.passed && (
                    <button
                      className={styles.button}
                      disabled={busy || running}
                      onClick={async () => {
                        try {
                          await api(`/ai/models/${model.id}/publish`, {
                            method: "POST",
                            body: "{}",
                          });
                          await refresh();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Approve and publish
                    </button>
                  )}
                  {model.status === "PUBLISHED" && <p>Active scanner model</p>}
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
