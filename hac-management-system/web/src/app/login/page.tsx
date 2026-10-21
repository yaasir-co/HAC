"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  ScanLine,
  ClipboardCheck,
  LoaderCircle,
} from "lucide-react";
import { api } from "@/components/client";
export default function Login() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.location.href = "/dashboard";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand brand-light" href="/login">
          <img className="hac-wordmark" src="/branding/hac-wordmark.png" alt="Halal Assessment Council"/>
          <span>
            HAC<span className="brand-sub">CERTIFICATION & INSPECTION</span>
          </span>
        </a>
        <div className="login-story-content">
          <span className="eyebrow light">CONFIDENCE THROUGH EVIDENCE</span>
          <h1>
            Every product.
            <br />
            Every inspection.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p>
            One connected workspace for certification records, field inspections
            and informed HAC review.
          </p>
          <div className="login-features">
            <span>
              <ShieldCheck size={20} /> Authoritative verification
            </span>
            <span>
              <ScanLine size={20} /> Product identification
            </span>
            <span>
              <ClipboardCheck size={20} /> Traceable inspections
            </span>
          </div>
        </div>
        <div className="login-foot">
          HAC Intelligent Certification Platform<span>Asia / Colombo</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <span className="eyebrow">YOUR INSPECTION WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p className="muted">Sign in with your assigned HAC account.</p>
          <form onSubmit={submit} className="form-stack">
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                placeholder="you@organisation.lk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy || !ready}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  Sign in <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="security-note">
            <ShieldCheck size={19} />
            <span>
              Access is restricted to authorised personnel.
              <br />
              Activity is recorded for accountability.
            </span>
          </div>
          <p className="login-help">
            Need access? Contact your HAC administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
