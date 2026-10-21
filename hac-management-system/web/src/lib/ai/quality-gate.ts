export type GateMetrics = {
  accuracy?: number;
  falseIdentificationRate?: number | null;
  perClass?: { label: string; support: number; recall: number }[];
};
export function qualityFailures(test: GateMetrics | undefined | null) {
  const reasons: string[] = [];
  if (!test || !Number.isFinite(test.accuracy) || test.accuracy! < 0.7)
    reasons.push("Held-out accuracy must be at least 70%.");
  if (
    test?.falseIdentificationRate == null ||
    !Number.isFinite(test.falseIdentificationRate) ||
    test.falseIdentificationRate > 0.2
  )
    reasons.push("Background false identification must be at most 20%.");
  const foreground =
    test?.perClass?.filter(
      (row) => row.label !== "__unknown__" && row.support > 0,
    ) || [];
  if (
    !foreground.length ||
    foreground.some((row) => !Number.isFinite(row.recall)) ||
    foreground.reduce((sum, row) => sum + row.recall, 0) / foreground.length <
      0.7
  )
    reasons.push("Mean product recall must be at least 70%.");
  return reasons;
}
