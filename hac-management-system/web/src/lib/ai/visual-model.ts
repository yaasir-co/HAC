import * as tf from "@tensorflow/tfjs";
import { EXTRACTOR } from "./core";

export type VisualInput =
  | tf.Tensor3D
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;

/** Frozen, official ImageNet MobileNet weights with the classification head removed. */
export async function loadVisualModel(modelUrl: string = EXTRACTOR.url) {
  const network = await tf.loadLayersModel(modelUrl);
  const features = tf.model({
    inputs: network.inputs,
    outputs: network.getLayer("global_average_pooling2d_1").output,
  });
  // The ImageNet classifier is unused by the product embedding index.
  network.getLayer("conv_preds").dispose();
  return {
    infer(image: VisualInput, _embedding = true): tf.Tensor {
      return tf.tidy(() => {
        const pixels =
          image instanceof tf.Tensor ? image : tf.browser.fromPixels(image);
        // This official Keras MobileNet artifact expects RGB values scaled to [-1, 1].
        const input = tf.image
          .resizeBilinear(pixels as tf.Tensor3D, [224, 224], true)
          .toFloat()
          .div(127.5)
          .sub(1)
          .expandDims(0);
        return features.predict(input) as tf.Tensor;
      });
    },
    dispose() {
      features.dispose();
    },
  };
}
export type VisualModel = Awaited<ReturnType<typeof loadVisualModel>>;
