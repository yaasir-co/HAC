import "dotenv/config";
import { runInitialAdminCommand } from "./lib/initial-admin";

async function main(): Promise<void> {
  process.exitCode = await runInitialAdminCommand(process.env, {
    load: async () => {
      // Environment validation has already succeeded; do not initialize the local fallback.
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
