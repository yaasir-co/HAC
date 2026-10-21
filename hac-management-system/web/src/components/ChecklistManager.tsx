"use client";
import { useEffect, useState } from "react";
import { Edit3, ListChecks, Plus, Save, Trash2, X } from "lucide-react";
import { api, array, type Row } from "./client";

function blankQuestion(): Row { return { id: crypto.randomUUID(), section: "General", text: "", type: "COMPLIANCE", options: null, condition: null, requiresEvidenceOn: null }; }
export default function ChecklistManager() {
  const [records, setRecords] = useState<Row[]>([]);
  const [form, setForm] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    try { setRecords(array(await api("/checklist-management"))); }
    catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function edit(record?: Row) {
    const version = record?.versions?.[0];
    setForm({ templateId: record?.id, expectedVersion: version?.version, name: record?.name ?? "", description: record?.description ?? "", questions: version?.questions?.map((q: Row) => ({ id: q.id, section: q.section, text: q.text, type: q.type, options: q.options, condition: q.condition, requiresEvidenceOn: q.requiresEvidenceOn })) ?? [blankQuestion()] });
    setError(""); setNotice("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/checklist-management", { method: "POST", body: JSON.stringify(form) }); setForm(null); await load(); setNotice("Checklist published for future visits. Earlier versions and saved answers are retained."); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(record: Row) {
    if (!window.confirm(`Remove “${record.name}” from future inspections? Saved visits and answers will be retained.`)) return;
    setBusy(true); setError("");
    try { await api("/checklist-management", { method: "DELETE", body: JSON.stringify({ templateId: record.id }) }); await load(); setNotice("Checklist removed from future visits. Existing records are retained."); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  function changeQuestion(index: number, values: Row) {
    setForm(current => current && ({ ...current, questions: current.questions.map((q: Row, i: number) => i === index ? { ...q, ...values } : q) }));
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Inspection checklists</h1><p>Optional question sets for supervisors. Add, edit or remove questions at any time.</p></div>
      {!form && <button className="button primary" onClick={() => edit()}><Plus size={18} />Add checklist</button>}
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {loading && <p role="status">Loading checklists…</p>}
    {!form ? <div className="checklist-template-list">{records.map(record => {
      const version = record.versions?.[0];
      return <section key={record.id} className="checklist-template-card"><div><h2>{record.name}</h2><p>{array(version?.questions).length} optional questions · v{version?.version} · {version?.status === "PUBLISHED" ? "Available" : "Removed from future visits"}</p>{record.description && <p>{record.description}</p>}</div><div className="heading-actions">
        <button className="button secondary" disabled={busy} onClick={() => edit(record)}><Edit3 size={17} />Edit questions</button>
        {version?.status === "PUBLISHED" && <button className="button secondary" disabled={busy} onClick={() => void remove(record)}><Trash2 size={17} />Remove</button>}
      </div></section>;
    })}{!records.length && !loading && <section className="panel checklist-editor"><ListChecks size={28} /><h2>No checklists yet</h2><p>Supervisors can start and submit product inspections without one.</p></section>}</div> :
    <form className="panel checklist-editor" onSubmit={save}>
      <div className="section-title-row"><h2>{form.templateId ? "Edit checklist" : "New checklist"}</h2><button type="button" className="icon-button" aria-label="Close checklist editor" disabled={busy} onClick={() => setForm(null)}><X size={20} /></button></div>
      <p>All questions are optional. Saving creates a new version for future inspections.</p>
      <label>Checklist name<input required maxLength={300} value={form.name} disabled={busy} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Description<textarea rows={2} maxLength={10000} value={form.description} disabled={busy} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      {form.questions.map((q: Row, index: number) => <section className="checklist-editor-question" key={q.id}>
        <div className="section-title-row"><h3>Question {index + 1}</h3><button type="button" className="button secondary" disabled={busy} onClick={() => {
          setForm({ ...form, questions: form.questions.filter((_: Row, i: number) => i !== index).map((other: Row) => other.condition?.questionId === q.id ? { ...other, condition: null } : other) });
        }}><Trash2 size={16} />Remove question</button></div>
        <label>Question<input required maxLength={10000} value={q.text} disabled={busy} onChange={e => changeQuestion(index, { text: e.target.value })} /></label>
        <div className="form-grid"><label>Section<input required maxLength={300} value={q.section} disabled={busy} onChange={e => changeQuestion(index, { section: e.target.value })} /></label>
        <label>Answer type<select value={q.type} disabled={busy} onChange={e => changeQuestion(index, { type: e.target.value, options: e.target.value === "MULTIPLE_CHOICE" ? [] : null, requiresEvidenceOn: null })}>
          <option value="COMPLIANCE">Compliance / not applicable</option><option value="YES_NO">Yes / no</option><option value="PASS_FAIL">Pass / fail</option><option value="TEXT">Text</option><option value="NUMERIC">Number</option><option value="DATE">Date</option><option value="MULTIPLE_CHOICE">Multiple choice</option><option value="PHOTOGRAPH">Evidence photo ID</option><option value="ATTACHMENT">Evidence attachment ID</option><option value="SIGNATURE">Recorded signature text</option>
        </select></label></div>
        {q.type === "MULTIPLE_CHOICE" && <label>Choices (one per line)<textarea required rows={4} disabled={busy} value={array(q.options).join("\n")} onChange={e => changeQuestion(index, { options: e.target.value.split("\n") })} /></label>}
        {q.condition && <div><p>An existing conditional rule is retained. Removing its source question also clears this condition.</p><button type="button" className="button secondary" onClick={() => changeQuestion(index, { condition: null })}>Show this question for every visit</button></div>}
      </section>)}
      <button type="button" className="button secondary" disabled={busy || form.questions.length >= 300} onClick={() => setForm({ ...form, questions: [...form.questions, blankQuestion()] })}><Plus size={18} />Add question</button>
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setForm(null)}>Cancel</button><button className="button primary" disabled={busy}><Save size={18} />{busy ? "Saving…" : "Publish checklist"}</button></div>
    </form>}
  </>;
}
