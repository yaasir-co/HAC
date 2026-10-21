import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), get: vi.fn(), provision: vi.fn(), update: vi.fn() }));
vi.mock("../src/lib/db", () => ({ db: {} }));
vi.mock("../src/lib/auth", async (original) => ({
  ...await original<typeof import("../src/lib/auth")>(), requireUser: mock.user,
}));
vi.mock("../src/lib/workspace-setup", () => ({
  getWorkspaceSetup: mock.get, provisionWorkspace: mock.provision, updateWorkspaceRecord: mock.update,
}));
import { GET, POST, PATCH } from "../src/app/api/v1/workspace-setup/route";
import { ApiError } from "../src/lib/errors";
const admin = { id: "admin", name: "Administrator", email: "admin@example.test", role: "HAC_ADMIN", companyId: null };
const request = (method: string, origin = "https://hac.test") => new Request("https://hac.test/api/v1/workspace-setup", {
  method, headers: { origin, "content-type": "application/json" },
  ...(method === "GET" ? {} : { body: JSON.stringify({ supervisors: [] }) }),
});
beforeEach(() => {
  vi.clearAllMocks(); delete process.env.APP_ORIGIN;
  mock.user.mockResolvedValue(admin);
  mock.get.mockResolvedValue({ companies: [], supervisors: [], materials: [] });
  mock.provision.mockResolvedValue({ credentials: [{ email: "new@example.test", password: "Hac-synthetic-private-password" }] });
  mock.update.mockResolvedValue({ id: "record" });
});

describe("private workspace administration endpoint", () => {
  it.each(["SUPERVISOR", "AUDITOR", "COMPANY_ADMIN", "COMPANY_STAFF"])("blocks %s before reading or mutating workspace data", async (role) => {
    mock.user.mockResolvedValue({ ...admin, role });
    expect((await GET(request("GET"))).status).toBe(403);
    expect((await POST(request("POST"))).status).toBe(403);
    expect((await PATCH(request("PATCH"))).status).toBe(403);
    expect(mock.get).not.toHaveBeenCalled(); expect(mock.provision).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated access", async () => {
    mock.user.mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "Please sign in."));
    expect((await GET(request("GET"))).status).toBe(401);
    expect(mock.get).not.toHaveBeenCalled();
  });
  it("rejects cross-origin setup and edits before any provisioning", async () => {
    expect((await POST(request("POST", "https://other.test"))).status).toBe(403);
    expect((await PATCH(request("PATCH", "https://other.test"))).status).toBe(403);
    expect(mock.provision).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
  });
  it("marks one-time credential responses private and noncacheable and excludes credentials from preview", async () => {
    const created = await POST(request("POST"));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("private, no-store");
    expect(created.headers.get("pragma")).toBe("no-cache");
    expect((await created.json()).data.credentials[0].password).toBe("Hac-synthetic-private-password");
    const preview = await GET(request("GET"));
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await preview.json())).not.toContain("synthetic-private-password");
  });
});
