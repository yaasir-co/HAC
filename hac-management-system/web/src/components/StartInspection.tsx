"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, LoaderCircle } from "lucide-react";
import { api, array, Row } from "./client";
import WorkspaceDialog from "./WorkspaceDialog";

export const canStartInspection = (role: string) =>
  ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR"].includes(role);

export default function StartInspectionButton({
  role,
  companyId,
  small = false,
}: {
  role: string;
  companyId?: string;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canStartInspection(role)) return null;
  return (
    <span onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`button ${small ? "small secondary" : "primary"}`}
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck size={small ? 14 : 17} />
        Start inspection
      </button>
      {open && (
        <StartInspectionModal
          role={role}
          initialCompanyId={companyId}
          close={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function StartInspectionModal({
  role,
  initialCompanyId,
  close,
}: {
  role: string;
  initialCompanyId?: string;
  close: () => void;
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Row[]>([]);
  const [checklists, setChecklists] = useState<Row[]>([]);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [locationId, setLocationId] = useState("");
  const [checklistVersionId, setChecklistVersionId] = useState("");
  const [objectives, setObjectives] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api("/companies?pageSize=100"), api("/checklists").catch(() => [])])
      .then(([companyResponse, checklistResponse]) => {
        if (!active) return;
        const available = array(companyResponse).filter(
          (company) => !company.archivedAt && company.status === "ACTIVE",
        );
        const published = array(checklistResponse).filter(
          (checklist) => checklist.status === "PUBLISHED",
        );
        setCompanies(available);
        setChecklists(published);
        setCompanyId((current) =>
          available.some((company) => company.id === current)
            ? current
            : (available[0]?.id ?? ""),
        );
        setChecklistVersionId("");
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const company = companies.find((item) => item.id === companyId);
  const locations = array(company?.locations).filter(
    (location) => location.isActive !== false,
  );
  useEffect(() => {
    setLocationId((current) =>
      locations.some((location) => location.id === current)
        ? current
        : (locations[0]?.id ?? ""),
    );
    // Locations are returned with the selected company's record.
  }, [companyId, companies]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const inspection = await api("/inspections/start-now", {
        method: "POST",
        body: JSON.stringify({
          companyId,
          locationId,
          ...(checklistVersionId ? { checklistVersionId } : {}),
          type: "ROUTINE",
          ...(objectives.trim() ? { objectives: objectives.trim() } : {}),
        }),
      });
      router.push(`/inspections/${encodeURIComponent(inspection.id)}`);
      close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDialog
      title="Start an inspection now"
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit} className="form-stack">
        <p className="modal-intro">
          Start a visit under your own account. No scheduled inspection is
          required. An existing inspection in progress at this company location
          will resume.
        </p>
        {loading ? (
          <p role="status">
            <LoaderCircle className="spin" size={18} /> Loading your companies
            and checklists…
          </p>
        ) : (
          <>
            {!companies.length && (
              <div className="alert info">
                {role === "SUPERVISOR"
                  ? "No active assigned companies are available. Ask an administrator to review your company assignments."
                  : "Add an active company and location before starting an inspection."}
              </div>
            )}
            <label>
              Company *
              <select
                required
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                disabled={busy || !companies.length}
              >
                <option value="">Select a company</option>
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tradingName || item.legalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location *
              <select
                required
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                disabled={busy || !locations.length}
              >
                <option value="">Select a location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {company && !locations.length && (
                <small>
                  This company needs an active location. An administrator can
                  add it in Workspace setup.
                </small>
              )}
            </label>
            <label>
              Checklist (optional)
              <select
                value={checklistVersionId}
                onChange={(event) => setChecklistVersionId(event.target.value)}
                disabled={busy || !checklists.length}
              >
                <option value="">No checklist — products only</option>
                {checklists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.template?.name || item.name || "Inspection checklist"}{" "}
                    · version {item.version}
                  </option>
                ))}
              </select>
              {!checklists.length && (
                <small>
                  You can start and submit this visit without a checklist.
                </small>
              )}
            </label>
            <label>
              Visit objectives
              <textarea
                rows={3}
                maxLength={10000}
                value={objectives}
                onChange={(event) => setObjectives(event.target.value)}
                disabled={busy}
                placeholder="Optional focus for this visit"
              />
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="alert error">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={
              loading ||
              busy ||
              !companyId ||
              !locationId
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ClipboardCheck size={17} />
            )}
            Start inspection
          </button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
