import "dotenv/config";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const child = spawn(
  process.execPath,
  ["--use-env-proxy", resolve(".next/standalone/server.js")],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: process.env.PORT || "3000",
      HAC_STORAGE_PATH: resolve(
        process.env.HAC_STORAGE_PATH || ".local/storage",
      ),
      UPLOAD_DIR: resolve(process.env.UPLOAD_DIR || "uploads"),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error(
    "Could not start the built standalone server. Run npm run build first.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
