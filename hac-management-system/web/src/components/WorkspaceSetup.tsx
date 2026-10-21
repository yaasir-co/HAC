"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  Download,
  Edit3,
  FileText,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api, array, date, label, Row } from "./client";
import WorkspaceDialog from "./WorkspaceDialog";
import styles from "./workspace.module.css";

type SupervisorInput = { name: string; email: string };
type Tab = "setup" | "companies" | "supervisors" | "materials";
const initialNames = ["Yaasir", "Imthad", "Farraj", "Mazhar", "Imaath"];
const initialCompanies = [
  "Keells",
  "Cargills Food City",
  "Arpico",
  "Lanka Sathosa",
  "SPAR Sri Lanka",
  "Glomark",
  "Laugfs Supermarkets",
  "Ceylon Agro Industries",
  "Ceylon Biscuits",
  "Maliban",
];
const tabs: Array<[Tab, string]> = [
  ["setup", "Import workspace"],
  ["companies", "Companies"],
  ["supervisors", "Supervisors"],
  ["materials", "Raw materials"],
];
const categories = ["MEAT_AND_MEAT_BASED_RAW_MATERIALS", "FLAVOURS"];
const reviewStatuses = [
  "SOURCE_LISTED_REQUIRES_REVIEW",
  "VERIFIED",
  "SUSPENDED",
  "REVOKED",
];
const materialFields = [
  ["name", "Full material name and code"],
  ["insNumber", "INS number"],
  ["physicalState", "Physical state (P.S.)"],
  ["brand", "Brand"],
  ["manufacturer", "Manufacturer"],
  ["localSupplier", "Local supplier"],
  ["foreignSupplier", "Foreign supplier"],
  ["certificateBody", "Certificate body"],
  ["otherDocument", "Other document"],
  ["refNo", "Reference number"],
  ["remarks", "Remarks"],
  ["transcriptionNotes", "Transcription / review notes"],
] as const;

