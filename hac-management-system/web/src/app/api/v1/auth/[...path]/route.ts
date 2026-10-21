import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handleError } from "@/lib/errors";
import { readJson } from "@/lib/request-body";
import {
  assertSameOrigin,
  audit,
  newSessionToken,
  readSessionToken,
  requireUser,
  SESSION_SECONDS,
  sessionCookie,
  tokenHash,
  verifyPassword,
  type AuthUser,
} from "@/lib/auth";

export const runtime = "nodejs";
const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});
const DUMMY_PASSWORD_HASH = `scrypt$32768$8$1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

async function consumeLoginAttempt(email: string): Promise<string> {
  const now = Date.now();
  const bucket = Math.floor(now / WINDOW_MS);
  const keyHash = tokenHash(`login:${email}:${bucket}`);
  const increment = () =>
    db.loginRateLimit.upsert({
      where: { keyHash },
      create: {
        keyHash,
        count: 1,
        expiresAt: new Date((bucket + 1) * WINDOW_MS),
      },
      update: { count: { increment: 1 } },
    });
  let limit;
  try {
    limit = await increment();
  } catch (error) {
    // MySQL Prisma upserts can race when two requests create the first bucket.
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "P2002"
    )
      throw error;
    limit = await db.loginRateLimit.update({
      where: { keyHash },
      data: { count: { increment: 1 } },
    });
  }
  if (limit.count > MAX_ATTEMPTS)
    throw new ApiError(
      429,
      "LOGIN_RATE_LIMITED",
      "Too many sign-in attempts. Please try again after 15 minutes.",
    );
  return keyHash;
}

async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const { path } = await context.params;
    const action = path.join("/");
    if (request.method === "GET" && action === "me") {
      return Response.json(
        { data: await requireUser(request) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (request.method === "POST" && action === "login") {
      const { email, password } = loginSchema.parse(
        await readJson(request, 16 * 1024),
      );
      const attemptKey = await consumeLoginAttempt(email);
      const user = await db.user.findUnique({ where: { email } });
      const valid = await verifyPassword(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );
      if (!user || !valid || !user.isActive)
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "The email or password is incorrect.",
        );
      const token = newSessionToken();
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      } as AuthUser;
      await db.$transaction(async (tx) => {
        await tx.session.create({
          data: {
            tokenHash: tokenHash(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
          },
        });
        await audit(tx, safeUser, "LOGIN", "User", user.id);
        // A successful password proof resets failed-attempt history for this window.
        await tx.loginRateLimit.update({
          where: { keyHash: attemptKey },
          data: { count: 0 },
        });
        // Only stale records are removed. Active sessions remain individually revocable.
        await tx.session.deleteMany({
          where: { userId: user.id, expiresAt: { lte: new Date() } },
        });
      });
      return Response.json(
        { data: safeUser },
        {
          headers: {
            "Set-Cookie": sessionCookie(token),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (request.method === "POST" && action === "logout") {
      const user = await requireUser(request);
      const token = readSessionToken(request)!;
      await db.$transaction(async (tx) => {
        await tx.session.deleteMany({
          where: { tokenHash: tokenHash(token), userId: user.id },
        });
        await audit(tx, user, "LOGOUT", "User", user.id);
      });
      return Response.json(
        { data: { loggedOut: true } },
        {
          headers: {
            "Set-Cookie": sessionCookie("", 0),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    throw new ApiError(
      404,
      "NOT_FOUND",
      "The authentication endpoint does not exist.",
    );
  } catch (error) {
    return handleError(error);
  }
}
export const GET = route;
export const POST = route;
