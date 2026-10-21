"use client";
import * as tf from "@tensorflow/tfjs";
import { loadVisualModel, type VisualModel } from "./visual-model";
import { EXTRACTOR, normalize } from "./core";
let pending: Promise<VisualModel> | undefined;
export async function browserExtractor() {
  pending ??= (async () => {
    await tf.ready();
    return loadVisualModel();
  })().catch((e) => {
    pending = undefined;
    throw e;
  });
  return pending;
}
export async function browserEmbedding(
  image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
) {
  const model = await browserExtractor(),
    features = model.infer(image, true);
  try {
    return normalize(Array.from(await features.data()));
  } finally {
    features.dispose();
  }
}
