"use client";
import { useEffect, useState } from "react";
import { Type } from "lucide-react";

const key = "hac.large-text.v1";
export default function ReadabilityControls() {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    try {
      const enabled = localStorage.getItem(key) === "true";
      setLarge(enabled);
      document.documentElement.dataset.largeText = String(enabled);
    } catch { /* Display control still works when storage is unavailable. */ }
  }, []);
  return <button type="button" className="readability-control" aria-pressed={large}
    title="Larger text on this device only" onClick={() => {
      const enabled = !large;
      setLarge(enabled);
      document.documentElement.dataset.largeText = String(enabled);
      try { localStorage.setItem(key, String(enabled)); } catch {}
    }}><Type size={18} /><span>{large ? "Text: large" : "Text size"}</span></button>;
}
