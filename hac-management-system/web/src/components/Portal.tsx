"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  AlertTriangle,
  History,
  Wifi,
  Download,
  CheckCircle2,
  Circle,
  FolderOpen,
  Paperclip,
  Eye,
} from "lucide-react";
import ProductTrainingLibrary from "@/components/ai/ProductTrainingLibrary";
import Scanner from "@/components/ai/Scanner";
import LiveProductSearch from "./LiveProductSearch";
import ReadabilityControls from "./ReadabilityControls";
import ChecklistManager from "./ChecklistManager";
import SimpleInspection from "./SimpleInspection";
import { cleanObservationInput } from "@/lib/observation-input";
import WorkspaceSetup, { MaterialSourceDetails } from "./WorkspaceSetup";
import StartInspectionButton, { canStartInspection } from "./StartInspection";
import { api, array, date, label, Row } from "./client";
import {
  unlockOfflineSession,
  queueObservation,
  pendingDrafts,
  pendingDraftCount,
  syncQueuedObservations,
  clearOfflineSession,
} from "@/lib/offline";

const navigation = [
  {
    label: "WORKSPACE",
    items: [
      ["dashboard", "Overview", LayoutDashboard],
      ["inspections", "Inspections", ClipboardCheck],
      ["scanner", "Product scanner", ScanLine],
    ],
  },
  {
    label: "HAC RECORDS",
    items: [
      ["companies", "Companies", Building2],
      ["locations", "Company locations", Building2],
      ["items", "Product catalogue", Package],
      ["brands", "Brands", Package],
      ["manufacturers", "Manufacturers", Building2],
      ["suppliers", "Suppliers", Building2],
      ["certificates", "Certificates", FileCheck2],
      ["licenses", "Required licenses", FileText],
      ["restrictions", "Restriction records", ShieldCheck],
      ["checklists", "Checklist templates", ListChecks],
    ],
  },
  {
    label: "ASSURANCE",
    items: [
      ["investigations", "Investigations", Search],
      ["complaints", "Complaints", FileText],
      ["non-conformities", "Non-conformities", AlertTriangle],
      ["corrective-actions", "Corrective actions", ListChecks],
      ["reports", "Reports", FolderOpen],
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      ["ai/training", "AI training studio", Sparkles],
      ["users", "People & access", Users],
      ["workspace-setup", "Workspace setup", Settings2],
      ["notifications", "Notifications", Bell],
      ["audit-logs", "Audit history", History],
      ["settings", "Settings", Settings2],
    ],
  },
];
const endpoints: Record<string, string> = {
  brands: "brands",
  manufacturers: "manufacturers",
  suppliers: "suppliers",
  locations: "locations",
  checklists: "checklists",
  licenses: "licenses",
  restrictions: "restrictions",
  items: "products",
  companies: "companies",
  certificates: "certificates",
  inspections: "inspections",
  investigations: "investigations",
  complaints: "complaints",
  "non-conformities": "non-conformities",
  "corrective-actions": "corrective-actions",
  users: "users",
  notifications: "notifications",
  "audit-logs": "audit-logs",
};
const titles: Record<string, string> = {
  brands: "Product brands",
  manufacturers: "Manufacturers",
  suppliers: "Suppliers",
  locations: "Company locations",
  checklists: "Checklist templates",
  licenses: "Required licenses",
  restrictions: "Restriction records",
  dashboard: "Operational overview",
  companies: "Companies",
  items: "Product catalogue",
  certificates: "Certificates & approvals",
  inspections: "Inspections",
  investigations: "Investigations",
  complaints: "Complaints",
  "non-conformities": "Non-conformities",
  "corrective-actions": "Corrective actions",
  reports: "Inspection reports",
  users: "People & access",
  notifications: "Notifications",
  "audit-logs": "Audit history",
  settings: "Workspace settings",
  "workspace-setup": "Workspace setup",
  scanner: "Product scanner",
  "ai/training": "AI training studio",
};
const descriptions: Record<string, string> = {
  brands: "Shared brand identities for the authoritative product catalogue.",
  manufacturers:
    "Manufacturing organisations, distinct from inspected retailers.",
  suppliers: "Supply organisations linked to central product identities.",
  locations: "Branches, facilities and inspection locations.",
  checklists: "Published, versioned question sets for field inspections.",
  licenses:
    "Commercial and operational licenses, separate from HAC certificates.",
  restrictions: "Explicit, authorised restrictions with authority and scope.",
  companies: "Company records, locations and certification relationships.",
  items: "Central product identities, brands and exact packaging variants.",
  certificates: "Authoritative certification records and their approved scope.",
  inspections: "Start a visit for your company, record observations, and download the inspection record.",
  investigations: "Resolve discrepancies with evidence and accountable review.",
  complaints: "Record concerns and follow their resolution.",
  "non-conformities": "Track findings, severity and required follow-up.",
  "corrective-actions":
    "Follow corrective responses through authorised review.",
  users: "Accounts and their assigned access.",
  notifications: "Updates that need your attention.",
  "audit-logs": "A chronological record of important platform activity.",
};
export function Badge({ value }: { value: unknown }) {
  const s = String(value ?? "PENDING");
  const tone =
    /APPROVED|ACTIVE|VERIFIED|RESOLVED|CLOSED|COMPLETED|COMPLIANT|PASS|PUBLISHED/.test(
      s,
    ) && !s.includes("NOT")
      ? "green"
      : /EXPIRED|REVOKED|RESTRICTED|CRITICAL|FAIL|MISMATCH|REJECT/.test(s)
        ? "red"
        : /PROGRESS|PENDING|REVIEW|SUBMITTED|DRAFT|SCHEDULED|UNKNOWN|UNCERTAIN/.test(
              s,
            )
          ? "amber"
          : "neutral";
  return (
    <span className={`badge ${tone}`}>
      <i />
      {label(s)}
    </span>
  );
}
export function Empty({
  title = "No records yet",
  description = "Records will appear here when they are added.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <FolderOpen size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Loading your workspace…</span>
    </div>
  );
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="alert error" role="alert">
      <AlertTriangle size={18} />
      {error}
    </div>
  ) : null;
}
export default function Portal({ route }: { route: string[] }) {
  const current = route.join("/"),
    module = route[0],
    router = useRouter();
  const [user, setUser] = useState<Row | null>(null),
    [nav, setNav] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then(async (v) => {
        const account = v.user ?? v;
        await unlockOfflineSession(account.id).catch(() => {});
        setUser(account);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!user)
    return (
      <>
        <Loading />
        <ErrorBox error={error} />
      </>
    );
  const admin = ["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {nav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setNav(false)}
        />
      )}
      <aside className={`sidebar ${nav ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-symbol">h</span>
          <span>
            HAC<span className="brand-sub">CERTIFICATION & INSPECTION</span>
          </span>
        </Link>
        <div className="workspace-tag">
          <span className="workspace-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            HAC workspace<small>Certification operations</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items
                .filter(
                  ([p]) =>
                    admin ||
                    ![
                      "users",
                      "workspace-setup",
                      "ai/training",
                      "audit-logs",
                      "brands",
                      "manufacturers",
                      "suppliers",
                      "licenses",
                      "restrictions",
                      "checklists",
                    ].includes(String(p)),
                )
                .map(([path, title, Icon]) => {
                  const I = Icon as typeof Activity;
                  return (
                    <Link
                      onClick={() => setNav(false)}
                      href={`/${path}`}
                      key={String(path)}
                      className={`nav-item ${current === path || (module === path && route.length > 1) ? "active" : ""}`}
                    >
                      <I size={18} />
                      <span>{String(title)}</span>
                      {current === path && <span className="nav-active-dot" />}
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="connected-dot" />
          <div>
            Accountable by design<small>HAC intelligent platform</small>
          </div>
          <ShieldCheck size={16} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              onClick={() => setNav(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />{" "}
              <strong>
                {titles[current] ?? titles[module] ?? "Inspection workspace"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <ReadabilityControls />
            <span className="business-zone">Asia / Colombo</span>
            <Link
              className="icon-button"
              href="/notifications"
              aria-label="Notifications"
            >
              <Bell size={19} />
            </Link>
            <span className="topbar-divider" />
            <button
              className="profile-button"
              onClick={async () => {
                const pending = await pendingDraftCount().catch(() => 0);
                if (
                  pending &&
                  !window.confirm(
                    "Signing out will discard queued offline drafts. Synchronize first to keep them. Sign out and discard?",
                  )
                )
                  return;
                await clearOfflineSession().catch(() => {});
                await api("/auth/logout", { method: "POST" });
                router.push("/login");
              }}
              title="Sign out"
            >
              <span className="avatar">
                {user.name
                  ?.split(" ")
                  .map((v: string) => v[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="profile-info">
                {user.name}
                <small>{label(user.role)}</small>
              </span>
              <LogOut size={15} />
            </button>
          </div>
        </header>
        <OfflineStatus />
        <main
          id="main-content"
          className={`main-content ${module === "inspections" && route[1] ? "inspection-main" : ""}`}
        >
          {module === "dashboard" ? (
            <Dashboard user={user} />
          ) : module === "inspections" && route[1] ? (
            user.role === "AUDITOR" ? <InspectionWorkspace id={route[1]} user={user} /> : <SimpleInspection id={route[1]} user={user} />
          ) : current === "ai/training" ? (
            <>
              <PageHeading
                title="AI training studio"
                description="Collect product images, train a visual index and validate real predictions."
                eyebrow="PRODUCT INTELLIGENCE"
              />
              <ProductTrainingLibrary />
            </>
          ) : module === "scanner" ? (
            <StandaloneScanner canManageTests={admin} />
          ) : module === "reports" ? (
            <Reports />
          ) : module === "checklists" && admin ? (
            <ChecklistManager />
          ) : module === "settings" ? (
            <Settings user={user} />
          ) : module === "workspace-setup" ? (
            admin ? <WorkspaceSetup /> : <Empty title="Administrator access required" description="An HAC administrator manages company records, supervisor assignments and imported materials." />
          ) : endpoints[module] ? (
            <ResourcePage module={module} user={user} />
          ) : (
            <Empty
              title="Page not found"
              description="Choose a workspace from the navigation."
            />
          )}
        </main>
        <footer className="main-footer">
          <span>HAC Certification & Inspection</span>
          <span>Evidence informs. Authorised people decide.</span>
        </footer>
      </div>
      <nav className="mobile-bottom" aria-label="Mobile navigation">
        <Link href="/dashboard">
          <LayoutDashboard size={21} />
          Home
        </Link>
        <Link href="/inspections">
          <ClipboardCheck size={21} />
          Inspections
        </Link>
        <Link className="mobile-scan" href="/scanner">
          <ScanLine size={22} />
          Scan
        </Link>
        <Link href="/items">
          <Package size={21} />
          Products
        </Link>
        <button onClick={() => setNav(true)}>
          <Menu size={21} />
          More
        </button>
      </nav>
    </div>
  );
}
function PageHeading({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
function Dashboard({ user }: { user: Row }) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const metrics = data?.metrics ?? data?.counts ?? {};
  const stats = [
    [
      "Registered companies",
      metrics.companies ?? metrics.registeredCompanies,
      Building2,
      "Company records",
    ],
    [
      "Active certificates",
      metrics.activeCertificates,
      FileCheck2,
      "Within their validity period",
    ],
    [
      "Open inspections",
      metrics.openInspections ?? metrics.inspections,
      ClipboardCheck,
      "Scheduled and in progress",
    ],
    [
      "Open investigations",
      metrics.openInvestigations ?? metrics.investigations,
      Search,
      "Awaiting resolution",
    ],
  ];
  const inspections = array(data?.inspections ?? data?.upcomingInspections),
    findings = array(data?.recentFindings ?? data?.findings),
    certificates = array(data?.expiringCertificates);
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(new Date());
  return (
    <>
      <div className="dashboard-date">
        <span>
          <CalendarDays size={14} />
          {today}
        </span>
        <span className="system-status">
          <span className="connected-dot" />
          Live database workspace
        </span>
      </div>
      <PageHeading
        eyebrow="YOUR WORK, AT A GLANCE"
        title={`Welcome back, ${user.name?.split(" ")[0] ?? "there"}.`}
        description="A clear view of certification activity and the inspections ahead."
      >
        <Link className="button secondary" href="/reports">
          <ArrowDownToLine size={17} />
          View reports
        </Link>
        <StartInspectionButton role={user.role} />
      </PageHeading>
      <ErrorBox error={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        <>
          <div className="stat-grid">
            {stats.map(([name, value, Icon, detail], i) => {
              const I = Icon as typeof Activity;
              return (
                <div className="stat-card" key={i}>
                  <div className="stat-top">
                    <span>{String(name)}</span>
                    <span className="stat-icon">
                      <I size={19} />
                    </span>
                  </div>
                  <strong>{value ?? "—"}</strong>
                  <div className="stat-foot">
                    <span className={i === 0 ? "mini-green" : "mini-dot"} />
                    {String(detail)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="dashboard-columns">
            <section className="panel inspection-list">
              <div className="panel-heading">
                <div>
                  <span className="section-eyebrow">FIELD OPERATIONS</span>
                  <h2>
                    Inspection agenda{" "}
                    <span className="count-pill">{inspections.length}</span>
                  </h2>
                </div>
                <Link href="/inspections" className="text-link">
                  View all <ArrowRight size={15} />
                </Link>
              </div>
              {inspections.length ? (
                <div className="agenda-list">
                  {inspections.slice(0, 5).map((ins) => (
                    <Link
                      href={`/inspections/${ins.id}`}
                      className="agenda-row"
                      key={ins.id}
                    >
                      <span className="agenda-icon">
                        <Building2 size={22} />
                      </span>
                      <div className="agenda-info">
                        <div className="agenda-title">
                          {ins.company?.tradingName ??
                            ins.company?.legalName ??
                            ins.companyName ??
                            ins.reference}
                        </div>
                        <p>
                          {ins.location?.name ?? "Inspection visit"}{" "}
                          <span>·</span> {label(ins.type ?? "ROUTINE")}
                        </p>
                        <small>{ins.reference}</small>
                      </div>
                      <div className="agenda-meta">
                        <Badge value={ins.status} />
                        <small>
                          <Clock3 size={12} />
                          {date(ins.scheduledAt, true)}
                        </small>
                      </div>
                      <ChevronRight size={17} className="muted" />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Your agenda is clear"
                  description="Scheduled inspections will appear here."
                />
              )}
              <div className="panel-footer">
                <span>
                  <ShieldCheck size={14} />
                  Only inspections within your authorised scope
                </span>
              </div>
            </section>
            <section className="scan-callout">
              <div className="callout-symbol">
                <ScanLine size={28} />
              </div>
              <span className="eyebrow light">READY FOR THE FIELD</span>
              <h2>
                Identify. Verify.
                <br />
                Keep moving.
              </h2>
              <p>
                Open the scanner to identify a product, then check its
                authoritative HAC records.
              </p>
              <Link href="/scanner" className="button light-button">
                Open product scanner
                <ArrowRight size={17} />
              </Link>
              <div className="callout-caption">
                <ShieldCheck size={13} />
                Recognition never grants certification.
              </div>
              <div className="callout-guide">
                <i />
                <i />
                <i />
                <i />
              </div>
            </section>
          </div>
          <div className="dashboard-columns lower">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-eyebrow">REQUIRES ATTENTION</span>
                  <h2>Recent findings</h2>
                </div>
                <Link href="/non-conformities" className="text-link">
                  View findings
                  <ArrowRight size={15} />
                </Link>
              </div>
              {findings.length ? (
                <div className="finding-list">
                  {findings.slice(0, 5).map((f) => (
                    <div className="finding-row" key={f.id}>
                      <span className="finding-icon">
                        <AlertTriangle size={17} />
                      </span>
                      <div>
                        <strong>
                          {f.title ??
                            f.description ??
                            label(f.type ?? f.status)}
                        </strong>
                        <small>
                          {f.company?.tradingName ??
                            f.company?.legalName ??
                            f.inspection?.reference ??
                            date(f.createdAt)}
                        </small>
                      </div>
                      <Badge value={f.severity ?? f.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No recent findings"
                  description="Saved inspection findings appear here."
                />
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-eyebrow">
                    CERTIFICATE MONITORING
                  </span>
                  <h2>Validity watch</h2>
                </div>
                <Link href="/certificates" className="text-link">
                  View records
                  <ArrowRight size={15} />
                </Link>
              </div>
              {certificates.length ? (
                <div className="finding-list">
                  {certificates.slice(0, 5).map((c) => (
                    <div className="finding-row" key={c.id}>
                      <span className="certificate-mini">
                        <FileCheck2 size={18} />
                      </span>
                      <div>
                        <strong>{c.number}</strong>
                        <small>
                          {c.holder?.tradingName ??
                            c.holder?.legalName ??
                            c.issuer}
                        </small>
                      </div>
                      <div className="align-right">
                        <small>Expires</small>
                        <strong>{date(c.expiresAt)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No upcoming expiries"
                  description="Certificate expiry warnings will appear here."
                />
              )}
            </section>
          </div>
          <div className="principle-strip">
            <ShieldCheck size={20} />
            <div>
              <strong>
                Identity is a suggestion. Certification is a record.
              </strong>
              <span>
                Every verification uses authoritative scope, validity dates and
                recorded restrictions.
              </span>
            </div>
            <Link href="/audit-logs">
              View audit history <ArrowRight size={15} />
            </Link>
          </div>
        </>
      )}
    </>
  );
}
type Field = {
  key: string;
  title: string;
  type?: string;
  required?: boolean;
  resource?: string;
  options?: string[];
};
const fieldConfig: Record<string, Field[]> = {
  brands: [{ key: "name", title: "Brand name", required: true }],
  manufacturers: [
    { key: "name", title: "Manufacturer name", required: true },
    { key: "country", title: "Country" },
    { key: "registrationNumber", title: "Registration number" },
  ],
  suppliers: [
    { key: "name", title: "Supplier name", required: true },
    { key: "email", title: "Contact email", type: "email" },
  ],
  locations: [
    {
      key: "companyId",
      title: "Company",
      resource: "companies",
      required: true,
    },
    { key: "name", title: "Location name", required: true },
    {
      key: "type",
      title: "Location type",
      options: ["BRANCH", "FACTORY", "WAREHOUSE", "FACILITY"],
    },
    { key: "address", title: "Address", type: "textarea", required: true },
  ],
  checklists: [
    { key: "name", title: "Checklist name", required: true },
    { key: "description", title: "Description", type: "textarea" },
    {
      key: "questions",
      title: "Questions (JSON array: section, text, type, required, options)",
      type: "textarea",
      required: true,
    },
  ],
  licenses: [
    { key: "name", title: "License name", required: true },
    { key: "number", title: "License number", required: true },
    { key: "authority", title: "Issuing authority", required: true },
    { key: "companyId", title: "Company holder", resource: "companies" },
    {
      key: "manufacturerId",
      title: "Manufacturer holder",
      resource: "manufacturers",
    },
    {
      key: "effectiveAt",
      title: "Effective date",
      type: "date",
      required: true,
    },
    { key: "expiresAt", title: "Expiry date", type: "date", required: true },
  ],
  restrictions: [
    { key: "reference", title: "Authority reference", required: true },
    { key: "authority", title: "Restriction authority", required: true },
    { key: "productId", title: "Restricted product", resource: "products" },
    {
      key: "manufacturerId",
      title: "Restricted manufacturer",
      resource: "manufacturers",
    },
    {
      key: "scope",
      title: "Exact restriction scope",
      type: "textarea",
      required: true,
    },
    {
      key: "reason",
      title: "Authorised reason",
      type: "textarea",
      required: true,
    },
    {
      key: "effectiveAt",
      title: "Effective date",
      type: "date",
      required: true,
    },
    { key: "expiresAt", title: "Expiry date (if applicable)", type: "date" },
  ],
  companies: [
    { key: "legalName", title: "Legal company name", required: true },
    { key: "tradingName", title: "Trading name" },
    { key: "registrationNumber", title: "Registration number (if known)" },
    {
      key: "category",
      title: "Company category",
      options: ["RETAILER", "MANUFACTURER", "SUPPLIER", "DISTRIBUTOR", "OTHER"],
    },
    { key: "email", title: "Contact email", type: "email" },
    { key: "phone", title: "Contact phone" },
    { key: "locationName", title: "First location name" },
    { key: "address", title: "Location address" },
  ],
  items: [
    { key: "name", title: "Product name", required: true },
    { key: "itemCode", title: "HAC item code", required: true },
    { key: "type", title: "Item type", options: ["PRODUCT", "RAW_MATERIAL"] },
    { key: "category", title: "Category", required: true },
    { key: "brandId", title: "Brand", resource: "brands", required: true },
    {
      key: "manufacturerId",
      title: "Manufacturer",
      resource: "manufacturers",
      required: true,
    },
    { key: "supplierId", title: "Supplier", resource: "suppliers" },
    { key: "sku", title: "SKU", required: true },
    { key: "barcode", title: "Barcode" },
    { key: "variantName", title: "Variant / packaging name", required: true },
    { key: "description", title: "Description", type: "textarea" },
  ],
  certificates: [
    { key: "number", title: "Certificate number", required: true },
    {
      key: "holderId",
      title: "Certificate holder",
      resource: "companies",
      required: true,
    },
    { key: "issuer", title: "Issuing authority", required: true },
    { key: "type", title: "Certificate type", options: ["HAC", "OTHER"] },
    { key: "issuedAt", title: "Issue date", type: "date", required: true },
    {
      key: "effectiveAt",
      title: "Effective date",
      type: "date",
      required: true,
    },
    { key: "expiresAt", title: "Expiry date", type: "date", required: true },
    {
      key: "productId",
      title: "Approved product scope",
      resource: "products",
      required: true,
    },
  ],
  inspections: [
    {
      key: "companyId",
      title: "Company",
      resource: "companies",
      required: true,
    },
    {
      key: "locationId",
      title: "Inspection location",
      resource: "locations",
      required: true,
    },
    {
      key: "inspectorId",
      title: "Assigned inspector",
      resource: "users",
      required: true,
    },
    {
      key: "scheduledAt",
      title: "Planned date & time",
      type: "datetime-local",
      required: true,
    },
    {
      key: "type",
      title: "Inspection type",
      options: [
        "ROUTINE",
        "INITIAL",
        "SURVEILLANCE",
        "RENEWAL",
        "FOLLOW_UP",
        "COMPLAINT",
        "SPECIAL",
        "UNANNOUNCED",
      ],
    },
    {
      key: "checklistVersionId",
      title: "Checklist (optional)",
      resource: "checklists",
    },
    { key: "objectives", title: "Objectives", type: "textarea" },
  ],
  investigations: [
    {
      key: "companyId",
      title: "Company",
      resource: "companies",
      required: true,
    },
    { key: "title", title: "Investigation title", required: true },
    {
      key: "description",
      title: "Reason and context",
      type: "textarea",
      required: true,
    },
    {
      key: "priority",
      title: "Priority",
      options: ["NORMAL", "HIGH", "CRITICAL"],
    },
    { key: "productId", title: "Related product", resource: "products" },
  ],
  complaints: [
    {
      key: "companyId",
      title: "Company",
      resource: "companies",
      required: true,
    },
    { key: "title", title: "Complaint title", required: true },
    {
      key: "description",
      title: "Complaint details",
      type: "textarea",
      required: true,
    },
    {
      key: "priority",
      title: "Priority",
      options: ["NORMAL", "HIGH", "CRITICAL"],
    },
    { key: "productId", title: "Related product", resource: "products" },
  ],
  "non-conformities": [
    {
      key: "companyId",
      title: "Company",
      resource: "companies",
      required: true,
    },
    {
      key: "inspectionId",
      title: "Related inspection",
      resource: "inspections",
    },
    { key: "title", title: "Finding title", required: true },
    {
      key: "description",
      title: "Description and required action",
      type: "textarea",
      required: true,
    },
    {
      key: "severity",
      title: "Severity",
      options: ["OBSERVATION", "MINOR", "MAJOR", "CRITICAL"],
    },
    { key: "dueAt", title: "Response due", type: "date" },
    { key: "productId", title: "Related product", resource: "products" },
  ],
  "corrective-actions": [
    {
      key: "nonConformityId",
      title: "Non-conformity",
      resource: "non-conformities",
      required: true,
    },
    { key: "rootCause", title: "Root cause", type: "textarea", required: true },
    {
      key: "proposedAction",
      title: "Corrective action",
      type: "textarea",
      required: true,
    },
  ],
  users: [
    { key: "name", title: "Full name", required: true },
    { key: "email", title: "Email address", type: "email", required: true },
    {
      key: "password",
      title: "Initial password (at least 12 characters)",
      type: "password",
      required: true,
    },
    {
      key: "role",
      title: "Role",
      options: [
        "SUPERVISOR",
        "AUDITOR",
        "HAC_ADMIN",
        "COMPANY_ADMIN",
        "COMPANY_STAFF",
      ],
    },
    {
      key: "companyId",
      title: "Company for company roles",
      resource: "companies",
    },
  ],
};
const columnConfig: Record<string, [string, string][]> = {
  brands: [
    ["name", "Brand name"],
    ["createdAt", "Created"],
  ],
  manufacturers: [
    ["name", "Manufacturer"],
    ["country", "Country"],
    ["registrationNumber", "Registration"],
  ],
  suppliers: [
    ["name", "Supplier"],
    ["email", "Contact email"],
  ],
  locations: [
    ["name", "Location"],
    ["company", "Company"],
    ["type", "Type"],
    ["address", "Address"],
  ],
  checklists: [
    ["template.name", "Checklist"],
    ["version", "Version"],
    ["status", "Status"],
    ["publishedAt", "Published"],
  ],
  licenses: [
    ["number", "License"],
    ["name", "License name"],
    ["authority", "Authority"],
    ["expiresAt", "Expiry"],
    ["status", "Status"],
  ],
  restrictions: [
    ["reference", "Restriction"],
    ["authority", "Authority"],
    ["product.name", "Product"],
    ["scope", "Scope"],
    ["status", "Status"],
  ],
  companies: [
    ["company", "Company"],
    ["registrationNumber", "Registration"],
    ["category", "Category"],
    ["status", "Status"],
    ["locations", "Locations"],
  ],
  items: [
    ["product", "Product"],
    ["brand.name", "Brand"],
    ["manufacturer.name", "Manufacturer"],
    ["rawMaterialListing.certificateExpiry", "Source expiry"],
    ["type", "Type"],
    ["status", "Master status"],
  ],
  certificates: [
    ["number", "Certificate"],
    ["holder", "Approval holder"],
    ["issuer", "Issuing authority"],
    ["expiresAt", "Expiry"],
    ["status", "Status"],
  ],
  inspections: [
    ["reference", "Inspection"],
    ["company", "Company"],
    ["location.name", "Location"],
    ["scheduledAt", "Scheduled"],
    ["status", "Status"],
  ],
  investigations: [
    ["reference", "Reference"],
    ["title", "Investigation"],
    ["company", "Company"],
    ["priority", "Priority"],
    ["status", "Status"],
  ],
  complaints: [
    ["reference", "Reference"],
    ["title", "Complaint"],
    ["company", "Company"],
    ["createdAt", "Created"],
    ["status", "Status"],
  ],
  "non-conformities": [
    ["reference", "Reference"],
    ["title", "Finding"],
    ["company", "Company"],
    ["severity", "Severity"],
    ["status", "Status"],
  ],
  "corrective-actions": [
    ["reference", "Reference"],
    ["nonConformity.reference", "Non-conformity"],
    ["proposedAction", "Response"],
    ["createdAt", "Submitted"],
    ["status", "Status"],
  ],
  users: [
    ["name", "Person"],
    ["email", "Email"],
    ["role", "Role"],
    ["company", "Company"],
    ["isActive", "Active"],
  ],
  notifications: [
    ["title", "Notification"],
    ["message", "Message"],
    ["createdAt", "Received"],
    ["readAt", "Read"],
  ],
  "audit-logs": [
    ["action", "Action"],
    ["entityType", "Record type"],
    ["entityId", "Record reference"],
    ["user.name", "Performed by"],
    ["createdAt", "Timestamp"],
  ],
};
function get(row: Row, key: string): any {
  return key.split(".").reduce((v, k) => v?.[k], row);
}
function Cell({ row, path }: { row: Row; path: string }) {
  const value = get(row, path);
  if (path === "company" || path === "holder") {
    const c = value ?? row.company;
    return (
      <strong>
        {c?.tradingName ??
          c?.legalName ??
          (path === "company" && row.legalName
            ? (row.tradingName ?? row.legalName)
            : "—")}
        {(c?.isDemo ?? row.isDemo) && <span className="demo-mini">DEMO</span>}
      </strong>
    );
  }
  if (path === "product")
    return (
      <div className="product-name">
        <span className="product-icon">
          <Package size={17} />
        </span>
        <div>
          <strong>{row.name}</strong>
          <small>{row.itemCode}</small>
        </div>
      </div>
    );
  if (path === "locations")
    return String(row.locations?.length ?? row._count?.locations ?? 0);
  if (
    ["status", "severity", "priority", "role", "category", "type"].includes(
      path,
    )
  )
    return value ? <Badge value={value} /> : <span>—</span>;
  if (/At$/.test(path) || path.endsWith("certificateExpiry"))
    return <span className="nowrap">{date(value, path === "createdAt")}</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return <span>{value == null ? "—" : String(value)}</span>;
}
function ResourcePage({ module, user }: { module: string; user: Row }) {
  const [rows, setRows] = useState<Row[]>([]),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [notice, setNotice] = useState("");
  const resource = endpoints[module];
  const load = useCallback(() => {
    setBusy(true);
    api(
      `/${resource}?page=${page}&pageSize=20&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`,
    )
      .then((v) => {
        setRows(array(v));
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [resource, page, q, status]);
  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [load]);
  const canCreate =
    (!user.role.startsWith("COMPANY_") ||
      ["complaints", "corrective-actions"].includes(module)) &&
    Boolean(fieldConfig[module]) &&
    (module !== "inspections" || ["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role)) &&
    (![
      "users",
      "companies",
      "items",
      "certificates",
      "brands",
      "manufacturers",
      "suppliers",
      "locations",
      "checklists",
      "licenses",
      "restrictions",
    ].includes(module) ||
      ["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role));
  return (
    <>
      <PageHeading
        eyebrow="CERTIFICATION OPERATIONS"
        title={titles[module]}
        description={descriptions[module]}
      >
        {["inspections", "companies"].includes(module) && <StartInspectionButton role={user.role} />}
        {canCreate && (
          <button className={`button ${module === "inspections" ? "secondary" : "primary"}`} onClick={() => setCreate(true)}>
            <Plus size={17} />
            {module === "inspections"
              ? "Schedule inspection"
              : `Add ${module === "items" ? "product" : module === "companies" ? "company" : module === "users" ? "person" : module === "certificates" ? "certificate" : module === "corrective-actions" ? "response" : "record"}`}
          </button>
        )}
      </PageHeading>
      <ErrorBox error={error} />
      {notice && (
        <div className="alert success" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label={`Search ${titles[module]}`}
              placeholder={`Search ${titles[module].toLowerCase()}…`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="toolbar-right">
            <span className="record-count">
              {rows.length} records on this page
            </span>
            <label className="filter-select">
              <SlidersHorizontal size={16} />
              <select
                aria-label="Filter status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {[
                  "ACTIVE",
                  "DRAFT",
                  "SCHEDULED",
                  "IN_PROGRESS",
                  "SUBMITTED",
                  "APPROVED",
                  "OPEN",
                  "PENDING",
                  "CLOSED",
                  "EXPIRED",
                ].map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {busy ? (
          <Loading />
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columnConfig[module].map(([key, title]) => (
                    <th key={key}>{title}</th>
                  ))}
                  <th className="action-cell">
                    <span className="sr-only">Open record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() =>
                      module === "inspections"
                        ? window.location.assign(`/inspections/${row.id}`)
                        : setSelected(row)
                    }
                  >
                    {columnConfig[module].map(([key]) => (
                      <td key={key}>
                        <Cell row={row} path={key} />
                      </td>
                    ))}
                    <td className="action-cell">
                      {module === "companies" && canStartInspection(user.role) && <StartInspectionButton role={user.role} companyId={row.id} small />}
                      {module === "inspections" ? (
                        <Link
                          href={`/inspections/${row.id}`}
                          className="icon-button"
                          aria-label={`Open ${row.reference}`}
                        >
                          <ChevronRight size={17} />
                        </Link>
                      ) : (
                        <button
                          className="icon-button"
                          onClick={() => setSelected(row)}
                          aria-label="View record"
                        >
                          <ChevronRight size={17} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={q || status ? "No matching records" : "No records yet"}
            description={
              q || status
                ? "Try another search or filter."
                : `Add a record to begin working with ${titles[module].toLowerCase()}.`
            }
          />
        )}
        <div className="table-pagination">
          <span>Page {page}</span>
          <div>
            <button
              className="button small secondary"
              disabled={page === 1 || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="button small secondary"
              disabled={rows.length < 20 || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {module === "items" && (
        <div className="info-strip">
          <ShieldCheck size={18} />
          <p>
            A catalogue record identifies a product. HAC approval is evaluated
            separately against exact certificate scope and recorded
            restrictions.
          </p>
        </div>
      )}
      {create && (
        <CreateModal
          module={module}
          close={() => setCreate(false)}
          saved={() => {
            setCreate(false);
            setNotice(
              "Record saved. The change is recorded in the audit history.",
            );
            load();
          }}
        />
      )}
      {selected && (
        <DetailModal
          module={module}
          user={user}
          row={selected}
          close={() => setSelected(null)}
          refreshed={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </>
  );
}
function CreateModal({
  module,
  close,
  saved,
}: {
  module: string;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<Row>({}),
    [options, setOptions] = useState<Record<string, Row[]>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const fields = fieldConfig[module];
  useEffect(() => {
    const resources = [
      ...new Set(fields.map((f) => f.resource).filter(Boolean)),
    ] as string[];
    Promise.all(
      resources.map(async (r) => {
        try {
          return [r, array(await api(`/${r}?pageSize=100`))] as const;
        } catch {
          return [r, []] as const;
        }
      }),
    ).then((p) => setOptions(Object.fromEntries(p)));
  }, [fields]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body: Row = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== ""),
      );
      if (module === "checklists") body.questions = JSON.parse(body.questions);
      fields.forEach((f) => {
        if ((f.type === "date" || f.type === "datetime-local") && body[f.key])
          body[f.key] = new Date(body[f.key]).toISOString();
      });
      if (module === "items") {
        body.variants = [
          {
            sku: body.sku,
            name: body.variantName,
            barcode: body.barcode || undefined,
          },
        ];
        delete body.sku;
        delete body.barcode;
        delete body.variantName;
      }
      if (module === "certificates") {
        body.scopes = [{ productId: body.productId }];
        delete body.productId;
      }
      if (module === "companies" && body.locationName) {
        body.locations = [
          { name: body.locationName, address: body.address ?? "" },
        ];
        delete body.locationName;
        delete body.address;
      }
      await api(`/${endpoints[module]}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        module === "inspections"
          ? "Schedule an inspection"
          : `Add ${module === "items" ? "product" : label(module).toLowerCase().replace(/ies$/, "y").replace(/s$/, "")}`
      }
      close={close}
    >
      <form onSubmit={submit}>
        <div className="modal-intro">
          Create a saved record. Required fields are marked with an asterisk.
        </div>
        <div className="form-grid">
          {fields.map((f) => (
            <label
              key={f.key}
              className={f.type === "textarea" ? "span-two" : ""}
            >
              {f.title}
              {f.required ? " *" : ""}
              {f.type === "textarea" ? (
                <textarea
                  required={f.required}
                  rows={3}
                  value={form[f.key] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value })
                  }
                />
              ) : f.resource ? (
                <select
                  required={f.required}
                  value={form[f.key] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value })
                  }
                >
                  <option value="">Select {f.title.toLowerCase()}</option>
                  {(options[f.resource] ?? [])
                    .filter(
                      (v) =>
                        f.key !== "locationId" ||
                        !form.companyId ||
                        v.companyId === form.companyId,
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.tradingName ??
                          o.legalName ??
                          o.template?.name ??
                          o.name ??
                          o.reference ??
                          o.title ??
                          o.number ??
                          o.id}
                        {o.version ? ` · v${o.version}` : ""}
                      </option>
                    ))}
                </select>
              ) : f.options ? (
                <select
                  required={f.required}
                  value={form[f.key] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value })
                  }
                >
                  <option value="">Select…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {label(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required={f.required}
                  type={f.type ?? "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
        </div>
        {module === "certificates" && (
          <div className="alert info">
            <ShieldCheck size={17} />
            Certificate records and scope must be entered by an authorised HAC
            administrator. Product images do not establish approval.
          </div>
        )}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Save record
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [close]);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
function DetailModal({
  module,
  row,
  close,
  refreshed,
  user,
}: {
  module: string;
  user: Row;
  row: Row;
  close: () => void;
  refreshed: () => void;
}) {
  const [status, setStatus] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const transitions: Record<string, string[]> = {
    certificates: ["ACTIVE", "SUSPENDED", "REVOKED", "SUPERSEDED"],
    investigations: [
      "UNDER_INVESTIGATION",
      "AWAITING_COMPANY_RESPONSE",
      "AWAITING_HAC_REVIEW",
      "ADDITIONAL_EVIDENCE_REQUIRED",
      "ESCALATED",
      "RESOLVED",
      "CLOSED",
      "REOPENED",
    ],
    complaints: ["UNDER_REVIEW", "RESOLVED", "CLOSED", "REOPENED"],
    "non-conformities": ["IN_PROGRESS", "CLOSED", "REOPENED"],
    "corrective-actions": [
      "ACCEPTED",
      "REJECTED",
      "CHANGES_REQUESTED",
      "REOPENED",
    ],
  };
  async function transition(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/${endpoints[module]}/${row.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status, reason }),
      });
      refreshed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        row.title ??
        row.name ??
        row.legalName ??
        row.number ??
        row.reference ??
        "Record details"
      }
      close={close}
    >
      <div className="detail-summary">
        <Badge value={row.status ?? row.role ?? row.action} />
        {row.isDemo && (
          <span className="demo-banner">Fictional demonstration record</span>
        )}
      </div>
      <dl className="detail-grid">
        {Object.entries(row)
          .filter(
            ([k, v]) =>
              v != null &&
              typeof v !== "object" &&
              ![
                "passwordHash",
                "tokenHash",
                "normalizedName",
                "isDemo",
              ].includes(k),
          )
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
              <dd>{/At$/.test(k) ? date(v, true) : String(v)}</dd>
            </div>
          ))}
      </dl>
      {module === "items" && row.rawMaterialListing && <MaterialSourceDetails material={row.rawMaterialListing} />}
      {module === "companies" && <StartInspectionButton role={user.role} companyId={row.id} />}
      {module === "companies" &&
        ["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role) && (
          <CompanyAssignment companyId={row.id} />
        )}
      {row.locations?.length > 0 && (
        <>
          <h3>Locations</h3>
          {row.locations.map((l: Row) => (
            <div className="mini-card" key={l.id}>
              <Building2 size={17} />
              <div>
                <strong>{l.name}</strong>
                <p>{l.address}</p>
              </div>
            </div>
          ))}
        </>
      )}
      {row.variants?.length > 0 && (
        <>
          <h3>Product variants</h3>
          {row.variants.map((v: Row) => (
            <div className="mini-card" key={v.id}>
              <Package size={17} />
              <div>
                <strong>{v.name}</strong>
                <p>
                  {v.sku} · {v.barcode ?? "No barcode"}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
      {transitions[module] &&
        (!["certificates", "non-conformities", "corrective-actions"].includes(
          module,
        ) ||
          ["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role)) && (
          <form className="form-stack transition-form" onSubmit={transition}>
            <h3>Record a workflow decision</h3>
            <label>
              Next status
              <select
                required
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Select next status</option>
                {transitions[module].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <ErrorBox error={error} />
            <button className="button primary" disabled={busy}>
              Save decision
            </button>
          </form>
        )}
    </Modal>
  );
}
function InspectionWorkspace({ id, user }: { id: string; user: Row }) {
  const [inspection, setInspection] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("products"),
    [busy, setBusy] = useState(false),
    [productId, setProductId] = useState<string | null>(null),
    [predictionId,setPredictionId]=useState<string|undefined>(),
    [variantId, setVariantId] = useState<string | undefined>(),
    [unknown, setUnknown] = useState(false),
    [sign, setSign] = useState(false),
    [notice, setNotice] = useState(""),
    [tick, setTick] = useState(Date.now());
  const load = useCallback(async () => {
    try {
      setInspection(await api(`/inspections/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
    window.addEventListener("hac:synced", load);
    const timer = setInterval(() => setTick(Date.now()), 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hac:synced", load);
    };
  }, [load]);
  async function action(path: string, body: Row = {}) {
    setBusy(true);
    setError("");
    try {
      await api(`/inspections/${id}/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
      setNotice(
        path === "submit"
          ? "Inspection submitted. Its saved snapshot is immutable."
          : path === "start"
            ? "Inspection started. Your observations will be linked to this visit."
            : path === "reconcile"
              ? "Observations recalculated using current HAC records. Review the results, then record fresh signatures."
              : "Decision recorded.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!inspection)
    return (
      <>
        <Loading />
        <ErrorBox error={error} />
      </>
    );
  const ins = inspection,
    observations = array(ins.observations),
    findings = array(ins.findings),
    questions = array(ins.checklistVersion?.questions ?? ins.questions),
    responses = array(ins.responses),
    editable = ["DRAFT", "SCHEDULED", "IN_PROGRESS"].includes(ins.status),
    started = ins.status === "IN_PROGRESS",
    isAdmin = ["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role);
  const verified = observations.filter(
    (o) =>
      o.verification?.outcomes?.includes("VERIFIED_APPROVED") ||
      o.verification?.primaryStatus === "VERIFIED_APPROVED",
  ).length;
  const elapsed = ins.startedAt
    ? `${Math.floor((tick - new Date(ins.startedAt).valueOf()) / 60000)} min`
    : "Not started";
  const sections = [
    ["products", "Products", Package],
    ["scanner", "Live scanner", ScanLine],
    ["summary", "Submit & export", FileCheck2],
    ["checklist", "Checklist (optional)", ListChecks],
    ["evidence", "Evidence", Paperclip],
    ["findings", "Findings", AlertTriangle],
    ["overview", "Overview", LayoutDashboard],
  ];
  function select(pid: string, vid?: string, recognitionId?: string) {
    setProductId(pid);
    setPredictionId(recognitionId);
    setVariantId(vid);
  }
  return (
    <>
      <Link className="back-link" href="/inspections">
        ← Back to inspections
      </Link>
      <div className="inspection-heading">
        <div className="inspection-company-icon">
          <Building2 size={29} />
        </div>
        <div>
          <span className="eyebrow">{ins.reference}</span>
          <h1>
            {ins.company?.tradingName ?? ins.company?.legalName ?? "Inspection"}
          </h1>
          <p>
            {ins.location?.name} <span>·</span> {ins.location?.address}
          </p>
        </div>
        <div className="inspection-heading-actions">
          <Badge value={ins.status} />
          {!ins.startedAt && editable && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => action("start")}
            >
              <ClipboardCheck size={17} />
              Start inspection
            </button>
          )}
          {started && (
            <button
              className="button primary"
              onClick={() => setTab("scanner")}
            >
              <ScanLine size={17} />
              Scan product
            </button>
          )}
        </div>
      </div>
      {ins.company?.isDemo && (
        <div className="demo-banner">
          <FlaskConical size={15} />
          Fictional demonstration inspection. These records do not establish
          real-world HAC approval.
        </div>
      )}
      <ErrorBox error={error} />
      {notice && (
        <div className="alert success" role="status">
          <CheckCircle2 size={17} />
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <details className="inspection-summary"><summary>Visit summary · {observations.length} products recorded</summary>
      <div className="inspection-stat-bar">
        <div>
          <span>
            <Clock3 size={14} />
            Elapsed
          </span>
          <strong>{elapsed}</strong>
        </div>
        <div>
          <span>Products examined</span>
          <strong>{observations.length}</strong>
        </div>
        <div>
          <span>Verified approved</span>
          <strong className="green-text">{verified}</strong>
        </div>
        <div>
          <span>Require attention</span>
          <strong className="amber-text">
            {observations.length - verified}
          </strong>
        </div>
        <div>
          <span>Investigations</span>
          <strong>{array(ins.investigations).length}</strong>
        </div>
        <div>
          <span>Checklist progress</span>
          <strong>
            {responses.length}
            <small> / {questions.length}</small>
          </strong>
        </div>
      </div>
      </details>
      <div className="inspection-tabs" role="tablist">
        {sections.map(([key, title, Icon]) => {
          const I = Icon as typeof Activity;
          return (
            <button
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(String(key))}
              className={tab === key ? "active" : ""}
              key={String(key)}
            >
              <I size={16} />
              {String(title)}
              {key === "products" && <span>{observations.length}</span>}
            </button>
          );
        })}
      </div>
      {tab === "overview" && (
        <div className="inspection-overview-grid">
          <section className="panel">
            <div className="panel-heading">
              <h2>Visit details</h2>
              <ClipboardCheck size={20} className="muted" />
            </div>
            <dl className="detail-grid padded">
              <div>
                <dt>Inspector</dt>
                <dd>{ins.inspector?.name ?? user.name}</dd>
              </div>
              <div>
                <dt>Inspection type</dt>
                <dd>{label(ins.type ?? "ROUTINE")}</dd>
              </div>
              <div>
                <dt>Planned visit</dt>
                <dd>{date(ins.scheduledAt, true)}</dd>
              </div>
              <div>
                <dt>Actual start</dt>
                <dd>{date(ins.startedAt, true)}</dd>
              </div>
              <div>
                <dt>Optional checklist</dt>
                <dd>
                  {ins.checklistVersion ? `${ins.checklistVersion.template?.name ?? "Inspection"} · v${ins.checklistVersion.version}` : "None selected"}
                </dd>
              </div>
              <div>
                <dt>Master data basis</dt>
                <dd>{ins.masterDataVersion ?? "Recorded on start"}</dd>
              </div>
              <div className="span-two">
                <dt>Objectives</dt>
                <dd>
                  {ins.objectives ??
                    "Verify product identity, certification scope and observed conditions."}
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Inspection workflow</h2>
            </div>
            <ol className="workflow-steps">
              {[
                [
                  "Start your visit",
                  Boolean(ins.startedAt),
                  "Record the inspection time and data basis.",
                ],
                [
                  "Examine products",
                  observations.length > 0,
                  "Identify, verify and confirm physical observations.",
                ],
                [
                  "Optional checklist",
                  responses.length >= questions.length,
                  "Add general inspection answers when useful. You may skip this step.",
                ],
                [
                  "Review and sign",
                  array(ins.signatures).length > 0,
                  "Review findings and record the declaration.",
                ],
                [
                  "Submit for HAC review",
                  Boolean(ins.submittedAt),
                  "Preserve an immutable inspection snapshot.",
                ],
              ].map(([title, done, detail], i) => (
                <li key={i}>
                  <span className={done ? "step-done" : "step-pending"}>
                    {done ? <Check size={15} /> : i + 1}
                  </span>
                  <div>
                    <strong>{String(title)}</strong>
                    <p>{String(detail)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {tab === "scanner" && (
        <>
          <div className="section-title-row">
            <div>
              <h2>Identify a product</h2>
              <p>
                Recognition suggests identity. Authoritative records determine
                approval.
              </p>
            </div>
            {started && (
              <button
                className="button secondary"
                onClick={() => setUnknown(true)}
              >
                <Plus size={16} />
                Register unknown product
              </button>
            )}
          </div>
          {!started && (
            <div className="alert info">
              {editable
                ? "Start the inspection before saving observations."
                : "This inspection is submitted. Its observations are preserved."}
            </div>
          )}
          <Scanner inspectionId={id} onSelect={select} canManageTests={isAdmin} />
        </>
      )}
      {tab === "products" && (
        <section className="panel">
          {started && <div className="product-entry"><LiveProductSearch select={(pid, vid) => select(pid, vid)} /><div className="product-entry-actions"><button type="button" className="button secondary" onClick={() => setTab("scanner")}><ScanLine size={18} />Scan with camera</button><button type="button" className="button secondary" onClick={() => setUnknown(true)}><Plus size={18} />Product not listed?</button></div></div>}
          <div className="panel-heading">
            <div>
              <h2>Saved products</h2>
              <p>
                {observations.length} saved observations
              </p>
            </div>

          </div>
          {observations.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Product / material</th>
                    <th>Observed brand</th>
                    <th>HAC verification</th>
                    <th>Physical expiry</th>
                    <th>Batch</th>
                    <th>Inspector notes</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map((o, i) => (
                    <tr key={o.id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>
                          {o.product?.name ??
                            o.observedName ??
                            "Unknown product"}
                        </strong>
                        <small>{o.product?.itemCode ?? o.variant?.sku}</small>
                      </td>
                      <td>
                        {o.observedBrand ?? o.product?.brand?.name ?? "—"}
                      </td>
                      <td>
                        {(
                          o.verification?.outcomes ?? [
                            o.verification?.primaryStatus ?? o.conclusion,
                          ]
                        )
                          .filter(Boolean)
                          .map((s: string) => (
                            <Badge value={s} key={s} />
                          ))}
                      </td>
                      <td>{date(o.physicalExpiry)}</td>
                      <td>{o.batch ?? "—"}</td>
                      <td>{o.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No products examined yet"
              description="Open the scanner or search the catalogue to record the first observation."
            />
          )}
        </section>
      )}
      {tab === "checklist" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>General inspection checklist</h2>
              <p>
                Optional: save any useful answers. Unanswered questions do not block submission.
              </p>
            </div>
            <span className="count-pill">
              {responses.length} / {questions.length}
            </span>
          </div>
          {questions.length ? (
            <div className="checklist-questions">
              {questions.map((q: Row, i: number) => (
                <ChecklistQuestion
                  key={q.id}
                  question={q}
                  index={i}
                  response={responses.find((r: Row) => r.questionId === q.id)}
                  inspectionId={id}
                  editable={started}
                  saved={load}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="No checklist questions"
              description="You can submit this visit without a checklist."
            />
          )}
        </section>
      )}
      {tab === "findings" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Inspection findings</h2>
              <Badge
                value={
                  findings.some((f) => f.severity === "CRITICAL")
                    ? "CRITICAL"
                    : "UNDER_REVIEW"
                }
              />
            </div>
            {findings.length ? (
              <div className="finding-list">
                {findings.map((f) => (
                  <div className="finding-row" key={f.id}>
                    <span className="finding-icon">
                      <AlertTriangle size={18} />
                    </span>
                    <div>
                      <strong>
                        {f.title ?? f.description ?? label(f.type ?? f.code)}
                      </strong>
                      <small>
                        {f.product?.name ??
                          f.observation?.product?.name ??
                          f.reference ??
                          ""}
                      </small>
                      {f.description && <p>{f.description}</p>}
                    </div>
                    <Badge value={f.severity ?? f.status} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No saved findings"
                description="Verification discrepancies and confirmed findings will appear here."
              />
            )}
          </section>
          <section className="panel spaced">
            <div className="panel-heading">
              <h2>Linked investigations</h2>
            </div>
            {array(ins.investigations).length ? (
              <div className="finding-list">
                {array(ins.investigations).map((i) => (
                  <div className="finding-row" key={i.id}>
                    <Search size={18} />
                    <div>
                      <strong>
                        {i.reference} · {i.title}
                      </strong>
                      <small>{i.description}</small>
                    </div>
                    <Badge value={i.status} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No linked investigations"
                description="Raise a discrepancy from product verification or unknown-product registration."
              />
            )}
          </section>
        </>
      )}
      {tab === "evidence" && (
        <EvidencePanel inspection={ins} editable={started} saved={load} />
      )}
      {tab === "summary" && (
        <>
          <div className="inspection-overview-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>Review & declaration</h2>
              </div>
              <div className="panel-body">
                <p className="muted">
                  Review all product observations, evidence and checklist
                  answers before submitting. Server-side verification will run
                  again against current records.
                </p>
                <div className="summary-checks">
                  <span>
                    <CheckCircle2 size={17} />
                    {observations.length} product observations
                  </span>
                  <span>
                    <CheckCircle2 size={17} />
                    {responses.length} checklist responses
                  </span>
                  <span>
                    <CheckCircle2 size={17} />
                    {array(ins.evidence).length} evidence files
                  </span>
                  <span>
                    <CheckCircle2 size={17} />
                    {array(ins.signatures).length} declarations
                  </span>
                </div>
                {array(ins.signatures).map((s) => (
                  <div className="signature-record" key={s.id}>
                    <ShieldCheck size={19} />
                    <div>
                      <strong>{s.name}</strong>
                      <small>
                        {label(s.role)} ·{" "}
                        {date(s.signedAt ?? s.createdAt, true)}
                      </small>
                      {s.reason && <p>{s.reason}</p>}
                    </div>
                  </div>
                ))}
                {started && (
                  <div className="form-stack">
                    <button
                      className="button secondary"
                      onClick={() => setSign(true)}
                    >
                      <Plus size={17} />
                      Record signature / declaration
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Recalculate saved observations using current HAC records? Existing signatures will be cleared so you can review and sign the current results.",
                          )
                        )
                          action("reconcile", {
                            version: ins.version,
                            acknowledge: true,
                          });
                      }}
                    >
                      <ShieldCheck size={17} />
                      Reconcile current HAC records
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Submit this inspection for HAC review? The saved snapshot and observations will become immutable.",
                          )
                        )
                          action("submit", {
                            version: ins.version,
                            declaration: true,
                          });
                      }}
                    >
                      <FileCheck2 size={18} />
                      Submit inspection
                    </button>
                  </div>
                )}
                {ins.submittedAt && (
                  <div className="alert success">
                    <ShieldCheck size={18} />
                    Submitted {date(ins.submittedAt, true)}. The signed
                    inspection snapshot is preserved.
                  </div>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Reports & export</h2>
              </div>
              <div className="panel-body">
                <div className="report-illustration">
                  <FileText size={40} />
                  <span>HAC INSPECTION REPORT</span>
                  <i />
                  <i />
                  <i />
                </div>
                <p className="muted">
                  Reports are generated from the saved inspection records. Draft
                  reports are identified as drafts.
                </p>
                <div className="form-stack">
                  <a
                    className="button primary"
                    href={`/api/v1/reports/${id}?format=pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowDownToLine size={18} />
                    Download inspection PDF
                  </a>
                  <a
                    className="button secondary"
                    href={`/api/v1/reports/${id}?format=xlsx`}
                  >
                    <Download size={17} />
                    Export product checklist (Excel)
                  </a>
                </div>
              </div>
            </section>
          </div>
          {isAdmin && ins.submittedAt && (
            <section className="panel spaced">
              <div className="panel-heading">
                <h2>Authorised HAC review</h2>
              </div>
              <ReviewPanel
                decision={async (decision, reason) =>
                  action("review", { decision, reason })
                }
                busy={busy}
              />
            </section>
          )}
        </>
      )}
      {productId && (
        <VerificationModal
          productId={productId}
          predictionId={predictionId}
          variantId={variantId}
          inspection={ins}
          editable={started}
          close={() => setProductId(null)}
          saved={() => {
            setProductId(null);
            setNotice(
              navigator.onLine
                ? "Observation saved to the inspection. Continue scanning the next product."
                : "Observation queued in encrypted storage. Keep this tab open until synchronization. HAC approval requires online revalidation.",
            );
            if (navigator.onLine) load();
          }}
        />
      )}
      {unknown && (
        <UnknownModal
          inspection={ins}
          close={() => setUnknown(false)}
          saved={async (product: Row) => {
            setUnknown(false);
            await load();
            setNotice("Unlisted item saved on this inspection only.");
          }}
        />
      )}
      {sign && (
        <SignatureModal
          inspection={ins}
          user={user}
          close={() => setSign(false)}
          saved={() => {
            setSign(false);
            load();
          }}
        />
      )}
    </>
  );
}
function StandaloneScanner({ canManageTests }: { canManageTests: boolean }) {
  const [id, setId] = useState<string | null>(null),
    [vid, setVid] = useState<string | undefined>(),
    [companies, setCompanies] = useState<Row[]>([]),
    [companyId, setCompanyId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api("/companies?pageSize=100")
      .then((v) => setCompanies(array(v)))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="PRODUCT INTELLIGENCE"
        title="Product scanner"
        description="Identify products through real recognition or search. Confirm certification using authoritative HAC records."
      />
      <section className="scanner-context">
        <label>
          Company for HAC scope verification
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setError("");
            }}
          >
            <option value="">Select the company being inspected</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tradingName ?? c.legalName}
              </option>
            ))}
          </select>
        </label>
        <span>
          Company-specific relationships are evaluated in this context. To save
          an observation, scan within an active inspection.
        </span>
      </section>
      <ErrorBox error={error} />
      <Scanner
        canManageTests={canManageTests}
        onSelect={(pid, variantId) => {
          if (!companyId) {
            setError(
              "Select the company being inspected before opening its product verification.",
            );
            return;
          }
          setId(pid);
          setVid(variantId);
        }}
      />
      {id && (
        <VerificationModal
          productId={id}
          variantId={vid}
          inspection={{ companyId }}
          close={() => setId(null)}
          editable={false}
        />
      )}
    </>
  );
}
function VerificationModal({
  productId,
  predictionId,
  variantId,
  inspection,
  editable,
  close,
  saved,
}: {
  productId: string;
  predictionId?: string;
  variantId?: string;
  inspection?: Row;
  editable: boolean;
  close: () => void;
  saved?: () => void;
}) {
  const [product, setProduct] = useState<Row | null>(null),
    [form, setForm] = useState<Row>({
      variantId,
      identityConfirmed: false,
      conclusion: "CONFIRMED",
    }),
    [verification, setVerification] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [raise, setRaise] = useState(false);
  useEffect(() => {
    api(`/products/${productId}`)
      .then((p) => {
        setProduct(p);
        setForm((f) => ({
          ...f,
          variantId: variantId ?? (p.variants?.length === 1 ? p.variants[0].id : undefined),
          observedBrand: p.brand?.name ?? "",
          observedManufacturer: p.manufacturer?.name ?? "",
          observedBarcode:
            (
              p.variants?.find((v: Row) => v.id === variantId) ??
              (p.variants?.length === 1 ? p.variants[0] : undefined)
            )?.barcode ?? "",
          observedVariant:
            (
              p.variants?.find((v: Row) => v.id === variantId) ??
              (p.variants?.length === 1 ? p.variants[0] : undefined)
            )?.name ?? "",
        }));
      })
      .catch((e) => setError(e.message));
  }, [productId, variantId]);
  function payload() {
    const body: Row = {
      ...form,
      productId,
      recognitionPredictionId:predictionId,
      companyId: inspection?.companyId,
      locationId: inspection?.locationId,
    };
    if (!body.physicalExpiry) delete body.physicalExpiry;
    if (body.quantity !== "" && body.quantity != null)
      body.quantity = Number(body.quantity);
    else delete body.quantity;
    return cleanObservationInput(body);
  }
  async function evaluate() {
    setBusy(true);
    try {
      setVerification(
        await api("/verification", {
          method: "POST",
          body: JSON.stringify(payload()),
        }),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = payload();
      if (!navigator.onLine) {
        if (raise)
          throw new Error(
            "Connect before raising an investigation. Save an offline observation first.",
          );
        await queueObservation({
          inspectionId: inspection!.id,
          expectedVersion: inspection!.version,
          masterDataVersion: inspection!.masterDataVersion,
          payload: { ...body, clientMutationId: crypto.randomUUID() },
        });
        window.dispatchEvent(new Event("hac:queue"));
        saved?.();
        return;
      }
      const result = await api(`/inspections/${inspection?.id}/observations`, {
        method: "POST",
        body: JSON.stringify({
          ...body,
          version: inspection?.version,
          clientMutationId: crypto.randomUUID(),
        }),
      });
      if (raise)
        await api("/investigations", {
          method: "POST",
          body: JSON.stringify({
            companyId: inspection?.companyId,
            inspectionId: inspection?.id,
            productId,
            observationId: result.id,
            title: `Product verification review: ${product?.name}`,
            description:
              form.notes ||
              verification?.label ||
              "Inspector requests HAC review of the saved product observation.",
            priority: verification?.outcomes?.includes("EXPLICITLY_RESTRICTED")
              ? "CRITICAL"
              : "HIGH",
          }),
        });
      saved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const certificate = verification?.certificate;
  return (
    <Modal title="Product verification" close={close} wide>
      {!product ? (
        <Loading />
      ) : (
        <>
          <div className="verification-product">
            <span className="product-tile-icon large">
              <Package size={35} />
            </span>
            <div>
              <span className="eyebrow">{product.itemCode}</span>
              <h3>{product.name}</h3>
              <p>
                {product.brand?.name} · {product.manufacturer?.name}
              </p>
            </div>
            {product.isDemo && (
              <span className="demo-mini">FICTIONAL DEMO</span>
            )}
          </div>
          <div className="verification-principle">
            <ShieldCheck size={18} />
            <span>
              AI identifies. HAC records verify. Confirm the physical product
              before saving.
            </span>
          </div>
          <form onSubmit={save}>
            <div className="verification-section">
              <h3>
                <span>01</span>Compare product identity
              </h3>
              <div className="form-grid">
                <label>
                  Packaging / SKU
                  <select
                    value={form.variantId ?? ""}
                    onChange={(e) => {
                      const v = product.variants.find(
                        (v: Row) => v.id === e.target.value,
                      );
                      setForm({
                        ...form,
                        variantId: e.target.value,
                        observedVariant: v?.name,
                        observedBarcode: v?.barcode ?? "",
                      });
                      setVerification(null);
                    }}
                  >
                    <option value="">Unspecified variant</option>
                    {product.variants?.map((v: Row) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.sku}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Observed barcode
                  <input
                    value={form.observedBarcode ?? ""}
                    onChange={(e) => {
                      setForm({ ...form, observedBarcode: e.target.value });
                      setVerification(null);
                    }}
                  />
                </label>
                <label>
                  Observed brand
                  <input
                    value={form.observedBrand ?? ""}
                    onChange={(e) => {
                      setForm({ ...form, observedBrand: e.target.value });
                      setVerification(null);
                    }}
                  />
                  <small>HAC record: {product.brand?.name}</small>
                </label>
                <label>
                  Observed manufacturer
                  <input
                    value={form.observedManufacturer ?? ""}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        observedManufacturer: e.target.value,
                      });
                      setVerification(null);
                    }}
                  />
                  <small>HAC record: {product.manufacturer?.name}</small>
                </label>
                <label>
                  Observed variant
                  <input
                    value={form.observedVariant ?? ""}
                    onChange={(e) => {
                      setForm({ ...form, observedVariant: e.target.value });
                      setVerification(null);
                    }}
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.identityConfirmed}
                  onChange={(e) => {
                    setForm({ ...form, identityConfirmed: e.target.checked });
                    setVerification(null);
                  }}
                />
                <span>
                  I have physically checked that this is the selected product
                  identity.
                </span>
              </label>
            </div>
            <div className="verification-section">
              <h3>
                <span>02</span>Physical observation
              </h3>
              <div className="form-grid">
                <label>
                  Physical product expiry
                  <input
                    type="date"
                    value={form.physicalExpiry ?? ""}
                    onChange={(e) => {
                      setForm({ ...form, physicalExpiry: e.target.value });
                      setVerification(null);
                    }}
                  />
                  <small>Separate from the HAC certificate expiry.</small>
                </label>
                <label>
                  Batch / lot
                  <input
                    value={form.batch ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, batch: e.target.value })
                    }
                  />
                </label>
                <label>
                  Quantity observed
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.quantity ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                  />
                </label>
                <label>
                  Shelf / storage location
                  <input
                    value={form.storageLocation ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, storageLocation: e.target.value })
                    }
                  />
                </label>
                <label className="span-two">
                  Inspector notes
                  <textarea
                    rows={3}
                    value={form.notes ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="verification-section">
              <div className="section-title-row">
                <h3>
                  <span>03</span>Authoritative HAC verification
                </h3>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={evaluate}
                  disabled={busy}
                >
                  <ShieldCheck size={16} />
                  Check HAC records
                </button>
              </div>
              {verification ? (
                <>
                  <div className="verification-outcomes">
                    {(verification.outcomes ?? [verification.primaryStatus])
                      .filter(Boolean)
                      .map((v: string) => (
                        <Badge key={v} value={v} />
                      ))}
                  </div>
                  <p>{verification.label}</p>
                  {certificate && (
                    <dl className="detail-grid">
                      <div>
                        <dt>Certificate</dt>
                        <dd>{certificate.number}</dd>
                      </div>
                      <div>
                        <dt>Certificate expiry</dt>
                        <dd>{date(certificate.expiresAt)}</dd>
                      </div>
                      <div>
                        <dt>Issuing body</dt>
                        <dd>{certificate.issuer}</dd>
                      </div>
                      <div>
                        <dt>Verified at</dt>
                        <dd>{date(verification.evaluatedAt, true)}</dd>
                      </div>
                    </dl>
                  )}
                  <details className="verification-rules">
                    <summary>
                      View verification basis (
                      {verification.ruleVersion ?? "versioned rules"})
                    </summary>
                    {array(verification.rules).map((r, i) => (
                      <div key={i}>
                        <strong>{r.rule ?? r.code ?? r.title}</strong>
                        <p>{r.reason ?? r.message}</p>
                        {r.expected != null && (
                          <small>
                            Expected:{" "}
                            {typeof r.expected === "object"
                              ? JSON.stringify(r.expected)
                              : String(r.expected)}
                          </small>
                        )}
                        {r.actual != null && (
                          <small>
                            Observed:{" "}
                            {typeof r.actual === "object"
                              ? JSON.stringify(r.actual)
                              : String(r.actual)}
                          </small>
                        )}
                      </div>
                    ))}
                  </details>
                </>
              ) : (
                <p className="muted">
                  Check the current certificate scope, dates, company
                  relationship and recorded restrictions.
                </p>
              )}
            </div>
            {editable && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={raise}
                    onChange={(e) => setRaise(e.target.checked)}
                  />
                  <span>
                    Raise an investigation linked to this observation.
                  </span>
                </label>
                <label>
                  Inspector conclusion
                  <select
                    value={form.conclusion}
                    onChange={(e) =>
                      setForm({ ...form, conclusion: e.target.value })
                    }
                  >
                    <option value="CONFIRMED">Observation confirmed</option>
                    <option value="REVIEW_REQUIRED">HAC review required</option>
                    <option value="DISCREPANCY_CONFIRMED">
                      Discrepancy confirmed
                    </option>
                  </select>
                </label>
              </>
            )}
            <ErrorBox error={error} />
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                Close
              </button>
              {editable && (
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy || !form.identityConfirmed}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Check size={17} />
                  )}
                  Confirm & save observation
                </button>
              )}
            </div>
            {!editable && (
              <p className="muted small-text">
                To record an observation, open an assigned inspection and start
                the visit.
              </p>
            )}
          </form>
        </>
      )}
    </Modal>
  );
}
function ChecklistQuestion({
  question,
  index,
  response,
  inspectionId,
  editable,
  saved,
}: {
  question: Row;
  index: number;
  response?: Row;
  inspectionId: string;
  editable: boolean;
  saved: () => void;
}) {
  const [answer, setAnswer] = useState<any>(response?.answer ?? ""),
    [notes, setNotes] = useState(response?.notes ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(Boolean(response));
  const options = Array.isArray(question.options)
    ? question.options
    : question.type === "COMPLIANCE"
      ? ["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"]
      : question.type === "YES_NO"
        ? ["YES", "NO"]
        : question.type === "PASS_FAIL"
          ? ["PASS", "FAIL"]
          : [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/inspections/${inspectionId}/checklist`, {
        method: "POST",
        body: JSON.stringify({
          questionId: question.id,
          answer: question.type === "NUMERIC" ? Number(answer) : answer,
          notes,
        }),
      });
      setDone(true);
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="checklist-question" onSubmit={submit}>
      <div className="question-number">{index + 1}</div>
      <div className="question-content">
        <div className="question-heading">
          <div>
            <span className="section-eyebrow">{question.section}</span>
            <h3>
              {question.text}
              <span className="small-text muted"> (optional)</span>
            </h3>
          </div>
          {done && (
            <span className="saved-indicator">
              <CheckCircle2 size={14} />
              Saved
            </span>
          )}
        </div>
        <div className="question-answer">
          {options.length ? (
            <div className="answer-options">
              {options.map((o: string | Row) => {
                const val = typeof o === "string" ? o : o.value,
                  title = typeof o === "string" ? label(o) : o.label;
                return (
                  <label className={answer === val ? "selected" : ""} key={val}>
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      required={false}
                      value={val}
                      checked={answer === val}
                      disabled={!editable}
                      onChange={() => {
                        setAnswer(val);
                        setDone(false);
                      }}
                    />
                    {title}
                  </label>
                );
              })}
            </div>
          ) : (
            <input
              aria-label="Checklist answer"
              required={false}
              type={
                question.type === "NUMERIC"
                  ? "number"
                  : question.type === "DATE"
                    ? "date"
                    : "text"
              }
              value={answer}
              disabled={!editable}
              onChange={(e) => {
                setAnswer(e.target.value);
                setDone(false);
              }}
            />
          )}
          <label className="question-notes">
            Notes
            <input
              value={notes}
              disabled={!editable}
              onChange={(e) => {
                setNotes(e.target.value);
                setDone(false);
              }}
              placeholder="Add context or evidence reference…"
            />
          </label>
          {editable && (
            <button className="button secondary small" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Check size={14} />
              )}
              Save answer
            </button>
          )}
        </div>
        <ErrorBox error={error} />
      </div>
    </form>
  );
}
function UnknownModal({
  inspection,
  close,
  saved,
}: {
  inspection: Row;
  close: () => void;
  saved: (product: Row) => void | Promise<void>;
}) {
  const [form, setForm] = useState<Row>({ priority: "NORMAL" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api(`/inspections/${inspection.id}/unknown`, {
        method: "POST",
        body: JSON.stringify({ ...cleanObservationInput(form), description: form.description?.trim() || "" }),
      });
      await saved(result.observation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Unknown product — review required" close={close}>
      <div className="alert info">
        <CircleHelp size={18} />
        An unknown item is unverified. It is not automatically non-Halal,
        prohibited or HAC-approved.
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          {[
            ["name", "Product name", true],
            ["brandName", "Observed brand", false],
            ["manufacturerName", "Observed manufacturer", false],
            ["barcode", "Barcode", false],
          ].map(([key, title, req]) => (
            <label key={String(key)}>
              {String(title)}
              {req ? " *" : ""}
              <input
                required={Boolean(req)}
                value={form[String(key)] ?? ""}
                onChange={(e) =>
                  setForm({ ...form, [String(key)]: e.target.value })
                }
              />
            </label>
          ))}
          <label className="span-two">
            Description
            <textarea
              rows={3}
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label className="span-two">
            Reason for investigation *
            <textarea
              required
              rows={3}
              value={form.reason ?? ""}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {["NORMAL", "HIGH", "CRITICAL"].map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Plus size={17} />
            Create provisional item & investigation
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EvidencePanel({
  inspection,
  editable,
  saved,
}: {
  inspection: Row;
  editable: boolean;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData(e.currentTarget);
      data.set("inspectionId", inspection.id);
      await api("/evidence", { method: "POST", body: data });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Inspection evidence</h2>
          <p>Files remain access-controlled and linked to the inspection.</p>
        </div>
        <Paperclip size={20} />
      </div>
      {editable && (
        <form className="evidence-upload" onSubmit={upload}>
          <label>
            Select JPEG or PNG photograph (up to 8 MB)
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png"
              required
            />
          </label>
          <label>
            Description
            <input
              name="description"
              placeholder="What does this evidence show?"
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}
            Upload evidence
          </button>
        </form>
      )}
      <ErrorBox error={error} />
      {array(inspection.evidence).length ? (
        <div className="evidence-grid">
          {array(inspection.evidence).map((e) => (
            <a
              className="evidence-card"
              key={e.id}
              href={`/api/v1/evidence/${e.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {e.mimeType?.startsWith("image/") ? (
                <img
                  src={`/api/v1/evidence/${e.id}`}
                  alt={e.description ?? e.originalName}
                />
              ) : (
                <div className="evidence-file">
                  <FileText size={36} />
                </div>
              )}
              <div>
                <strong>{e.description ?? e.originalName}</strong>
                <small>{date(e.capturedAt ?? e.createdAt, true)}</small>
                <span>
                  <ShieldCheck size={12} />
                  {e.sha256?.slice(0, 16)}…
                </span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Empty
          title="No evidence attached"
          description="Upload evidence photographs during the active inspection."
        />
      )}
    </section>
  );
}
function SignatureModal({
  inspection,
  user,
  close,
  saved,
}: {
  inspection: Row;
  user: Row;
  close: () => void;
  saved: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [name, setName] = useState(user.name),
    [role, setRole] = useState("INSPECTOR"),
    [reason, setReason] = useState(""),
    [drawn, setDrawn] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const drawing = useRef(false);
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * e.currentTarget.width) / rect.width,
      y: ((e.clientY - rect.top) * e.currentTarget.height) / rect.height,
    };
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!drawn && !reason.trim()) {
      setError("Draw a signature or give the reason it is unavailable.");
      return;
    }
    setBusy(true);
    try {
      await api(`/inspections/${inspection.id}/sign`, {
        method: "POST",
        body: JSON.stringify({
          name,
          role,
          signature: drawn ? canvas.current?.toDataURL("image/png") : undefined,
          reason: reason || undefined,
        }),
      });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Signature & declaration" close={close}>
      <p className="muted">
        I confirm that the saved observations accurately reflect this visit.
        This declaration does not issue or alter official HAC certification.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Full name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Signing as
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="INSPECTOR">Inspector</option>
            <option value="COMPANY_REPRESENTATIVE">
              Company representative
            </option>
          </select>
        </label>
        <label>
          Draw signature
          <canvas
            className="signature-canvas"
            ref={canvas}
            width={600}
            height={180}
            onPointerDown={(e) => {
              drawing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = point(e),
                ctx = e.currentTarget.getContext("2d");
              ctx?.beginPath();
              ctx?.moveTo(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const p = point(e),
                ctx = e.currentTarget.getContext("2d");
              if (ctx) {
                ctx.strokeStyle = "#102b36";
                ctx.lineWidth = 2.5;
                ctx.lineCap = "round";
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
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
        </label>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
            setDrawn(false);
          }}
        >
          Clear signature
        </button>
        <label>
          Signature unavailable / refusal reason
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required if no signature is provided"
          />
        </label>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <ShieldCheck size={17} />
            Save declaration
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReviewPanel({
  decision,
  busy,
}: {
  decision: (decision: string, reason: string) => Promise<void>;
  busy: boolean;
}) {
  const [reason, setReason] = useState(""),
    [choice, setChoice] = useState("APPROVED");
  return (
    <form
      className="panel-body form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        decision(choice, reason);
      }}
    >
      <label>
        Review decision
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="APPROVED">Approve inspection report</option>
          <option value="CLARIFICATION_REQUIRED">Request clarification</option>
        </select>
      </label>
      <label>
        Review reason
        <textarea
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="button primary" disabled={busy}>
        <ShieldCheck size={17} />
        Record authorised decision
      </button>
    </form>
  );
}
function Reports() {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    api("/inspections?pageSize=100")
      .then((v) => setRows(array(v)))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="SAVED RECORDS, CLEARLY PRESENTED"
        title="Inspection reports"
        description="Generate authoritative PDF reports and Excel checklists from saved inspection records."
      />
      <ErrorBox error={error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Available inspections</h2>
          <span className="count-pill">{rows.length}</span>
        </div>
        {busy ? (
          <Loading />
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Inspection</th>
                  <th>Company</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Downloads</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="text-link" href={`/inspections/${r.id}`}>
                        {r.reference}
                      </Link>
                    </td>
                    <td>{r.company?.tradingName ?? r.company?.legalName}</td>
                    <td>{date(r.submittedAt ?? r.scheduledAt)}</td>
                    <td>
                      <Badge value={r.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <a
                          className="button secondary small"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`/api/v1/reports/${r.id}?format=pdf`}
                        >
                          <FileText size={15} />
                          PDF
                        </a>
                        <a
                          className="button secondary small"
                          href={`/api/v1/reports/${r.id}?format=xlsx`}
                        >
                          <Download size={15} />
                          Excel
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No inspections to report"
            description="Create an inspection and save observations to generate its report."
          />
        )}
      </section>
      <div className="info-strip">
        <ShieldCheck size={19} />
        <p>
          Submitted inspection snapshots are preserved. Draft reports identify
          their draft status, and counts may overlap where an item has multiple
          findings.
        </p>
      </div>
    </>
  );
}
function Settings({ user }: { user: Row }) {
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE PREFERENCES"
        title="Workspace settings"
        description="Your account, operational defaults and certification safeguards."
      />
      <div className="inspection-overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Your account</h2>
            <Users size={20} />
          </div>
          <dl className="detail-grid padded">
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{label(user.role)}</dd>
            </div>
            <div className="span-two">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Business timezone</dt>
              <dd>Asia / Colombo</dd>
            </div>
            <div>
              <dt>Interface language</dt>
              <dd>English</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Verification safeguards</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="settings-safeguards">
            <div>
              <CheckCircle2 size={18} />
              <span>
                Approval is calculated on the server from HAC records.
              </span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>Recognition scores never confer official approval.</span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>
                Submitted inspection snapshots cannot be silently edited.
              </span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>Company access follows role and assignments.</span>
            </div>
          </div>
        </section>
      </div>
      <div className="info-strip">
        <CircleHelp size={18} />
        <p>
          Account access, certification policies and environment configuration
          are managed by authorised administrators. Contact your administrator
          to request changes.
        </p>
      </div>
    </>
  );
}
function OfflineStatus() {
  const [online, setOnline] = useState(true),
    [count, setCount] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    async function refresh() {
      setOnline(navigator.onLine);
      setCount(await pendingDraftCount().catch(() => 0));
      try {
        await pendingDrafts();
      } catch (e) {
        setMessage((e as Error).message);
      }
    }
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("hac:queue", refresh);
    const guard = (e: BeforeUnloadEvent) => {
      if (count) {
        e.preventDefault();
        e.returnValue =
          "Keep this tab open until queued observations are synchronized.";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("hac:queue", refresh);
      window.removeEventListener("beforeunload", guard);
    };
  }, [count]);
  async function sync() {
    setBusy(true);
    try {
      const r = await syncQueuedObservations();
      setCount(r.pending);
      setMessage(
        r.conflict?.message ??
          `${r.synced.length} observations synchronized. Server-side HAC verification has been applied.`,
      );
      window.dispatchEvent(new Event("hac:synced"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (online && !count && !message) return null;
  return (
    <div
      className={`offline-status ${online ? "" : "disconnected"}`}
      role="status"
    >
      <Wifi size={16} />
      <div>
        <strong>
          {online
            ? "Connection available"
            : "Offline — certification requires online revalidation"}
        </strong>
        <span>
          {count
            ? `${count} encrypted observations queued. Keep this tab open; reloading or signing out loses the in-memory encryption key.`
            : "Previously loaded records may be stale. Final submission requires a live connection."}
          {message && ` ${message}`}
        </span>
      </div>
      {online && count > 0 && (
        <button
          className="button secondary small"
          disabled={busy}
          onClick={sync}
        >
          Synchronize
        </button>
      )}
      {message && !count && (
        <button
          className="icon-button"
          onClick={() => setMessage("")}
          aria-label="Dismiss sync message"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
function CompanyAssignment({ companyId }: { companyId: string }) {
  const [people, setPeople] = useState<Row[]>([]),
    [userId, setUserId] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/users?pageSize=100")
      .then((v) =>
        setPeople(
          array(v).filter((u) =>
            ["SUPERVISOR", "AUDITOR", "HAC_ADMIN", "SUPER_ADMIN"].includes(
              u.role,
            ),
          ),
        ),
      )
      .catch(() => {});
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/assignments", {
        method: "POST",
        body: JSON.stringify({ companyId, userId }),
      });
      setMessage("Company assignment saved.");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack assignment-form" onSubmit={submit}>
      <h3>Assign a supervisor or auditor</h3>
      <label>
        HAC team member
        <select
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Select team member</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {label(p.role)}
            </option>
          ))}
        </select>
      </label>
      <button className="button secondary" disabled={busy}>
        <Users size={16} />
        Save company assignment
      </button>
      <ErrorBox error={error} />
      {message && <div className="alert success">{message}</div>}
    </form>
  );
}
