"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export default function PwaRegistration() {
  const [show, setShow] = useState(false),
    [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [ios, setIos] = useState(false),
    [installed, setInstalled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone());
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const mobile =
      window.matchMedia("(max-width: 900px)").matches ||
      /Android|iPhone|iPad/.test(navigator.userAgent);
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("hac-install-dismissed") === "1";
    } catch {}
    const timer = setTimeout(() => {
      if (mobile && !standalone() && !dismissed) setShow(true);
    }, 1200);
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setShow(false);
      setPrompt(null);
    };
    const reopen = () => {
      if (!standalone()) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    window.addEventListener("hac-install", reopen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      window.removeEventListener("hac-install", reopen);
    };
  }, []);
  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem("hac-install-dismissed", "1");
    } catch {}
  }
  if (!show || installed) return null;
  return (
    <aside className="install-hac" role="dialog" aria-label="Install HAC app">
      <img src="/branding/hac-app-192.png" alt="HAC halal app icon" />
      <div>
        <h2>Install HAC on this device</h2>
        <p>Open inspections directly from your home screen.</p>
        {!prompt && (
          <p>
            {ios
              ? "Tap Share, then Add to Home Screen, then Add."
              : "Open your browser menu and choose Install app or Add to Home screen. Use Chrome or Edge if your browser has no install option."}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="install-actions">
          {prompt && (
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await prompt.prompt();
                  const choice = await prompt.userChoice;
                  if (choice.outcome === "accepted") {
                    setShow(false);
                    setInstalled(true);
                  } else dismiss();
                  setPrompt(null);
                } catch {
                  setError(
                    "Use your browser menu to install, or try again later.",
                  );
                  setPrompt(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Opening…" : "Install app"}
            </button>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={dismiss}
          >
            {prompt ? "Later" : "Got it"}
          </button>
        </div>
      </div>
    </aside>
  );
}
