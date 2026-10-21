import { test, expect, type Page } from "@playwright/test";
const user = { id: "mobile-supervisor", role: "SUPERVISOR", name: "Yaasir", email: "yaasir@example.test" };
const product = { id: "raw-material", name: "Chicken Boneless Meat", itemCode: "MARML-001", type: "RAW_MATERIAL", category: "RAW_MATERIAL", variants: [], brand: { name: "Prima" }, manufacturer: { name: "Ceylon Grain Elevators PLC" } };
async function mockInspection(page: Page) {
  const inspection = { id: "mobile-visit", reference: "INS-UI-TEST", status: "IN_PROGRESS", version: 1, companyId: "keells", locationId: "main", inspectorId: user.id, company: { legalName: "Keells" }, location: { name: "Main location", address: "Test address" }, inspector: user, checklistVersion: null, observations: [] as object[], responses: [], evidence: [], findings: [], signatures: [], investigations: [], nonConformities: [], startedAt: new Date().toISOString() };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/inspections/mobile-visit/observations")) {
      saved = request.postDataJSON();
      inspection.observations = [{ id: "observation-1", ...saved, product }]; data = inspection.observations[0]; inspection.version++;
    } else if (path.endsWith("/inspections/mobile-visit")) data = inspection;
    else if (path.endsWith("/products/raw-material")) data = product;
    else if (path.endsWith("/products")) {
      const q = url.searchParams.get("q") ?? "";
      if (q === "old") await new Promise(resolve => setTimeout(resolve, 600));
      data = q === "absent" || q === "old" ? [] : [product];
    } else if (path.endsWith("/ai/published")) data = null;
    await route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: { data } }).catch(() => {});
  });
  return { saved: () => saved };
}
test("supervisor browses live matches and saves a raw material without variant/barcode", async ({ page }) => {
  const state = await mockInspection(page);
  await page.goto("/inspections/mobile-visit");
  await expect(page.getByRole("button", { name: /Chicken Boneless Meat/ })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Find product", exact: true });
  await input.fill("old"); await page.waitForTimeout(260); await input.fill("Chicken");
  await expect(page.getByRole("button", { name: /Chicken Boneless Meat/ })).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.getByRole("button", { name: /Chicken Boneless Meat/ })).toBeVisible();
  await input.fill("absent"); await expect(page.getByRole("status").filter({ hasText: "No matching products" })).toBeVisible();
  await input.fill("Chicken");
  await page.getByRole("button", { name: /Chicken Boneless Meat/ }).click();
  const dialog = page.getByRole("dialog", { name: "Product verification", exact: true });
  await dialog.getByRole("checkbox", { name: /physically checked/ }).check();
  await dialog.getByRole("button", { name: "Confirm & save observation", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => state.saved()?.productId).toBe(product.id);
  expect(state.saved()).not.toHaveProperty("variantId");
  expect(state.saved()).not.toHaveProperty("observedBarcode");
  expect(state.saved()).not.toHaveProperty("observedVariant");
  expect(state.saved()?.identityConfirmed).toBe(true);
});
for (const width of [360, 393, 412]) test(`readable mobile controls at ${width}px with device-local larger text`, async ({ page }) => {
  await page.setViewportSize({ width, height: 915 }); await mockInspection(page);
  await page.goto("/inspections/mobile-visit");
  const bodySize = await page.locator("body").evaluate(el => getComputedStyle(el).fontSize);
  expect(bodySize).toBe("14px");
  const color = await page.getByRole("heading", { name: "Find and add a product" }).evaluate(el => getComputedStyle(el).color);
  expect(color).toBe("rgb(17, 24, 39)");
  const toggle = page.getByRole("button", { name: "Text size", exact: true });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "true");
  await expect(page.getByRole("button", { name: "Text: large" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("body").evaluate(el => getComputedStyle(el).fontSize)).toBe("17px");
  await expect(page.getByRole("button", { name: /Chicken Boneless Meat/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `.local/mobile-inspection-${width}-large.png`, fullPage: true });
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-large-text", "true");
  await page.getByRole("button", { name: "Text: large" }).click();
  expect(await page.locator("body").evaluate(el => getComputedStyle(el).fontSize)).toBe(bodySize);
});
test("administrator edits checklist questions without JSON and removes future availability", async ({ page }) => {
  let published: Record<string, any> | undefined, removed = "";
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { ...user, role: "HAC_ADMIN" };
    if (path.endsWith("/checklist-management")) {
      if (route.request().method() === "POST") { published = route.request().postDataJSON(); data = { id: "v2" }; }
      else if (route.request().method() === "DELETE") { removed = route.request().postDataJSON().templateId; }
      else data = [{ id: "template-1", name: "Site questions", versions: [{ version: 1, status: "PUBLISHED", questions: [{ id: "q1", section: "General", text: "First question", type: "YES_NO" }, { id: "q2", section: "General", text: "Remove me", type: "TEXT" }] }] }];
    }
    await route.fulfill({ json: { data }, status: route.request().method() === "POST" ? 201 : 200 });
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/checklists");
  await page.getByRole("button", { name: "Edit questions" }).click();
  await page.getByRole("button", { name: "Remove question", exact: true }).nth(1).click();
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).nth(1).fill("New optional question");
  await page.getByRole("button", { name: "Publish checklist", exact: true }).click();
  await expect.poll(() => published?.questions?.length).toBe(2);
  expect(published?.questions.map((q: Record<string, unknown>) => q.text)).toEqual(["First question", "New optional question"]);
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => removed).toBe("template-1");
});

test("an unlisted item with cleared optional fields opens immediately for recording", async ({ page }) => {
  const state = await mockInspection(page);
  const provisional = { ...product, id: "provisional-material", name: "Loose notebook", brand: { name: "Unspecified — provisional" } };
  let registered: Record<string, unknown> | undefined;
  await page.route("**/api/v1/inspections/mobile-visit/unknown", async route => {
    registered = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { data: { product: provisional, investigation: { id: "investigation" } } } });
  });
  await page.route("**/api/v1/products/provisional-material", route => route.fulfill({ json: { data: provisional } }));
  await page.goto("/inspections/mobile-visit");
  await page.getByRole("button", { name: "Product not listed?", exact: true }).click();
  const unknown = page.getByRole("dialog", { name: "Unknown product — review required", exact: true });
  await unknown.getByRole("textbox", { name: "Product name *", exact: true }).fill(provisional.name);
  await unknown.getByRole("textbox", { name: "Observed brand", exact: true }).fill("cleared");
  await unknown.getByRole("textbox", { name: "Observed brand", exact: true }).fill("");
  await unknown.getByRole("textbox", { name: "Reason for investigation *", exact: true }).fill("Unlisted local validation item");
  await unknown.getByRole("button", { name: "Create provisional item & investigation", exact: true }).click();
  const verification = page.getByRole("dialog", { name: "Product verification", exact: true });
  await expect(verification).toBeVisible();
  expect(registered?.description).toBe(""); expect(registered).not.toHaveProperty("brandName");
  await verification.getByRole("checkbox", { name: /physically checked/ }).check();
  await verification.getByRole("button", { name: "Confirm & save observation", exact: true }).click();
  await expect.poll(() => state.saved()?.productId).toBe(provisional.id);
});
