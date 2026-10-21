import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  tx: {
    checklistTemplate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    checklistTemplateVersion: { create: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }, client: { $transaction: vi.fn() },
}));
vi.mock("../src/lib/db", () => ({ db: state.client }));
import { archiveChecklist, checklistEditSchema, publishChecklist } from "../src/lib/checklist-management";
const admin = { id: "admin", role: "HAC_ADMIN" as const, name: "Admin", email: "admin@example.test", companyId: null };
beforeEach(() => {
  vi.resetAllMocks();
  state.client.$transaction.mockImplementation(async callback => callback(state.tx));
  state.tx.checklistTemplate.findUnique.mockResolvedValue({ id: "template-1", name: "Original", versions: [{ id: "v1", version: 1 }] });
  state.tx.checklistTemplate.create.mockResolvedValue({ id: "template-new" });
  state.tx.checklistTemplateVersion.create.mockImplementation(async ({ data }) => ({ id: "v2", ...data }));
  state.tx.checklistTemplateVersion.updateMany.mockResolvedValue({ count: 1 });
});
describe("administrator checklist revisions", () => {
  it("creates a new version, remaps conditional identities and retires previous availability without rewriting questions/responses", async () => {
    const result = await publishChecklist(admin, { templateId: "template-1", expectedVersion: 1, name: "Revised", questions: [
      { id: "q1", text: "Storage clean?", type: "YES_NO" },
      { id: "q2", text: "Details", type: "TEXT", condition: { questionId: "q1", equals: "NO" } },
    ] }, state.client as never);
    expect(result.version).toBe(2);
    const questions = state.tx.checklistTemplateVersion.create.mock.calls[0][0].data.questions.create;
    expect(questions[0].id).not.toBe("q1");
    expect(questions[1].condition.questionId).toBe(questions[0].id);
    expect(questions.every((q: { required: boolean }) => q.required === false)).toBe(true);
    expect(state.tx.checklistTemplateVersion.updateMany).toHaveBeenCalledWith({ where: { templateId: "template-1", status: "PUBLISHED", id: { not: "v2" } }, data: { status: "RETIRED" } });
  });
  it("allows an empty optional checklist", () => {
    expect(checklistEditSchema.parse({ name: "Products only", questions: [] }).questions).toEqual([]);
  });
  it("rejects stale edits before creating another version", async () => {
    await expect(publishChecklist(admin, { templateId: "template-1", expectedVersion: 2, name: "Revised", questions: [] }, state.client as never)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(state.tx.checklistTemplateVersion.create).not.toHaveBeenCalled();
  });
  it("removes availability instead of deleting historical versions or responses", async () => {
    await expect(archiveChecklist(admin, "template-1", state.client as never)).resolves.toEqual({ id: "template-1", retiredVersions: 1 });
    expect(state.tx.checklistTemplateVersion.updateMany).toHaveBeenCalledWith({ where: { templateId: "template-1", status: "PUBLISHED" }, data: { status: "RETIRED" } });
  });
  it("turns a concurrent serializable edit into a reloadable conflict", async () => {
    state.client.$transaction.mockRejectedValueOnce({ code: "P2034" });
    await expect(publishChecklist(admin, { name: "New", questions: [] }, state.client as never)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });
  it("denies supervisors publication and removal", async () => {
    const supervisor = { ...admin, role: "SUPERVISOR" as const };
    await expect(publishChecklist(supervisor, { name: "New", questions: [] }, state.client as never)).rejects.toMatchObject({ status: 403 });
    await expect(archiveChecklist(supervisor, "template-1", state.client as never)).rejects.toMatchObject({ status: 403 });
    expect(state.client.$transaction).not.toHaveBeenCalled();
  });
  it("rejects dangling or self-referential conditions and choices without options", () => {
    for (const q of [
      { id: "q1", text: "A", type: "TEXT", condition: { questionId: "deleted", equals: "YES" } },
      { id: "q1", text: "A", type: "TEXT", condition: { questionId: "q1", equals: "YES" } },
      { id: "q1", text: "A", type: "MULTIPLE_CHOICE", options: [] },
    ]) expect(checklistEditSchema.safeParse({ name: "New", questions: [q] }).success).toBe(false);
  });
});
