import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("hac-install-dismissed", "1"),
  );
});
test("catalogue search cancels stale results, trims input and shows product photos", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let data: any = [];
    if (url.pathname.endsWith("/auth/me"))
      data = { id: "u", name: "Yaasir", role: "SUPERVISOR" };
    else if (url.pathname.endsWith("/products")) {
      const q = url.searchParams.get("q");
      if (q === "old") await new Promise((resolve) => setTimeout(resolve, 650));
      data = [
        {
          id: q === "old" ? "old" : "current",
          name: q === "old" ? "Stale match" : "Current milk",
          itemCode: "MILK",
          brand: { name: "Observed brand" },
          manufacturer: { name: "Maker" },
          imageUrl: "/branding/hac-halal.png",
        },
      ];
    }
    await route.fulfill({ json: { data } }).catch(() => {});
  });
  await page.goto("/items");
  const input = page.getByRole("textbox", {
    name: "Search Product catalogue",
    exact: true,
  });
  await input.fill("old");
  await page.waitForTimeout(260);
  await input.fill(" milk ");
  await expect(page.getByText("Current milk", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText("Stale match", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Current milk photo", exact: true }),
  ).toBeVisible();
});
test("administrator can upload and remove a product display photo", async ({
  page,
}) => {
  let saved = false,
    removed = false;
  const bytes = await readFile("public/branding/hac-halal.png");
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith("/auth/me"))
      data = { id: "admin", name: "Admin", role: "HAC_ADMIN" };
    else if (path.endsWith("/catalogue-images/product/product")) {
      if (route.request().method() === "POST") {
        saved = true;
        data = { imageUrl: "/branding/hac-halal.png" };
      } else {
        removed = true;
        data = { imageUrl: null };
      }
    } else if (path.endsWith("/products"))
      data = [
        {
          id: "product",
          name: "Milk",
          itemCode: "MILK",
          status: "ACTIVE",
          brand: { name: "Brand" },
          manufacturer: { name: "Maker" },
        },
      ];
    await route.fulfill({ json: { data } });
  });
  await page.goto("/items");
  await page.getByRole("button", { name: "View record", exact: true }).click();
  await page
    .getByLabel("Upload product photo", { exact: true })
    .setInputFiles({ name: "milk.png", mimeType: "image/png", buffer: bytes });
  await expect.poll(() => saved).toBe(true);
  await expect(
    page.getByRole("img", { name: "Milk photo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect.poll(() => removed).toBe(true);
  await expect(
    page.getByRole("img", { name: "Milk photo", exact: true }),
  ).toHaveCount(0);
});
