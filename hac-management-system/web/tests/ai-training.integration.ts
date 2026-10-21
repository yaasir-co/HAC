/** Genuine TensorFlow image extraction, training/evaluation/publication lifecycle on SYNTHETIC fictional fixtures. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { extractImage } from "../src/lib/ai/extractor";
import { EXTRACTOR } from "../src/lib/ai/core";
async function main() {
  if (process.env.HAC_INTEGRATION !== "1")
    throw new Error(
      "Set HAC_INTEGRATION=1; this test creates retained fictional training records.",
    );
  const base = new URL(
    process.env.HAC_TEST_BASE_URL || "http://127.0.0.1:3000",
  );
  assert(["127.0.0.1", "localhost"].includes(base.hostname));
  const origin = process.env.APP_ORIGIN || base.origin;
  const credentials = JSON.parse(
    await readFile(".local/credentials.json", "utf8"),
  );
  let cookie = "";
  const checks: string[] = [];
  const modelIds: string[] = [];
  async function call(path: string, body?: unknown) {
    const r = await fetch(new URL(`/api/v1/${path}`, base), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        origin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const p = await r.json();
    assert(
      r.ok,
      `${path} ${r.status} ${p.error?.code || ""}: ${p.error?.message || ""}`,
    );
    return p.data;
  }
  const login = await fetch(new URL("/api/v1/auth/login", base), {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(credentials.admin),
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await call("companies/demo-company-keells")).isDemo, true);
  assert.equal(
    await call("ai/published"),
    null,
    "Do not supersede a user-published model in the synthetic lifecycle test.",
  );
  const dataset = await call("ai/datasets", {
    name: `SYNTHETIC SMOKE ONLY ${randomUUID()}`,
    description:
      "Generated illustrations of fictional packaging. Lifecycle smoke only; never representative field product accuracy. Models are archived after this test.",
  });
  const firstBytes: Buffer[] = [];
  const labels = ["demo-product-rice", "demo-product-tea", null];
  try {
    for (let kind = 0; kind < 3; kind++)
      for (let group = 0; group < 5; group++) {
        const canvas = Buffer.alloc(224 * 224 * 3);
        const cx = [112, 84, 143, 117, 91][group],
          cy = [110, 131, 86, 72, 101][group],
          size = [78, 62, 70, 57, 90][group];
        for (let y = 0; y < 224; y++)
          for (let x = 0; x < 224; x++) {
            const i = (y * 224 + x) * 3;
            const background = 205 + ((x * 13 + y * 7 + group * 31) % 37);
            let rgb = [background, background, background];
            if (
              kind === 0 &&
              Math.abs(x - cx) < size * 0.7 &&
              Math.abs(y - cy) < size
            ) {
              const stripe = Math.floor((x + group * 7) / 10) % 2;
              rgb = stripe ? [180, 25, 30] : [245, 105, 45];
              if (Math.abs(y - cy) < 12) rgb = [250, 230, 160];
            }
            if (kind === 1 && Math.hypot(x - cx, y - cy) < size) {
              const stripe = Math.floor(Math.hypot(x - cx, y - cy) / 8) % 2;
              rgb = stripe ? [15, 95, 45] : [55, 195, 80];
              if (Math.abs(x - cx) < 13) rgb = [230, 250, 220];
            }
            if (kind === 2) {
              const wave =
                Math.sin((x + group * 18) / 19) +
                Math.cos((y - group * 10) / 22);
              rgb = wave > 0 ? [25, 50, 160] : [95, 130, 245];
            }
            canvas[i] = rgb[0];
            canvas[i + 1] = rgb[1];
            canvas[i + 2] = rgb[2];
          }
        const bytes = await sharp(canvas, {
          raw: { width: 224, height: 224, channels: 3 },
        })
          .png()
          .toBuffer();
        if (group === 0) firstBytes[kind] = bytes;
        const form = new FormData();
        form.set(
          "file",
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          `synthetic-${kind}-${group}.png`,
        );
        if (labels[kind]) form.set("productId", labels[kind]!);
        form.set("captureGroup", `independent-${kind}-${group}`);
        const response = await fetch(
          new URL(`/api/v1/ai/datasets/${dataset.id}/images`, base),
          { method: "POST", headers: { cookie, origin }, body: form },
        );
        const payload = await response.json();
        assert.equal(
          response.status,
          201,
          `${payload.error?.code}: ${payload.error?.message}`,
        );
      }
    checks.push(
      "15 genuine decoded synthetic images persisted across two product classes and background",
    );
    let model = await call(`ai/datasets/${dataset.id}/train`, {
      threshold: 0.5,
      margin: 0.01,
    });
    modelIds.push(model.id);
    assert(model.artifact?.vectors?.length > 0);
    assert.equal(model.artifact.dimension, 256);
    assert(model.metrics.test.sampleCount >= 3);
    checks.push(
      "actual MobileNet transfer features and held-out evaluation produced a real versioned artifact",
    );
    if (model.status !== "VALIDATED")
      throw new Error(
        `Synthetic model correctly requires validation: measured test accuracy=${model.metrics.test.accuracy}; no publish bypass is permitted.`,
      );
    await call(`ai/models/${model.id}/publish`, {});
    assert.equal((await call("ai/published")).id, model.id);
    checks.push(
      "validated artifact publication is reflected in the active model endpoint",
    );
    const scheduledAt = new Date(
      Date.now() + (7 + Math.floor(Math.random() * 300)) * 86400000,
    ).toISOString();
    const inspection = await call("inspections", {
      companyId: "demo-company-keells",
      locationId: "demo-location-keells",
      inspectorId: (await call("auth/me")).id,
      scheduledAt,
      checklistVersionId: "demo-checklist-v1",
    });
    await call(`inspections/${inspection.id}/start`, {});
    const features = await extractImage(firstBytes[0]);
    const prediction = await call("ai/predict", {
      embedding: features.embedding,
      inspectionId: inspection.id,
      extractorVersion: EXTRACTOR.version,
    });
    assert.equal(prediction.candidates[0].productId, "demo-product-rice");
    assert(prediction.predictionId);
    assert.equal(prediction.modelVersionId, model.id);
    checks.push(
      "actual image features rank the expected fictional product and persist prediction provenance",
    );
    const product = await call("products/demo-product-rice");
    const observation = await call(
      `inspections/${inspection.id}/observations`,
      {
        productId: product.id,
        variantId: product.variants[0].id,
        recognitionPredictionId: prediction.predictionId,
        identityConfirmed: true,
        conclusion: "Synthetic image fixture identity confirmed",
        clientMutationId: randomUUID(),
      },
    );
    assert.equal(observation.recognitionPredictionId, prediction.predictionId);
    const saved = await call(`inspections/${inspection.id}`);
    assert.equal(
      saved.observations[0].recognitionPrediction.modelVersionId,
      model.id,
    );
    assert.equal(
      saved.observations[0].recognitionPrediction.acceptedProductId,
      product.id,
    );
    checks.push(
      "confirmed observation links the saved prediction, model version and authoritative verification",
    );

    // Complete a fictional Keells visit using saved records, including the real image prediction above.
    for (const fields of [
      {
        productId: "demo-product-tea",
        variantId: "demo-variant-tea",
        observedBrand: "Fictional alternative brand",
      },
      {
        productId: "demo-product-expired-certificate",
        variantId: "demo-variant-expired-certificate",
      },
      {
        productId: "demo-product-physical-expiry",
        variantId: "demo-variant-physical-expiry",
        physicalExpiry: "2000-01-01",
      },
      {
        productId: "demo-product-restricted",
        variantId: "demo-variant-restricted",
      },
    ])
      await call(`inspections/${inspection.id}/observations`, {
        ...fields,
        identityConfirmed: true,
        conclusion: "Fictional mixed finding; HAC review required",
        clientMutationId: randomUUID(),
      });
    const provisional = await call(`inspections/${inspection.id}/unknown`, {
      name: `Fictional unknown image acceptance ${randomUUID()}`,
      description: "Synthetic local integration record only.",
      reason: "No HAC approval is supplied for this fictional packaging.",
    });
    await call(`inspections/${inspection.id}/observations`, {
      productId: provisional.product.id,
      observedName: provisional.product.name,
      identityConfirmed: true,
      conclusion: "Unknown provisional item; approval unverified",
      clientMutationId: randomUUID(),
    });
    await call("non-conformities", {
      companyId: inspection.companyId,
      inspectionId: inspection.id,
      productId: product.id,
      observationId: observation.id,
      title: "Fictional acceptance follow-up",
      description:
        "Automated demonstration finding; not a real operational non-conformity.",
      severity: "OBSERVATION",
    });
    const evidence = new FormData();
    evidence.set("inspectionId", inspection.id);
    evidence.set("observationId", observation.id);
    evidence.set(
      "description",
      "SYNTHETIC packaging illustration used for ML integration; not a field photograph.",
    );
    evidence.set(
      "file",
      new Blob([new Uint8Array(firstBytes[0])], { type: "image/png" }),
      "synthetic-packaging.png",
    );
    const uploaded = await fetch(new URL("/api/v1/evidence", base), {
      method: "POST",
      headers: { cookie, origin },
      body: evidence,
    });
    assert.equal(uploaded.status, 201);
    const detail = await call(`inspections/${inspection.id}`);
    for (const question of detail.checklistVersion.questions) {
      if (!question.required) continue;
      const answer =
        question.type === "COMPLIANCE"
          ? "COMPLIANT"
          : question.type === "YES_NO"
            ? true
            : question.type === "PASS_FAIL"
              ? "PASS"
              : "Fictional integration answer";
      await call(`inspections/${inspection.id}/checklist`, {
        questionId: question.id,
        answer,
      });
    }
    const signature = await sharp(
      Buffer.from(
        '<svg width="400" height="100"><rect width="400" height="100" fill="white"/><path d="M20 70L45 20L60 70L95 25L115 65L155 40L180 60L235 25L290 65L365 40" fill="none" stroke="black" stroke-width="3"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    await call(`inspections/${inspection.id}/sign`, {
      name: "Demo Administrator — synthetic acceptance fixture",
      role: "INSPECTOR",
      signature: `data:image/png;base64,${signature.toString("base64")}`,
    });
    await call(`inspections/${inspection.id}/sign`, {
      name: "Fictional representative unavailable",
      role: "COMPANY_REPRESENTATIVE",
      reason:
        "Automated synthetic integration fixture; no real company representative participates.",
    });
    const signed = await call(`inspections/${inspection.id}`);
    const submitted = await call(`inspections/${inspection.id}/submit`, {
      version: signed.version,
      declaration: true,
    });
    assert.equal(submitted.snapshot.observations.length, 6);
    assert(
      submitted.snapshot.observations.some(
        (o: { recognitionPredictionId?: string }) =>
          o.recognitionPredictionId === prediction.predictionId,
      ),
    );
    const report = await fetch(
      new URL(`/api/v1/reports/${inspection.id}`, base),
      { headers: { cookie } },
    );
    assert.equal(report.status, 200);
    const reportBytes = Buffer.from(await report.arrayBuffer());
    assert.equal(reportBytes.subarray(0, 4).toString(), "%PDF");
    await writeFile(".local/keells-synthetic-inspection.pdf", reportBytes, {
      mode: 0o600,
    });
    await call(`inspections/${inspection.id}/review`, {
      decision: "APPROVED",
      reason:
        "Synthetic local acceptance workflow reviewed; no official certification statement.",
    });
    checks.push(
      "fictional Keells image prediction, mixed outcomes, unknown investigation, evidence, declarations, immutable submission, PDF and authorized review complete together",
    );
    const second = await call(`ai/datasets/${dataset.id}/train`, {
      threshold: 0.5,
      margin: 0.01,
    });
    modelIds.push(second.id);
    assert.equal(second.status, "VALIDATED");
    await call(`ai/models/${second.id}/publish`, {});
    assert.equal((await call("ai/published")).id, second.id);
    await call(`ai/models/${model.id}/rollback`, {});
    assert.equal((await call("ai/published")).id, model.id);
    checks.push(
      "second real training version publishes and administrator rollback restores the prior artifact",
    );
  } finally {
    for (const modelId of modelIds)
      await call(`ai/models/${modelId}/archive`, {
        reason:
          "Synthetic lifecycle smoke complete; not a representative field product model.",
      });
    await writeFile(
      ".local/ai-training-results.json",
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          datasetId: dataset.id,
          modelIds,
          passed: checks.length,
          checks,
          limitations:
            "Generated illustrations and small grouped holdout demonstrate functioning ML integration only. No field accuracy guarantee; all test models archived.",
        },
        null,
        2,
      ),
    );
  }
  assert.equal(await call("ai/published"), null);
  console.log(
    `PASS ${checks.length} genuine TensorFlow image training/inference/lifecycle checks; synthetic test models archived.`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
