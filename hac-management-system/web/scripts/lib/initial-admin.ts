import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { databaseDiagnostic } from "../../src/lib/database-diagnostics";

const messages = {
  INVALID_DATABASE_URL:
    "Set DATABASE_URL to the intended MySQL database connection before creating an administrator.",
  INVALID_EMAIL: "Set HAC_ADMIN_EMAIL to a valid administrator email address.",
  INVALID_PASSWORD:
    "Set HAC_ADMIN_PASSWORD to a private password containing 12 to 1024 characters.",
  INVALID_NAME: "HAC_ADMIN_NAME must contain 1 to 120 characters when supplied.",
  EXISTING_USERS:
    "Administrator creation refused: this database already contains a user. Existing accounts and passwords were preserved. This command cannot reset or replace accounts.",
} as const;

export class InitialAdminSetupError extends Error {
  constructor(public readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "InitialAdminSetupError";
  }
}

export type InitialAdminInput = {
  email: string;
  password: string;
  name: string;
};

type Environment = Record<string, string | undefined>;
type AdminDatabase = Pick<PrismaClient, "$transaction" | "$disconnect">;
type PasswordHasher = (password: string) => Promise<string>;

/** Validate before importing db.ts so this private command never uses its local fallback. */
export function readInitialAdminEnvironment(env: Environment): InitialAdminInput {
  const rawUrl = env.DATABASE_URL;
  try {
    if (!rawUrl || rawUrl !== rawUrl.trim()) throw new Error();
    const url = new URL(rawUrl);
    if (
      url.protocol !== "mysql:" ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.pathname.length < 2 ||
      url.pathname.slice(1).includes("/") ||
      url.hash
    )
      throw new Error();
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new InitialAdminSetupError("INVALID_DATABASE_URL");
  }

  const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .safeParse(env.HAC_ADMIN_EMAIL);
  if (!email.success) throw new InitialAdminSetupError("INVALID_EMAIL");
  const password = z.string().min(12).max(1024).safeParse(env.HAC_ADMIN_PASSWORD);
  if (!password.success) throw new InitialAdminSetupError("INVALID_PASSWORD");
  const name = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .safeParse(env.HAC_ADMIN_NAME ?? "HAC Administrator");
  if (!name.success) throw new InitialAdminSetupError("INVALID_NAME");
  return { email: email.data, password: password.data, name: name.data };
}

/** First-account provisioning only: no password reset, promotion, migration, or demo seed. */
export async function createInitialAdmin(
  database: Pick<AdminDatabase, "$transaction">,
  input: InitialAdminInput,
  hashPassword: PasswordHasher,
): Promise<void> {
  await database.$transaction(
    async (tx) => {
      if ((await tx.user.count()) !== 0)
        throw new InitialAdminSetupError("EXISTING_USERS");
      const passwordHash = await hashPassword(input.password);
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          role: "HAC_ADMIN",
          companyId: null,
          isActive: true,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "INITIAL_ADMIN_CREATED",
          entityType: "User",
          entityId: user.id,
          companyId: null,
          after: { role: "HAC_ADMIN", isActive: true },
        },
      });
    },
    { isolationLevel: "Serializable", timeout: 30000 },
  );
}

type CommandDependencies = {
  load: () => Promise<{ database: AdminDatabase; hashPassword: PasswordHasher }>;
  log: (message: string) => void;
  error: (message: string) => void;
};

/** Keep command output independent of driver errors, input values, and connection strings. */
export async function runInitialAdminCommand(
  env: Environment,
  dependencies: CommandDependencies,
): Promise<number> {
  let database: AdminDatabase | undefined;
  let exitCode = 0;
  try {
    const input = readInitialAdminEnvironment(env);
    const loaded = await dependencies.load();
    database = loaded.database;
    await createInitialAdmin(database, input, loaded.hashPassword);
    dependencies.log(
      "Initial administrator created. Sign in with the configured HAC_ADMIN_EMAIL and HAC_ADMIN_PASSWORD. Remove the one-time administrator environment variables after setup.",
    );
  } catch (error) {
    exitCode = 1;
    const diagnostic = databaseDiagnostic(error);
    dependencies.error(
      error instanceof InitialAdminSetupError
        ? messages[error.code]
        : diagnostic
          ? `[${diagnostic.code}] ${diagnostic.message}`
          : "Administrator creation failed. Check the private database configuration and applied migrations, then retry. No existing user's password was reset.",
    );
  } finally {
    if (database) {
      try {
        await database.$disconnect();
      } catch {
        exitCode = 1;
        dependencies.error(
          "The database connection could not be closed cleanly. Check the private server logs before retrying administrator creation.",
        );
      }
    }
  }
  return exitCode;
}
