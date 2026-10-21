import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (process.platform === "linux" && existsSync("/usr/bin/chromium")
    ? "/usr/bin/chromium"
    : undefined);
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.HAC_BASE_URL ?? "http://localhost:3000",
    headless: true,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      ...(process.platform === "linux" ? { args: ["--no-sandbox"] } : {}),
    },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