function Alert({
  message,
  success = false,
}: {
  message: string;
  success?: boolean;
}) {
  return message ? (
    <div
      role={success ? "status" : "alert"}
      className={`alert ${success ? "success" : "error"}`}
    >
      {success ? <Check size={17} /> : <AlertTriangle size={17} />}
      {message}
    </div>
  ) : null;
}
function companyName(company: Row) {
  return company.tradingName || company.legalName || company.name;
}
function inputDate(value: unknown) {
  return value ? String(value).slice(0, 10) : "";
}
function csvCell(value: unknown, protectFormula = true) {
  let text = String(value ?? "");
  if (protectFormula && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadCredentials(credentials: Row[]) {
  const csv = [
    ["Name", "Login email", "Initial password", "Assigned companies"]
      .map((cell) => csvCell(cell))
      .join(","),
    ...credentials.map((account) =>
      [
        csvCell(account.name),
        csvCell(account.email),
        csvCell(account.password, false),
        csvCell(
          Array.isArray(account.companyNames)
            ? account.companyNames.join("; ")
            : "",
        ),
      ].join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "hac-supervisor-credentials.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WorkspaceSetup() {
  const [data, setData] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>("setup");
  const [companyNames, setCompanyNames] = useState<string[]>(initialCompanies);
  const [supervisors, setSupervisors] = useState<SupervisorInput[]>(
    initialNames.map((name) => ({
      name,
      email: `${name.toLowerCase()}@supervisors.hac.test`,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{
    kind: "company" | "supervisor" | "material";
    row: Row;
  } | null>(null);
  const [credentials, setCredentials] = useState<Row[]>([]);
  const [downloaded, setDownloaded] = useState(false);
  const load = useCallback(async (initial = false) => {
    try {
      const result = await api("/workspace-setup");
      setData(result);
      if (initial) {
        if (
          Array.isArray(result.defaults?.companyNames) &&
          result.defaults.companyNames.length === 10
        )
          setCompanyNames(result.defaults.companyNames);
        if (
          Array.isArray(result.defaults?.supervisors) &&
          result.defaults.supervisors.length === 5
        )
          setSupervisors(result.defaults.supervisors);
      }
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(true);
  }, [load]);
  useEffect(() => {
    if (!credentials.length || downloaded) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardNavigation = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("href")?.startsWith("#")
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setError("Download supervisor credentials before leaving this page.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [credentials.length, downloaded]);
  async function provision(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/workspace-setup", {
        method: "POST",
        body: JSON.stringify({ companyNames, supervisors }),
      });
      const newCredentials = array(result.credentials);
      setCredentials(newCredentials);
      setDownloaded(false);
      await load();
      setNotice(
        `Workspace records are ready. ${newCredentials.length} new supervisor accounts were created. Existing accounts and passwords were preserved.`,
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(action: string, id: string, fields: Row) {
    await api("/workspace-setup", {
      method: "PATCH",
      body: JSON.stringify({ action, id, fields }),
    });
    setEditing(null);
    await load();
    setNotice("Changes saved and recorded in the audit history.");
  }
  const companies = array(data?.companies),
    people = array(data?.supervisors),
    materials = array(data?.materials);
  const filteredMaterials = materials.filter((material) =>
    `${material.name} ${material.brand || ""} ${material.manufacturer || ""} ${material.rowNumber}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className={styles.workspace}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Workspace setup</h1>
          <p>
            Manage your companies, supervisors and imported raw material
            records.
          </p>
        </div>
      </div>
      <Alert message={error} />
      <Alert message={notice} success />
      <div className={styles.sourceNote}>
        <FileText size={20} />
        <p>
          The supplied MARML covers <strong>Ceylon Agro Industries</strong>,
          application PSA0135. Only the 39 rows visible on pages 1–3 of 31 are
          imported. Certificate expiry dates are retained; a historical source
          listing does not make an expired material currently approved.
        </p>
      </div>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Workspace management"
      >
        {tabs.map(([key, title]) => (
          <button
            key={key}
            id={`workspace-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`workspace-panel-${key}`}
            className={tab === key ? styles.active : ""}
            onClick={() => {
              setTab(key);
              setNotice("");
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading" role="status">
          <LoaderCircle size={22} className="spin" />
          Loading workspace records…
        </div>
      ) : (
        <section
          role="tabpanel"
          id={`workspace-panel-${tab}`}
          aria-labelledby={`workspace-tab-${tab}`}
        >
          {tab === "setup" && (
            <form onSubmit={provision}>
              <div className={styles.summary}>
                <Summary
                  icon={<Building2 size={20} />}
                  count={10}
                  text="Company profiles"
                />
                <Summary
                  icon={<Users size={20} />}
                  count={5}
                  text="Supervisors · 2 companies each"
                />
                <Summary
                  icon={<FileText size={20} />}
                  count={39}
                  text="Source material rows"
                />
              </div>
              {data?.imported && (
                <div className="alert info">
                  Workspace records already exist. Use the Companies,
                  Supervisors and Raw materials tabs to edit them. Re-importing
                  only adds missing records and does not reset passwords.
                </div>
              )}
              <section className={`panel ${styles.formPanel}`}>
                <h2>Company names</h2>
                <p>
                  Review the ten profiles. Legal registration details and
                  location addresses can be completed after import.
                </p>
                <div className="form-grid">
                  {companyNames.map((name, index) => (
                    <label key={index}>
                      Company {index + 1}
                      <input
                        required
                        readOnly={index === 7}
                        maxLength={200}
                        value={name}
                        onChange={(event) =>
                          setCompanyNames((current) =>
                            current.map((value, position) =>
                              position === index ? event.target.value : value,
                            ),
                          )
                        }
                        disabled={busy || Boolean(data?.imported)}
                      />
                      {index === 7 && (
                        <small>
                          This source-company name is fixed for the MARML
                          import. Profile corrections can be made after import.
                        </small>
                      )}
                    </label>
                  ))}
                </div>
              </section>
              <section className={`panel ${styles.formPanel}`}>
                <h2>Supervisor accounts and company assignments</h2>
                <p>
                  Replace the suggested sign-in addresses with real email
                  addresses if available. Initial passwords are generated
                  privately and can be downloaded once after creation.
                </p>
                <div className={styles.supervisorForms}>
                  {supervisors.map((person, index) => (
                    <div key={index} className={styles.supervisorEntry}>
                      <span className={styles.number}>{index + 1}</span>
                      <label>
                        Supervisor name
                        <input
                          required
                          maxLength={200}
                          value={person.name}
                          onChange={(event) =>
                            setSupervisors((current) =>
                              current.map((item, position) =>
                                position === index
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          disabled={busy || Boolean(data?.imported)}
                        />
                      </label>
                      <label>
                        Sign-in email
                        <input
                          required
                          type="email"
                          maxLength={254}
                          value={person.email}
                          onChange={(event) =>
                            setSupervisors((current) =>
                              current.map((item, position) =>
                                position === index
                                  ? { ...item, email: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          disabled={busy || Boolean(data?.imported)}
                        />
                      </label>
                      <p className={styles.assignment}>
                        <Building2 size={15} />
                        {companyNames[index * 2]}
                        <br />
                        {companyNames[index * 2 + 1]}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <div className={styles.setupActions}>
                <p>
                  Only administrators can run this import. Company records do
                  not imply a certification decision.
                </p>
                <button
                  className="button primary"
                  disabled={busy || Boolean(credentials.length)}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}
                  {data?.imported
                    ? "Add missing workspace records"
                    : "Create workspace and import materials"}
                </button>
              </div>
            </form>
          )}
          {tab === "companies" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Company profiles</h2>
                  <p>Update profile details and inspection locations.</p>
                </div>
                <span className="count-pill">{companies.length}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Registration</th>
                      <th>Location</th>
                      <th>Contact</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((company) => (
                      <tr key={company.id}>
                        <td>
                          <strong>{companyName(company)}</strong>
                          <small>{company.legalName}</small>
                        </td>
                        <td>{company.registrationNumber || "Not supplied"}</td>
                        <td>
                          {array(company.locations).map((location) => (
                            <div key={location.id}>
                              <strong>{location.name}</strong>
                              <small>{location.address}</small>
                            </div>
                          ))}
                        </td>
                        <td>
                          {company.email || "—"}
                          <br />
                          {company.phone || "—"}
                        </td>
                        <td>
                          <button
                            className="button small secondary"
                            onClick={() =>
                              setEditing({ kind: "company", row: company })
                            }
                          >
                            <Edit3 size={14} />
                            Edit company
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!companies.length && <EmptyImport />}
            </section>
          )}
          {tab === "supervisors" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Supervisors and assigned companies</h2>
                  <p>
                    Each supervisor can start a visit at either assigned company
                    without a scheduled inspection.
                  </p>
                </div>
                <span className="count-pill">{people.length}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Supervisor</th>
                      <th>Sign-in email</th>
                      <th>Assigned companies</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => (
                      <tr key={person.id}>
                        <td>
                          <strong>{person.name}</strong>
                        </td>
                        <td>{person.email}</td>
                        <td>
                          {array(person.assignments)
                            .filter(
                              (assignment) =>
                                assignment.isActive !== false &&
                                !assignment.revokedAt,
                            )
                            .map((assignment) => (
                              <div key={assignment.companyId}>
                                {companyName(
                                  assignment.company ||
                                    companies.find(
                                      (company) =>
                                        company.id === assignment.companyId,
                                    ) ||
                                    {},
                                )}
                              </div>
                            ))}
                        </td>
                        <td>{person.isActive ? "Yes" : "No"}</td>
                        <td>
                          <button
                            className="button small secondary"
                            onClick={() =>
                              setEditing({ kind: "supervisor", row: person })
                            }
                          >
                            <Edit3 size={14} />
                            Edit supervisor
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!people.length && <EmptyImport />}
            </section>
          )}
          {tab === "materials" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Imported MARML materials</h2>
                  <p>
                    Edit current interpreted fields while retaining the original
                    transcribed source.
                  </p>
                </div>
                <span className="count-pill">{materials.length}</span>
              </div>
              <div className="table-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search imported materials"
                    placeholder="Search name, brand or manufacturer…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Source row</th>
                      <th>Material</th>
                      <th>Brand / manufacturer</th>
                      <th>Certificate body / expiry</th>
                      <th>Review</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map((material) => (
                      <tr key={material.id}>
                        <td>
                          {material.rowNumber}
                          <small>Page {material.sourcePage}</small>
                        </td>
                        <td>
                          <strong>
                            {material.name || material.product?.name}
                          </strong>
                          <small>{label(material.category)}</small>
                        </td>
                        <td>
                          {material.brand || "—"}
                          <small>{material.manufacturer || "—"}</small>
                        </td>
                        <td>
                          {material.certificateBody || "—"}
                          <small>{date(material.certificateExpiry)}</small>
                          {material.certificateExpiry &&
                            new Date(material.certificateExpiry).getTime() <
                              Date.now() && (
                              <span className={styles.expired}>
                                Expired source date
                              </span>
                            )}
                        </td>
                        <td>{label(material.reviewStatus)}</td>
                        <td>
                          <button
                            className="button small secondary"
                            onClick={() =>
                              setEditing({ kind: "material", row: material })
                            }
                          >
                            <Edit3 size={14} />
                            Review / edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!materials.length && <EmptyImport />}
              {materials.length > 0 && !filteredMaterials.length && (
                <p className={styles.empty}>No materials match this search.</p>
              )}
            </section>
          )}
        </section>
      )}
      {credentials.length > 0 && (
        <section
          className={styles.credentials}
          aria-label="New supervisor credentials"
        >
          <ShieldCheck size={23} />
          <div>
            <h2>Save the new supervisor credentials</h2>
            <p>
              {credentials.length} newly created accounts are available in this
              page only. Download the private CSV before leaving. Existing
              passwords are never reissued.
            </p>
            <div className={styles.credentialActions}>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  downloadCredentials(credentials);
                  setDownloaded(true);
                  setError("");
                }}
              >
                <Download size={17} />
                Download private credentials CSV
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={!downloaded}
                onClick={() => {
                  setCredentials([]);
                  setDownloaded(false);
                }}
              >
                Clear credentials from this page
              </button>
            </div>
          </div>
        </section>
      )}
      {editing && (
        <RecordEditor
          kind={editing.kind}
          row={editing.row}
          companies={companies}
          close={() => setEditing(null)}
          save={save}
        />
      )}
    </div>
  );
}

function Summary({
  icon,
  count,
  text,
}: {
  icon: React.ReactNode;
  count: number;
  text: string;
}) {
  return (
    <div>
      {icon}
      <strong>{count}</strong>
      <span>{text}</span>
    </div>
  );
}
function EmptyImport() {
  return (
    <p className={styles.empty}>
      Create the workspace from the Import workspace tab to add these records.
    </p>
  );
}

export function MaterialSourceDetails({ material }: { material: Row }) {
  const metadata = material.sourceMetadata || {};
  return (
    <section className={styles.sourceDetails}>
      <h3>MARML source record</h3>
      <dl className="detail-grid">
        <div>
          <dt>Source company</dt>
          <dd>
            {material.sourceCompanyName ||
              material.sourceCompany?.legalName ||
              "Ceylon Agro Industries"}
          </dd>
        </div>
        <div>
          <dt>Source reference</dt>
          <dd>
            Page {material.sourcePage}, row {material.rowNumber} ·{" "}
            {metadata.applicationNumber || "PSA0135"}
          </dd>
        </div>
        <div>
          <dt>Local supplier</dt>
          <dd>{material.localSupplier || "—"}</dd>
        </div>
        <div>
          <dt>Foreign supplier</dt>
          <dd>{material.foreignSupplier || "—"}</dd>
        </div>
        <div>
          <dt>Certificate body</dt>
          <dd>{material.certificateBody || "—"}</dd>
        </div>
        <div>
          <dt>Source certificate expiry</dt>
          <dd>{date(material.certificateExpiry)}</dd>
        </div>
        <div>
          <dt>Review status</dt>
          <dd>{label(material.reviewStatus)}</dd>
        </div>
        <div>
          <dt>Remarks</dt>
          <dd>{material.remarks || "—"}</dd>
        </div>
        {material.transcriptionNotes && (
          <div className="span-two">
            <dt>Transcription notes</dt>
            <dd>{material.transcriptionNotes}</dd>
          </div>
        )}
      </dl>
      <p className="small-text muted">
        Source scope applies to the named source company. Inspect the current
        certificate, identity and company relationship before reaching a
        conclusion.
      </p>
      {material.sourceRow && (
        <details className={styles.original}>
          <summary>Original transcribed source (read only)</summary>
          <pre>{JSON.stringify(material.sourceRow, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function RecordEditor({
  kind,
  row,
  companies,
  close,
  save,
}: {
  kind: "company" | "supervisor" | "material";
  row: Row;
  companies: Row[];
  close: () => void;
  save: (action: string, id: string, fields: Row) => Promise<void>;
}) {
  const firstLocation = array(row.locations)[0];
  const assigned = array(row.assignments)
    .filter(
      (assignment) => assignment.isActive !== false && !assignment.revokedAt,
    )
    .map((assignment) => assignment.companyId);
  const [form, setForm] = useState<Row>(() => ({
    ...row,
    certificateExpiry: inputDate(row.certificateExpiry),
    locationId: firstLocation?.id || "",
    locationName: firstLocation?.name || "",
    address: firstLocation?.address || "",
    company1: assigned[0] || "",
    company2: assigned[1] || "",
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function change(key: string, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      let fields: Row;
      if (kind === "material") {
        fields = Object.fromEntries(
          materialFields.map(([key]) => [
            key,
            String(form[key] || "").trim() || null,
          ]),
        );
        fields.category = form.category;
        fields.reviewStatus = form.reviewStatus;
        fields.certificateExpiry = form.certificateExpiry || null;
      } else if (kind === "company") {
        fields = Object.fromEntries(
          [
            "legalName",
            "tradingName",
            "registrationNumber",
            "email",
            "phone",
            "category",
          ].map((key) => [key, String(form[key] || "").trim() || null]),
        );
        if (form.locationId)
          Object.assign(fields, {
            locationId: form.locationId,
            locationName: form.locationName,
            address: form.address,
          });
      } else {
        if (!form.company1 || !form.company2 || form.company1 === form.company2)
          throw new Error(
            "Select two different companies for this supervisor.",
          );
        fields = {
          name: form.name.trim(),
          email: form.email.trim(),
          isActive: Boolean(form.isActive),
          companyIds: [form.company1, form.company2],
        };
        if (form.newPassword) fields.password = form.newPassword;
      }
      await save(kind, row.id, fields);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDialog
      title={`Edit ${kind === "material" ? "raw material" : kind}`}
      close={() => {
        if (!busy) close();
      }}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          {kind === "material" && (
            <>
              {materialFields.map(([key, title]) => (
                <label
                  key={key}
                  className={
                    [
                      "name",
                      "manufacturer",
                      "remarks",
                      "transcriptionNotes",
                    ].includes(key)
                      ? "span-two"
                      : ""
                  }
                >
                  {title}
                  {key === "name" ? " *" : ""}
                  {key === "physicalState" ? (
                    <select
                      value={form.physicalState || ""}
                      onChange={(event) =>
                        change("physicalState", event.target.value)
                      }
                      disabled={busy}
                    >
                      <option value="">Not recorded</option>
                      <option value="s">s — solid</option>
                      <option value="lq">lq — liquid</option>
                      <option value="l">l — as recorded</option>
                      <option value="pw">pw — powder</option>
                    </select>
                  ) : [
                      "name",
                      "manufacturer",
                      "remarks",
                      "transcriptionNotes",
                      "localSupplier",
                      "foreignSupplier",
                    ].includes(key) ? (
                    <textarea
                      rows={key === "manufacturer" ? 3 : 2}
                      required={key === "name"}
                      maxLength={key === "name" ? 191 : 10000}
                      value={form[key] || ""}
                      onChange={(event) => change(key, event.target.value)}
                      disabled={busy}
                    />
                  ) : (
                    <input
                      maxLength={191}
                      value={form[key] || ""}
                      onChange={(event) => change(key, event.target.value)}
                      disabled={busy}
                    />
                  )}
                </label>
              ))}
              <label>
                Category
                <select
                  required
                  value={form.category}
                  onChange={(event) => change("category", event.target.value)}
                  disabled={busy}
                >
                  {categories.map((value) => (
                    <option value={value} key={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Certificate expiry
                <input
                  type="date"
                  value={form.certificateExpiry}
                  onChange={(event) =>
                    change("certificateExpiry", event.target.value)
                  }
                  disabled={busy}
                />
              </label>
              <label className="span-two">
                Authorized review status
                <select
                  required
                  value={form.reviewStatus}
                  onChange={(event) =>
                    change("reviewStatus", event.target.value)
                  }
                  disabled={busy}
                >
                  {reviewStatuses.map((value) => (
                    <option value={value} key={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
                <small>
                  Changing the review status does not extend an expired
                  certificate or transfer the source scope to another company.
                </small>
              </label>
            </>
          )}
          {kind === "company" && (
            <>
              {[
                ["legalName", "Company / legal name"],
                ["tradingName", "Trading name"],
                ["registrationNumber", "Registration number (if known)"],
                ["email", "Contact email"],
                ["phone", "Contact phone"],
              ].map(([key, title]) => (
                <label key={key}>
                  {title}
                  {key === "legalName" ? " *" : ""}
                  <input
                    required={key === "legalName"}
                    type={key === "email" ? "email" : "text"}
                    value={form[key] || ""}
                    onChange={(event) => change(key, event.target.value)}
                    disabled={busy}
                  />
                </label>
              ))}
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(event) => change("category", event.target.value)}
                  disabled={busy}
                >
                  {[
                    "RETAILER",
                    "MANUFACTURER",
                    "SUPPLIER",
                    "DISTRIBUTOR",
                    "OTHER",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              {array(row.locations).length > 0 && (
                <>
                  <label className="span-two">
                    Location to update
                    <select
                      value={form.locationId}
                      onChange={(event) => {
                        const location = array(row.locations).find(
                          (item) => item.id === event.target.value,
                        );
                        setForm((current) => ({
                          ...current,
                          locationId: location?.id || "",
                          locationName: location?.name || "",
                          address: location?.address || "",
                        }));
                      }}
                      disabled={busy}
                    >
                      {array(row.locations).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Location name *
                    <input
                      required
                      value={form.locationName}
                      onChange={(event) =>
                        change("locationName", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Location address *
                    <textarea
                      required
                      rows={3}
                      value={form.address}
                      onChange={(event) =>
                        change("address", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {kind === "supervisor" && (
            <>
              <label>
                Supervisor name *
                <input
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(event) => change("name", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Sign-in email *
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(event) => change("email", event.target.value)}
                  disabled={busy}
                />
              </label>
              {[1, 2].map((position) => (
                <label key={position}>
                  Assigned company {position} *
                  <select
                    required
                    value={form[`company${position}`]}
                    onChange={(event) =>
                      change(`company${position}`, event.target.value)
                    }
                    disabled={busy}
                  >
                    <option value="">Select a company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {companyName(company)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  onChange={(event) => change("isActive", event.target.checked)}
                  disabled={busy}
                />
                Account is active
              </label>
              <label className="span-two">
                New password (optional)
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={1024}
                  value={form.newPassword || ""}
                  onChange={(event) =>
                    change("newPassword", event.target.value)
                  }
                  disabled={busy}
                />
                <small>
                  Leave blank to preserve the current password. Setting a new
                  password ends the supervisor's current sessions. Keep the
                  replacement password private.
                </small>
              </label>
              <p className="small-text muted span-two">
                Profile and company assignment changes preserve the saved
                password unless a replacement is supplied above. A supervisor
                can start inspections only for currently assigned companies.
              </p>
            </>
          )}
        </div>
        {kind === "material" && <MaterialSourceDetails material={row} />}
        <Alert message={error} />
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Save changes
          </button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
