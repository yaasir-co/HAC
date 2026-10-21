"use client";
import { useEffect } from "react";
export default function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Application remains usable if storage is unavailable. */
      });
  }, []);
  return null;
}
