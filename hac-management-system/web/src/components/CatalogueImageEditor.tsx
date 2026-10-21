"use client";
import { useState } from "react";
import { api } from "./client";
import CataloguePicture from "./CataloguePicture";
export default function CatalogueImageEditor({
  kind,
  id,
  name,
  imageUrl,
  editable,
}: {
  kind: "product" | "company";
  id: string;
  name: string;
  imageUrl?: string | null;
  editable: boolean;
}) {
  const [src, setSrc] = useState(imageUrl),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function change(file?: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      if (file) form.set("file", file);
      const result = await api(`/catalogue-images/${kind}/${id}`, {
        method: file ? "POST" : "DELETE",
        ...(file ? { body: form } : {}),
      });
      setSrc(result.imageUrl);
      setNotice(
        file
          ? "Image saved. Supervisors will see it in search and scanning."
          : "Image removed.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalogue-image-editor">
      <CataloguePicture src={src} name={name} company={kind === "company"} />
      <div>
        <h3>
          {kind === "company" ? "Company logo" : "Product / material photo"}
        </h3>
        {editable && (
          <>
            <label className="button secondary">
              {busy ? "Saving…" : src ? "Replace image" : "Add image"}
              <input
                className="sr-only"
                aria-label={
                  kind === "company"
                    ? "Upload company logo"
                    : "Upload product photo"
                }
                type="file"
                accept="image/jpeg,image/png"
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.[0]) void change(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {src && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void change()}
              >
                Remove image
              </button>
            )}
            <p>
              JPEG or PNG, up to 8 MB. Display photos are separate from model
              training images.
            </p>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
