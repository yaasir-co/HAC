import { describe, expect, it, vi } from "vitest";
import { databaseDiagnostic } from "../src/lib/database-diagnostics";
import { handleError } from "../src/lib/errors";

describe("private database diagnostics", () => {
  it.each([
    [{ code: "P1000" }, "DATABASE_AUTHENTICATION_FAILED"],
    [{ code: "P2021" }, "DATABASE_SCHEMA_NOT_READY"],
    [{ code: "P2022" }, "DATABASE_SCHEMA_NOT_READY"],
    [{ code: "ECONNREFUSED" }, "DATABASE_UNAVAILABLE"],
    [{ errorCode: "P1003" }, "DATABASE_NOT_FOUND"],
    [{ errno: 1142 }, "DATABASE_ACCESS_DENIED"],
    [
      { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } },
      "DATABASE_TLS_FAILED",
    ],
    [
      {
        meta: {
          driverAdapterError: {
            cause: { kind: "AuthenticationFailed", originalMessage: "private" },
          },
        },
      },
      "DATABASE_AUTHENTICATION_FAILED",
    ],
    [
      { code: "ER_GET_CONNECTION_TIMEOUT", cause: { errno: 1045 } },
      "DATABASE_AUTHENTICATION_FAILED",
    ],
  ])(
    "classifies structured failures without copying driver details",
    (error, code) => {
      const diagnostic = databaseDiagnostic(error);
      expect(diagnostic?.code).toBe(code);
      expect(JSON.stringify(diagnostic)).not.toContain("private");
    },
  );

  it("ignores error messages, arbitrary metadata and cyclic causes", () => {
    const error = {
      code: "CUSTOM_SECRET_VALUE",
      message: "P1000 private-password",
      cause: {},
    };
    error.cause = error;
    expect(databaseDiagnostic(error)).toBeUndefined();
    expect(databaseDiagnostic(null)).toBeUndefined();
  });

  it("keeps the public response generic and logs only safe database categories", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = Object.assign(
        new Error(
          "mysql://private-user:private-password@private-host/private-db",
        ),
        {
          code: "P2021",
          meta: {
            table: "private-table",
            driverAdapterError: {
              cause: { originalMessage: "private-password" },
            },
          },
        },
      );
      const response = handleError(error);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe("DATABASE_SCHEMA_NOT_READY");
      expect(JSON.stringify(body)).not.toContain("private");
      expect(log).toHaveBeenCalledWith("[api] Request failed", {
        code: "P2021",
        name: "Error",
        database: "DATABASE_SCHEMA_NOT_READY",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    } finally {
      log.mockRestore();
    }
  });
});

it("logs P2039 driver codes without exposing a driver message or query", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const error = Object.assign(new Error("private query"), {
      code: "P2039",
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: "1064",
            originalMessage: "private-password SELECT secret",
          },
        },
      },
    });
    const response = handleError(error);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DATABASE_QUERY_FAILED");
    expect(JSON.stringify(spy.mock.calls)).toContain("1064");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("private");
  } finally {
    spy.mockRestore();
  }
});
