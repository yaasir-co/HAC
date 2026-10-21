import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
const mock = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getInspection: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  deleteSignatures: vi.fn(),
  auditCreate: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        inspection: { updateMany: mock.updateMany },
        inspectionEvidence: { create: mock.create },
        inspectionSignature: { deleteMany: mock.deleteSignatures },
        auditLog: { create: mock.auditCreate },
      }),
  },
}));
vi.mock("../src/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/auth")>()),
  requireUser: mock.requireUser,
}));
vi.mock("../src/lib/inspection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/inspection")>()),
  getInspection: mock.getInspection,
}));
import { POST } from "../src/app/api/v1/evidence/route";
import { readPrivateFile, sha256 } from "../src/lib/evidence";
let temporary: string;
beforeEach(async () => {
  vi.clearAllMocks();
  temporary = await mkdtemp(path.join(os.tmpdir(), "hac-evidence-route-"));
  process.env.HAC_STORAGE_PATH = temporary;
  process.env.APP_ORIGIN = "https://hac.test";
  mock.requireUser.mockResolvedValue({
    id: "inspector",
    role: "SUPERVISOR",
    companyId: null,
  });
  mock.getInspection.mockResolvedValue({
    id: "inspection",
    companyId: "company",
    inspectorId: "inspector",
    version: 8,
    status: "IN_PROGRESS",
    observations: [{ id: "obs-same" }],
  });
  mock.updateMany.mockResolvedValue({ count: 1 });
  mock.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ev-1",
      ...data,
      createdAt: new Date(),
    }),
  );
  mock.deleteSignatures.mockResolvedValue({ count: 2 });
});
afterEach(async () => {
  delete process.env.HAC_STORAGE_PATH;
  delete process.env.APP_ORIGIN;
  await rm(temporary, { recursive: true, force: true });
});
async function request(observationId = "obs-same") {
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(image)], "packaging.png", { type: "image/png" }),
  );
  form.set("inspectionId", "inspection");
  form.set("observationId", observationId);
  return new Request("https://hac.test/api/v1/evidence", {
    method: "POST",
    headers: { origin: "https://hac.test" },
    body: form,
  });
}

describe("inspection evidence mutations", () => {
  it("rejects changes to a submitted inspection before storing an image", async () => {
    mock.getInspection.mockResolvedValue({
      id: "inspection",
      companyId: "company",
      inspectorId: "inspector",
      version: 8,
      status: "SUBMITTED",
      observations: [],
    });
    const response = await POST(await request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INSPECTION_LOCKED");
    expect(mock.create).not.toHaveBeenCalled();
    expect(await readdir(temporary)).toEqual([]);
  });
  it("rejects an observation from another inspection", async () => {
    const response = await POST(await request("foreign-observation"));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("OBSERVATION_MISMATCH");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("locks the expected version, stores verified bytes and invalidates signatures atomically", async () => {
    const response = await POST(await request());
    expect(response.status).toBe(201);
    const result = (await response.json()).data;
    expect(result.storedName).toBeUndefined();
    expect(result.url).toBe("/api/v1/evidence/ev-1");
    expect(mock.updateMany).toHaveBeenCalledWith({
      where: { id: "inspection", version: 8, status: "IN_PROGRESS" },
      data: { version: { increment: 1 } },
    });
    expect(mock.deleteSignatures).toHaveBeenCalledWith({
      where: { inspectionId: "inspection" },
    });
    const data = mock.create.mock.calls[0][0].data;
    expect(data.observationId).toBe("obs-same");
    expect(data.uploadedById).toBe("inspector");
    expect(sha256(await readPrivateFile(data.storedName))).toBe(result.sha256);
    expect(mock.auditCreate).toHaveBeenCalled();
  });
  it("removes its unused file when a concurrent submission wins the version lock", async () => {
    mock.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(await request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("VERSION_CONFLICT");
    expect(mock.create).not.toHaveBeenCalled();
    expect(await readdir(path.join(temporary, "evidence"))).toEqual([]);
    expect(mock.deleteSignatures).not.toHaveBeenCalled();
  });
});
