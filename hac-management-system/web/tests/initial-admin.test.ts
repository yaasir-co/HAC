import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("../src/lib/db", () => ({ db: {} }));
import { hashPassword, verifyPassword } from "../src/lib/auth";
import {
  createInitialAdmin,
  readInitialAdminEnvironment,
  runInitialAdminCommand,
} from "../scripts/lib/initial-admin";

const secret = "a private initial administrator password";
const validEnvironment = {
  DATABASE_URL: "mysql://app:private-database-password@db.example.test:3306/hac",
  HAC_ADMIN_EMAIL: " Owner@Example.test ",
  HAC_ADMIN_PASSWORD: secret,
};
const tx = {
  user: { count: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
};
const transaction = vi.fn();
const disconnect = vi.fn();
const database = {
  $transaction: transaction,
  $disconnect: disconnect,
} as unknown as Pick<PrismaClient, "$transaction" | "$disconnect">;

beforeEach(() => {
  vi.clearAllMocks();
  tx.user.count.mockResolvedValue(0);
  tx.user.create.mockResolvedValue({ id: "initial-admin" });
  tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  disconnect.mockResolvedValue(undefined);
  transaction.mockImplementation(async (callback) => callback(tx));
});

describe("private initial-administrator provisioning", () => {
  it("normalizes the email and uses only a display-name default", () => {
    expect(readInitialAdminEnvironment(validEnvironment)).toEqual({
      email: "owner@example.test",
      password: secret,
      name: "HAC Administrator",
    });
    expect(
      readInitialAdminEnvironment({
        ...validEnvironment,
        HAC_ADMIN_NAME: "  HAC Owner  ",
      }).name,
    ).toBe("HAC Owner");
  });

  it.each([
    ["DATABASE_URL", undefined, "INVALID_DATABASE_URL"],
    ["DATABASE_URL", "not-a-url", "INVALID_DATABASE_URL"],
    ["DATABASE_URL", "https://db.example.test/hac", "INVALID_DATABASE_URL"],
    ["DATABASE_URL", "mysql://app@db.example.test/hac", "INVALID_DATABASE_URL"],
    ["DATABASE_URL", "mysql://app:secret@db.example.test/", "INVALID_DATABASE_URL"],
    ["DATABASE_URL", "mysql://app:%invalid@db.example.test/hac", "INVALID_DATABASE_URL"],
    ["HAC_ADMIN_EMAIL", undefined, "INVALID_EMAIL"],
    ["HAC_ADMIN_EMAIL", "invalid", "INVALID_EMAIL"],
    ["HAC_ADMIN_PASSWORD", undefined, "INVALID_PASSWORD"],
    ["HAC_ADMIN_PASSWORD", "too-short", "INVALID_PASSWORD"],
    ["HAC_ADMIN_PASSWORD", "a".repeat(1025), "INVALID_PASSWORD"],
    ["HAC_ADMIN_NAME", " ", "INVALID_NAME"],
    ["HAC_ADMIN_NAME", "a".repeat(121), "INVALID_NAME"],
  ])("rejects invalid %s before loading the database", async (key, value, code) => {
    const env = { ...validEnvironment, [key as string]: value };
    expect(() => readInitialAdminEnvironment(env)).toThrow(
      expect.objectContaining({ code }),
    );
    const load = vi.fn();
    const output = { log: vi.fn(), error: vi.fn() };
    expect(await runInitialAdminCommand(env, { load, ...output })).toBe(1);
    expect(load).not.toHaveBeenCalled();
    expect(output.log).not.toHaveBeenCalled();
    expect(JSON.stringify(output.error.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(output.error.mock.calls)).not.toContain(
      validEnvironment.DATABASE_URL,
    );
  });

  it("atomically creates an active independent HAC administrator with the real password hash and safe audit", async () => {
    await createInitialAdmin(
      database,
      readInitialAdminEnvironment(validEnvironment),
      hashPassword,
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 30000,
    });
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).toEqual({
      email: "owner@example.test",
      name: "HAC Administrator",
      role: "HAC_ADMIN",
      companyId: null,
      isActive: true,
      passwordHash: expect.stringMatching(/^scrypt\$/),
    });
    expect(data.passwordHash).not.toContain(secret);
    expect(await verifyPassword(secret, data.passwordHash)).toBe(true);
    expect(await verifyPassword("another password", data.passwordHash)).toBe(false);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "initial-admin",
        action: "INITIAL_ADMIN_CREATED",
        entityType: "User",
        entityId: "initial-admin",
        companyId: null,
        after: { role: "HAC_ADMIN", isActive: true },
      },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      data.passwordHash,
    );
  });

  it("refuses any existing user without creating accounts or changing credentials", async () => {
    tx.user.count.mockResolvedValue(1);
    const hasher = vi.fn();
    await expect(
      createInitialAdmin(
        database,
        readInitialAdminEnvironment(validEnvironment),
        hasher,
      ),
    ).rejects.toMatchObject({ code: "EXISTING_USERS" });
    expect(hasher).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("disconnects after success and refuses a repeated invocation without exposing credentials", async () => {
    tx.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const output = { log: vi.fn(), error: vi.fn() };
    const load = async () => ({ database, hashPassword });
    expect(
      await runInitialAdminCommand(validEnvironment, { load, ...output }),
    ).toBe(0);
    expect(
      await runInitialAdminCommand(validEnvironment, { load, ...output }),
    ).toBe(1);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(output.error.mock.calls[0][0]).toContain("already contains a user");
    const text = JSON.stringify([output.log.mock.calls, output.error.mock.calls]);
    expect(text).not.toContain(secret);
    expect(text).not.toContain("private-database-password");
    expect(text).not.toContain("owner@example.test");
    expect(text).not.toContain("scrypt$");
  });

  it("disconnects and hides raw driver details after a database failure", async () => {
    transaction.mockRejectedValue(
      new Error(`Access denied: ${validEnvironment.DATABASE_URL}; ${secret}`),
    );
    const output = { log: vi.fn(), error: vi.fn() };
    expect(
      await runInitialAdminCommand(validEnvironment, {
        load: async () => ({ database, hashPassword }),
        ...output,
      }),
    ).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(output.log).not.toHaveBeenCalled();
    const text = JSON.stringify(output.error.mock.calls);
    expect(text).toContain("Check the private database configuration");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(validEnvironment.DATABASE_URL);
  });

  it("returns failure safely if database initialization itself fails", async () => {
    const output = { log: vi.fn(), error: vi.fn() };
    expect(
      await runInitialAdminCommand(validEnvironment, {
        load: async () => {
          throw new Error(validEnvironment.DATABASE_URL);
        },
        ...output,
      }),
    ).toBe(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(JSON.stringify(output.error.mock.calls)).not.toContain(
      validEnvironment.DATABASE_URL,
    );
  });

  it("reports a known schema failure without exposing the database's raw error", async () => {
    transaction.mockRejectedValue({
      code: "P2021",
      message: `Private table: ${validEnvironment.DATABASE_URL}; ${secret}`,
    });
    const output = { log: vi.fn(), error: vi.fn() };
    expect(
      await runInitialAdminCommand(validEnvironment, {
        load: async () => ({ database, hashPassword }),
        ...output,
      }),
    ).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
    const text = JSON.stringify(output.error.mock.calls);
    expect(text).toContain("DATABASE_SCHEMA_NOT_READY");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(validEnvironment.DATABASE_URL);
  });

  it("does not silently succeed if closing the connection fails", async () => {
    disconnect.mockRejectedValue(new Error(validEnvironment.DATABASE_URL));
    const output = { log: vi.fn(), error: vi.fn() };
    expect(
      await runInitialAdminCommand(validEnvironment, {
        load: async () => ({ database, hashPassword }),
        ...output,
      }),
    ).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(output.error.mock.calls[0][0]).toContain("could not be closed cleanly");
    expect(JSON.stringify(output.error.mock.calls)).not.toContain(
      validEnvironment.DATABASE_URL,
    );
  });
});
