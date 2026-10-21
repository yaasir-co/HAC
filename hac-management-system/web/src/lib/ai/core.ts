/** Real image embeddings are supplied by the pinned TensorFlow MobileNet extractor. */
export const EXTRACTOR = {
  name: "MobileNet v1 0.25 / 224",
  version: "mobilenet-v1-025-224-gap-layers-v1",
  url: "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json",
} as const;
export type Sample = {
  id: string;
  productId: string | null;
  variantId?: string | null;
  captureGroup: string;
  embedding: number[];
};
export type IndexedVector = {
  productId: string | null;
  variantId?: string | null;
  embedding: number[];
};
export type Artifact = {
  format: "hac-embedding-index-v1";
  extractor: typeof EXTRACTOR;
  dimension: number;
  threshold: number;
  margin: number;
  vectors: IndexedVector[];
  sampleIds: string[];
  createdAt: string;
};
export type Candidate = {
  productId: string;
  variantId: string | null;
  score: number;
};
export function normalize(vector: number[]): number[] {
  if (!vector.length || vector.some((value) => !Number.isFinite(value)))
    throw new Error("Embedding must contain finite values.");
  const magnitude = Math.hypot(...vector);
  if (!magnitude) throw new Error("Embedding cannot be zero.");
  return vector.map((value) => value / magnitude);
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new Error("Embedding dimensions do not match.");
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((total, value, index) => total + value * b[index], 0),
    ),
  );
}
export function rank(embedding: number[], artifact: Artifact) {
  if (embedding.length !== artifact.dimension)
    throw new Error("Embedding model version does not match this index.");
  const vector = normalize(embedding);
  const classes = new Map<
    string,
    { productId: string | null; variantId: string | null; score: number }
  >();
  for (const entry of artifact.vectors) {
    const key = `${entry.productId ?? "__unknown__"}:${entry.variantId ?? ""}`;
    const score = cosine(vector, entry.embedding);
    if (!classes.has(key) || classes.get(key)!.score < score)
      classes.set(key, {
        productId: entry.productId,
        variantId: entry.variantId ?? null,
        score,
      });
  }
  const ordered = [...classes.values()].sort(
    (a, b) =>
      b.score - a.score ||
      String(a.productId).localeCompare(String(b.productId)),
  );
  const first = ordered[0],
    second = ordered[1];
  const uncertain =
    !first ||
    first.productId === null ||
    first.score < artifact.threshold ||
    Boolean(second && first.score - second.score < artifact.margin);
  return {
    bestSimilarity: first?.score ?? -1,
    similarityMargin: first && second ? first.score - second.score : 2,
    backgroundClosest: !first || first.productId === null,
    candidates: ordered
      .filter((entry): entry is Candidate => entry.productId !== null)
      .slice(0, 3),
    uncertain,
    reason: !first
      ? "No trained examples"
      : first.productId === null
        ? "Background/unknown example is the closest match"
        : first.score < artifact.threshold
          ? "Similarity is below the model threshold"
          : second && first.score - second.score < artifact.margin
            ? "Top candidates are ambiguous"
            : "Identity requires physical confirmation",
    bestLabel: uncertain
      ? "__unknown__"
      : `${first.productId}:${first.variantId ?? ""}`,
  };
}
/** Entire capture/near-duplicate groups remain in a single partition. */
export function partition(samples: Sample[]) {
  const byClass = new Map<string, Map<string, Sample[]>>();
  for (const sample of samples) {
    const key = `${sample.productId ?? "__unknown__"}:${sample.variantId ?? ""}`;
    if (!byClass.has(key)) byClass.set(key, new Map());
    const groups = byClass.get(key)!;
    groups.set(sample.captureGroup, [
      ...(groups.get(sample.captureGroup) ?? []),
      sample,
    ]);
  }
  const train: Sample[] = [],
    validation: Sample[] = [],
    test: Sample[] = [];
  for (const [label, groups] of byClass) {
    if (groups.size < 3)
      throw new Error(
        `${label} needs at least three independent capture groups for training, validation and test. Near-duplicates stay together.`,
      );
    const ordered = [...groups].sort(([a], [b]) => a.localeCompare(b));
    const testCount = Math.max(1, Math.floor(groups.size * 0.15)),
      validationCount = Math.max(1, Math.floor(groups.size * 0.15));
    ordered.forEach(([, rows], index) =>
      (index < testCount
        ? test
        : index < testCount + validationCount
          ? validation
          : train
      ).push(...rows),
    );
  }
  return { train, validation, test };
}
export function createArtifact(
  samples: Sample[],
  threshold = 0.82,
  margin = 0.04,
): Artifact {
  if (!samples.length) throw new Error("Training samples are required.");
  const dimension = samples[0].embedding.length;
  if (samples.some((s) => s.embedding.length !== dimension))
    throw new Error("Incompatible feature extractor versions.");
  return {
    format: "hac-embedding-index-v1",
    extractor: EXTRACTOR,
    dimension,
    threshold,
    margin,
    vectors: samples.map((s) => ({
      productId: s.productId,
      variantId: s.variantId ?? null,
      embedding: normalize(s.embedding),
    })),
    sampleIds: samples.map((s) => s.id),
    createdAt: new Date().toISOString(),
  };
}
export function evaluate(samples: Sample[], artifact: Artifact) {
  if (!samples.length)
    throw new Error("Held-out examples are required for evaluation.");
  const confusion: Record<string, Record<string, number>> = {};
  let correct = 0,
    top3 = 0,
    falseIdentification = 0,
    unknownTotal = 0,
    unknownCorrect = 0;
  for (const sample of samples) {
    const actual =
      sample.productId === null
        ? "__unknown__"
        : `${sample.productId}:${sample.variantId ?? ""}`;
    const result = rank(sample.embedding, artifact),
      predicted = result.bestLabel;
    confusion[actual] ??= {};
    confusion[actual][predicted] = (confusion[actual][predicted] ?? 0) + 1;
    if (actual === predicted) correct++;
    if (sample.productId === null) {
      unknownTotal++;
      if (result.uncertain) unknownCorrect++;
      else falseIdentification++;
    } else if (
      result.candidates.some(
        (c) =>
          c.productId === sample.productId &&
          (c.variantId ?? null) === (sample.variantId ?? null),
      )
    )
      top3++;
  }
  const labels = [
    ...new Set([
      ...Object.keys(confusion),
      ...Object.values(confusion).flatMap((row) => Object.keys(row)),
    ]),
  ];
  const perClass = labels.map((label) => {
    const tp = confusion[label]?.[label] ?? 0,
      support = Object.values(confusion[label] ?? {}).reduce(
        (a, b) => a + b,
        0,
      ),
      predicted = Object.values(confusion).reduce(
        (a, row) => a + (row[label] ?? 0),
        0,
      ),
      precision = predicted ? tp / predicted : 0,
      recall = support ? tp / support : 0;
    return {
      label,
      support,
      precision,
      recall,
      f1:
        precision + recall
          ? (2 * precision * recall) / (precision + recall)
          : 0,
    };
  });
  return {
    sampleCount: samples.length,
    accuracy: correct / samples.length,
    top1Accuracy: correct / samples.length,
    top3Accuracy:
      samples.length - unknownTotal
        ? top3 / (samples.length - unknownTotal)
        : null,
    falseIdentificationRate: unknownTotal
      ? falseIdentification / unknownTotal
      : null,
    unknownDetectionRate: unknownTotal ? unknownCorrect / unknownTotal : null,
    confusionMatrix: confusion,
    perClass,
  };
}
export function hamming(a: string, b: string) {
  if (a.length !== b.length) return Infinity;
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}
