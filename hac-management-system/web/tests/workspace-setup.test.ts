import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../src/lib/auth";
import { verifyPassword } from "../src/lib/auth";
vi.mock("../src/lib/db", () => ({ db: {} }));
import { getWorkspaceSetup, provisionWorkspace, updateWorkspaceRecord, workspaceSetupSchema, workspacePatchSchema, WORKSPACE_COMPANY_IDS as companyIds, WORKSPACE_SUPERVISOR_IDS as userIds, WORKSPACE_SUPERVISORS, materialCertificateDate } from "../src/lib/workspace-setup";
import { MARML_SOURCE, MARML_MATERIALS } from "../src/data/marml-materials";
const admin: AuthUser = { id: "admin", name: "Admin", email: "admin@example.test", role: "HAC_ADMIN", companyId: null };
const people = WORKSPACE_SUPERVISORS.map((person) => ({ ...person }));
let companies: Map<string, any>, users: Map<string, any>, listings: Map<string, any>, products: Map<string, any>, assignments: any[];
const staff = (user: any) => ({ id: user.id, name: user.name, email: user.email, isActive: user.isActive, role: user.role, assignments: assignments.filter((a) => a.userId === user.id && a.isActive && !a.revokedAt).map((a) => ({ ...a, company: { id: a.companyId, legalName: companies.get(a.companyId)?.legalName } })) });
const mock = {
  company: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, companyLocation: { upsert: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  rawMaterialListing: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() }, product: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  brand: { upsert: vi.fn() }, manufacturer: { upsert: vi.fn() }, supplier: { upsert: vi.fn() },
  supervisorCompanyAssignment: { create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() }, companyItem: { create: vi.fn() },
  checklistTemplate: { upsert: vi.fn() }, checklistTemplateVersion: { upsert: vi.fn(), findUnique: vi.fn() }, checklistQuestion: { upsert: vi.fn() }, auditLog: { create: vi.fn() }, session: { deleteMany: vi.fn() }, $transaction: vi.fn(),
};
const database = mock as unknown as PrismaClient;
const passwordGenerator = vi.fn(), passwordHasher = vi.fn();
const dependencies = { database, passwordGenerator, passwordHasher };
beforeEach(() => {
  vi.clearAllMocks(); companies = new Map(); users = new Map(); listings = new Map(); products = new Map(); assignments = [];
  let counter = 0;
  passwordGenerator.mockImplementation(() => `Hac-private-generated-password-${++counter}`); passwordHasher.mockResolvedValue("stored-scrypt-hash");
  mock.$transaction.mockImplementation((callback) => callback(mock));
  mock.company.upsert.mockImplementation(({ where, create }: any) => { if (!companies.has(where.id)) companies.set(where.id, { ...create, locations: [] }); return companies.get(where.id); });
  mock.company.findMany.mockImplementation(({ where }: any) => [...companies.values()].filter((c) => !where?.id?.in || where.id.in.includes(c.id)));
  mock.company.findUnique.mockImplementation(({ where }: any) => companies.get(where.id) || null);
  mock.company.update.mockImplementation(({ where, data }: any) => { Object.assign(companies.get(where.id), data); return companies.get(where.id); });
  mock.companyLocation.upsert.mockImplementation(({ create }: any) => { const c = companies.get(create.companyId); if (!c.locations.some((l: any) => l.id === create.id)) c.locations.push({ ...create }); return create; });
  mock.user.findUnique.mockImplementation(({ where }: any) => where.id ? users.get(where.id) || null : [...users.values()].find((u) => u.email === where.email) || null);
  mock.user.create.mockImplementation(({ data }: any) => { users.set(data.id, { ...data }); return data; });
  mock.user.findMany.mockImplementation(() => [...users.values()].map(staff));
  mock.user.update.mockImplementation(({ where, data }: any) => { Object.assign(users.get(where.id), data); return staff(users.get(where.id)); });
  mock.supervisorCompanyAssignment.create.mockImplementation(({ data }: any) => { assignments.push({ ...data, revokedAt: null }); return data; });
  mock.supervisorCompanyAssignment.updateMany.mockImplementation(({ where, data }: any) => { for (const a of assignments) if (a.userId === where.userId && !where.companyId.notIn.includes(a.companyId)) Object.assign(a, data); return { count: 1 }; });
  mock.supervisorCompanyAssignment.upsert.mockImplementation(({ where, create, update }: any) => { const a = assignments.find((a) => a.userId === where.userId_companyId.userId && a.companyId === where.userId_companyId.companyId); if (a) Object.assign(a, update); else assignments.push({ ...create, revokedAt: null }); });
  for (const e of [mock.brand, mock.manufacturer, mock.supplier]) e.upsert.mockImplementation(({ create }: any) => create);
  mock.product.findFirst.mockResolvedValue(null);
  mock.product.create.mockImplementation(({ data }: any) => { products.set(data.id, { ...data, version: 1 }); return products.get(data.id); });
  mock.product.update.mockImplementation(({ where, data }: any) => { const p = products.get(where.id); Object.assign(p, { ...data, version: p.version + 1 }); return p; });
  mock.rawMaterialListing.findUnique.mockImplementation(({ where }: any) => where.id ? listings.get(where.id) || null : [...listings.values()].find((l) => l.rowNumber === where.sourceDocument_rowNumber.rowNumber) || null);
  mock.rawMaterialListing.create.mockImplementation(({ data }: any) => { listings.set(data.id, { ...data, version: 1 }); return listings.get(data.id); });
  mock.rawMaterialListing.findMany.mockImplementation(() => [...listings.values()]);
  mock.rawMaterialListing.update.mockImplementation(({ where, data }: any) => { const l = listings.get(where.id); Object.assign(l, { ...data, version: l.version + 1 }); return l; });
  mock.checklistTemplateVersion.findUnique.mockResolvedValue({ id: "workspace-checklist-marml-v1" });
});

