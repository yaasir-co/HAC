"use client";
import OptionalInspectionSignature from "./OptionalInspectionSignature";
import CataloguePicture from "./CataloguePicture";
import UnlistedItemForm from "./UnlistedItemForm";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Download,
  LoaderCircle,
  Package,
  Plus,
  ScanLine,
} from "lucide-react";
import { api, type Row } from "./client";
import LiveProductSearch from "./LiveProductSearch";
import WorkspaceDialog from "./WorkspaceDialog";
import Scanner from "./ai/Scanner";

type Choice = {
  product?: Row;
  productId?: string;
  variantId?: string;
  predictionId?: string;
  name: string;
  kind: "PRODUCT" | "RAW_MATERIAL";
  key: string;
};
const isMaterial = (row: Row) =>
  row.product?.type === "RAW_MATERIAL" ||
  row.conclusion === "UNLISTED_RAW_MATERIAL";
export default function SimpleInspection({
  id,
  user,
}: {
  id: string;
  user: Row;
}) {
  const [inspection, setInspection] = useState<Row | null>(null),
    [error, setError] = useState("");
  const [camera, setCamera] = useState(false),
    [manual, setManual] = useState(false),
    [finishing, setFinishing] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const [name, setName] = useState(""),
    [kind, setKind] = useState<"PRODUCT" | "RAW_MATERIAL">("PRODUCT"),
    [filter, setFilter] = useState("ALL");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const resolver = useRef<(() => void) | null>(null),
    choosing = useRef(false),
    manualKey = useRef(crypto.randomUUID());
  const inspected = useRef(new Set<string>());
  const load = useCallback(async () => {
    try {
      const data = await api(`/inspections/${id}/mobile`);
      inspected.current = new Set(
        data.observations.map((row: Row) => row.productId).filter(Boolean),
      );
      setInspection(data);
      setError("");
      return data;
    } catch (failure) {
      setError((failure as Error).message);
      return null;
    }
  }, [id]);
  useEffect(() => {
    void load();
    return () => {
      resolver.current?.();
    };
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const choose = useCallback(
    async (
      productId: string,
      variantId?: string,
      predictionId?: string,
      product?: Row,
    ) => {
      if (inspected.current.has(productId)) {
        setNotice("This item is already inspected");
        return;
      }
      if (choosing.current) return;
      choosing.current = true;
      setError("");
      try {
        const selected =
          product ??
          (
            await api<Row[]>(
              `/catalogue-search?id=${encodeURIComponent(productId)}`,
            )
          )[0];
        if (!selected)
          throw new Error("This product is no longer available. Search again.");
        await new Promise<void>((resolve) => {
          resolver.current = resolve;
          setChoice({
            product: selected,
            productId,
            variantId,
            predictionId,
            name: selected.name,
            kind: selected.type === "RAW_MATERIAL" ? "RAW_MATERIAL" : "PRODUCT",
            key: crypto.randomUUID(),
          });
        });
      } catch (failure) {
        setError((failure as Error).message);
      } finally {
        choosing.current = false;
      }
    },
    [],
  );
  function closeChoice() {
    if (saving) return;
    setChoice(null);
    resolver.current?.();
    resolver.current = null;
    choosing.current = false;
  }
  async function add(selected: Choice) {
    setSaving(true);
    setError("");
    try {
      const path = `/inspections/${id}/${selected.productId ? "observations" : "unknown"}`;
      const payload = selected.productId
        ? {
            productId: selected.productId,
            variantId: selected.variantId,
            recognitionPredictionId: selected.predictionId,
            identityConfirmed: true,
            conclusion: "OBSERVED",
            clientMutationId: selected.key,
          }
        : {
            name: selected.name,
            kind: selected.kind,
            clientMutationId: selected.key,
          };
      let result: Row;
      try {
        result = await api(path, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (failure) {
        if ((failure as Row).code !== "VERSION_CONFLICT") throw failure;
        await load();
        result = await api(path, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      const row = result.observation ?? result;
      if (selected.productId) inspected.current.add(selected.productId);
      setInspection(
        (current) =>
          current && {
            ...current,
            version:
              current.version +
              (current.observations.some((item: Row) => item.id === row.id)
                ? 0
                : 1),
            observations: [
              {
                ...row,
                product: selected.product ?? null,
                observedName: row.observedName || selected.name,
              },
              ...current.observations.filter((item: Row) => item.id !== row.id),
            ],
          },
      );
      setNotice(`${selected.name} added`);
      setChoice(null);
      setManual(false);
      setName("");
      manualKey.current = crypto.randomUUID();
      resolver.current?.();
      resolver.current = null;
      choosing.current = false;
    } catch (failure) {
      if (
        ["ALREADY_INSPECTED", "DUPLICATE_RECORD"].includes(
          (failure as Row).code,
        )
      ) {
        await load();
        setNotice("This item is already inspected");
        setChoice(null);
        resolver.current?.();
        resolver.current = null;
        choosing.current = false;
      } else setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function removeItem(row: Row) {
    setSaving(true);
    setError("");
    try {
      await api(`/inspections/${id}/remove-item`, {
        method: "POST",
        body: JSON.stringify({
          observationId: row.id,
          version: inspection?.version,
        }),
      });
      await load();
      setNotice("Item removed. Review the updated list before submitting.");
    } catch (failure) {
      setError((failure as Error).message);
      if ((failure as Row).code === "VERSION_CONFLICT") await load();
    } finally {
      setSaving(false);
    }
  }
  async function downloadPdf() {
    setSaving(true);
    setError("");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`/api/v1/reports/${id}?format=pdf`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ||
            "Could not download the report. Please retry.",
        );
      }
      if (!response.headers.get("content-type")?.includes("application/pdf"))
        throw new Error("Please sign in again to download this report.");
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = `${inspection?.reference || "inspection"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) {
      setError(
        (failure as Error).name === "AbortError"
          ? "The PDF is taking too long. Please retry."
          : (failure as Error).message,
      );
    } finally {
      clearTimeout(timer);
      setSaving(false);
    }
  }
  async function submit() {
    setSaving(true);
    setError("");
    try {
      const latest = await load();
      if (!latest) return;
      await api(`/inspections/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({ version: latest.version, declaration: true }),
      });
      await load();
      setFinishing(false);
      setNotice("Inspection submitted. Your PDF is ready.");
    } catch (failure) {
      setError((failure as Error).message);
      if ((failure as Row).code === "REVALIDATION_REQUIRED")
        setNeedsRefresh(true);
    } finally {
      setSaving(false);
    }
  }
  async function refreshChecks() {
    setSaving(true);
    setError("");
    try {
      const latest = await load();
      if (!latest) return;
      await api(`/inspections/${id}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ version: latest.version, acknowledge: true }),
      });
      await load();
      setNeedsRefresh(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!inspection)
    return (
      <section className="panel simple-loading">
        <LoaderCircle size={24} className={error ? "" : "spin"} />
        <h1>
          {error ? "Could not open the inspection" : "Opening inspection…"}
        </h1>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button className="button primary" onClick={() => void load()}>
              Retry
            </button>
          </>
        )}
        <Link href="/inspections">Back to inspections</Link>
      </section>
    );
  const rows: Row[] = inspection.observations,
    materials = rows.filter(isMaterial),
    completed = !["SCHEDULED", "IN_PROGRESS", "DRAFT"].includes(
      inspection.status,
    );
  const editable =
    inspection.status === "IN_PROGRESS" && inspection.inspectorId === user.id;
  const visible =
    filter === "ALL"
      ? rows
      : rows.filter((row) =>
          filter === "MATERIAL" ? isMaterial(row) : !isMaterial(row),
        );
  const confirm = choice && (
    <QuickConfirm
      choice={choice}
      saving={saving}
      error={error}
      cancel={closeChoice}
      add={() => void add(choice)}
    />
  );
  return (
    <div className="simple-inspection">
      <Link className="back-link" href="/inspections">
        ← Inspections
      </Link>
      <div className="simple-heading">
        <CataloguePicture
          src={inspection.company.imageUrl}
          name={inspection.company.legalName}
          company
        />
        <div>
          <span className="eyebrow">{inspection.reference}</span>
          <h1>
            {inspection.company.tradingName || inspection.company.legalName}
          </h1>
          <p>{inspection.location.name}</p>
        </div>
        <span className="simple-count">
          {rows.length}
          <small>inspected</small>
        </span>
      </div>
      {error && !choice && !manual && !finishing && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="simple-toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {completed ? (
        <section className="panel simple-completed">
          <Check size={36} />
          <h2>Inspection submitted</h2>
          <p>{rows.length} items saved to this visit.</p>
          <button
            className="button primary"
            disabled={saving}
            onClick={() => void downloadPdf()}
          >
            <Download size={19} />
            {saving ? "Preparing PDF…" : "Download inspection PDF"}
          </button>
        </section>
      ) : editable ? (
        <>
          <div className="simple-actions">
            <button
              className="button primary"
              onClick={() => {
                setCamera(true);
                setError("");
              }}
            >
              <ScanLine size={22} />
              Scan items
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setManual(true);
                setError("");
              }}
            >
              <Plus size={20} />
              Not in HAC list?
            </button>
          </div>
          <section className="panel">
            <LiveProductSearch
              inspectedProductIds={rows
                .map((row) => row.productId)
                .filter(Boolean)}
              select={(pid, vid, product) => {
                void choose(pid, vid, undefined, product);
              }}
            />
          </section>
        </>
      ) : !completed && inspection.inspectorId === user.id ? (
        <button
          className="button primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api(`/inspections/${id}/start`, { method: "POST" });
              await load();
            } catch (failure) {
              setError((failure as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          Start this visit
        </button>
      ) : (
        <p>This visit belongs to another inspector.</p>
      )}
      <section className="panel simple-saved">
        <div className="panel-heading">
          <h2>Inspected items</h2>
          <span>{rows.length} saved</span>
        </div>
        <div className="simple-filters" aria-label="Inspected item type">
          {[
            ["ALL", `All (${rows.length})`],
            ["PRODUCT", `Products (${rows.length - materials.length})`],
            ["MATERIAL", `Materials (${materials.length})`],
          ].map(([value, title]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {title}
            </button>
          ))}
        </div>
        {!visible.length ? (
          <div className="simple-empty">
            <Package size={32} />
            <p>
              {rows.length
                ? "No items of this type yet."
                : "Scan or search to add your first item."}
            </p>
          </div>
        ) : (
          <ul className="simple-item-list">
            {visible.map((row) => (
              <li key={row.id}>
                <CataloguePicture
                  src={row.product?.imageUrl || row.evidence?.[0]?.url}
                  name={row.product?.name || row.observedName}
                />
                <div>
                  <strong>{row.product?.name || row.observedName}</strong>
                  <small>
                    {isMaterial(row) ? "Material" : "Product"}
                    {!row.productId ? " · Not in HAC list" : ""}
                  </small>
                  <span
                    className={`simple-result ${row.verification?.primaryStatus === "VERIFIED_APPROVED" ? "approved" : "review"}`}
                  >
                    {row.verification?.label ||
                      "Recorded — requires HAC review"}
                  </span>
                </div>
                {editable ? (
                  <RemoveItemControl
                    name={row.product?.name || row.observedName}
                    disabled={saving}
                    remove={() => removeItem(row)}
                  />
                ) : (
                  <Check size={18} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {editable && (
        <div className="simple-finish-bar">
          <button
            className="button primary"
            disabled={!rows.length || saving || !!choice}
            onClick={async () => {
              setFinishing(true);
              setError("");
              await load();
            }}
          >
            Review inspection · {rows.length} items
          </button>
        </div>
      )}
      {camera && (
        <WorkspaceDialog
          title="Scan and add items"
          wide
          close={() => {
            if (saving) return;
            closeChoice();
            setCamera(false);
          }}
        >
          <div className="inspection-camera">
            <Scanner
              inspectionId={id}
              onSelect={() => {}}
              onQuickSelect={choose}
              cameraOnly
              inspectedProductIds={rows
                .map((row) => row.productId)
                .filter(Boolean)}
            />
            {confirm}
          </div>
        </WorkspaceDialog>
      )}
      {!camera && confirm}
      {manual && (
        <WorkspaceDialog
          title="Add an unlisted item"
          close={() => {
            if (!saving) setManual(false);
          }}
        >
          <UnlistedItemForm
            inspectionId={id}
            onBusy={setSaving}
            onSaved={async () => {
              await load();
              setManual(false);
              setNotice("Unlisted item and photo saved");
            }}
          />
        </WorkspaceDialog>
      )}
      {finishing && (
        <WorkspaceDialog
          title="Review inspection"
          close={() => {
            if (!saving) setFinishing(false);
          }}
        >
          <div className="form-stack">
            <h2>{rows.length} inspected items</h2>
            <p>
              Check each item below. You can remove mistakes before submission.
            </p>
            <ul className="review-item-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <div className="review-item-heading">
                    <CataloguePicture
                      src={row.product?.imageUrl || row.evidence?.[0]?.url}
                      name={row.product?.name || row.observedName}
                    />
                    <div>
                      <strong>{row.product?.name || row.observedName}</strong>
                      <small>
                        {row.observedBrand ||
                          row.product?.brand?.name ||
                          "Brand not recorded"}
                      </small>
                      <span>
                        {row.verification?.label || "Requires HAC review"}
                      </span>
                    </div>
                    <RemoveItemControl
                      name={row.product?.name || row.observedName}
                      disabled={saving}
                      remove={() => removeItem(row)}
                    />
                  </div>
                  <details>
                    <summary>Recorded details</summary>
                    <dl>
                      {[
                        ["Manufacturer", row.observedManufacturer],
                        ["Barcode", row.observedBarcode],
                        ["Batch", row.batch],
                        ["Quantity", row.quantity],
                        ["Physical expiry", row.physicalExpiry],
                        ["Notes", row.notes],
                      ]
                        .filter(([, value]) => value != null && value !== "")
                        .map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                    {!row.productId && (
                      <p>Unlisted item — saved on this visit only.</p>
                    )}
                  </details>
                </li>
              ))}
            </ul>
            {(inspection.signatures || []).map((signature: Row) => (
              <p className="saved-signature" key={signature.id}>
                ✓ {signature.name} ·{" "}
                {signature.role === "INSPECTOR"
                  ? "Supervisor"
                  : "Company representative"}{" "}
                ·{" "}
                {signature.hasSignature
                  ? "Signature saved"
                  : "Authenticated confirmation"}
              </p>
            ))}
            <OptionalInspectionSignature
              key={inspection.version}
              inspectionId={id}
              version={inspection.version}
              user={user}
              onSaved={async () => {
                await load();
                setNotice("Signature saved");
              }}
            />

            <p>
              Submitting as <strong>{user.name}</strong>. By submitting, you
              confirm that these saved items accurately reflect your inspection.
            </p>
            <p>
              Approval checks are recorded automatically. A representative
              signature and checklist are optional.
            </p>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {needsRefresh ? (
              <button
                className="button primary"
                disabled={saving}
                onClick={() => void refreshChecks()}
              >
                Refresh approval checks
              </button>
            ) : (
              <button
                className="button primary"
                disabled={saving || !rows.length}
                onClick={() => void submit()}
              >
                {saving ? "Submitting…" : "Confirm & submit inspection"}
              </button>
            )}
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => setFinishing(false)}
            >
              Keep inspecting
            </button>
          </div>
        </WorkspaceDialog>
      )}
    </div>
  );
}
function QuickConfirm({
  choice,
  saving,
  error,
  cancel,
  add,
}: {
  choice: Choice;
  saving: boolean;
  error: string;
  cancel: () => void;
  add: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="quick-confirm-backdrop">
      <div
        className="quick-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label="Add to inspected list?"
        tabIndex={-1}
        ref={ref}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            cancel();
          }
          if (event.key === "Tab") {
            event.stopPropagation();
            const controls = [
              ...(ref.current?.querySelectorAll<HTMLButtonElement>(
                "button:not([disabled])",
              ) ?? []),
            ];
            const first = controls[0],
              last = controls.at(-1);
            if (!first) {
              event.preventDefault();
              return;
            }
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2>
          Add to inspected{" "}
          {choice.kind === "RAW_MATERIAL" ? "materials" : "products"}?
        </h2>
        <CataloguePicture src={choice.product?.imageUrl} name={choice.name} />
        <strong>{choice.name}</strong>
        <p>
          Confirm this is the item you see. HAC approval is checked
          automatically.
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="quick-confirm-actions">
          <button
            className="button secondary"
            disabled={saving}
            onClick={cancel}
          >
            No
          </button>
          <button className="button primary" disabled={saving} onClick={add}>
            {saving ? "Adding…" : "Yes, add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveItemControl({
  name,
  disabled,
  remove,
}: {
  name: string;
  disabled: boolean;
  remove: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div
      className="remove-item-confirm"
      role="group"
      aria-label={`Remove ${name}?`}
    >
      <strong>Remove?</strong>
      <button
        type="button"
        className="button small danger"
        disabled={disabled}
        onClick={async () => {
          await remove();
          setConfirm(false);
        }}
      >
        Yes, remove
      </button>
      <button
        type="button"
        className="button small secondary"
        disabled={disabled}
        onClick={() => setConfirm(false)}
      >
        Keep
      </button>
    </div>
  ) : (
    <button
      type="button"
      className="remove-item-button"
      disabled={disabled}
      aria-label={`Remove ${name}`}
      onClick={() => setConfirm(true)}
    >
      Remove
    </button>
  );
}
