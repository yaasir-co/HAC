import { normalize } from "./core";
export const OBJECT_TEST_EXTRACTOR = {
  version: "mobilenet-v1-100-224-gap-object-test-v1",
  url: "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/model.json",
} as const;
export const SCAN_TEST_LABELS = ["laptop", "phone", "person", "pen", "pencil", "book", "background"] as const;
export type ScanTestLabel = typeof SCAN_TEST_LABELS[number];
export const SCAN_TEST_NAMES: Record<ScanTestLabel, string> = { laptop: "Laptop", phone: "Mobile phone", person: "Person", pen: "Pen", pencil: "Pencil", book: "Book", background: "Other / background" };
export type ObjectTestArtifact = {
  format: "hac-object-softmax-v1"; extractorVersion: typeof OBJECT_TEST_EXTRACTOR.version;
  dimension: number; labels: ScanTestLabel[]; weights: number[][]; bias: number[];
  threshold: number; margin: number; trainedAt: string;
};
export function classifyTestObject(features: number[], artifact: ObjectTestArtifact) {
  if (artifact.format !== "hac-object-softmax-v1" || artifact.extractorVersion !== OBJECT_TEST_EXTRACTOR.version || features.length !== artifact.dimension || artifact.weights.length !== artifact.dimension || artifact.bias.length !== artifact.labels.length || artifact.bias.some(v => !Number.isFinite(v)) || artifact.weights.some(row => row.length !== artifact.labels.length || row.some(v => !Number.isFinite(v)))) throw new Error("The scan test model is incompatible. Reload the scanner.");
  const vector = normalize(features);
  const logits = artifact.bias.map((bias, column) => vector.reduce((total, value, row) => total + value * artifact.weights[row][column], bias));
  const max = Math.max(...logits), exponentials = logits.map(value => Math.exp(value - max));
  const sum = exponentials.reduce((a, b) => a + b, 0);
  const candidates = artifact.labels.map((label, i) => ({ label, score: exponentials[i] / sum })).sort((a, b) => b.score - a.score);
  const first = candidates[0], second = candidates[1];
  const uncertain = first.label === "background" || first.score < artifact.threshold || !!second && first.score - second.score < artifact.margin;
  return { candidates: candidates.slice(0, 3), uncertain, label: uncertain ? "background" as const : first.label,
    reason: first.label === "background" ? "No supported test object found" : uncertain ? "Uncertain — move closer, improve the light or search manually" : "Test suggestion — confirm the object yourself" };
}
