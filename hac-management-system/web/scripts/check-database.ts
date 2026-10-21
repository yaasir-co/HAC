import "dotenv/config";
import { databaseDiagnostic } from "../src/lib/database-diagnostics";

async function main() {
  try {
    const url = new URL(process.env.DATABASE_URL || "");
    if (url.protocol !== "mysql:" || !url.hostname || !url.username || !url.password || url.pathname.length < 2) throw new Error();
  } catch {
    console.error("DATABASE_CONFIG_INVALID: Set DATABASE_URL to the real MySQL connection details in Hostinger's private environment settings. No local default is used by this check.");
    process.exitCode = 1;
    return;
  }

  let db: typeof import("../src/lib/db").db | undefined;
  try {
    ({ db } = await import("../src/lib/db"));
    await db.$queryRaw`SELECT 1`;
    console.log("Database connection successful.");
    await Promise.all([
      db.user.findFirst({ select: { id: true } }),
      db.loginRateLimit.findFirst({ select: { keyHash: true } }),
      db.session.findFirst({ select: { id: true } }),
      db.auditLog.findFirst({ select: { id: true } }),
    ]);
    console.log("Authentication tables are present.");
    const admins = await db.user.count({ where: { role: { in: ["SUPER_ADMIN", "HAC_ADMIN"] }, isActive: true } });
    console.log(admins ? "An active administrator exists. Use that account's saved credentials." : "No active administrator exists. For an empty user table, run npm run admin:create to create the first administrator.");
  } catch (error) {
    const diagnostic = databaseDiagnostic(error);
    console.error(diagnostic ? `${diagnostic.code}: ${diagnostic.message}` : "DATABASE_CHECK_FAILED: Check the database configuration and reviewed migration status. No internal details are printed.");
    process.exitCode = 1;
  } finally {
    await db?.$disconnect();
  }
}

void main().catch(() => {
  console.error("DATABASE_CHECK_FAILED: The database check could not finish.");
  process.exitCode = 1;
});
