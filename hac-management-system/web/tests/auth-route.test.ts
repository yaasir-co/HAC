import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
  loginRateLimit: { upsert: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ db: mock }));
import { GET, POST } from "../src/app/api/v1/auth/[...path]/route";
import { hashPassword, newSessionToken, tokenHash } from "../src/lib/auth";
let passwordHash: string;
const password = "example secure test password";
const user = {
  id: "admin-1",
  email: "admin@example.test",
  name: "Test Administrator",
  role: "HAC_ADMIN",
  companyId: null,
  isActive: true,
};
const request = (action: string, body: object, origin = "https://hac.test") =>
  new Request(`https://hac.test/api/v1/auth/${action}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const context = (action: string) => ({
  params: Promise.resolve({ path: [action] }),
});
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.APP_ORIGIN;
  mock.loginRateLimit.upsert.mockResolvedValue({ count: 1 });
  mock.user.findUnique.mockResolvedValue({ ...user, passwordHash });
  mock.$transaction.mockImplementation(
    async (callback: (tx: typeof mock) => Promise<unknown>) => callback(mock),
  );
});

describe("authentication REST API", () => {
  it("logs in using the saved password and stores only the session token hash", async () => {
    const response = await POST(
      request("login", { email: user.email, password }),
      context("login"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: userFields() });
    const cookie = response.headers.get("set-cookie")!;
    const token = cookie.match(/hac_session=([^;]+)/)![1];
    expect(cookie).toContain("HttpOnly");
    expect(mock.session.create).toHaveBeenCalledWith({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        expiresAt: expect.any(Date),
      },
    });
    expect(mock.auditLog.create.mock.calls[0][0].data.action).toBe("LOGIN");
    expect(JSON.stringify(mock.auditLog.create.mock.calls)).not.toContain(
      passwordHash,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("handles a concurrently created MySQL rate bucket without rejecting a valid login", async () => {
    mock.loginRateLimit.upsert.mockRejectedValueOnce({ code: "P2002" });
    mock.loginRateLimit.update.mockResolvedValueOnce({ count: 2 });
    const response = await POST(
      request("login", { email: user.email, password }),
      context("login"),
    );
    expect(response.status).toBe(200);
    expect(mock.loginRateLimit.update).toHaveBeenLastCalledWith({
      where: { keyHash: expect.any(String) },
      data: { count: 0 },
    });
  });
  it("preserves the failed-attempt limit when a bucket creation races", async () => {
    mock.loginRateLimit.upsert.mockRejectedValueOnce({ code: "P2002" });
    mock.loginRateLimit.update.mockResolvedValueOnce({ count: 9 });
    const response = await POST(
      request("login", { email: user.email, password }),
      context("login"),
    );
    expect(response.status).toBe(429);
    expect(mock.user.findUnique).not.toHaveBeenCalled();
  });
  it("gives the same generic credential failure for unknown and incorrect passwords", async () => {
    mock.user.findUnique.mockResolvedValue(null);
    const unknown = await POST(
      request("login", { email: "unknown@example.test", password }),
      context("login"),
    );
    mock.user.findUnique.mockResolvedValue({ ...user, passwordHash });
    const incorrect = await POST(
      request("login", { email: user.email, password: "incorrect password" }),
      context("login"),
    );
    expect(unknown.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(await unknown.json()).toEqual(await incorrect.json());
    expect(mock.session.create).not.toHaveBeenCalled();
  });
  it("blocks account attempts exceeding the persisted rate limit before password work", async () => {
    mock.loginRateLimit.upsert.mockResolvedValue({ count: 9 });
    const response = await POST(
      request("login", { email: user.email, password }),
      context("login"),
    );
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("LOGIN_RATE_LIMITED");
    expect(mock.user.findUnique).not.toHaveBeenCalled();
  });
  it("rejects cross-origin login before reading credentials or touching the database", async () => {
    const response = await POST(
      request(
        "login",
        { email: user.email, password },
        "https://attacker.test",
      ),
      context("login"),
    );
    expect(response.status).toBe(403);
    expect(mock.loginRateLimit.upsert).not.toHaveBeenCalled();
  });
  it("returns only safe session-user fields and revokes the current session on logout", async () => {
    const token = newSessionToken();
    mock.session.findUnique.mockResolvedValue({
      user,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const me = await GET(
      new Request("https://hac.test/api/v1/auth/me", {
        headers: { cookie: `hac_session=${token}` },
      }),
      context("me"),
    );
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ data: userFields() });
    const logout = await POST(
      new Request("https://hac.test/api/v1/auth/logout", {
        method: "POST",
        headers: { origin: "https://hac.test", cookie: `hac_session=${token}` },
      }),
      context("logout"),
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mock.session.deleteMany).toHaveBeenLastCalledWith({
      where: { tokenHash: tokenHash(token), userId: user.id },
    });
  });
});
function userFields() {
  const { isActive: _isActive, ...safe } = user;
  return safe;
}
