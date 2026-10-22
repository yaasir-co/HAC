import { beforeEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  assertInspector: vi.fn(),
  assertDraft: vi.fn(),
  lock: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  item: vi.fn(),
  finding: vi.fn(),
  evidence: vi.fn(),
  signature: vi.fn(),
  investigation: vi.fn(),
  nonConformity: vi.fn(),
  prediction: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ db: { $transaction: mock.transaction } }));
vi.mock("../src/lib/auth", () => ({ audit: mock.audit }));
vi.mock("../src/lib/inspection", () => ({
  getInspection: mock.get,
  assertInspector: mock.assertInspector,
  assertDraft: mock.assertDraft,
  lockDraft: mock.lock,
}));
import { removeInspectionItem } from "../src/lib/remove-inspection-item";
import { ApiError } from "../src/lib/errors";
const user = {
  id: "s",
  name: "Supervisor",
  role: "SUPERVISOR" as const,
  email: "s@example.test",
  companyId: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.get.mockResolvedValue({
    id: "visit",
    version: 3,
    companyId: "company",
    observations: [
      {
        id: "item",
        productId: "p",
        recognitionPredictionId: "prediction",
        evidence: [{ storedName: "evidence/retained.png" }],
      },
    ],
  });
  mock.transaction.mockImplementation(async (fn: any) =>
    fn({
      observation: { delete: mock.item },
      inspectionFinding: { deleteMany: mock.finding },
      inspectionEvidence: { deleteMany: mock.evidence },
      inspectionSignature: { deleteMany: mock.signature },
      investigation: { updateMany: mock.investigation },
      nonConformity: { updateMany: mock.nonConformity },
      recognitionPrediction: { updateMany: mock.prediction },
    }),
  );
});
it("removes only a draft item, clears signatures and keeps formal cases and file bytes for audit", async () => {
  const result = await removeInspectionItem(user, "visit", {
    observationId: "item",
    version: 3,
  });
  expect(result.version).toBe(4);
  expect(mock.lock).toHaveBeenCalled();
  expect(mock.item).toHaveBeenCalledWith({ where: { id: "item" } });
  expect(mock.signature).toHaveBeenCalledWith({
    where: { inspectionId: "visit" },
  });
  expect(mock.investigation).toHaveBeenCalledWith({
    where: { observationId: "item" },
    data: { observationId: null },
  });
  expect(mock.audit).toHaveBeenCalled();
});
it("rejects stale versions without modifying a record", async () => {
  await expect(
    removeInspectionItem(user, "visit", { observationId: "item", version: 2 }),
  ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(mock.transaction).not.toHaveBeenCalled();
});
it("rejects a submitted inspection and cross-inspection item identifiers", async () => {
  await expect(
    removeInspectionItem(user, "visit", {
      observationId: "elsewhere",
      version: 3,
    }),
  ).rejects.toMatchObject({ code: "OBSERVATION_NOT_FOUND" });
  mock.assertDraft.mockImplementationOnce(() => {
    throw new ApiError(409, "INSPECTION_LOCKED", "Submitted");
  });
  await expect(
    removeInspectionItem(user, "visit", { observationId: "item", version: 3 }),
  ).rejects.toMatchObject({ code: "INSPECTION_LOCKED" });
  expect(mock.transaction).not.toHaveBeenCalled();
});
