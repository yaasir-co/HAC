"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, LoaderCircle, Package, Search, X } from "lucide-react";
import { api, array, type Row } from "./client";

export default function LiveProductSearch({ select, initialQuery = "" }: {
  select: (id: string, variantId?: string, product?: Row) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const results = useRef<HTMLUListElement>(null);
  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    // Clear earlier results immediately so a fast tap cannot choose a stale match.
    setRows([]);
    const timer = setTimeout(async () => {
      try {
        const response = await api(`/catalogue-search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!controller.signal.aborted) setRows(array(response));
      } catch (failure) {
        if (!controller.signal.aborted) setError((failure as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, query.trim() ? 220 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, revision]);
  return <section className="live-product-search" aria-label="Find a catalogue product">
    <div className="panel-heading"><div><h2>Find and add a product</h2><p>Type a name, brand, item code or barcode. Tap an item, then confirm Add.</p></div></div>
    <form className="inline-search" onSubmit={event => { event.preventDefault(); setRevision(value => value + 1); }}>
      <div className="search-field">
        <Search size={20} aria-hidden="true" />
        <input aria-label="Find product" aria-controls="live-product-results" autoComplete="off" inputMode="search" enterKeyHint="search" maxLength={100}
          value={query} onChange={event => { setRows([]); setBusy(true); setQuery(event.target.value); }} placeholder="Search products as you type…"
          onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); results.current?.querySelector("button")?.focus(); } }} />
        {query && <button type="button" className="icon-button" aria-label="Clear product search" onClick={() => setQuery("")}><X size={18} /></button>}
      </div>
    </form>
    <div role="status" aria-live="polite" className="search-status">
      {busy ? <><LoaderCircle size={16} className="spin" /> Searching catalogue…</> : error ? "" : rows.length ? `${rows.length} ${query.trim() ? "matching" : "catalogue"} ${rows.length === 1 ? "product" : "products"}` : "No matching products. Try a shorter name, brand or item code."}
    </div>
    {error && <div role="alert" className="alert error">{error}<button type="button" className="button secondary" onClick={() => setRevision(value => value + 1)}>Retry search</button></div>}
    <ul id="live-product-results" ref={results} className="product-search-grid" aria-label="Matching products" aria-busy={busy}>
      {rows.map(product => <li key={product.id}><button type="button" className="search-product"
        onClick={() => select(product.id, product.variants?.length === 1 ? product.variants[0].id : undefined, product)}>
        <span className="product-tile-icon"><Package size={25} /></span>
        <span className="search-product-copy"><strong>{product.name}</strong><small>{product.brand?.name || "Brand not recorded"} · {product.itemCode}</small>
          <span>{product.variants?.length === 1 ? product.variants[0].name : product.variants?.length > 1 ? "Choose the exact packaging after selecting" : "Raw material / unpackaged item"}</span></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button></li>)}
    </ul>
  </section>;
}
