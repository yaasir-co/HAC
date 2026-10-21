import { it, expect } from "vitest";
import * as tf from "@tensorflow/tfjs";
it("executes TensorFlow CPU feature arithmetic and disposes tensors (runtime smoke, not image accuracy)", async () => {
  await tf.setBackend("cpu");
  await tf.ready();
  const before = tf.memory().numTensors;
  const tensor = tf.tensor2d([
      [3, 4],
      [0, 5],
    ]),
    norm = tensor.norm("euclidean", 1);
  expect(Array.from(await norm.data())).toEqual([5, 5]);
  tensor.dispose();
  norm.dispose();
  expect(tf.memory().numTensors).toBe(before);
});
