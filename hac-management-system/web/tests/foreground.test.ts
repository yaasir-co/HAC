import { it, expect } from "vitest";
import { foregroundRegion, frameDifference } from "../src/lib/ai/foreground";
it("finds a central foreground package without pretending flat/full frames are segmented", () => {
  const data = new Uint8Array(96 * 96 * 3).fill(240);
  for (let y = 22; y < 78; y++)
    for (let x = 30; x < 68; x++) {
      const i = (y * 96 + x) * 3;
      data[i] = 20;
      data[i + 1] = 90;
      data[i + 2] = 140;
    }
  const region = foregroundRegion(data, 96, 96);
  expect(region).not.toBeNull();
  expect(region!.bounds.width).toBeLessThan(0.6);
  expect(region!.bounds.height).toBeGreaterThan(0.5);
  expect(region!.mask[48 * 96 + 48]).toBe(1);
  expect(region!.mask[0]).toBe(0);
  expect(
    foregroundRegion(new Uint8Array(96 * 96 * 3).fill(100), 96, 96),
  ).toBeNull();
});
it("requires consecutive stable frames before capture", () => {
  expect(frameDifference(undefined, new Uint8Array([50, 50]))).toBe(1);
  expect(
    frameDifference(new Uint8Array([50, 50]), new Uint8Array([51, 50])),
  ).toBeLessThan(0.035);
  expect(
    frameDifference(new Uint8Array([0, 0]), new Uint8Array([255, 255])),
  ).toBe(1);
});
