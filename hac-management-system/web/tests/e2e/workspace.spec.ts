import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("sign in and inspect the live database workspace on desktop and mobile", async ({
  page,
}) => {
  const credentials = JSON.parse(
    await readFile(".local/credentials.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(credentials.supervisor.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.supervisor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Welcome back,/ }),
  ).toBeVisible();
  await expect(page.getByText("Live database workspace")).toBeVisible();
  await expect(
    page.getByText("Registered companies", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Inspections", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Inspections", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.locator("tbody tr").first().click();
  await expect(
    page.getByRole("tab", { name: "Product", exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Products", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Product verification checklist" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Welcome back,/ }),
  ).toBeVisible();
  await expect(page.locator(".mobile-bottom")).toBeVisible();
  await expect(
    page.getByText("Registered companies", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar.open")).toBeVisible();
  await page
    .locator(".sidebar.open")
    .getByRole("link", { name: "Product catalogue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Product catalogue", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  expect(errors).toEqual([]);
});
test("camera permission failure remains actionable without invented predictions", async ({
  page,
  context,
}) => {
  const credentials = JSON.parse(
    await readFile(".local/credentials.json", "utf8"),
  );
  await page.goto("/login");
  await page.getByLabel("Email address").fill(credentials.supervisor.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials.supervisor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await context.clearPermissions();
  await page.goto("/scanner");
  await expect(
    page.getByRole("heading", { name: "Product scanner", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByText(/Camera unavailable:/)).toBeVisible();
  await page.getByRole("textbox", { name: "Product search" }).fill("rice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Rice.*Review/ }).first(),
  ).toBeVisible();
});
