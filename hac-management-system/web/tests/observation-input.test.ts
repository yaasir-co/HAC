import { describe, expect, it } from "vitest";
import { cleanObservationInput } from "../src/lib/observation-input";
describe("observation transport", () => {
  it("omits empty raw material variant and barcode controls without dropping physical confirmation", () => {
    expect(cleanObservationInput({ productId: "raw-1", variantId: "", observedVariant: "  ", observedBarcode: "", observedBrand: "Prima", identityConfirmed: true, quantity: "0", notes: "  Checked package  " })).toEqual({ productId: "raw-1", observedBrand: "Prima", identityConfirmed: true, quantity: 0, notes: "Checked package" });
  });
  it("retains selected variants and missing identity confirmation for server evaluation", () => {
    expect(cleanObservationInput({ variantId: "v1", identityConfirmed: false, physicalExpiry: "2027-01-01", quantity: "" })).toEqual({ variantId: "v1", identityConfirmed: false, physicalExpiry: "2027-01-01" });
  });
});
