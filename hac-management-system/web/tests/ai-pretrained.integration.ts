/** Official downloaded weights and actual image inference. Synthetic image smoke only, never field accuracy. */
import assert from "node:assert/strict";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { extractImage } from "../src/lib/ai/extractor";
import { createArtifact, rank } from "../src/lib/ai/core";
async function main() {
  const images = [
    '<svg width="224" height="224"><rect width="224" height="224" fill="#ddd"/><rect x="40" y="20" width="140" height="180" rx="10" fill="#c33"/><text x="70" y="100" font-size="32" fill="white">DEMO</text></svg>',
    '<svg width="224" height="224"><rect width="224" height="224" fill="#202820"/><circle cx="112" cy="112" r="85" fill="#4a8"/><path d="M40 110L160 50L180 180Z" fill="#fff"/></svg>',
  ];
  const vectors = [];
  for (const image of images) {
    const bytes = await sharp(Buffer.from(image)).png().toBuffer();
    const result = await extractImage(bytes);
    assert.equal(result.embedding.length, 256);
    assert(result.embedding.every(Number.isFinite));
    assert(Math.abs(Math.hypot(...result.embedding) - 1) < 1e-5);
    vectors.push(result);
  }
  const artifact = createArtifact(
    vectors.map((v, i) => ({
      id: `synthetic-${i}`,
      productId: `fictional-${i}`,
      captureGroup: `independent-${i}`,
      embedding: v.embedding,
    })),
    0.82,
    0.04,
  );
  for (let i = 0; i < vectors.length; i++) {
    const result = rank(vectors[i].embedding, artifact);
    assert.equal(result.candidates[0].productId, `fictional-${i}`);
    assert(result.candidates[0].score > 0.999);
  }
  await writeFile(
    ".local/ai-pretrained-results.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        passed: 2,
        dimension: 256,
        inferenceMs: vectors.map((v) => v.inferenceMs),
        limitations:
          "Synthetic image/backbone and self-match integration smoke, not held-out product recognition accuracy.",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS official MobileNet image decoding, 256-dimensional features and actual similarity ranking (synthetic smoke; no product accuracy claim).",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
