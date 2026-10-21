import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import type { Prisma } from "@prisma/client";

export const ROLES = [
  "SUPER_ADMIN",
  "HAC_ADMIN",
  "SUPERVISOR",
  "AUDITOR",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
] as const;
export type Role = (typeof ROLES)[number];
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
};
export const SESSION_COOKIE = "hac_session";
export const SESSION_SECONDS = 60 * 60 * 8;
const COST = 32768;

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024)
    throw new ApiError(
      400,
      "WEAK_PASSWORD",
      "Passwords must contain 12 to 1024 characters.",
    );
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt);
  return `scrypt$${COST}$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (
    password.length > 1024 ||
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== String(COST) ||
    parts[2] !== "8" ||
    parts[3] !== "1"
  )
    return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await derivePassword(password, salt);
  return timingSafeEqual(actual, expected);
}

export function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const entry of cookie.split(";")) {
    const [name, ...value] = entry.trim().split("=");
    if (name === SESSION_COOKIE)
      return /^[A-Za-z0-9_-]{43}$/.test(value.join("="))
        ? value.join("=")
        : null;
  }
  return null;
}

export function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  let expected: string;
  try {
    const configured = new URL(process.env.APP_ORIGIN || request.url);
    if (
      !["http:", "https:"].includes(configured.protocol) ||
      configured.username ||
      configured.password
    ) {
      throw new Error("Invalid application origin");
    }
    expected = configured.origin;
  } catch {
    // Do not log the value: a misconfigured field might contain a credential.
    console.error(
      "[auth] Invalid APP_ORIGIN. Set the full http(s) website address in the server environment.",
    );
    throw new ApiError(
      503,
      "AUTH_CONFIGURATION_ERROR",
      "Sign-in is temporarily unavailable. Please contact the site administrator.",
    );
  }
  // Cookie-authenticated API clients, including Flutter, must send the configured Origin.
  if (!origin || origin === "null" || origin !== expected)
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "This action must originate from the application.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "Cross-site actions are not allowed.",
    );
}

export async function requireUser(request: Request): Promise<AuthUser> {
  const token = readSessionToken(request);
  if (!token)
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          companyId: true,
          isActive: true,
        },
      },
    },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.user.isActive ||
    !ROLES.includes(session.user.role as Role)
  )
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "Your session has expired. Please sign in again.",
    );
  const { isActive: _isActive, ...user } = session.user;
  return { ...user, role: user.role as Role };
}

export function requireRole(user: AuthUser, roles: string[]): void {
  if (!roles.includes(user.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
}

export async function assertCompanyAccess(
  user: AuthUser,
  companyId: string,
): Promise<void> {
  if (user.role === "SUPER_ADMIN" || user.role === "HAC_ADMIN") return;
  if (user.role === "COMPANY_ADMIN" || user.role === "COMPANY_STAFF") {
    if (user.companyId === companyId) return;
    throw new ApiError(
      403,
      "COMPANY_ACCESS_DENIED",
      "You do not have access to this company.",
    );
  }
  const assignment = await db.supervisorCompanyAssignment.findFirst({
    where: { userId: user.id, companyId, isActive: true, revokedAt: null },
  });
  if (!assignment)
    throw new ApiError(
      403,
      "COMPANY_ACCESS_DENIED",
      "This company is not assigned to you.",
    );
}

/** Use this for list queries as well as assertCompanyAccess for individual objects. */
export async function accessibleCompanyIds(
  user: AuthUser,
): Promise<string[] | null> {
  if (user.role === "SUPER_ADMIN" || user.role === "HAC_ADMIN") return null;
  if (user.role === "COMPANY_ADMIN" || user.role === "COMPANY_STAFF")
    return user.companyId ? [user.companyId] : [];
  const assignments = await db.supervisorCompanyAssignment.findMany({
    where: { userId: user.id, isActive: true, revokedAt: null },
    select: { companyId: true },
  });
  return assignments.map((assignment) => assignment.companyId);
}

function safeAuditValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Audit snapshots must never copy credentials, password hashes, session or reset tokens.
  return JSON.parse(
    JSON.stringify(value, (key, entry: unknown) =>
      /password|token|secret|cookie|credential/i.test(key)
        ? "[REDACTED]"
        : typeof entry === "bigint"
          ? String(entry)
          : entry,
    ),
  ) as Prisma.InputJsonValue;
}

export async function audit(
  client: Pick<typeof db, "auditLog">,
  user: AuthUser,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
  companyId?: string,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: user.id,
      action,
      entityType,
      entityId,
      companyId,
      before: safeAuditValue(before),
      after: safeAuditValue(after),
    },
  });
}
