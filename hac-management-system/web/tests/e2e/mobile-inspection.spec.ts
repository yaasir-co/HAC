import { test, expect, type Page } from "@playwright/test";
const user = {
  id: "mobile-supervisor",
  role: "SUPERVISOR",
  name: "Yaasir",
  email: "yaasir@example.test",
};
const product = {
  id: "raw-material",
  name: "Chicken Boneless Meat",
  itemCode: "MARML-001",
  type: "RAW_MATERIAL",
  category: "RAW_MATERIAL",
  variants: [],
  brand: { name: "Prima" },
  manufacturer: { name: "Ceylon Grain Elevators PLC" },
};
async function mockInspection(page: Page) {
  const inspection = {
    id: "mobile-visit",
    reference: "INS-UI-TEST",
    status: "IN_PROGRESS",
    version: 1,
    companyId: "keells",
    locationId: "main",
    inspectorId: user.id,
    company: { legalName: "Keells" },
    location: { name: "Main location", address: "Test address" },
    inspector: user,
    checklistVersion: null,
    observations: [] as object[],
    responses: [],
    evidence: [],
    findings: [],
    signatures: [],
    investigations: [],
    nonConformities: [],
    startedAt: new Date().toISOString(),
  };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/inspections/mobile-visit/observations")) {
      saved = request.postDataJSON();
      inspection.observations = [{ id: "observation-1", ...saved, product }];
      data = inspection.observations[0];
      inspection.version++;
    } else if (path.endsWith("/inspections/mobile-visit/submit")) {
      inspection.status = "SUBMITTED";
      inspection.version++;
      data = inspection;
    } else if (path.endsWith("/reports/mobile-visit")) {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.7\nmock download"),
      });
      return;
    } else if (path.endsWith("/inspections/mobile-visit/mobile"))
      data = inspection;
    else if (path.endsWith("/products/raw-material")) data = product;
    else if (path.endsWith("/catalogue-search")) {
      const q = url.searchParams.get("q") ?? "";
      if (q === "old") await new Promise((resolve) => setTimeout(resolve, 600));
      data = q === "absent" || q === "old" ? [] : [product];
    } else if (path.endsWith("/ai/published")) data = null;
    await route
      .fulfill({
        status: request.method() === "POST" ? 201 : 200,
        json: { data },
      })
      .catch(() => {});
  });
  return { saved: () => saved };
}
test("supervisor browses live matches and saves a raw material without variant/barcode", async ({
  page,
}) => {
  const state = await mockInspection(page);
  await page.goto("/inspections/mobile-visit");
  await expect(
    page.getByRole("button", { name: /Chicken Boneless Meat/ }),
  ).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "Find product",
    exact: true,
  });
  await input.fill("old");
  await page.waitForTimeout(260);
  await input.fill("Chicken");
  await expect(
    page.getByRole("button", { name: /Chicken Boneless Meat/ }),
  ).toBeVisible();
  await page.waitForTimeout(650);
  await expect(
    page.getByRole("button", { name: /Chicken Boneless Meat/ }),
  ).toBeVisible();
  await input.fill("absent");
  await expect(
    page.getByRole("status").filter({ hasText: "No matching products" }),
  ).toBeVisible();
  await input.fill("Chicken");
  await page.getByRole("button", { name: /Chicken Boneless Meat/ }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Add to inspected list?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Yes, add", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => state.saved()?.productId).toBe(product.id);
  expect(state.saved()).not.toHaveProperty("variantId");
  expect(state.saved()).not.toHaveProperty("observedBarcode");
  expect(state.saved()).not.toHaveProperty("observedVariant");
  expect(state.saved()?.identityConfirmed).toBe(true);
});
for (const width of [360, 393, 412])
  test(`readable mobile controls at ${width}px with device-local larger text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 915 });
    await mockInspection(page);
    await page.goto("/inspections/mobile-visit");
    const bodySize = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(bodySize).toBe("14px");
    const color = await page
      .getByRole("heading", { name: "Find and add a product" })
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(17, 24, 39)");
    const toggle = page.getByRole("button", { name: "Text size", exact: true });
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-large-text",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Text: large" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("17px");
    await expect(
      page.getByRole("button", { name: /Chicken Boneless Meat/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/mobile-inspection-${width}-large.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-large-text",
      "true",
    );
    await page.getByRole("button", { name: "Text: large" }).click();
    expect(
      await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe(bodySize);
  });
test("administrator edits checklist questions without JSON and removes future availability", async ({
  page,
}) => {
  let published: Record<string, any> | undefined,
    removed = "";
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { ...user, role: "HAC_ADMIN" };
    if (path.endsWith("/checklist-management")) {
      if (route.request().method() === "POST") {
        published = route.request().postDataJSON();
        data = { id: "v2" };
      } else if (route.request().method() === "DELETE") {
        removed = route.request().postDataJSON().templateId;
      } else
        data = [
          {
            id: "template-1",
            name: "Site questions",
            versions: [
              {
                version: 1,
                status: "PUBLISHED",
                questions: [
                  {
                    id: "q1",
                    section: "General",
                    text: "First question",
                    type: "YES_NO",
                  },
                  {
                    id: "q2",
                    section: "General",
                    text: "Remove me",
                    type: "TEXT",
                  },
                ],
              },
            ],
          },
        ];
    }
    await route.fulfill({
      json: { data },
      status: route.request().method() === "POST" ? 201 : 200,
    });
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/checklists");
  await page.getByRole("button", { name: "Edit questions" }).click();
  await page
    .getByRole("button", { name: "Remove question", exact: true })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .nth(1)
    .fill("New optional question");
  await page
    .getByRole("button", { name: "Publish checklist", exact: true })
    .click();
  await expect.poll(() => published?.questions?.length).toBe(2);
  expect(
    published?.questions.map((q: Record<string, unknown>) => q.text),
  ).toEqual(["First question", "New optional question"]);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => removed).toBe("template-1");
});

test("unlisted item is recorded once on the visit without catalogue creation or another save dialog", async ({
  page,
}) => {
  await mockInspection(page);
  let registered: Record<string, unknown> | undefined;
  await page.route(
    "**/api/v1/inspections/mobile-visit/unknown",
    async (route) => {
      registered = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          data: {
            observation: {
              id: "unlisted-1",
              productId: null,
              observedName: registered?.name,
              conclusion: "UNLISTED_RAW_MATERIAL",
            },
            catalogueChanged: false,
          },
        },
      });
    },
  );
  await page.goto("/inspections/mobile-visit");
  await page
    .getByRole("button", { name: "Not in HAC list?", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add an unlisted item",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Loose notebook");
  await dialog
    .getByRole("button", { name: "Raw material", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add to inspected list", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".simple-item-list")).toContainText(
    "Loose notebook",
  );
  expect(registered?.kind).toBe("RAW_MATERIAL");
  expect(registered?.clientMutationId).toBeTruthy();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("No dismisses the single confirmation without saving", async ({
  page,
}) => {
  const state = await mockInspection(page);
  await page.goto("/inspections/mobile-visit");
  await page.getByRole("button", { name: /Chicken Boneless Meat/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "No", exact: true })
    .click();
  expect(state.saved()).toBeUndefined();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("supervisor submits without a signature screen and downloads PDF", async ({
  page,
}) => {
  await mockInspection(page);
  await page.goto("/inspections/mobile-visit");
  await page.getByRole("button", { name: /Chicken Boneless Meat/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Yes, add", exact: true })
    .click();
  await page.getByRole("button", { name: /Finish inspection/ }).click();
  await page
    .getByRole("button", { name: "Confirm & submit inspection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inspection submitted", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download inspection PDF", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("INS-UI-TEST.pdf");
});

test("search failure ends loading and provides retry", async ({ page }) => {
  await mockInspection(page);
  await page.route("**/api/v1/catalogue-search?**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "Search is temporarily unavailable.",
        },
      },
    }),
  );
  await page.goto("/inspections/mobile-visit");
  await expect(
    page.getByText("Search is temporarily unavailable."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry search", exact: true }),
  ).toBeVisible();
});
