"use client";
import { useRef, useState } from "react";
import { api, type Row } from "./client";
export default function OptionalInspectionSignature({
  inspectionId,
  version,
  user,
  onSaved,
}: {
  inspectionId: string;
  version: number;
  user: Row;
  onSaved: () => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    [drawn, setDrawn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [role, setRole] = useState("INSPECTOR"),
    [name, setName] = useState(user.name || "");
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * 600) / rect.width,
      y: ((event.clientY - rect.top) * 180) / rect.height,
    };
  }
  function clear() {
    canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
    setDrawn(false);
  }
  return (
    <details className="optional-signature">
      <summary>Add signature (optional)</summary>
      <p>
        You may submit without drawing a signature. Changes to inspected items
        clear saved signatures.
      </p>
      <label>
        Signing as
        <select
          disabled={busy}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setName(e.target.value === "INSPECTOR" ? user.name : "");
            clear();
          }}
        >
          <option value="INSPECTOR">Supervisor</option>
          <option value="COMPANY_REPRESENTATIVE">Company representative</option>
        </select>
      </label>
      <label>
        Signer's name
        <input
          value={name}
          maxLength={300}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <canvas
        ref={canvas}
        width={600}
        height={180}
        className="signature-canvas"
        aria-label="Draw optional signature"
        onPointerDown={(event) => {
          if (busy) return;
          drawing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = point(event),
            context = event.currentTarget.getContext("2d");
          context?.beginPath();
          context?.moveTo(p.x, p.y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const p = point(event),
            context = event.currentTarget.getContext("2d");
          if (context) {
            context.strokeStyle = "#102b36";
            context.lineWidth = 3;
            context.lineCap = "round";
            context.lineTo(p.x, p.y);
            context.stroke();
            setDrawn(true);
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <div className="simple-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={clear}
        >
          Clear drawing
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || !drawn || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api(`/inspections/${inspectionId}/sign`, {
                method: "POST",
                body: JSON.stringify({
                  version,
                  name: name.trim(),
                  role,
                  signature: canvas.current?.toDataURL("image/png"),
                }),
              });
              await onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save optional signature"}
        </button>
      </div>
    </details>
  );
}
