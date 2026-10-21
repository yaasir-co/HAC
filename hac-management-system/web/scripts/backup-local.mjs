// A workspace backup protects local demo data when Docker volumes are not retained.
import "dotenv/config";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/hac_dev" ||
  Number(url.port || 3306) !== 3307
)
  throw new Error(
    "Local backup only permits the Docker development database on localhost:3307/hac_dev.",
  );
const directory = resolve(".local/backups");
await mkdir(directory, { recursive: true, mode: 0o700 });
const temporary = resolve(directory, `current.${process.pid}.sql.gz.tmp`);
const destination = resolve(directory, "current.sql.gz");
const child = spawn(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "mysql",
    "sh",
    "-c",
    'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysqldump --user="$MYSQL_USER" --single-transaction --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces "$MYSQL_DATABASE"',
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
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
            `Local mysqldump failed with exit ${code}: ${diagnostics.slice(0, 2000)}`,
          ),
        ),
  );
});
try {
  await Promise.all([
    pipeline(
      child.stdout,
      createGzip(),
      createWriteStream(temporary, { mode: 0o600 }),
    ),
    completion,
  ]);
  const info = await stat(temporary);
  if (info.size < 100)
    throw new Error("Backup unexpectedly empty; existing backup preserved.");
  await rename(temporary, destination);
  console.log(
    `Saved private local database snapshot: .local/backups/current.sql.gz (${info.size} compressed bytes). Existing database unchanged. Preserve .local/storage and uploads with this backup.`,
  );
} catch (error) {
  child.kill();
  await unlink(temporary).catch(() => {});
  throw error;
}
