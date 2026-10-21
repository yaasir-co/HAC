/** Real camera + TensorFlow extraction; API candidates are fixtures to exercise the selection UI. */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
test.skip(
  process.env.HAC_QUICK_CAMERA_TESTS !== "1",
  "Requires the documented local camera and official product backbone fixtures.",
);
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${path.resolve(".local/object-test/camera.y4m")}`,
    ],
  },
});
test("top three appear inside live camera; Yes adds once and scanning continues", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const user = { id: "supervisor", name: "Yaasir", role: "SUPERVISOR" };
  const products = ["Laptop", "Mobile phone", "Book"].map((name, i) => ({
    id: `p${i}`,
    name,
    type: "PRODUCT",
    variants: [],
  }));
  let saved: any,
    predictions = 0;
  await page.route(
    "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/**",
    async (route) => {
      const name = path.basename(new URL(route.request().url()).pathname);
      await route.fulfill({
        body: await readFile(path.join(".local/product-backbone", name)),
        contentType: name.endsWith("json")
          ? "application/json"
          : "application/octet-stream",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route("**/api/v1/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: any = [];
    if (p.endsWith("/auth/me")) data = user;
    else if (p.endsWith("/mobile"))
      data = {
        id: "visit",
        reference: "TEST",
        status: "IN_PROGRESS",
        inspectorId: user.id,
        version: 1,
        company: { legalName: "Keells" },
        location: { name: "Main" },
        observations: [],
      };
    else if (p.endsWith("/ai/published")) data = { id: "model", version: 1 };
    else if (p.endsWith("/ai/predict")) {
      predictions++;
      expect(route.request().postDataJSON().embedding.length).toBe(256);
      data = {
        predictionId: `prediction-${predictions}`,
        candidates: products.map((product, i) => ({
          productId: product.id,
          product,
          score: 0.95 - i * 0.1,
        })),
        uncertain: false,
      };
    } else if (p.endsWith("/observations")) {
      saved = route.request().postDataJSON();
      data = { id: "saved", ...saved };
    }
    await route.fulfill({ json: { data } });
  });
  await context.grantPermissions(["camera"]);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/inspections/visit");
  await page.getByRole("button", { name: "Scan items", exact: true }).click();
  const overlay = page.getByLabel("Top three predicted products", {
    exact: true,
  });
  await expect(overlay.getByRole("button")).toHaveCount(3, { timeout: 60000 });
  await overlay.getByRole("button", { name: /Laptop/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Yes, add", exact: true })
    .click();
  await expect.poll(() => saved?.productId).toBe("p0");
  expect(saved.recognitionPredictionId).toMatch(/^prediction-/);
  expect(saved.identityConfirmed).toBe(true);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("Camera on", { exact: true })).toBeVisible();
  const previous = predictions;
  await expect
    .poll(() => predictions, { timeout: 20000 })
    .toBeGreaterThan(previous);
  await expect(overlay.getByRole("button",{name:/Laptop/})).toBeDisabled();
  await page.screenshot({
    path: ".local/quick-camera-mobile.png",
    fullPage: true,
  });
});

test.beforeEach(async ({page})=>{await page.addInitScript(()=>localStorage.setItem("hac-install-dismissed","1"));});
