import "dotenv/config";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import mariadb from "mariadb";
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/hac_dev" ||
  Number(url.port || 3306) !== 3307
)
  throw new Error(
    "Restore check only permits the local Docker development database.",
  );
if (!existsSync(".local/backups/current.sql.gz")) {
  console.log(
    "No retained local backup; normal versioned migrations will initialize the database.",
  );
  process.exit(0);
}
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: 3307,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: "hac_dev",
});
let empty = false;
try {
  const rows = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
  );
  empty = Number(rows[0].count) === 0;
} finally {
  await connection.end();
}
if (!empty) {
  console.log("Existing local database retained; restore skipped.");
  process.exit(0);
}
const restored = spawnSync(
  process.execPath,
  ["scripts/restore-local.mjs", "--restore-backup"],
  { stdio: "inherit" },
);
process.exit(restored.status ?? 1);
