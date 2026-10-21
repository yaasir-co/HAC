// Explicit, guarded restore only into an empty local development database.
import "dotenv/config";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import mariadb from "mariadb";
if (process.argv[2] !== "--restore-backup" || process.argv.length !== 3)
  throw new Error(
    "An explicit --restore-backup argument is required. This restores only into an empty local hac_dev database.",
  );
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/hac_dev" ||
  Number(url.port || 3306) !== 3307
)
  throw new Error("Local restore only permits Docker localhost:3307/hac_dev.");
const backup = resolve(".local/backups/current.sql.gz");
await access(backup);
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: 3307,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: "hac_dev",
});
let locked = false;
try {
  const lock = await connection.query(
    "SELECT GET_LOCK('hac_local_schema_migrations', 10) AS acquired",
  );
  if (Number(lock[0].acquired) !== 1)
    throw new Error(
      "Another local setup/restore process holds the database lock.",
    );
  locked = true;
  const tables = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  );
  if (Number(tables[0].count) !== 0)
    throw new Error(
      "Restore refused: hac_dev already contains tables. No existing records were changed.",
    );
  // Prevent application traffic during an empty-database restore. A distinct instance
  // should not be started until this process finishes; the advisory lock serializes
  // the supplied migration runner and restores.
  const child = spawn(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "mysql",
      "sh",
      "-c",
      'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --user="$MYSQL_USER" "$MYSQL_DATABASE"',
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });
  const completion = new Promise((accept, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `Restore failed with exit ${code}: ${diagnostics.slice(0, 2000)}`,
            ),
          ),
    );
  });
  try {
    await Promise.all([
      pipeline(createReadStream(backup), createGunzip(), child.stdin),
      completion,
    ]);
  } catch (error) {
    child.kill();
    throw error;
  }
  const restored = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  );
  if (Number(restored[0].count) === 0)
    throw new Error(
      "Restore completed without application tables. Inspect the backup before starting services.",
    );
  console.log(
    `Restored ${Number(restored[0].count)} local tables from the private workspace backup. Next run db:migrate:local and functional readiness checks before starting normal work.`,
  );
} finally {
  if (locked)
    await connection
      .query("SELECT RELEASE_LOCK('hac_local_schema_migrations')")
      .catch(() => {});
  await connection.end();
}
