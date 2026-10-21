import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suites = {
  api: "api.integration.ts",
  datasets: "ai-api.integration.ts",
  training: "ai-training.integration.ts",
};
const suite = process.argv[2];
if (!Object.hasOwn(suites, suite)) {
  console.error("Choose one integration suite: api, datasets, training.");
  process.exit(1);
}
const child = spawn(
  process.execPath,
  ["--use-env-proxy", "--import", "tsx", resolve(root, "tests", suites[suite])],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, HAC_INTEGRATION: "1" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error(
    "Could not start the integration runner. Install dependencies with npm ci.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
