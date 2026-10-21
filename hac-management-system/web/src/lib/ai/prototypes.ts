import { cosine, createArtifact, normalize, type Sample } from "./core";
/** Diverse training-only prototypes bound mobile inference cost as photo libraries grow. */
export function createPrototypeArtifact(
  samples: Sample[],
  threshold = 0.82,
  margin = 0.04,
  limit = 24,
) {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const key = `${sample.productId ?? "background"}:${sample.variantId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  const prototypes: Sample[] = [];
  for (const rows of groups.values()) {
    const budget = rows[0].productId === null ? Math.max(limit, 96) : limit;
    if (rows.length <= budget) {
      prototypes.push(...rows);
      continue;
    }
    const centers = [rows[0].embedding];
    while (centers.length < budget) {
      let best = rows[0].embedding,
        distance = -1;
      for (const row of rows) {
        const nearest = Math.max(
          ...centers.map((center) => cosine(row.embedding, center)),
        );
        if (1 - nearest > distance) {
          distance = 1 - nearest;
          best = row.embedding;
        }
      }
      centers.push(best);
    }
    for (let iteration = 0; iteration < 3; iteration++) {
      const buckets: number[][][] = centers.map(() => []);
      for (const row of rows) {
        let chosen = 0,
          score = -Infinity;
        centers.forEach((center, i) => {
          const value = cosine(row.embedding, center);
          if (value > score) {
            chosen = i;
            score = value;
          }
        });
        buckets[chosen].push(row.embedding);
      }
      buckets.forEach((bucket, i) => {
        if (bucket.length) {
          const mean = centers[i].map(
            (_, dimension) =>
              bucket.reduce((total, vector) => total + vector[dimension], 0) /
              bucket.length,
          );
          if (Math.hypot(...mean) > 0) centers[i] = normalize(mean);
        }
      });
    }
    centers.forEach((embedding, i) =>
      prototypes.push({
        ...rows[0],
        id: `${rows[0].id}-prototype-${i}`,
        embedding,
      }),
    );
  }
  const artifact = createArtifact(prototypes, threshold, margin);
  artifact.sampleIds = samples.map((sample) => sample.id);
  return artifact;
}
