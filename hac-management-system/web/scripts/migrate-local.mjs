// Deliberately limited to disposable, explicitly named local development databases.
// Standard reviewed deployments use `prisma migrate deploy` instead.
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import mariadb from "mariadb";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/hac_dev"
)
  throw new Error(
    "Local migration runner only permits localhost / hac_dev. Use reviewed Prisma migrate deploy for other databases.",
  );
const migrationRoot = resolve("prisma/migrations");
const names = (await readdir(migrationRoot))
  .filter((name) => /^\d{12,}_[a-z0-9_]+$/.test(name))
  .sort();
const migrations = await Promise.all(
  names.map(async (name) => {
    const sql = await readFile(
      join(migrationRoot, name, "migration.sql"),
      "utf8",
    );
    const clean = sql.replace(/--[^\n]*/g, "");
    if (
      /\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME)\b/i.test(
        clean.replace(
          /ON (?:UPDATE|DELETE) (?:CASCADE|SET NULL|RESTRICT|NO ACTION)/g,
          "",
        ),
      )
    )
      throw new Error(`Local fallback refuses destructive SQL: ${name}`);
    return {
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  }),
);
if (!migrations.length) throw new Error("No versioned migrations found.");
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
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
    throw new Error("Another local migration process holds the schema lock.");
  locked = true;
  const tables = await connection.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  );
  if (
    !tables.some((table) => table.name === "_prisma_migrations") &&
    tables.length
  )
    throw new Error(
      "Refusing to baseline an existing database. Back up and review its schema manually.",
    );
  await connection.query(
    "CREATE TABLE IF NOT EXISTS `_prisma_migrations` (`id` VARCHAR(36) NOT NULL PRIMARY KEY, `checksum` VARCHAR(64) NOT NULL, `finished_at` DATETIME(3) NULL, `migration_name` VARCHAR(255) NOT NULL, `logs` TEXT NULL, `rolled_back_at` DATETIME(3) NULL, `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  const records = await connection.query(
    "SELECT * FROM `_prisma_migrations` WHERE `rolled_back_at` IS NULL ORDER BY `started_at`",
  );
  for (const record of records) {
    if (!record.finished_at)
      throw new Error(
        `Migration ${record.migration_name} did not finish. MySQL DDL is not transactional: inspect and recover before proceeding.`,
      );
    const migration = migrations.find(
      (item) => item.name === record.migration_name,
    );
    if (!migration || migration.checksum !== record.checksum)
      throw new Error(
        `Applied migration ${record.migration_name} is missing or changed. Restore its exact file before proceeding.`,
      );
  }
  for (const migration of migrations) {
    if (records.some((record) => record.migration_name === migration.name)) {
      console.log(`Already applied: ${migration.name}`);
      continue;
    }
    const id = randomUUID();
    await connection.query(
      "INSERT INTO `_prisma_migrations` (`id`,`checksum`,`migration_name`) VALUES (?,?,?)",
      [id, migration.checksum, migration.name],
    );
    try {
      const statements = migration.sql
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((sql) => sql.trim())
        .filter(Boolean);
      for (const statement of statements) await connection.query(statement);
      await connection.query(
        "UPDATE `_prisma_migrations` SET `finished_at`=CURRENT_TIMESTAMP(3),`applied_steps_count`=1 WHERE `id`=?",
        [id],
      );
      console.log(
        `Applied local SQL migration: ${migration.name} (${statements.length} statements)`,
      );
    } catch (error) {
      await connection.query(
        "UPDATE `_prisma_migrations` SET `logs`=? WHERE `id`=?",
        [String(error.message).slice(0, 10000), id],
      );
      throw error;
    }
  }
} finally {
  if (locked)
    await connection
      .query("SELECT RELEASE_LOCK('hac_local_schema_migrations')")
      .catch(() => {});
  await connection.end();
}
