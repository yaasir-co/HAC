import { test, expect } from "@playwright/test";
test("administrator bulk uploads 105 images with counts, progress and resumable training", async ({
  page,
}) => {
  let uploaded = 0,
    steps = 0;
  const product = {
    id: "raw-material",
    name: "Training material",
    type: "RAW_MATERIAL",
    variants: [],
  };
  let model: any;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname;
    let data: any = [];
    if (p.endsWith("/auth/me"))
      data = { id: "admin", name: "Administrator", role: "HAC_ADMIN" };
    else if (p.endsWith("/ai/datasets"))
      data = [{ id: "library", name: "Product photographs" }];
    else if (p.endsWith("/catalogue-search")) data = [product];
    else if (p.endsWith("/ai/datasets/library/images")) {
      uploaded++;
      data = { id: `image-${uploaded}` };
    } else if (p.endsWith("/ai/training-library"))
      data = {
        counts: [
          { productId: product.id, count: uploaded, groups: uploaded, product },
        ],
        images: [],
      };
    else if (p.endsWith("/ai/training-jobs")) {
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        if (input.action === "start")
          model = {
            id: "job",
            version: 1,
            status: "TRAINING",
            metrics: { job: { processed: 0, total: 105, phase: "EXTRACTING" } },
          };
        else {
          steps++;
          model = {
            ...model,
            status: "VALIDATION_REQUIRED",
            metrics: {
              job: { processed: 105, total: 105, phase: "DONE" },
              passed: false,
              test: {
                accuracy: 0.4,
                top3Accuracy: 0.8,
                sampleCount: 20,
                falseIdentificationRate: 0.4,
              },
            },
          };
        }
        data = model;
      } else data = model ? [model] : [];
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/ai/training");
  await page
    .getByRole("combobox", { name: "Training library", exact: true })
    .selectOption("library");
  await page.getByRole("button", { name: /Training material/ }).click();
  await page
    .getByLabel("Upload training photos", { exact: true })
    .setInputFiles(
      Array.from({ length: 105 }, (_, i) => ({
        name: `photo-${i}.jpg`,
        mimeType: "image/jpeg",
        buffer: Buffer.from(`mock image ${i}`),
      })),
    );
  await expect.poll(() => uploaded).toBe(105);
  await expect(
    page.getByText("105 / 105 processed · 105 saved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/105 stored images/)).toBeVisible();
  await page.getByRole("button", { name: "Train model", exact: true }).click();
  await expect.poll(() => steps).toBe(1);
  await expect(page.getByText(/VALIDATION REQUIRED/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve and publish" }),
  ).toHaveCount(0);
});
