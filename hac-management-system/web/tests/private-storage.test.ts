import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, stat, rm, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  storePrivateFile,
  readPrivateFile,
  deletePrivateFile,
} from "../src/lib/evidence";
import { fallbackStorageRoot } from "../src/lib/private-storage";
let directory: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe("persistent private storage permission recovery", () => {
  it.skipIf(process.platform !== "linux")(
    "writes and downloads the identical private PDF through fallback when primary is read-only",
    async () => {
      directory = await mkdtemp("/tmp/hac-permissions-");
      await mkdir(path.join(directory, "denied"), { mode: 0o500 });
      vi.stubEnv("HAC_STORAGE_PATH", path.join(directory, "denied"));
      vi.stubEnv("HAC_STORAGE_FALLBACK_PATH", path.join(directory, "fallback"));
      const bytes = Buffer.from("%PDF-1.7\nprivate report");
      const key = await storePrivateFile("reports", "pdf", bytes);
      expect(await readPrivateFile(key)).toEqual(bytes);
      expect(await readFile(path.join(directory, "fallback", key))).toEqual(
        bytes,
      );
      expect(
        (await stat(path.join(directory, "fallback", key))).mode & 0o777,
      ).toBe(0o600);
      expect(
        (await stat(path.dirname(path.join(directory, "fallback", key)))).mode &
          0o777,
      ).toBe(0o700);
      await deletePrivateFile(key);
      await expect(readPrivateFile(key)).rejects.toMatchObject({
        code: "PRIVATE_FILE_UNAVAILABLE",
      });
    },
  );
  it("keeps the fallback namespace independent of passwords", () => {
    vi.stubEnv("HAC_STORAGE_FALLBACK_PATH", "");
    vi.stubEnv("DATABASE_URL", "mysql://one:first@localhost/database_a");
    const first = fallbackStorageRoot();
    vi.stubEnv("DATABASE_URL", "mysql://two:second@localhost/database_a");
    expect(fallbackStorageRoot()).toBe(first);
    vi.stubEnv("DATABASE_URL", "mysql://two:second@localhost/database_b");
    expect(fallbackStorageRoot()).not.toBe(first);
  });
});
