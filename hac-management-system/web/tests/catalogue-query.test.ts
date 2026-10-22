import { it, expect, vi } from "vitest";
vi.mock("../src/lib/db", () => ({ db: {} }));
import { catalogueWhere } from "../src/lib/catalogue-query";
it("binds search text and company identifiers instead of interpolating SQL", () => {
  const hostile = "%' OR 1=1 --",
    condition = catalogueWhere({
      q: hostile,
      companyIds: ["company-safe"],
      status: "ACTIVE",
    });
  expect(condition.sql).not.toContain(hostile);
  expect(condition.values).toContain(hostile);
  expect(condition.values).toContain("company-safe");
  expect(condition.sql).not.toContain("JSON");
  expect(catalogueWhere({ companyIds: [] }).sql).toContain("1=0");
});
