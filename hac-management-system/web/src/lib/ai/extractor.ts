import * as tf from "@tensorflow/tfjs";
import { loadVisualModel, type VisualModel } from "./visual-model";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { EXTRACTOR, normalize } from "./core";
let modelPromise: Promise<VisualModel> | undefined;
export async function extractor() {
  modelPromise ??= (async () => {
    await tf.setBackend("cpu");
    await tf.ready();
    return loadVisualModel();
  })().catch((error) => {
    modelPromise = undefined;
    throw new Error(
      `TensorFlow feature extractor could not be loaded from ${new URL(EXTRACTOR.url).hostname}. Check network access and retry. ${error instanceof Error ? error.message : "Download failed"}`,
    );
  });
  return modelPromise;
}
export async function prepareImage(bytes: Buffer) {
  const metadata = await sharp(bytes, {
    limitInputPixels: 20_000_000,
  }).metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
    !metadata.width ||
    !metadata.height
  )
    throw new Error("Use a valid JPEG, PNG or WebP image.");
  const canonical = await sharp(bytes, { limitInputPixels: 20_000_000 })
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer();
  const gray = await sharp(canonical)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();
  let perceptualHash = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      perceptualHash += gray[y * 9 + x] > gray[y * 9 + x + 1] ? "1" : "0";
  const edge = await sharp(canonical)
    .resize(128, 128)
    .grayscale()
    .raw()
    .toBuffer();
  let sum = 0,
    sumSquared = 0,
    n = 0;
  for (let y = 1; y < 127; y++)
    for (let x = 1; x < 127; x++) {
      const i = y * 128 + x,
        v =
          4 * edge[i] -
          edge[i - 1] -
          edge[i + 1] -
          edge[i - 128] -
          edge[i + 128];
      sum += v;
      sumSquared += v * v;
      n++;
    }
  return {
    bytes: canonical,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash("sha256").update(canonical).digest("hex"),
    perceptualHash,
    blurScore: sumSquared / n - (sum / n) ** 2,
  };
}
export async function extractImage(bytes: Buffer) {
  const { data: pixels, info } = await sharp(bytes, {
    limitInputPixels: 20_000_000,
  })
    .rotate()
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const model = await extractor(),
    start = performance.now();
  const tensor = tf.tensor3d(
    new Uint8Array(pixels),
    [info.height, info.width, 3],
    "int32",
  );
  let features: tf.Tensor | undefined;
  try {
    features = model.infer(tensor, true);
    return {
      embedding: normalize(Array.from(await features.data())),
      inferenceMs: performance.now() - start,
    };
  } finally {
    features?.dispose();
    tensor.dispose();
  }
}
