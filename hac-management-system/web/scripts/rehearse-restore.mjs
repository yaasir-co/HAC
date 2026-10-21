// Restore a private local snapshot in a separate throwaway MySQL container. Never touches the live DB.
import { randomBytes } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { setTimeout as pause } from "node:timers/promises";

const name = `hac-restore-rehearsal-${process.pid}`;
const envFile = `.local/rehearsal-${process.pid}.env`;
const password = randomBytes(24).toString("hex");
let created = false;
await writeFile(
  envFile,
  `MYSQL_DATABASE=hac_dev\nMYSQL_USER=hac\nMYSQL_PASSWORD=${password}\nMYSQL_ROOT_PASSWORD=${randomBytes(24).toString("hex")}\n`,
  { mode: 0o600, flag: "wx" },
);
try {
  const run = spawnSync(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--env-file",
      envFile,
      "mysql:8.4",
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0)
    throw new Error("Could not start a separate rehearsal container.");
  created = true;
  function query(sql) {
    const r = spawnSync(
      "docker",
      [
        "exec",
        name,
        "sh",
        "-c",
        'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --batch --skip-column-names --user="$MYSQL_USER" "$MYSQL_DATABASE" --execute "$1"',
        "sh",
        sql,
      ],
      { encoding: "utf8" },
    );
    return r.status === 0 ? r.stdout.trim() : null;
  }
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (query("SELECT 1") === "1") {
      ready = true;
      break;
    }
    await pause(1000);
  }
  if (!ready)
    throw new Error(
      "Rehearsal database did not become available inside its own container.",
    );
  if (query("SHOW TABLES"))
    throw new Error("The rehearsal database must be empty.");
  const child = spawn(
    "docker",
    [
      "exec",
      "--interactive",
      name,
      "sh",
      "-c",
      'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --user="$MYSQL_USER" "$MYSQL_DATABASE"',
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (b) => (stderr += b.toString()));
  const completion = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Rehearsal import failed with exit ${code}.`)),
    );
  });
  await Promise.all([
    pipeline(
      createReadStream(".local/backups/current.sql.gz"),
      createGunzip(),
      child.stdin,
    ),
    completion,
  ]);
  const tables = query("SHOW TABLES").split("\n");
  const counts = query(
    "SELECT (SELECT COUNT(*) FROM Company),(SELECT COUNT(*) FROM Observation),(SELECT COUNT(*) FROM Inspection WHERE snapshotHash IS NOT NULL)",
  )
    .split("\t")
    .map(Number);
  if (tables.length !== 39 || counts[1] < 1 || counts[2] < 1)
    throw new Error(
      "Restored data did not contain the expected schema and submitted inspection data.",
    );
  const evidence = {
    executedAt: new Date().toISOString(),
    tables: tables.length,
    companies: counts[0],
    observations: counts[1],
    submittedSnapshots: counts[2],
    isolatedContainer: true,
    sourceDatabaseChanged: false,
  };
  await writeFile(
    ".local/restore-rehearsal-results.json",
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(
    "PASS isolated MySQL backup restoration: schema, observations and submitted snapshots retained.",
  );
} finally {
  if (created) spawnSync("docker", ["stop", name], { stdio: "ignore" });
  await unlink(envFile).catch(() => {});
}
