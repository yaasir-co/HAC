import { it, expect } from "vitest";
import { observationIdentity } from "../src/lib/observation-identity";
it("deduplicates product identity across variants, and manual names despite whitespace/case", () => {
  expect(observationIdentity("product-a")).toBe(
    observationIdentity("product-a"),
  );
  expect(observationIdentity("product-a")).not.toBe(
    observationIdentity("product-b"),
  );
  expect(observationIdentity(null, "  Fresh   Milk ", "PRODUCT", "BRAND")).toBe(
    observationIdentity(null, "fresh milk", "PRODUCT", "brand"),
  );
  expect(observationIdentity(null, "fresh milk", "PRODUCT", "brand")).toBe(
    observationIdentity(null, "fresh milk", "RAW_MATERIAL", "brand"),
  );
  expect(observationIdentity(null, "fresh milk", "PRODUCT", "brand")).not.toBe(
    observationIdentity(null, "fresh milk", "PRODUCT", "other"),
  );
});
