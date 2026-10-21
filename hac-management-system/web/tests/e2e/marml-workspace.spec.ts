import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const names = [
  "Keells",
  "Cargills Food City",
  "Arpico",
  "Lanka Sathosa",
  "SPAR Sri Lanka",
  "Glomark",
  "Laugfs Supermarkets",
  "Ceylon Agro Industries",
  "Ceylon Biscuits",
  "Maliban",
];
const staffNames = ["Yaasir", "Imthad", "Farraj", "Mazhar", "Imaath"];
const companies = names.map((name, index) => ({
  id: `company-${index}`,
  legalName: name,
  tradingName: name,
  status: "ACTIVE",
  registrationNumber: null,
  category: "RETAILER",
  locations: [
    {
      id: `location-${index}`,
      companyId: `company-${index}`,
      name: "Main location",
      address: "Address pending confirmation",
      isActive: true,
    },
  ],
}));
const supervisors = staffNames.map((name, index) => ({
  id: `supervisor-${index}`,
  name,
  email: `${name.toLowerCase()}@supervisors.hac.test`,
  isActive: true,
  assignments: companies.slice(index * 2, index * 2 + 2).map((company) => ({
    companyId: company.id,
    company,
    isActive: true,
    revokedAt: null,
  })),
}));
const checklist = {
  id: "checklist-1",
  status: "PUBLISHED",
  version: 1,
  template: { name: "Material inspection" },
  questions: [],
};
const listing = {
  id: "listing-1",
  name: "Source chicken material",
  category: "MEAT_AND_MEAT_BASED_RAW_MATERIALS",
  rowNumber: 1,
  sourcePage: 1,
  physicalState: "s",
  brand: "Source brand",
  manufacturer: "Source manufacturer",
  certificateBody: "HAC",
  certificateExpiry: "2025-09-11T00:00:00.000Z",
  reviewStatus: "SOURCE_LISTED_REQUIRES_REVIEW",
  sourceCompanyName: "Ceylon Agro Industries",
  sourceMetadata: { applicationNumber: "PSA0135" },
  sourceRow: {
    name: "Original source chicken material",
    certificateExpiry: "2025-09-11",
  },
};

test("a supervisor starts an assigned-company inspection without a schedule or inspector selector", async ({
  page,
}) => {
  let posted: Record<string, unknown> | undefined;
  const user = {
    id: "supervisor-0",
    name: "Yaasir",
    role: "SUPERVISOR",
    email: supervisors[0].email,
  };
  const inspection = {
    id: "new-inspection",
    reference: "INS-UI-TEST",
    status: "IN_PROGRESS",
    version: 1,
    type: "ROUTINE",
    company: companies[0],
    companyId: companies[0].id,
    location: companies[0].locations[0],
    inspector: user,
    inspectorId: user.id,
    checklistVersion: checklist,
    observations: [],
    responses: [],
    evidence: [],
    findings: [],
    signatures: [],
    investigations: [],
    nonConformities: [],
    startedAt: "2026-10-21T12:00:00Z",
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/companies")) data = companies.slice(0, 2);
    else if (path.endsWith("/checklists")) data = [checklist];
    else if (path.endsWith("/inspections/start-now")) {
      posted = route.request().postDataJSON();
      data = inspection;
    } else if (path.endsWith("/inspections/new-inspection")) data = inspection;
    await route.fulfill({
      json: { data },
      status: path.endsWith("/start-now") ? 201 : 200,
    });
  });
  await page.goto("/inspections");
  await expect(
    page.getByRole("button", { name: "Schedule inspection", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start inspection", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Start an inspection now" });
  await expect(
    dialog.getByRole("combobox", { name: "Company *", exact: true }),
  ).toHaveValue(companies[0].id);
  await expect(
    dialog
      .getByRole("combobox", { name: "Company *", exact: true })
      .locator("option"),
  ).toHaveCount(3);
  await expect(
    dialog.getByRole("combobox", { name: "Location *", exact: true }),
  ).toHaveValue(companies[0].locations[0].id);
  await expect(
    dialog.getByRole("combobox", { name: "Checklist (optional)", exact: true }),
  ).toHaveValue("");
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Start inspection", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inspections\/new-inspection$/);
  expect(posted).toEqual({
    companyId: companies[0].id,
    locationId: companies[0].locations[0].id,
    type: "ROUTINE",
  });
  await expect(
    page.getByRole("link", { name: "Workspace setup", exact: true }),
  ).toHaveCount(0);
});