describe("administrator-managed MARML workspace", () => {
  it("restricts preview, import and future changes to administrators", async () => {
    const supervisor = { ...admin, role: "SUPERVISOR" as const };
    await expect(getWorkspaceSetup(supervisor, database)).rejects.toMatchObject({ status: 403 });
    await expect(provisionWorkspace(supervisor, { supervisors: people }, dependencies)).rejects.toMatchObject({ status: 403 });
    await expect(updateWorkspaceRecord(supervisor, { action: "supervisor", id: "x", fields: { name: "Changed" } }, database)).rejects.toMatchObject({ status: 403 });
    expect(mock.$transaction).not.toHaveBeenCalled();
  });
  it("requires five different supervisor emails and ten unique company names", () => {
    expect(workspaceSetupSchema.safeParse({ supervisors: people.slice(0, 4) }).success).toBe(false);
    expect(workspaceSetupSchema.safeParse({ supervisors: people.map(() => people[0]) }).success).toBe(false);
    expect(workspaceSetupSchema.safeParse({ supervisors: people, companyNames: Array(10).fill("Same") }).success).toBe(false);
  });
  it("pins the supplied document to Ceylon Agro Industries instead of relabelling its source company", async () => {
    const names = companyIds.map((_, index) => `Company ${index + 1}`);
    names[7] = "Another retailer";
    await expect(provisionWorkspace(admin, { supervisors: people, companyNames: names }, dependencies)).rejects.toMatchObject({ status: 422, code: "MARML_SOURCE_COMPANY_MISMATCH" });
    expect(mock.$transaction).not.toHaveBeenCalled();
  });
  it("creates10 companies,5 supervisors,2 assignments each and39 source rows without inventing registrations or certificates", async () => {
    const result = await provisionWorkspace(admin, { supervisors: people }, dependencies);
    expect(companies.size).toBe(10); expect(users.size).toBe(5); expect(listings.size).toBe(39);
    expect([...companies.values()].every((c) => c.registrationNumber === null && !c.isDemo)).toBe(true);
    expect(result.credentials).toHaveLength(5);
    expect(new Set(result.credentials.map((c) => c.password)).size).toBe(5);
    for (const [index, userId] of userIds.entries()) {
      expect(users.get(userId)).toMatchObject({ role: "SUPERVISOR", companyId: null, passwordHash: "stored-scrypt-hash" });
      expect(assignments.filter((a) => a.userId === userId).map((a) => a.companyId)).toEqual(companyIds.slice(index * 2, index * 2 + 2));
    }
    expect([...listings.values()].every((l) => l.sourceCompanyId === companyIds[7] && l.reviewStatus === "SOURCE_LISTED_REQUIRES_REVIEW")).toBe(true);
    expect(mock.companyItem.create.mock.calls.every(([q]) => q.data.companyId === companyIds[7])).toBe(true);
    expect(mock.checklistQuestion.upsert).toHaveBeenCalledTimes(4);
    const stored = JSON.stringify([...users.values(), ...mock.auditLog.create.mock.calls]);
    for (const credential of result.credentials) expect(stored).not.toContain(credential.password);
    const preview = JSON.stringify(await getWorkspaceSetup(admin, database));
    expect(preview).not.toContain("stored-scrypt-hash"); expect(preview).not.toContain("Hac-private-generated-password");
  });
  it("does not reissue passwords or overwrite administrator corrections on repeated import", async () => {
    await provisionWorkspace(admin, { supervisors: people }, dependencies);
    users.get(userIds[0]).name = "Edited operator"; assignments[0].companyId = companyIds[9]; listings.get("workspace-marml-001").remarks = "Admin correction";
    const repeated = await provisionWorkspace(admin, { supervisors: people }, dependencies);
    expect(repeated.credentials).toEqual([]); expect(repeated.existingUsersPreserved).toBe(5);
    expect(passwordHasher).toHaveBeenCalledTimes(5); expect(mock.product.create).toHaveBeenCalledTimes(39);
    expect(users.get(userIds[0]).name).toBe("Edited operator"); expect(assignments[0].companyId).toBe(companyIds[9]); expect(listings.get("workspace-marml-001").remarks).toBe("Admin correction");
  });
  it("rejects an email already owned by another account without adopting or promoting it", async () => {
    users.set("existing", { id: "existing", email: people[0].email, role: "COMPANY_ADMIN", passwordHash: "unchanged" });
    await expect(provisionWorkspace(admin, { supervisors: people }, dependencies)).rejects.toMatchObject({ status: 409, code: "SETUP_EMAIL_EXISTS" });
    expect(users.get("existing").passwordHash).toBe("unchanged"); expect(passwordHasher).not.toHaveBeenCalled();
  });
  it("identifies a catalogue conflict by source row without guessing which existing identity to reuse", async () => {
    mock.product.findFirst.mockResolvedValueOnce({ id: "pre-existing-material" });
    await expect(provisionWorkspace(admin, { supervisors: people }, dependencies)).rejects.toMatchObject({ status: 409, code: "MARML_IDENTITY_CONFLICT", message: expect.stringContaining("row 1") });
    expect(mock.product.create).not.toHaveBeenCalled();
    expect(mock.rawMaterialListing.create).not.toHaveBeenCalled();
  });
  it("keeps response reads within the creation transaction so a failed summary rejects before commit", async () => {
    let inTransaction = false;
    mock.$transaction.mockImplementation(async (callback) => {
      inTransaction = true;
      try { return await callback(mock); } finally { inTransaction = false; }
    });
    mock.rawMaterialListing.findMany.mockImplementation(() => {
      expect(inTransaction).toBe(true);
      throw new Error("Synthetic summary failure");
    });
    await expect(provisionWorkspace(admin, { supervisors: people }, dependencies)).rejects.toThrow("Synthetic summary failure");
    expect(mock.$transaction).toHaveBeenCalledOnce();
    expect(inTransaction).toBe(false);
  });
  it("preserves original source/scope and advances catalogue and listing versions on an audited edit", async () => {
    await provisionWorkspace(admin, { supervisors: people }, dependencies);
    const listing = listings.get("workspace-marml-001"), source = JSON.stringify(listing.sourceRow);
    expect(workspacePatchSchema.safeParse({ action: "material", id: listing.id, fields: { sourceCompanyId: companyIds[0] } }).success).toBe(false);
    const result = await updateWorkspaceRecord(admin, { action: "material", id: listing.id, fields: { name: "Corrected identity", certificateExpiry: "2027-06-30", reviewStatus: "VERIFIED" } }, database);
    if (!("sourceRow" in result)) throw new Error("Expected a material listing response");
    expect(JSON.stringify(result.sourceRow)).toBe(source); expect(result.sourceCompanyId).toBe(companyIds[7]); expect(result.reviewStatus).toBe("VERIFIED"); expect(result.version).toBe(2);
    expect(products.get(listing.productId)).toMatchObject({ name: "Corrected identity", version: 2 });
    expect(mock.auditLog.create.mock.calls.at(-1)?.[0].data.action).toBe("UPDATE_MARML_LISTING");
  });
  it("replaces supervisor access with exactly two companies, preserves passwords and revokes old email sessions", async () => {
    await provisionWorkspace(admin, { supervisors: people }, dependencies);
    expect(workspacePatchSchema.safeParse({ action: "supervisor", id: userIds[0], fields: { companyIds: [companyIds[0], companyIds[0]] } }).success).toBe(false);
    const result = await updateWorkspaceRecord(admin, { action: "supervisor", id: userIds[0], fields: { email: "edited@example.test", companyIds: [companyIds[7], companyIds[9]] } }, database);
    if (!("assignments" in result)) throw new Error("Expected a supervisor response");
    expect(result.assignments.map((a: any) => a.companyId)).toEqual([companyIds[7], companyIds[9]]);
    expect(users.get(userIds[0]).passwordHash).toBe("stored-scrypt-hash"); expect(mock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: userIds[0] } });
  });
  it("supports an explicit administrator password reset using the real hash and revokes prior supervisor sessions", async () => {
    await provisionWorkspace(admin, { supervisors: people }, dependencies);
    const newPassword = "A new explicit supervisor password";
    const result = await updateWorkspaceRecord(admin, { action: "supervisor", id: userIds[0], fields: { password: newPassword } }, database);
    const saved = users.get(userIds[0]);
    expect(await verifyPassword(newPassword, saved.passwordHash)).toBe(true);
    expect(saved.role).toBe("SUPERVISOR");
    expect(saved.password).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(newPassword);
    expect(JSON.stringify(mock.auditLog.create.mock.calls)).not.toContain(newPassword);
    expect(JSON.stringify(mock.auditLog.create.mock.calls)).not.toContain(saved.passwordHash);
    expect(mock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: userIds[0] } });
  });
  it("retains printed expiry dates through the final instant of the Sri Lankan calendar day", () => {
    expect(materialCertificateDate("2025-09-11").toISOString()).toBe("2025-09-11T18:29:59.999Z");
    expect(MARML_SOURCE.suppliedPages).toEqual([1, 2, 3]); expect(MARML_SOURCE.declaredPageCount).toBe(31);
    expect(MARML_MATERIALS.map((r) => r.rowNumber)).toEqual(Array.from({ length: 39 }, (_, i) => i + 1));
  });
});
