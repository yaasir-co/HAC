import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { HostedMigrationFailure, runHostedSetup } from "../scripts/lib/hosted-setup";

const password = "private one-time hosted administrator password";
const databaseUrl = "mysql://app:private-database-password@db.example.test:3306/hac";
const env = {
  HAC_HOSTED_SETUP: "true",
  DATABASE_URL: databaseUrl,
  HAC_ADMIN_EMAIL: "owner@example.test",
  HAC_ADMIN_PASSWORD: password,
};
const tx = {
  user: { count: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
};
const mock = {
  user: { count: vi.fn(), findFirst: vi.fn() },
  loginRateLimit: { findFirst: vi.fn() },
  session: { findFirst: vi.fn() },
  auditLog: { findFirst: vi.fn() },
  $transaction: vi.fn(),
  $disconnect: vi.fn(),
};
const database = mock as unknown as Pick<
  PrismaClient,
  "user" | "session" | "loginRateLimit" | "auditLog" | "$transaction" | "$disconnect"
>;
const migrate = vi.fn();
const hashPassword = vi.fn();
const load = vi.fn();
const log = vi.fn();
const error = vi.fn();
const dependencies = { migrate, load, log, error };

beforeEach(() => {
  vi.clearAllMocks();
  migrate.mockResolvedValue(undefined);
  load.mockResolvedValue({ database, hashPassword });
  mock.user.count.mockResolvedValue(0);
  mock.$transaction.mockImplementation(async (callback) => callback(tx));
  mock.$disconnect.mockResolvedValue(undefined);
  tx.user.count.mockResolvedValue(0);
  tx.user.create.mockResolvedValue({ id: "initial-admin" });
  tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  hashPassword.mockResolvedValue("a-private-password-hash");
});

describe("explicit hosted setup during a normal build", () => {
  it.each([undefined, "false", " FALSE "])(
    "does no database work when HAC_HOSTED_SETUP is %s, even without database settings",
    async (flag) => {
      expect(await runHostedSetup({ HAC_HOSTED_SETUP: flag }, dependencies)).toBe(0);
      expect(migrate).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(mock.$transaction).not.toHaveBeenCalled();
      expect(mock.$disconnect).not.toHaveBeenCalled();
    },
  );

  it.each(["", "yes", "1", "private-invalid-value"])(
    "rejects an ambiguous flag before any database operation",
    async (flag) => {
      expect(await runHostedSetup({ ...env, HAC_HOSTED_SETUP: flag }, dependencies)).toBe(1);
      expect(migrate).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(JSON.stringify(error.mock.calls)).not.toContain(flag === "" ? databaseUrl : flag);
    },
  );

  it.each([undefined, "invalid", "https://db.example.test/hac", "mysql://app:secret@db.example.test/", "mysql://app@db.example.test/hac", "mysql://app:%invalid@db.example.test/hac"])(
    "validates the intended database URL before invoking Prisma",
    async (url) => {
      expect(await runHostedSetup({ ...env, DATABASE_URL: url }, dependencies)).toBe(1);
      expect(migrate).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(JSON.stringify(error.mock.calls)).not.toContain(password);
    },
  );

  it("stops before queries or account creation when migrations fail and hides raw errors", async () => {
    migrate.mockRejectedValue(new Error(`${databaseUrl}; ${password}`));
    expect(await runHostedSetup(env, dependencies)).toBe(1);
    expect(load).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mock.$transaction).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain(databaseUrl);
    expect(JSON.stringify(error.mock.calls)).not.toContain(password);
  });

  it("migrates, checks authentication tables and atomically creates only the first administrator", async () => {
    expect(await runHostedSetup({ ...env, HAC_HOSTED_SETUP: " TRUE " }, dependencies)).toBe(0);
    expect(migrate.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
    expect(mock.user.findFirst).toHaveBeenCalledWith({ select: { id: true } });
    expect(mock.loginRateLimit.findFirst).toHaveBeenCalledWith({ select: { keyHash: true } });
    expect(mock.session.findFirst).toHaveBeenCalledWith({ select: { id: true } });
    expect(mock.auditLog.findFirst).toHaveBeenCalledWith({ select: { id: true } });
    expect(hashPassword).toHaveBeenCalledWith(password);
    expect(mock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 30000,
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: "owner@example.test",
        name: "HAC Administrator",
        passwordHash: "a-private-password-hash",
        role: "HAC_ADMIN",
        companyId: null,
        isActive: true,
      },
      select: { id: true },
    });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe("INITIAL_ADMIN_CREATED");
    expect(mock.$disconnect).toHaveBeenCalledOnce();
    const output = JSON.stringify([log.mock.calls, error.mock.calls, tx.auditLog.create.mock.calls]);
    expect(output).not.toContain(password);
    expect(output).not.toContain("a-private-password-hash");
    expect(output).not.toContain(databaseUrl);
  });

  it("preserves any existing user and ignores missing or changed administrator settings", async () => {
    mock.user.count.mockResolvedValue(1);
    expect(await runHostedSetup({ ...env, HAC_ADMIN_EMAIL: undefined, HAC_ADMIN_PASSWORD: "bad" }, dependencies)).toBe(0);
    expect(migrate).toHaveBeenCalledOnce();
    expect(mock.$transaction).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(log.mock.calls.at(-1)?.[0]).toContain("Existing user accounts and passwords were preserved");
    expect(mock.$disconnect).toHaveBeenCalledOnce();
  });

  it("allows repeated opted-in builds without resetting or recreating accounts", async () => {
    mock.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect(await runHostedSetup(env, dependencies)).toBe(0);
    expect(await runHostedSetup({ HAC_HOSTED_SETUP: "true", DATABASE_URL: databaseUrl }, dependencies)).toBe(0);
    expect(migrate).toHaveBeenCalledTimes(2);
    expect(tx.user.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(mock.$disconnect).toHaveBeenCalledTimes(2);
  });

  it("requires private administrator settings only for an empty user table", async () => {
    expect(await runHostedSetup({ ...env, HAC_ADMIN_PASSWORD: undefined }, dependencies)).toBe(1);
    expect(migrate).toHaveBeenCalledOnce();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(mock.$disconnect).toHaveBeenCalledOnce();
    expect(JSON.stringify(error.mock.calls)).toContain("HAC_ADMIN_PASSWORD");
  });

  it("handles a concurrently created first user without changing it", async () => {
    tx.user.count.mockResolvedValue(1);
    expect(await runHostedSetup(env, dependencies)).toBe(0);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(log.mock.calls.at(-1)?.[0]).toContain("creation was skipped");
  });

  it("stops with safe database diagnostics if schema checks fail after migration", async () => {
    mock.loginRateLimit.findFirst.mockRejectedValueOnce({
      code: "P2021",
      message: `${databaseUrl}; ${password}`,
    });
    expect(await runHostedSetup(env, dependencies)).toBe(1);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(mock.$disconnect).toHaveBeenCalledOnce();
    const output = JSON.stringify(error.mock.calls);
    expect(output).toContain("DATABASE_SCHEMA_NOT_READY");
    expect(output).not.toContain(password);
    expect(output).not.toContain(databaseUrl);
  });

  it("prints only a validated Prisma code for a failed migration", async () => {
    migrate.mockRejectedValue(new HostedMigrationFailure("P3009"));
    expect(await runHostedSetup(env, dependencies)).toBe(1);
    expect(JSON.stringify(error.mock.calls)).toContain("P3009");
    expect(load).not.toHaveBeenCalled();
    expect(new HostedMigrationFailure(databaseUrl).code).toBeUndefined();
  });
});
