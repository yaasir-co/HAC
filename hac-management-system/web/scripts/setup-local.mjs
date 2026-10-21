import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { addMissingLocalDefaults } from "./local-defaults.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
mkdirSync(".local", { recursive: true, mode: 0o700 });
const secret = () => randomBytes(24).toString("base64url");
if (!existsSync(".env")) {
  const databasePassword = secret();
  writeFileSync(
    ".env",
    `DATABASE_URL="mysql://hac:${databasePassword}@127.0.0.1:3307/hac_dev"\nMYSQL_PASSWORD="${databasePassword}"\nMYSQL_ROOT_PASSWORD="${secret()}"\nAPP_ORIGIN="http://localhost:3000"\nUPLOAD_DIR="./uploads"\nHAC_STORAGE_PATH="./.local/storage"\nDEMO_MODE="true"\n`,
    { mode: 0o600 },
  );
}
// Refresh non-secret local defaults additively; preserve every existing value.
const existingEnv = readFileSync(".env", "utf8");
writeFileSync(".env", addMissingLocalDefaults(existingEnv), { mode: 0o600 });
if (!existsSync(".local/credentials.json")) {
  writeFileSync(
    ".local/credentials.json",
    JSON.stringify(
      {
        admin: { email: "admin@demo.hac.test", password: secret() },
        supervisor: { email: "supervisor@demo.hac.test", password: secret() },
        company: { email: "company@demo.hac.test", password: secret() },
        restricted: { email: "restricted@demo.hac.test", password: secret() },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
const result = spawnSync(
  "docker",
  ["compose", "up", "-d", "--wait", "--wait-timeout", "120"],
  { stdio: "inherit", cwd: root },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "Local MySQL is healthy. Random demo login credentials are stored in .local/credentials.json; keep this file private. Next run npm run db:generate && npm run db:migrate:local && npm run db:seed.",
);
