/** Real HTTP dataset storage/security checks. No recognition score or trained model is fabricated.
 * Run only against the local fictional seed: HAC_INTEGRATION=1 npx tsx tests/ai-api.integration.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import path from "node:path";
async function main() {
  if (process.env.HAC_INTEGRATION !== "1") {
    console.log(
      "AI HTTP checks not run. Set HAC_INTEGRATION=1 after starting the local app.",
    );
    process.exit(0);
  }
  const base = new URL(
    process.env.HAC_TEST_BASE_URL || "http://127.0.0.1:3000",
  );
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
    "AI integration tests are limited to local development.",
  );
  const origin = process.env.APP_ORIGIN || base.origin;
  const credentials = JSON.parse(
    await readFile(path.resolve(".local/credentials.json"), "utf8"),
  );
  const sessions: Record<string, string> = {},
    checks: string[] = [];
  async function request(
    endpoint: string,
    actor?: string,
    method = "GET",
    body?: BodyInit,
  ) {
    return fetch(new URL(`/api/v1/${endpoint}`, base), {
      method,
      headers: {
        ...(method !== "GET" ? { origin } : {}),
        ...(actor ? { cookie: sessions[actor] } : {}),
      },
      body,
    });
  }
  async function login(actor: string) {
    const response = await fetch(new URL("/api/v1/auth/login", base), {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(credentials[actor]),
    });
    assert.equal(response.status, 200);
    sessions[actor] = response.headers.get("set-cookie")!.split(";")[0];
  }
  async function check(label: string, fn: () => Promise<void>) {
    await fn();
    checks.push(label);
    console.log(`PASS ${label}`);
  }
  let datasetId = "",
    imageId = "";
  try {
    await login("admin");
    await login("supervisor");
    await check(
      "training datasets require an authorized HAC administrator",
      async () => {
        assert.equal((await request("ai/datasets")).status, 401);
        assert.equal((await request("ai/datasets", "supervisor")).status, 403);
      },
    );
    await check(
      "create a persistent dataset with no invented training status",
      async () => {
        const response = await fetch(new URL("/api/v1/ai/datasets", base), {
          method: "POST",
          headers: {
            origin,
            cookie: sessions.admin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `Isolated AI storage test ${randomUUID()}`,
          }),
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        datasetId = body.data.id;
        assert.equal(body.data.status, "COLLECTING_DATA");
      },
    );
    const bytes = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 3,
        background: { r: 20, g: 120, b: 80 },
      },
    })
      .png()
      .toBuffer();
    function upload(file: Blob, filename: string) {
      const form = new FormData();
      form.set("file", file, filename);
      form.set("productId", "demo-product-rice");
      form.set("captureGroup", "integration-camera-burst");
      return request(`ai/datasets/${datasetId}/images`, "admin", "POST", form);
    }
    await check(
      "actual image capture upload stores a decoded image and quality metadata",
      async () => {
        const response = await upload(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          "test.png",
        );
        assert.equal(response.status, 201);
        const body = await response.json();
        imageId = body.data.id;
        assert.equal(body.data.width, 96);
        assert.equal(body.data.mimeType, "image/jpeg");
        assert.equal(body.data.quality.blurScore, 0);
        assert(!("path" in body.data));
        assert(!("embedding" in body.data));
      },
    );
    await check(
      "exact duplicates and unsupported image payloads are rejected",
      async () => {
        assert.equal(
          (
            await upload(
              new Blob([new Uint8Array(bytes)], { type: "image/png" }),
              "again.png",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await upload(
              new Blob(
                [
                  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>',
                ],
                { type: "image/svg+xml" },
              ),
              "invalid.svg",
            )
          ).status,
          400,
        );
      },
    );
    await check(
      "stored training photographs cannot be read by unauthorized users",
      async () => {
        assert.equal((await request(`ai/images/${imageId}`)).status, 401);
        assert.equal(
          (await request(`ai/images/${imageId}`, "supervisor")).status,
          403,
        );
        const response = await request(`ai/images/${imageId}`, "admin");
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/jpeg");
        assert((await response.arrayBuffer()).byteLength > 0);
      },
    );
    await check(
      "dataset restoration retains saved images without marking a model trained",
      async () => {
        const response = await request(`ai/datasets/${datasetId}`, "admin"),
          body = await response.json();
        assert.equal(response.status, 200);
        assert(
          body.data.images.some(
            (image: { id: string }) => image.id === imageId,
          ),
        );
        assert.equal(body.data.models.length, 0);
      },
    );
    await check(
      "training refuses insufficient independent product and background classes",
      async () => {
        const response = await fetch(
          new URL(`/api/v1/ai/datasets/${datasetId}/train`, base),
          {
            method: "POST",
            headers: {
              origin,
              cookie: sessions.admin,
              "Content-Type": "application/json",
            },
            body: "{}",
          },
        );
        assert.equal(response.status, 400);
        const body = await response.json();
        assert.equal(body.error.code, "INSUFFICIENT_CLASSES");
      },
    );
    await check(
      "dataset removal is authenticated and updates storage records",
      async () => {
        assert.equal(
          (await request(`ai/images/${imageId}`, "supervisor", "DELETE"))
            .status,
          403,
        );
        assert.equal(
          (await request(`ai/images/${imageId}`, "admin", "DELETE")).status,
          200,
        );
        assert.equal(
          (await request(`ai/images/${imageId}`, "admin")).status,
          404,
        );
      },
    );
    await writeFile(
      path.resolve(".local/ai-integration-results.json"),
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          checks,
          passed: checks.length,
          limitations: [
            "Pretrained MobileNet image inference and actual image-based training remain unverified until official model host access is restored.",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      `${checks.length} AI HTTP integration checks passed. No model accuracy was evaluated.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "AI integration failed",
    );
    process.exitCode = 1;
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "AI integration failed",
  );
  process.exitCode = 1;
});
