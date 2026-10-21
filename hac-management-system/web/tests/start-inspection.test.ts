import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../src/lib/auth";

const state = vi.hoisted(() => {
  const tx = {
    user: { findUnique: vi.fn() },
    supervisorCompanyAssignment: { findFirst: vi.fn() },
    company: { findUnique: vi.fn(), create: vi.fn() },
    companyLocation: { findUnique: vi.fn() },
    checklistTemplateVersion: { findUnique: vi.fn() },
    inspection: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    client: { $transaction: vi.fn() },
    actor: {
      id: "supervisor-1", name: "Supervisor One", email: "supervisor@example.test",
      role: "SUPERVISOR" as string, companyId: null,
    },
  };
});
vi.mock("../src/lib/db", () => ({ db: state.client }));
vi.mock("../src/lib/auth", async (original) => {
  const actual = await original<typeof import("../src/lib/auth")>();
  return { ...actual, requireUser: vi.fn(async () => state.actor) };
});

import { POST } from "../src/app/api/v1/[...path]/route";
import { startInspectionNow, startInspectionSchema } from "../src/lib/start-inspection";

const previousOrigin = process.env.APP_ORIGIN;
const payload = {
  companyId: "company-1", locationId: "location-1", checklistVersionId: "checklist-1",
};
const tx = state.tx;
const context = () => ({ params: Promise.resolve({ path: ["inspections", "start-now"] }) });
function request(extra: Record<string, unknown> = {}) {
  return new Request("https://hac.test/api/v1/inspections/start-now", {
    method: "POST", headers: { origin: "https://hac.test", "content-type": "application/json" },
    body: JSON.stringify({ ...payload, ...extra }),
  });
}
const user = () => state.actor as AuthUser;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ORIGIN = "https://hac.test";
  state.actor.role = "SUPERVISOR";
  tx.user.findUnique.mockResolvedValue({ ...state.actor, isActive: true });
  tx.supervisorCompanyAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });
  tx.company.findUnique.mockResolvedValue({ id: "company-1", status: "ACTIVE", archivedAt: null, isDemo: false });
  tx.company.create.mockImplementation(async ({ data }) => ({ id: "new-company", ...data }));
  tx.companyLocation.findUnique.mockResolvedValue({ id: "location-1", companyId: "company-1", isActive: true });
  tx.checklistTemplateVersion.findUnique.mockResolvedValue({ id: "checklist-1", status: "PUBLISHED" });
  tx.inspection.findFirst.mockResolvedValue(null);
  tx.inspection.create.mockImplementation(async ({ data }) => ({ id: "inspection-1", version: 1, ...data }));
  tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  state.client.$transaction.mockImplementation(async (callback) => callback(tx));
});
afterAll(() => {
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
});