test("an administrator provisions, downloads private credentials, and edits records while retaining source data", async ({
  page,
}) => {
  const state = {
    imported: false,
    companies: structuredClone(companies),
    supervisors: structuredClone(supervisors),
    materials: [structuredClone(listing)],
  };
  const patches: Record<string, any>[] = [];
  let provisioned: Record<string, any> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          data: { id: "admin", name: "Test Administrator", role: "HAC_ADMIN" },
        },
      });
    if (!path.endsWith("/workspace-setup"))
      return route.fulfill({ json: { data: [] } });
    if (route.request().method() === "POST") {
      provisioned = route.request().postDataJSON();
      state.imported = true;
      return route.fulfill({
        json: {
          data: {
            credentials: [
              {
                name: "Yaasir",
                email: supervisors[0].email,
                password: "Hac-synthetic-ui-test-only",
                companyNames: names.slice(0, 2),
              },
            ],
            materialsImported: 39,
            existingUsersPreserved: 0,
          },
        },
      });
    }
    if (route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON();
      patches.push(patch);
      const collection =
        patch.action === "material"
          ? state.materials
          : patch.action === "company"
            ? state.companies
            : state.supervisors;
      const record = collection.find((item) => item.id === patch.id)!;
      Object.assign(record, patch.fields);
      return route.fulfill({ json: { data: record } });
    }
    return route.fulfill({
      json: {
        data: {
          ...state,
          defaults: {
            companyNames: names,
            supervisors: staffNames.map((name) => ({
              name,
              email: `${name.toLowerCase()}@supervisors.hac.test`,
            })),
          },
          source: { title: "Supplied MARML" },
        },
      },
    });
  });
  await page.goto("/workspace-setup");
  await expect(
    page.getByRole("heading", { name: "Workspace setup", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create workspace and import materials" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save the new supervisor credentials" }),
  ).toBeVisible();
  expect(
    provisioned?.supervisors.map((person: { name: string }) => person.name),
  ).toEqual(staffNames);
  expect(provisioned?.companyNames).toEqual(names);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace-setup$/);
  await expect(page.getByRole("alert").filter({ hasText: "Download supervisor credentials before leaving" })).toContainText(
    "Download supervisor credentials before leaving",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private credentials CSV" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hac-supervisor-credentials.csv");
  const contents = await readFile((await download.path())!, "utf8");
  expect(contents).toContain("Hac-synthetic-ui-test-only");
  expect(contents).toContain("Keells; Cargills Food City");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "Hac-synthetic-ui-test-only",
  );
  await page
    .getByRole("button", { name: "Clear credentials from this page" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save the new supervisor credentials" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Companies", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit company", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Company / legal name *", { exact: true })
    .fill("Updated company profile");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(patches[0].fields.legalName).toBe("Updated company profile");
  await page.getByRole("tab", { name: "Supervisors", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit supervisor", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Supervisor name *", { exact: true })
    .fill("Yaasir Updated");
  await page
    .getByRole("dialog")
    .getByLabel("New password (optional)", { exact: false })
    .fill("replacement synthetic UI password");
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Assigned company 2 *", exact: true })
    .selectOption(companies[2].id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(patches[1].fields.companyIds).toEqual([
    companies[0].id,
    companies[2].id,
  ]);
  expect(patches[1].fields.password).toBe("replacement synthetic UI password");
  await page.getByRole("tab", { name: "Raw materials", exact: true }).click();
  await page
    .getByRole("button", { name: "Review / edit", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", {
      name: "Full material name and code *",
      exact: true,
    })
    .fill("Reviewed current material name");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(patches[2].fields.name).toBe("Reviewed current material name");
  expect(patches[2].fields).not.toHaveProperty("sourceRow");
  expect(state.materials[0].sourceRow.name).toBe(
    "Original source chicken material",
  );
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test.beforeEach(async ({page})=>{await page.addInitScript(()=>localStorage.setItem("hac-install-dismissed","1"));});
