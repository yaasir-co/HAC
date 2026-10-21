import { rank, type Artifact, type Sample } from "./core";
export const TRAINING_RECIPE = "grouped-prototypes-background-calibration-v2";
/** Validate once per image, then search rejection parameters without repeating expensive vector comparisons. */
export function calibrateRejection(validation: Sample[], artifact: Artifact) {
  const scored = validation.map((sample) => ({
    sample,
    result: rank(sample.embedding, { ...artifact, threshold: 0, margin: 0 }),
  }));
  const foregroundLabels = [
    ...new Set(
      validation
        .filter((row) => row.productId)
        .map((row) => `${row.productId}:${row.variantId ?? ""}`),
    ),
  ];
  let best:
    | {
        threshold: number;
        margin: number;
        feasible: boolean;
        score: number;
        backgroundRate: number;
      }
    | undefined;
  for (const threshold of [
    0.55, 0.6, 0.65, 0.7, 0.72, 0.75, 0.78, 0.8, 0.82, 0.85, 0.88, 0.9, 0.92,
    0.94, 0.96, 0.98, 0.99,
  ])
    for (const margin of [
      0.01, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2, 0.3,
    ]) {
      let background = 0,
        falseIdentification = 0;
      const counts = new Map<string, { total: number; correct: number }>();
      for (const { sample, result } of scored) {
        const reject =
          result.backgroundClosest ||
          result.bestSimilarity < threshold ||
          result.similarityMargin < margin;
        if (!sample.productId) {
          background++;
          if (!reject) falseIdentification++;
          continue;
        }
        const label = `${sample.productId}:${sample.variantId ?? ""}`,
          row = counts.get(label) || { total: 0, correct: 0 };
        row.total++;
        if (!reject && result.bestLabel === label) row.correct++;
        counts.set(label, row);
      }
      const backgroundRate = background ? falseIdentification / background : 1;
      const recall =
        foregroundLabels.reduce((sum, label) => {
          const row = counts.get(label)!;
          return sum + row.correct / row.total;
        }, 0) / Math.max(1, foregroundLabels.length);
      const feasible = backgroundRate <= 0.2,
        score = (recall + 1 - backgroundRate) / 2;
      if (
        !best ||
        (feasible && !best.feasible) ||
        (feasible === best.feasible &&
          (score > best.score + 1e-10 ||
            (Math.abs(score - best.score) < 1e-10 &&
              backgroundRate < best.backgroundRate)))
      )
        best = { threshold, margin, feasible, score, backgroundRate };
    }
  return best!;
}
