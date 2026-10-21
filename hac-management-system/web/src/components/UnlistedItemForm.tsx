"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./client";
export default function UnlistedItemForm({
  inspectionId,
  onSaved,
  onBusy,
}: {
  inspectionId: string;
  onSaved: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [brandHidden, setBrandHidden] = useState(false);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  function choose(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("Choose a photo of at most 8 MB.");
      return;
    }
    setPhoto(file);
    setError("");
  }
  return (
    <form
      className="form-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!photo) {
          setError("Take or choose a photo of this item.");
          return;
        }
        const form = new FormData(event.currentTarget);
        form.set("file", photo);
        form.set("clientMutationId", key.current);
        if (brandHidden) form.set("brandName", "Not visible on item");
        setBusy(true);
        onBusy(true);
        setError("");
        try {
          try {
            await api(`/inspections/${inspectionId}/unknown`, {
              method: "POST",
              body: form,
            });
          } catch (e) {
            if ((e as { code?: string }).code !== "VERSION_CONFLICT") throw e;
            await api(`/inspections/${inspectionId}/mobile`);
            await api(`/inspections/${inspectionId}/unknown`, {
              method: "POST",
              body: form,
            });
          }
          await onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <p>
        This item and photo stay on this inspection. They are not added to the
        HAC master catalogue.
      </p>
      <div className="unlisted-photo">
        {preview && <img src={preview} alt="Unlisted item preview" />}
        <div className="simple-actions">
          <label className="button primary">
            Take photo
            <input
              className="sr-only"
              aria-label="Take item photo"
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="button secondary">
            Choose photo
            <input
              className="sr-only"
              aria-label="Choose item photo"
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      <label>
        Item name *
        <input autoFocus name="name" required maxLength={300} disabled={busy} />
      </label>
      <label>
        Item type
        <select name="kind" disabled={busy}>
          <option value="PRODUCT">Product</option>
          <option value="RAW_MATERIAL">Raw material</option>
        </select>
      </label>
      <label>
        Brand *
        <input
          name="brandName"
          required={!brandHidden}
          disabled={busy || brandHidden}
          maxLength={300}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={brandHidden}
          disabled={busy}
          onChange={(e) => setBrandHidden(e.target.checked)}
        />
        Brand is not visible on the item
      </label>
      <details>
        <summary>Manufacturer, barcode and other details</summary>
        <div className="form-stack">
          <label>
            Manufacturer
            <input name="manufacturerName" maxLength={300} disabled={busy} />
          </label>
          <label>
            Barcode
            <input
              name="barcode"
              maxLength={300}
              inputMode="numeric"
              disabled={busy}
            />
          </label>
          <label>
            Batch / lot
            <input name="batch" maxLength={300} disabled={busy} />
          </label>
          <label>
            Quantity
            <input
              name="quantity"
              type="number"
              min="0.001"
              step="any"
              disabled={busy}
            />
          </label>
          <label>
            Physical expiry
            <input name="physicalExpiry" type="date" disabled={busy} />
          </label>
          <label>
            Notes
            <textarea name="description" maxLength={2000} disabled={busy} />
          </label>
        </div>
      </details>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy || !photo}>
        {busy ? "Saving item and photo…" : "Add to inspected list"}
      </button>
    </form>
  );
}
