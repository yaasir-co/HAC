import { describe, expect, it } from "vitest";
import { createPrototypeArtifact } from "../src/lib/ai/prototypes";
import { normalize, partition, rank, type Sample } from "../src/lib/ai/core";
describe("bounded training-only product prototypes", () => {
  const samples: Sample[] = Array.from({ length: 360 }, (_, i) => ({
    id: `image-${i}`,
    productId: i < 120 ? "a" : i < 240 ? "b" : null,
    captureGroup: `session-${i}`,
    embedding: normalize(
      i < 120
        ? [1, 0, (i % 9) / 100]
        : i < 240
          ? [0, 1, (i % 9) / 100]
          : [0, (i % 9) / 100, 1],
    ),
  }));
  it("caps each class without mixing labels or losing training provenance", () => {
    const split = partition(samples),
      artifact = createPrototypeArtifact(split.train);
    expect(artifact.vectors.length).toBeLessThanOrEqual(144);
    for (const id of ["a", "b"])
      expect(
        artifact.vectors.filter((row) => row.productId === id).length,
      ).toBeLessThanOrEqual(24);
    expect(
      artifact.vectors.filter((row) => row.productId === null).length,
    ).toBeLessThanOrEqual(96);
    expect(artifact.sampleIds).toEqual(split.train.map((row) => row.id));
    expect(
      artifact.sampleIds.some((id) => split.test.some((row) => row.id === id)),
    ).toBe(false);
    expect(rank([1, 0, 0], artifact).candidates[0].productId).toBe("a");
    expect(rank([0, 1, 0], artifact).candidates[0].productId).toBe("b");
    expect(rank([0, 0, 1], artifact).uncertain).toBe(true);
    for (const vector of artifact.vectors)
      expect(Math.hypot(...vector.embedding)).toBeCloseTo(1);
  });
});
