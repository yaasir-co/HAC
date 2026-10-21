import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "./errors";
import {
  privateStorageRoot,
  fallbackStorageRoot,
  writablePrivateDirectory,
  permissionError,
} from "./private-storage";
export { privateStorageRoot } from "./private-storage";

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 32_000_000;
/** Only opaque, server-created storage keys are accepted. Never resolve user filenames. */
export function storagePath(key: string): string {
  if (!/^(evidence|reports)\/[a-zA-Z0-9-]+\.(jpg|png|pdf|xlsx)$/.test(key)) {
    throw new ApiError(
      400,
      "INVALID_STORAGE_KEY",
      "Invalid private file reference.",
    );
  }
  const root = privateStorageRoot();
  const destination = path.resolve(root, key);
  if (!destination.startsWith(root + path.sep))
    throw new ApiError(
      400,
      "INVALID_STORAGE_KEY",
      "Invalid private file reference.",
    );
  return destination;
}

export function detectImageType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  )
    return "image/png";
  return null;
}

export async function prepareEvidence(bytes: Uint8Array, declaredType: string) {
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES)
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "Evidence must be a non-empty image of at most 8 MB.",
    );
  const detectedType = detectImageType(bytes);
  if (!detectedType || detectedType !== declaredType)
    throw new ApiError(
      415,
      "UNSUPPORTED_FILE",
      "Upload a JPEG or PNG whose contents match its file type.",
    );
  try {
    // Decode and re-encode to remove EXIF/GPS and prevent active or trailing content.
    const pipeline = sharp(bytes, {
      limitInputPixels: MAX_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      });
    const buffer =
      detectedType === "image/png"
        ? await pipeline.png().toBuffer()
        : await pipeline.jpeg({ quality: 90 }).toBuffer();
    const metadata = await sharp(buffer).metadata();
    return {
      buffer,
      mimeType: detectedType,
      extension:
        detectedType === "image/png" ? ("png" as const) : ("jpg" as const),
      sha256: createHash("sha256").update(buffer).digest("hex"),
      sizeBytes: buffer.length,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throw new ApiError(
      415,
      "INVALID_IMAGE",
      "The image could not be decoded safely.",
    );
  }
}

export async function storePrivateFile(
  category: "evidence" | "reports",
  extension: "jpg" | "png" | "pdf" | "xlsx",
  bytes: Uint8Array,
): Promise<string> {
  const key = `${category}/${randomUUID()}.${extension}`;
  storagePath(key); // Validate the opaque key before choosing a private directory.
  const destination = path.join(
    await writablePrivateDirectory(category),
    path.basename(key),
  );
  const temporary = `${destination}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return key;
}
export async function readPrivateFile(key: string) {
  const primary = storagePath(key),
    fallback = path.join(fallbackStorageRoot(), key);
  for (const filename of [...new Set([primary, fallback])]) {
    try {
      return await readFile(/* turbopackIgnore: true */ filename);
    } catch (error) {
      if (
        !permissionError(error) &&
        !(
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        )
      )
        throw error;
    }
  }
  throw new ApiError(
    503,
    "PRIVATE_FILE_UNAVAILABLE",
    "The retained private file is unavailable. Check private storage or restore it from backup.",
  );
}
export async function deletePrivateFile(key: string) {
  const primary = storagePath(key);
  await Promise.all(
    [...new Set([primary, path.join(fallbackStorageRoot(), key)])].map(
      (filename) => unlink(filename).catch(() => undefined),
    ),
  );
}
export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
