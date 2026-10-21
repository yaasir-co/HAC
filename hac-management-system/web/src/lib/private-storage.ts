import { createHash } from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { ApiError } from "./errors";
export const privateStorageRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.HAC_STORAGE_PATH ||
      path.join(process.cwd(), ".local", "storage"),
  );
export function fallbackStorageRoot() {
  let identity = "hac";
  try {
    const database = new URL(
      process.env.DATABASE_URL || "mysql://localhost/hac",
    );
    identity = database.hostname + database.pathname;
  } catch {}
  const namespace = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 16);
  // Persistent user home, outside public_html. Never silently use disposable /tmp storage.
  return path.resolve(
    /* turbopackIgnore: true */ process.env.HAC_STORAGE_FALLBACK_PATH ||
      path.join(homedir(), ".hac-private", namespace),
  );
}
export function permissionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EACCES", "EPERM", "EROFS"].includes(String(error.code))
  );
}
export async function writablePrivateDirectory(
  category: "reports" | "evidence" | "training",
) {
  const primary =
    category === "training" && process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR, "ai")
      : path.join(privateStorageRoot(), category);
  const fallback = path.join(fallbackStorageRoot(), category);
  for (const directory of [...new Set([primary, fallback])]) {
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await access(directory, constants.W_OK);
      return directory;
    } catch (error) {
      if (!permissionError(error)) throw error;
    }
  }
  throw new ApiError(
    503,
    "STORAGE_NOT_WRITABLE",
    "Private storage is not writable. An administrator must configure an owned persistent storage directory.",
  );
}
