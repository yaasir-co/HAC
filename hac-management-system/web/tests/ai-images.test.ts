import { it, expect } from "vitest";
import sharp from "sharp";
import { prepareImage } from "../src/lib/ai/extractor";
it("decodes and re-encodes training uploads, removes metadata and computes actual image quality", async () => {
  const png = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 0, g: 130, b: 80 },
    },
  })
    .png()
    .toBuffer();
  const image = await prepareImage(png),
    metadata = await sharp(image.bytes).metadata();
  expect(metadata.format).toBe("jpeg");
  expect(image.width).toBe(64);
  expect(image.height).toBe(48);
  expect(image.perceptualHash).toHaveLength(64);
  expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(image.blurScore).toBe(0);
  expect(metadata.exif).toBeUndefined();
});
it("rejects SVG and non-image training payloads", async () => {
  await expect(
    prepareImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
      ),
    ),
  ).rejects.toThrow();
  await expect(prepareImage(Buffer.from("not an image"))).rejects.toThrow();
});
