import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  detectImageType,
  MAX_EVIDENCE_BYTES,
  prepareEvidence,
  readPrivateFile,
  sha256,
  storagePath,
  storePrivateFile,
} from "../src/lib/evidence";
let temporary: string | undefined;
afterEach(async () => {
  delete process.env.HAC_STORAGE_PATH;
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

describe("private inspection evidence", () => {
  it("rejects active content and a declared MIME that differs from magic bytes", async () => {
    expect(
      detectImageType(Buffer.from('<svg onload="alert(1)"></svg>')),
    ).toBeNull();
    await expect(
      prepareEvidence(Buffer.from("<svg/>"), "image/png"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    await expect(prepareEvidence(png, "image/jpeg")).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
    });
  });
  it("rejects empty, overlarge, corrupt, and decompression-bomb image input", async () => {
    await expect(
      prepareEvidence(Buffer.alloc(0), "image/png"),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(
      prepareEvidence(Buffer.alloc(MAX_EVIDENCE_BYTES + 1), "image/png"),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      prepareEvidence(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
        "image/png",
      ),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    const wide = await sharp({
      create: { width: 6000, height: 6000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(prepareEvidence(wide, "image/png")).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
  });
  it("decodes, resizes and strips image EXIF metadata while hashing stored bytes", async () => {
    const source = await sharp({
      create: { width: 2600, height: 20, channels: 3, background: "blue" },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "private original metadata" } })
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const prepared = await prepareEvidence(source, "image/jpeg");
    expect(prepared.width).toBe(2400);
    expect((await sharp(prepared.buffer).metadata()).exif).toBeUndefined();
    expect(prepared.sha256).toBe(sha256(prepared.buffer));
    expect(prepared.sizeBytes).toBe(prepared.buffer.length);
  });
  it("blocks traversal and creates opaque private storage names", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "hac-evidence-"));
    process.env.HAC_STORAGE_PATH = temporary;
    for (const key of [
      "../../secret",
      "evidence/../report.pdf",
      "/tmp/image.png",
      "evidence/a.svg",
      "reports/a.pdf/extra",
    ])
      expect(() => storagePath(key)).toThrow();
    const bytes = Buffer.from("test private artifact");
    const key = await storePrivateFile("reports", "pdf", bytes);
    expect(key).toMatch(/^reports\/[a-f0-9-]+\.pdf$/);
    expect(storagePath(key)).toBe(path.join(temporary, key));
    expect(await readPrivateFile(key)).toEqual(bytes);
  });
});
