import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
  getInspection: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  readPrivateFile: vi.fn(),
  renderPdf: vi.fn(),
  storePrivateFile: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    inspectionReport: { findUnique: mock.findUnique, findMany: mock.findMany },
  },
}));
vi.mock("../src/lib/auth", () => ({
  requireUser: mock.requireUser,
  requireRole: mock.requireRole,
  audit: vi.fn(),
}));
vi.mock("../src/lib/inspection", () => ({ getInspection: mock.getInspection }));
vi.mock("../src/lib/evidence", () => ({
  readPrivateFile: mock.readPrivateFile,
  sha256: (bytes: Uint8Array) => Buffer.from(bytes).toString(),
  storePrivateFile: mock.storePrivateFile,
  deletePrivateFile: vi.fn(),
}));
vi.mock("../src/lib/reports", () => ({
  renderInspectionPdf: mock.renderPdf,
  renderInspectionWorkbook: vi.fn(),
}));
import { GET } from "../src/app/api/v1/reports/[inspectionId]/route";
import { ApiError } from "../src/lib/errors";
const context = { params: Promise.resolve({ inspectionId: "inspection-a" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mock.requireUser.mockResolvedValue({ id: "u", role: "SUPERVISOR" });
  mock.requireRole.mockImplementation(
    (user: { role: string }, roles: string[]) => {
      if (!roles.includes(user.role))
        throw new ApiError(403, "FORBIDDEN", "Not permitted.");
    },
  );
  mock.getInspection.mockResolvedValue({
    id: "inspection-a",
    reference: "DEMO-INS",
    companyId: "company-a",
    version: 4,
    status: "SUBMITTED",
  });
  mock.findUnique.mockResolvedValue({
    id: "report",
    reference: "report-ref",
    revision: 4,
    sha256: "authentic bytes",
    storedName: "reports/opaque.pdf",
  });
  mock.readPrivateFile.mockResolvedValue(Buffer.from("authentic bytes"));
});

describe("controlled inspection report downloads", () => {
  it("requires authentication before inspecting records", async () => {
    mock.requireUser.mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "Sign in."),
    );
    const response = await GET(
      new Request("https://hac.test/api/v1/reports/inspection-a"),
      context,
    );
    expect(response.status).toBe(401);
    expect(mock.getInspection).not.toHaveBeenCalled();
    expect(mock.readPrivateFile).not.toHaveBeenCalled();
  });
  it("denies company administrators internal report access before loading snapshots", async () => {
    mock.requireUser.mockResolvedValue({
      id: "company",
      role: "COMPANY_ADMIN",
      companyId: "company-a",
    });
    const response = await GET(
      new Request("https://hac.test/api/v1/reports/inspection-a"),
      context,
    );
    expect(response.status).toBe(403);
    expect(mock.getInspection).not.toHaveBeenCalled();
    expect(mock.readPrivateFile).not.toHaveBeenCalled();
  });
  it("enforces company/assignment access before reading private storage", async () => {
    mock.getInspection.mockRejectedValue(
      new ApiError(403, "COMPANY_ACCESS_DENIED", "Denied."),
    );
    const response = await GET(
      new Request("https://hac.test/api/v1/reports/inspection-a"),
      context,
    );
    expect(response.status).toBe(403);
    expect(mock.findUnique).not.toHaveBeenCalled();
    expect(mock.readPrivateFile).not.toHaveBeenCalled();
  });
  it("reuses an immutable artifact for the selected revision", async () => {
    const response = await GET(
      new Request("https://hac.test/api/v1/reports/inspection-a"),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("authentic bytes");
    expect(mock.findUnique).toHaveBeenCalledWith({
      where: {
        inspectionId_revision_format: {
          inspectionId: "inspection-a",
          revision: 4,
          format: "PDF",
        },
      },
    });
    expect(mock.renderPdf).not.toHaveBeenCalled();
    expect(mock.storePrivateFile).not.toHaveBeenCalled();
    expect(response.headers.get("x-report-sha256")).toBe("authentic bytes");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects a retained artifact whose integrity hash differs", async () => {
    mock.readPrivateFile.mockResolvedValue(Buffer.from("tampered bytes"));
    const response = await GET(
      new Request("https://hac.test/api/v1/reports/inspection-a"),
      context,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REPORT_INTEGRITY_FAILED");
    expect(mock.renderPdf).not.toHaveBeenCalled();
  });
  it("does not silently regenerate a missing signed report", async () => {
    mock.readPrivateFile.mockRejectedValue(new Error("ENOENT"));
    const response = await GET(
      new Request("https://hac.test/api/v1/reports/inspection-a"),
      context,
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("REPORT_UNAVAILABLE");
    expect(mock.renderPdf).not.toHaveBeenCalled();
  });
});
