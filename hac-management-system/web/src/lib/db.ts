import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function createClient() {
  const url = new URL(
    process.env.DATABASE_URL ??
      "mysql://missing:missing@127.0.0.1:3307/hac_dev",
  );
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 8,
    connectTimeout: 10000,
  });
  return new PrismaClient({ adapter });
}
const globalDb = globalThis as unknown as { hacDb?: PrismaClient };
export const db = globalDb.hacDb ?? createClient();
if (process.env.NODE_ENV !== "production") globalDb.hacDb = db;
