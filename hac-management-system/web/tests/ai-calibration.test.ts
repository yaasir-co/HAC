import { describe, it, expect } from "vitest";
import { calibrateRejection } from "../src/lib/ai/calibration";
import { qualityFailures } from "../src/lib/ai/quality-gate";
import {
  createArtifact,
  evaluate,
  normalize,
  type Sample,
} from "../src/lib/ai/core";
describe("validation-only background rejection", () => {
  it("rejects similar unrelated photos while retaining recognisable products", () => {
    const artifact = createArtifact([
      { id: "train-a", productId: "a", captureGroup: "a", embedding: [1, 0] },
      { id: "train-bg", productId: null, captureGroup: "b", embedding: [0, 1] },
    ]);
    const validation: Sample[] = [
      { id: "val-a", productId: "a", captureGroup: "c", embedding: [1, 0] },
      {
        id: "val-bg",
        productId: null,
        captureGroup: "d",
        embedding: normalize([0.85, 0.53]),
      },
    ];
    expect(evaluate(validation, artifact).falseIdentificationRate).toBe(1);
    const choice = calibrateRejection(validation, artifact),
      metrics = evaluate(validation, { ...artifact, ...choice });
    expect(choice.feasible).toBe(true);
    expect(metrics.falseIdentificationRate).toBe(0);
    expect(metrics.accuracy).toBe(1);
    expect(qualityFailures(metrics)).toEqual([]);
  });
  it("cannot publish high overall accuracy that hides a failed background or foreground class", () => {
    expect(
      qualityFailures({
        accuracy: 0.83,
        falseIdentificationRate: 0.434,
        perClass: [{ label: "a:", support: 10, recall: 1 }],
      }),
    ).toContain("Background false identification must be at most 20%.");
    expect(
      qualityFailures({
        accuracy: 0.95,
        falseIdentificationRate: 0,
        perClass: [
          { label: "a:", support: 10, recall: 0 },
          { label: "__unknown__", support: 190, recall: 1 },
        ],
      }),
    ).toContain("Mean product recall must be at least 70%.");
    expect(qualityFailures(undefined).length).toBeGreaterThan(0);
  });
});
