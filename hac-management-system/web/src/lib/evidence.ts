import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "./errors";

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 32_000_000;
export const privateStorageRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.HAC_STORAGE_PATH ||
      path.join(process.cwd(), ".local", "storage"),
  );

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
  const destination = storagePath(key);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
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
export const readPrivateFile = (key: string) =>
  readFile(/* turbopackIgnore: true */ storagePath(key));
export const deletePrivateFile = (key: string) =>
  unlink(storagePath(key)).catch(() => undefined);
export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
