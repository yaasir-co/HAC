import type { PrismaClient } from "@prisma/client";
import { databaseDiagnostic } from "../../src/lib/database-diagnostics";
import {
  createInitialAdmin,
  InitialAdminSetupError,
  readInitialAdminEnvironment,
} from "./initial-admin";

type Environment = Record<string, string | undefined>;
type HostedDatabase = Pick<
  PrismaClient,
  "user" | "session" | "loginRateLimit" | "auditLog" | "$transaction" | "$disconnect"
>;

const messages = {
  INVALID_FLAG:
    "HAC_HOSTED_SETUP must be true or false. Use true only to explicitly apply the committed migrations to the intended hosted database.",
  INVALID_DATABASE_URL:
    "Hosted setup requires DATABASE_URL for the intended MySQL database. No local database default is used.",
} as const;

class HostedSetupError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "HostedSetupError";
  }
}

/** Only this validated Prisma code may leave the captured migration output. */
export class HostedMigrationFailure extends Error {
  readonly code?: string;
  constructor(code?: string) {
    super("The Prisma migration command failed.");
    this.name = "HostedMigrationFailure";
    this.code = code && /^P\d{4}$/.test(code) ? code : undefined;
  }
}

function setupEnabled(env: Environment): boolean {
  if (env.HAC_HOSTED_SETUP === undefined) return false;
  const flag = env.HAC_HOSTED_SETUP.trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  throw new HostedSetupError("INVALID_FLAG");
}

function validateDatabaseUrl(env: Environment): void {
  const raw = env.DATABASE_URL;
  try {
    if (!raw || raw !== raw.trim()) throw new Error();
    const url = new URL(raw);
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
    throw new HostedSetupError("INVALID_DATABASE_URL");
  }
}

type Dependencies = {
  migrate: () => Promise<void>;
  load: () => Promise<{
    database: HostedDatabase;
    hashPassword: (password: string) => Promise<string>;
  }>;
  log: (message: string) => void;
  error: (message: string) => void;
};

const existingUsersMessage =
  "Hosted setup complete. Existing user accounts and passwords were preserved; initial administrator creation was skipped.";

/** Invoked by the build, but database work requires an explicit environment opt-in. */
export async function runHostedSetup(
  env: Environment,
  dependencies: Dependencies,
): Promise<number> {
  let database: HostedDatabase | undefined;
  let exitCode = 0;
  try {
    if (!setupEnabled(env)) {
      dependencies.log("Hosted database setup is disabled. Continuing the normal application build.");
      return 0;
    }
    validateDatabaseUrl(env);
    dependencies.log("Hosted setup explicitly enabled. Applying committed Prisma migrations to the configured database.");
    await dependencies.migrate();
    dependencies.log("Prisma migrations completed successfully.");

    const loaded = await dependencies.load();
    database = loaded.database;
    await Promise.all([
      database.user.findFirst({ select: { id: true } }),
      database.loginRateLimit.findFirst({ select: { keyHash: true } }),
      database.session.findFirst({ select: { id: true } }),
      database.auditLog.findFirst({ select: { id: true } }),
    ]);
    dependencies.log("Authentication tables are present.");

    if ((await database.user.count()) !== 0) {
      dependencies.log(existingUsersMessage);
    } else {
      const input = readInitialAdminEnvironment(env);
      try {
        await createInitialAdmin(database, input, loaded.hashPassword);
        dependencies.log(
          "Initial administrator created. Sign in with the configured HAC_ADMIN_EMAIL and HAC_ADMIN_PASSWORD. Set HAC_HOSTED_SETUP=false and remove the one-time administrator variables after setup.",
        );
      } catch (error) {
        // A concurrent initializer may have created the first account after the count.
        if (error instanceof InitialAdminSetupError && error.code === "EXISTING_USERS")
          dependencies.log(existingUsersMessage);
        else throw error;
      }
    }
  } catch (error) {
    exitCode = 1;
    const diagnostic = databaseDiagnostic(error);
    dependencies.error(
      error instanceof HostedSetupError
        ? messages[error.code]
        : error instanceof InitialAdminSetupError
          ? error.message
          : diagnostic
            ? `[${diagnostic.code}] ${diagnostic.message} Hosted setup stopped; the application build will not continue.`
            : error instanceof HostedMigrationFailure
              ? `Prisma migrations failed${error.code ? ` (${error.code})` : ""}. Review the intended database and migration history before retrying. No database reset was attempted.`
              : "Hosted database setup failed. Check the private database configuration, migration history and one-time administrator settings. The application build will not continue.",
    );
  } finally {
    if (database) {
      try {
        await database.$disconnect();
      } catch {
        exitCode = 1;
        dependencies.error("The hosted setup database connection could not be closed cleanly. Check the private server logs before retrying.");
      }
    }
  }
  return exitCode;
}
