import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  session: { findUnique: vi.fn() },
  supervisorCompanyAssignment: { findFirst: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("../src/lib/db", () => ({ db: mock }));
import {
  accessibleCompanyIds,
  assertCompanyAccess,
  assertSameOrigin,
  audit,
  hashPassword,
  newSessionToken,
  readSessionToken,
  requireRole,
  requireUser,
  sessionCookie,
  tokenHash,
  verifyPassword,
  type AuthUser,
} from "../src/lib/auth";
import { ApiError, handleError } from "../src/lib/errors";

const supervisor: AuthUser = {
  id: "inspector",
  name: "Demo Inspector",
  email: "inspector@example.test",
  role: "SUPERVISOR",
  companyId: null,
};
const staff: AuthUser = {
  ...supervisor,
  role: "COMPANY_STAFF",
  companyId: "company-a",
};
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.APP_ORIGIN;
});

describe("password storage", () => {
  it("salts each password and verifies only the correct password", async () => {
    const password = "correct horse battery staple";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toEqual(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("wrong horse battery staple", first)).toBe(
      false,
    );
  });
  it("rejects weak new passwords and hostile encoded parameters", async () => {
    await expect(hashPassword("password")).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
    });
    expect(
      await verifyPassword(
        "password",
        "scrypt$999999999999$8$1$invalid$invalid",
      ),
    ).toBe(false);
    expect(await verifyPassword("password", "malformed")).toBe(false);
  });
});

describe("session protection", () => {
  it("creates random opaque tokens, hashes and HttpOnly strict cookies", () => {
    const token = newSessionToken();
    expect(token).toHaveLength(43);
    expect(token).not.toEqual(newSessionToken());
    expect(tokenHash(token)).toHaveLength(64);
    expect(tokenHash(token)).not.toContain(token);
    expect(sessionCookie(token)).toContain(
      "HttpOnly; SameSite=Strict; Path=/; Max-Age=28800",
    );
    expect(
      readSessionToken(
        new Request("https://hac.test", {
          headers: { cookie: `other=x; hac_session=${token}` },
        }),
      ),
    ).toBe(token);
    expect(
      readSessionToken(
        new Request("https://hac.test", {
          headers: { cookie: "hac_session=malformed" },
        }),
      ),
    ).toBeNull();
  });
  it("marks production cookies Secure and clears them with the same cookie policy", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie(newSessionToken())).toContain("; Secure");
    expect(sessionCookie("", 0)).toContain("Max-Age=0; Secure");
    vi.unstubAllEnvs();
  });
  it("rejects absent, expired and disabled-user sessions", async () => {
    await expect(
      requireUser(new Request("https://hac.test")),
    ).rejects.toMatchObject({ status: 401 });
    const token = newSessionToken();
    const request = new Request("https://hac.test", {
      headers: { cookie: `hac_session=${token}` },
    });
    mock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(0),
      user: { ...supervisor, isActive: true },
    });
    await expect(requireUser(request)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    mock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...supervisor, isActive: false },
    });
    await expect(requireUser(request)).rejects.toMatchObject({ status: 401 });
    mock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...supervisor, isActive: true },
    });
    expect(await requireUser(request)).toEqual(supervisor);
    expect(mock.session.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { tokenHash: tokenHash(token) } }),
    );
  });
});

describe("CSRF and server-side company permissions", () => {
  it("allows same-origin writes and rejects missing or foreign origins", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://hac.test/api", {
          method: "POST",
          headers: { origin: "https://hac.test" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(new Request("https://hac.test/api", { method: "POST" })),
    ).toThrow(ApiError);
    expect(() =>
      assertSameOrigin(
        new Request("https://hac.test/api", {
          method: "POST",
          headers: { origin: "https://attacker.test" },
        }),
      ),
    ).toThrow(ApiError);
    expect(() =>
      assertSameOrigin(new Request("https://hac.test/api")),
    ).not.toThrow();
  });
  it("respects configured deployment origin behind a proxy", () => {
    process.env.APP_ORIGIN = "https://certification.example";
    expect(() =>
      assertSameOrigin(
        new Request("http://internal:3000/api", {
          method: "POST",
          headers: { origin: "https://certification.example" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://internal:3000/api", {
          method: "POST",
          headers: { origin: "http://internal:3000" },
        }),
      ),
    ).toThrow(ApiError);
  });
  it("denies a company user access to another company", async () => {
    await expect(
      assertCompanyAccess(staff, "company-a"),
    ).resolves.toBeUndefined();
    await expect(assertCompanyAccess(staff, "company-b")).rejects.toMatchObject(
      { status: 403 },
    );
    expect(await accessibleCompanyIds(staff)).toEqual(["company-a"]);
  });
  it("requires active supervisor assignments for object and collection access", async () => {
    mock.supervisorCompanyAssignment.findFirst.mockResolvedValue(null);
    await expect(
      assertCompanyAccess(supervisor, "company-b"),
    ).rejects.toMatchObject({ code: "COMPANY_ACCESS_DENIED" });
    mock.supervisorCompanyAssignment.findFirst.mockResolvedValue({
      companyId: "company-a",
    });
    await expect(
      assertCompanyAccess(supervisor, "company-a"),
    ).resolves.toBeUndefined();
    expect(mock.supervisorCompanyAssignment.findFirst).toHaveBeenLastCalledWith(
      {
        where: {
          userId: supervisor.id,
          companyId: "company-a",
          isActive: true,
          revokedAt: null,
        },
      },
    );
    mock.supervisorCompanyAssignment.findMany.mockResolvedValue([
      { companyId: "company-a" },
    ]);
    expect(await accessibleCompanyIds(supervisor)).toEqual(["company-a"]);
    expect(
      await accessibleCompanyIds({ ...supervisor, role: "HAC_ADMIN" }),
    ).toBeNull();
  });
  it("does not give supervisors administrator decision permissions", () => {
    expect(() => requireRole(supervisor, ["HAC_ADMIN", "SUPER_ADMIN"])).toThrow(
      ApiError,
    );
    expect(() =>
      requireRole({ ...supervisor, role: "HAC_ADMIN" }, ["HAC_ADMIN"]),
    ).not.toThrow();
  });
});

describe("safe audit and error handling", () => {
  it("redacts credential fields from audit snapshots", async () => {
    await audit(
      mock as never,
      supervisor,
      "UPDATE",
      "User",
      "user-id",
      { passwordHash: "sensitive" },
      { name: "Changed", nested: { accessToken: "sensitive" } },
    );
    const entry = mock.auditLog.create.mock.calls[0][0].data;
    expect(entry.before.passwordHash).toBe("[REDACTED]");
    expect(entry.after.nested.accessToken).toBe("[REDACTED]");
    expect(entry.after.name).toBe("Changed");
  });
  it("returns stable conflicts without internal constraint or credential details", async () => {
    const response = handleError({
      code: "P2002",
      message: "sensitive-constraint-name",
    });
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive");
    expect(handleError(new ApiError(403, "FORBIDDEN", "Denied")).status).toBe(
      403,
    );
  });
});
