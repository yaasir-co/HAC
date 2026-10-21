import { describe, expect, it } from "vitest";
import { classifyTestObject, OBJECT_TEST_EXTRACTOR, SCAN_TEST_LABELS, type ObjectTestArtifact } from "../src/lib/ai/object-test-core";
import artifact from "../src/data/scan-test/model.json";
import sources from "../src/data/scan-test/sources.json";
describe("experimental object scanner", () => {
  const model: ObjectTestArtifact = { format: "hac-object-softmax-v1", extractorVersion: OBJECT_TEST_EXTRACTOR.version, dimension: 2, labels: ["pen", "pencil", "background"], weights: [[9, -4, 0], [-4, 9, 0]], bias: [0, 0, 0], threshold: 0.7, margin: 0.15, trainedAt: "2026-10-21T00:00:00Z" };
  it("returns a category suggestion for actual features rather than a HAC approval", () => {
    const result = classifyTestObject([1, 0], model);
    expect(result.label).toBe("pen"); expect(result.uncertain).toBe(false);
    expect(result).not.toHaveProperty("certificate"); expect(result).not.toHaveProperty("approval");
  });
  it("rejects ambiguous foreground scores and mismatched extractors", () => {
    expect(classifyTestObject([1, 1], model).uncertain).toBe(true);
    expect(() => classifyTestObject([1, 0, 0], model)).toThrow("incompatible");
  });
  it("ships real trained weights with all six requested categories and a background class", () => {
    expect(artifact.extractorVersion).toBe(OBJECT_TEST_EXTRACTOR.version);
    expect(artifact.labels).toEqual([...SCAN_TEST_LABELS]);
    expect(artifact.weights.length).toBe(artifact.dimension);
    expect(artifact.weights.flat().every(Number.isFinite)).toBe(true);
    expect(new Set(artifact.weights.flat()).size).toBeGreaterThan(100);
  });
  it("retains source/license attribution and photographer partitions without cross-partition reuse", () => {
    const partitions = new Map<string, string>();
    const hashes = new Set<string>();
    for (const source of sources.samples) {
      expect(source.license).toBeTruthy(); expect(source.landingUrl).toMatch(/^https:\/\//);
      expect(hashes.has(source.sha256)).toBe(false); hashes.add(source.sha256);
      const split = partitions.get(source.captureGroup);
      if (split) expect(split).toBe(source.split);
      else partitions.set(source.captureGroup, source.split);
    }
    expect(sources.samples.length).toBeGreaterThanOrEqual(100);
  });
});