describe("supervisor on-demand inspection start", () => {
  it("starts without a checklist and does not query a fabricated template", async () => {
    const input = startInspectionSchema.parse({ companyId: "company-1", locationId: "location-1" });
    const result = await startInspectionNow(user(), input, state.client as never);
    expect(result.inspection.checklistVersionId).toBeNull();
    expect(tx.checklistTemplateVersion.findUnique).not.toHaveBeenCalled();
  });

  it("starts an assigned company visit directly in progress and audits its server-owned identity/time", async () => {
    const response = await POST(request({ objectives: "Check incoming raw materials" }), context());
    expect(response.status).toBe(201);
    const record = (await response.json()).data;
    expect(record).toMatchObject({ id: "inspection-1", status: "IN_PROGRESS", inspectorId: "supervisor-1", type: "ROUTINE" });
    expect(record.startedAt).toBeTruthy();
    expect(record.scheduledAt).toBe(record.startedAt);
    expect(tx.inspection.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      inspectorId: "supervisor-1", status: "IN_PROGRESS", startedAt: expect.any(Date), scheduledAt: expect.any(Date),
      companyId: "company-1", locationId: "location-1", checklistVersionId: "checklist-1", isDemo: false,
    }) });
    expect(state.client.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", timeout: 15000 });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "SELF_START", userId: "supervisor-1", companyId: "company-1" });
    expect(tx.inspection.findFirst).toHaveBeenCalledWith({
      where: { inspectorId: "supervisor-1", companyId: "company-1", locationId: "location-1", status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
    });
  });

  it.each([{ inspectorId: "another-inspector" }, { scheduledAt: "2099-01-01T00:00:00Z" }, { status: "APPROVED" }])(
    "rejects forged server-owned fields before starting a transaction", async (extra) => {
      const response = await POST(request(extra), context());
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(state.client.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["AUDITOR", "COMPANY_ADMIN", "COMPANY_STAFF"])("denies %s accounts", async (role) => {
    state.actor.role = role;
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(state.client.$transaction).not.toHaveBeenCalled();
  });

  it("denies an unassigned or revoked company and checks current assignment inside the transaction", async () => {
    tx.supervisorCompanyAssignment.findFirst.mockResolvedValue(null);
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("COMPANY_ACCESS_DENIED");
    expect(tx.supervisorCompanyAssignment.findFirst).toHaveBeenCalledWith({
      where: { userId: "supervisor-1", companyId: "company-1", isActive: true, revokedAt: null },
    });
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it("does not trust an administrator role that changed since the request's user was loaded", async () => {
    state.actor.role = "HAC_ADMIN";
    tx.user.findUnique.mockResolvedValue({ ...state.actor, role: "SUPERVISOR", isActive: true });
    tx.supervisorCompanyAssignment.findFirst.mockResolvedValue(null);
    expect((await POST(request(), context())).status).toBe(403);
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it("rejects a user disabled after authentication", async () => {
    tx.user.findUnique.mockResolvedValue({ ...state.actor, isActive: false });
    expect((await POST(request(), context())).status).toBe(403);
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it.each([
    { id: "company-1", status: "ARCHIVED", archivedAt: new Date(), isDemo: false },
    { id: "company-1", status: "SUSPENDED", archivedAt: null, isDemo: false },
    null,
  ])("requires an active, unarchived company", async (company) => {
    tx.company.findUnique.mockResolvedValue(company);
    expect((await POST(request(), context())).status).toBe(422);
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it("rejects a location belonging to a different company", async () => {
    tx.companyLocation.findUnique.mockResolvedValue({ id: "location-1", companyId: "company-other", isActive: true });
    const response = await POST(request(), context());
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("INVALID_LOCATION");
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive location or unpublished checklist", async () => {
    tx.companyLocation.findUnique.mockResolvedValueOnce({ id: "location-1", companyId: "company-1", isActive: false });
    expect((await POST(request(), context())).status).toBe(422);
    tx.checklistTemplateVersion.findUnique.mockResolvedValue({ id: "checklist-1", status: "DRAFT" });
    const response = await POST(request(), context());
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("INVALID_CHECKLIST");
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it("resumes the supervisor's same active visit without creating or changing a record", async () => {
    const existing = { id: "existing-inspection", companyId: "company-1", locationId: "location-1", inspectorId: "supervisor-1", status: "IN_PROGRESS" };
    tx.inspection.findFirst.mockResolvedValue(existing);
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(existing);
    expect(tx.inspection.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows another assigned company without enforcing scheduled-visit timing conflicts", async () => {
    tx.company.findUnique.mockResolvedValue({ id: "company-2", status: "ACTIVE", archivedAt: null, isDemo: false });
    tx.companyLocation.findUnique.mockResolvedValue({ id: "location-2", companyId: "company-2", isActive: true });
    const response = await POST(request({ companyId: "company-2", locationId: "location-2", type: "UNANNOUNCED" }), context());
    expect(response.status).toBe(201);
    expect((await response.json()).data.type).toBe("UNANNOUNCED");
    expect(tx.inspection.findFirst.mock.calls[0][0].where).toEqual({
      inspectorId: "supervisor-1", companyId: "company-2", locationId: "location-2", status: "IN_PROGRESS",
    });
  });

  it("allows active HAC administrators without a supervisor-company assignment", async () => {
    state.actor.role = "HAC_ADMIN";
    tx.user.findUnique.mockResolvedValue({ ...state.actor, isActive: true });
    expect((await POST(request(), context())).status).toBe(201);
    expect(tx.supervisorCompanyAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("retries one serializable write conflict and revalidates the current permissions", async () => {
    state.client.$transaction.mockRejectedValueOnce({ code: "P2034" });
    const result = await startInspectionNow(user(), startInspectionSchema.parse(payload));
    expect(result.created).toBe(true);
    expect(state.client.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.user.findUnique).toHaveBeenCalledOnce();
    expect(tx.inspection.create).toHaveBeenCalledOnce();
  });

  it("returns a retryable conflict if two start attempts both encounter contention", async () => {
    state.client.$transaction.mockRejectedValueOnce({ code: "P2034" }).mockRejectedValueOnce({ code: "P2034" });
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("START_CONFLICT");
    expect(state.client.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe("company profile registration", () => {
  it.each([undefined, null, "", "  "])("keeps an unknown registration number null instead of fabricating an identifier", async (registrationNumber) => {
    state.actor.role = "HAC_ADMIN";
    const response = await POST(new Request("https://hac.test/api/v1/companies", {
      method: "POST",
      headers: { origin: "https://hac.test", "content-type": "application/json" },
      body: JSON.stringify({ legalName: "Company profile", registrationNumber }),
    }), { params: Promise.resolve({ path: ["companies"] }) });
    expect(response.status).toBe(201);
    expect(tx.company.create.mock.calls[0][0].data.registrationNumber).toBeNull();
    expect((await response.json()).data.registrationNumber).toBeNull();
  });
});
