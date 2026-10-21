export type DatabaseDiagnostic = { code: string; message: string };

const categories: Array<[string[], DatabaseDiagnostic]> = [
  [["P1000", "1045", "ER_ACCESS_DENIED_ERROR", "AuthenticationFailed"], {
    code: "DATABASE_AUTHENTICATION_FAILED",
    message: "Check the database username and password in DATABASE_URL.",
  }],
  [["P1003", "1049", "ER_BAD_DB_ERROR", "DatabaseDoesNotExist"], {
    code: "DATABASE_NOT_FOUND",
    message: "Check that DATABASE_URL names an existing Hostinger database.",
  }],
  [["P2021", "P2022", "1146", "1054", "ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "TableDoesNotExist", "ColumnNotFound"], {
    code: "DATABASE_SCHEMA_NOT_READY",
    message: "Required tables or columns are missing. Apply the reviewed Prisma migrations to this database.",
  }],
  [["P1010", "1044", "1142", "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "DatabaseAccessDenied"], {
    code: "DATABASE_ACCESS_DENIED",
    message: "Check the database user's permissions for the configured database.",
  }],
  [["P1011", "TlsConnectionError", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN"], {
    code: "DATABASE_TLS_FAILED",
    message: "Check the database provider's TLS requirements and certificate configuration.",
  }],
  [["P1001", "P1002", "P1017", "P2024", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT", "ER_GET_CONNECTION_TIMEOUT", "45028", "DatabaseNotReachable", "ConnectionClosed", "TooManyConnections"], {
    code: "DATABASE_UNAVAILABLE",
    message: "Check the database hostname, port, network access and connection limits. Use the hostname provided by Hostinger.",
  }],
];

/** Only inspect structured codes. Never return driver messages, SQL, URLs or credentials. */
export function databaseDiagnostic(error: unknown): DatabaseDiagnostic | undefined {
  const tokens = new Set<string>();
  const visited = new Set<object>();
  function inspect(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return;
    visited.add(value);
    const item = value as Record<string, unknown>;
    for (const key of ["code", "errorCode", "errno", "originalCode", "kind"]) {
      if (typeof item[key] === "string" || typeof item[key] === "number") tokens.add(String(item[key]));
    }
    for (const key of ["cause", "meta", "driverAdapterError", "error"]) inspect(item[key], depth + 1);
  }
  inspect(error, 0);
  return categories.find(([codes]) => codes.some((code) => tokens.has(code)))?.[1];
}
