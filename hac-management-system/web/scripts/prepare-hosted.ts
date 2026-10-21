import "dotenv/config";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { HostedMigrationFailure, runHostedSetup } from "./lib/hosted-setup";

async function main(): Promise<void> {
  process.exitCode = await runHostedSetup(process.env, {
    migrate: () => new Promise<void>((done, reject) => {
      execFile(
        process.execPath,
        [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
        { env: process.env, maxBuffer: 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (!error) {
            done();
            return;
          }
          // Never relay raw CLI output: malformed connection strings may contain secrets.
          const code = `${stdout}\n${stderr}`.match(/Error(?: code)?\s*:\s*(P\d{4})\b/i)?.[1];
          reject(new HostedMigrationFailure(code));
        },
      );
    }),
    load: async () => {
      const { db } = await import("../src/lib/db");
      return {
        database: db,
        hashPassword: async (password) => {
          const { hashPassword } = await import("../src/lib/auth");
          return hashPassword(password);
        },
      };
    },
    log: (message) => console.log(message),
    error: (message) => console.error(message),
  });
}

void main();
