/** Genuine transfer learning on a curated, attributed object-image manifest; never production certification. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as tf from "@tensorflow/tfjs";
import { extractImage } from "../src/lib/ai/extractor";
import { loadVisualModel } from "../src/lib/ai/visual-model";
import { classifyTestObject, SCAN_TEST_LABELS, OBJECT_TEST_EXTRACTOR, type ObjectTestArtifact } from "../src/lib/ai/object-test-core";
type Source = { id: string; label: string; file: string; captureGroup: string; sha256: string; [key: string]: unknown };
const root = path.resolve(".local/object-test"), destination = path.resolve("src/data/scan-test");
async function main() {
  const manifest = JSON.parse(await readFile(path.join(root, "dataset.json"), "utf8")) as { samples: Source[] };
  const samples = manifest.samples;
  if (samples.length < 100 || new Set(samples.map(s => s.sha256)).size !== samples.length) throw new Error("At least 100 distinct attributed source images are required.");
  // One photographer/capture group has one partition across ALL labels.
  let assignments: Map<string, string> | undefined;
  for (let seed = 0; seed < 1000; seed++) {
    const groups = new Map(samples.map(s => { const bucket = Number.parseInt(createHash("sha256").update(`${seed}:${s.captureGroup}`).digest("hex").slice(0, 8), 16) % 10; return [s.captureGroup, bucket < 2 ? "test" : bucket < 4 ? "validation" : "train"]; }));
    if (SCAN_TEST_LABELS.every(label => ["test", "validation", "train"].every(split => samples.filter(s => s.label === label && groups.get(s.captureGroup) === split).length >= (split === "train" ? 8 : 3)))) { assignments = groups; break; }
  }
  if (!assignments) throw new Error("Not enough independent groups for every class.");
  await tf.setBackend("cpu"); await tf.ready();
  const visualModel = await loadVisualModel(OBJECT_TEST_EXTRACTOR.url);
  const cachedFile = path.join(root, `features-${OBJECT_TEST_EXTRACTOR.version}.json`);
  let cached: Record<string, { sha256: string; embedding: number[] }> = {};
  try { cached = JSON.parse(await readFile(cachedFile, "utf8")); } catch {}
  const rows: { source: Source; split: string; embedding: number[] }[] = [];
  for (const [i, source] of samples.entries()) {
    const bytes = await readFile(path.join(root, source.file));
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error(`Source hash changed: ${source.id}`);
    const features = cached[source.id]?.sha256 === source.sha256 ? cached[source.id].embedding : (await extractImage(bytes, visualModel)).embedding;
    cached[source.id] = { sha256: source.sha256, embedding: features };
    rows.push({ source, split: assignments.get(source.captureGroup)!, embedding: features });
    if ((i + 1) % 20 === 0) { await writeFile(cachedFile, JSON.stringify(cached)); console.log(`Extracted real image features ${i + 1}/${samples.length}`); }
  }
  await writeFile(cachedFile, JSON.stringify(cached));
  const dimension = rows[0].embedding.length;
  const data = (split: string) => {
    const values = rows.filter(r => r.split === split);
    return { x: tf.tensor2d(values.map(r => r.embedding)), y: tf.tensor2d(values.map(r => SCAN_TEST_LABELS.map(label => label === r.source.label ? 1 : 0))) };
  };
  const train = data("train"), validation = data("validation");
  const model = tf.sequential({ layers: [tf.layers.dense({ inputShape: [dimension], units: SCAN_TEST_LABELS.length, activation: "softmax", kernelRegularizer: tf.regularizers.l2({ l2: 0.0005 }), kernelInitializer: tf.initializers.glorotUniform({ seed: 421 }) })] });
  model.compile({ optimizer: tf.train.adam(0.025), loss: "categoricalCrossentropy", metrics: ["accuracy"] });
  let bestLoss = Infinity, bestEpoch = 0, best: tf.Tensor[] = [], stale = 0;
  for (let epoch = 0; epoch < 220; epoch++) {
    const history = await model.fit(train.x, train.y, { epochs: 1, batchSize: 24, shuffle: false, validationData: [validation.x, validation.y], verbose: 0 });
    const loss = Number(history.history.val_loss[0]);
    if (loss < bestLoss - 0.0001) { best.forEach(t => t.dispose()); best = model.getWeights().map(t => t.clone()); bestLoss = loss; bestEpoch = epoch + 1; stale = 0; } else stale++;
    if (stale >= 25) break;
  }
  model.setWeights(best);
  const [weightTensor, biasTensor] = model.getWeights();
  const artifact: ObjectTestArtifact = { format: "hac-object-softmax-v1", extractorVersion: OBJECT_TEST_EXTRACTOR.version, dimension, labels: [...SCAN_TEST_LABELS], weights: await weightTensor.array() as number[][], bias: await biasTensor.array() as number[], threshold: 0.65, margin: 0.15, trainedAt: new Date().toISOString() };
  // Tune only on validation. The test partition is evaluated once after this choice.
  const measure = (split: string, model: ObjectTestArtifact) => {
    const selected = rows.filter(r => r.split === split);
    let correct = 0, accepted = 0, acceptedCorrect = 0, top1 = 0;
    const confusion: Record<string, Record<string, number>> = {};
    for (const row of selected) {
      const result = classifyTestObject(row.embedding, model), actual = row.source.label;
      if (result.candidates[0].label === actual) top1++;
      if (result.label === actual) correct++;
      if (!result.uncertain) { accepted++; if (result.label === actual) acceptedCorrect++; }
      confusion[actual] ??= {}; confusion[actual][result.label] = (confusion[actual][result.label] ?? 0) + 1;
    }
    return { sampleCount: selected.length, accuracy: correct / selected.length, top1Accuracy: top1 / selected.length, acceptedCount: accepted, acceptedAccuracy: accepted ? acceptedCorrect / accepted : null, confusion };
  };
  let bestScore = -Infinity;
  for (const threshold of [0.5, 0.6, 0.65, 0.7, 0.75, 0.8]) for (const margin of [0.1, 0.15, 0.2]) {
    const candidate = { ...artifact, threshold, margin }, metrics = measure("validation", candidate);
    const score = (metrics.acceptedAccuracy ?? 0) * 0.65 + metrics.accuracy * 0.35;
    if (score > bestScore) { bestScore = score; artifact.threshold = threshold; artifact.margin = margin; }
  }
  const metrics = { trainedAt: artifact.trainedAt, sourceImageCount: samples.length, trainCount: rows.filter(r => r.split === "train").length, bestEpoch, bestValidationLoss: bestLoss, validation: measure("validation", artifact), test: measure("test", artifact), limitations: "Small camera-test baseline trained on openly licensed object images. Not a product-packaging model, not certification, not representative A25/Redmi camera acceptance. A held-out result is not field accuracy. Person is an object category, never identity recognition." };
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "model.json"), JSON.stringify(artifact));
  await writeFile(path.join(destination, "evaluation.json"), JSON.stringify(metrics, null, 2) + "\n");
  await writeFile(path.join(destination, "sources.json"), JSON.stringify({ format: "hac-object-test-sources-v1", samples: rows.map(({ source, split }) => { const { file: _file, ...attribution } = source; return { ...attribution, split }; }) }, null, 2) + "\n");
  train.x.dispose(); train.y.dispose(); validation.x.dispose(); validation.y.dispose(); best.forEach(t => t.dispose()); model.dispose(); visualModel.dispose();
  console.log(JSON.stringify(metrics, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
