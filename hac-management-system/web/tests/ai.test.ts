import { describe, it, expect } from "vitest";
import {
  normalize,
  cosine,
  createArtifact,
  rank,
  partition,
  evaluate,
  hamming,
  type Sample,
} from "../src/lib/ai/core";
const sample = (
  id: string,
  productId: string | null,
  embedding: number[],
  captureGroup = id,
): Sample => ({ id, productId, embedding, captureGroup });
describe("real embedding index business rules (deterministic vectors, not image accuracy evaluation)", () => {
  it("normalizes feature vectors and rejects invalid tensors", () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(() => normalize([0, 0])).toThrow();
    expect(() => normalize([NaN])).toThrow();
  });
  it("rejects incompatible extractor dimensions", () => {
    expect(() => cosine([1], [1, 0])).toThrow();
    expect(() =>
      createArtifact([sample("a", "a", [1, 0]), sample("b", "b", [1])]),
    ).toThrow();
  });
  it("orders top three candidates by actual cosine similarity", () => {
    const artifact = createArtifact([
      sample("a", "a", [1, 0, 0, 0]),
      sample("b", "b", [0.8, 0.6, 0, 0]),
      sample("c", "c", [0.6, 0.8, 0, 0]),
      sample("d", "d", [0, 0, 0, 1]),
    ]);
    expect(
      rank([1, 0, 0, 0], artifact).candidates.map((c) => c.productId),
    ).toEqual(["a", "b", "c"]);
  });
  it("rejects weak similarities as uncertain and never supplies approval status", () => {
    const value = rank(
      [0, 0, 1],
      createArtifact([
        sample("a", "a", [1, 0, 0]),
        sample("b", "b", [0, 1, 0]),
      ]),
    );
    expect(value.uncertain).toBe(true);
    expect(value).not.toHaveProperty("approval");
  });
  it("rejects ambiguous products", () => {
    expect(
      rank(
        [1, 0],
        createArtifact([
          sample("a", "a", [1, 0]),
          sample("b", "b", [0.999, 0.001]),
        ]),
      ).uncertain,
    ).toBe(true);
  });
  it("rejects an actual unknown/background nearest neighbour", () => {
    const value = rank(
      [0, 0, 1],
      createArtifact([
        sample("a", "a", [1, 0, 0]),
        sample("b", null, [0, 0, 1]),
      ]),
    );
    expect(value.uncertain).toBe(true);
    expect(value.bestLabel).toBe("__unknown__");
  });
  it("returns no invented score for an empty index", () => {
    const artifact = createArtifact([sample("a", "a", [1, 0])]);
    artifact.vectors = [];
    expect(rank([1, 0], artifact).candidates).toEqual([]);
  });
  it("keeps capture groups out of other partitions", () => {
    const samples = ["a", "b", "c", "d", "e", "f"].flatMap((group) => [
      sample(group + "1", "p", [1, 0], group),
      sample(group + "2", "p", [1, 0], group),
    ]);
    const split = partition(samples);
    const groups = Object.values(split).map(
      (rows) => new Set(rows.map((r) => r.captureGroup)),
    );
    for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++)
        expect([...groups[a]].filter((g) => groups[b].has(g))).toEqual([]);
  });
  it("refuses evaluation leakage from one webcam burst", () => {
    expect(() =>
      partition([
        sample("a", "p", [1, 0], "burst"),
        sample("b", "p", [1, 0], "burst"),
        sample("c", "p", [1, 0], "burst"),
      ]),
    ).toThrow("independent capture groups");
  });
  it("requires at least three independent groups per class", () => {
    expect(() =>
      partition([sample("a", "p", [1, 0]), sample("b", "p", [1, 0])]),
    ).toThrow();
  });
  it("calculates real held-out confusion counts and per class metrics", () => {
    const artifact = createArtifact([
      sample("a", "a", [1, 0, 0]),
      sample("b", "b", [0, 1, 0]),
      sample("u", null, [0, 0, 1]),
    ]);
    const metrics = evaluate(
      [
        sample("a-test", "a", [1, 0, 0]),
        sample("b-test", "b", [0, 1, 0]),
        sample("u-test", null, [0, 0, 1]),
      ],
      artifact,
    );
    expect(metrics.accuracy).toBe(1);
    expect(metrics.unknownDetectionRate).toBe(1);
    expect(metrics.falseIdentificationRate).toBe(0);
    expect(metrics.top3Accuracy).toBe(1);
    expect(metrics.perClass.find((p) => p.label === "a:")?.f1).toBe(1);
  });
  it("reports false identification instead of hiding unknown errors", () => {
    const artifact = createArtifact([
      sample("a", "a", [1, 0]),
      sample("b", "b", [0, 1]),
    ]);
    const metrics = evaluate([sample("u", null, [1, 0])], artifact);
    expect(metrics.accuracy).toBe(0);
    expect(metrics.falseIdentificationRate).toBe(1);
    expect(metrics.unknownDetectionRate).toBe(0);
  });
  it("reports unavailable unknown metrics as null", () => {
    const artifact = createArtifact([
      sample("a", "a", [1, 0]),
      sample("b", "b", [0, 1]),
    ]);
    expect(
      evaluate([sample("test", "a", [1, 0])], artifact).falseIdentificationRate,
    ).toBeNull();
  });
  it("will not report metrics without test samples", () => {
    expect(() =>
      evaluate([], createArtifact([sample("a", "a", [1, 0])])),
    ).toThrow();
  });
  it("measures perceptual hash distance to group near duplicates", () => {
    expect(hamming("0101", "0111")).toBe(1);
    expect(hamming("0", "10")).toBe(Infinity);
  });
});
