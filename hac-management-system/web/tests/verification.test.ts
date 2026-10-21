import { describe, expect, it } from "vitest";
import {
  evaluateVerification,
  type VerificationInput,
  type VerificationRecords,
  type VerificationScope,
} from "../src/lib/verification";

const at = "2026-10-21T06:00:00.000Z";
const input = (patch: Partial<VerificationInput> = {}): VerificationInput => ({
  productId: "product-1",
  variantId: "variant-1",
  companyId: "retailer-1",
  locationId: "retail-branch-1",
  at,
  identityConfirmed: true,
  ...patch,
});
const scope = (patch: Partial<VerificationScope> = {}): VerificationScope => ({
  id: "scope-1",
  productId: "product-1",
  variantId: "variant-1",
  requiresCompanyRelationship: false,
  certificate: {
    id: "cert-1",
    number: "DEMO-CERT-001",
    holderId: "manufacturer-company",
    issuer: "Fictional HAC demo",
    type: "HAC",
    status: "ACTIVE",
    effectiveAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-31T18:29:59.999Z",
  },
  ...patch,
});
const records = (
  patch: Partial<VerificationRecords> = {},
): VerificationRecords => ({
  product: {
    id: "product-1",
    itemCode: "DEMO-P001",
    name: "Fictional tea",
    status: "ACTIVE",
    brand: { id: "brand-1", name: "Brand A" },
    manufacturer: { id: "maker-1", name: "Maker A" },
    variants: [
      {
        id: "variant-1",
        sku: "TEA-100",
        name: "Black tea 100g",
        barcode: "1234567890123",
      },
      {
        id: "variant-2",
        sku: "TEA-200",
        name: "Black tea 200g",
        barcode: "1234567890124",
      },
    ],
    updatedAt: "2026-10-20T00:00:00Z",
    isDemo: true,
  },
  scopes: [scope()],
  companyItems: [],
  licenses: [],
  restrictions: [],
  ...patch,
});
const verify = (
  observation: Partial<VerificationInput> = {},
  master: Partial<VerificationRecords> = {},
) => evaluateVerification(input(observation), records(master));
const expiredScope = () => {
  const value = scope();
  value.certificate.expiresAt = "2026-10-01T00:00:00Z";
  return value;
};

describe("authoritative HAC verification", () => {
  it("verifies an exact active certificate and product with human confirmation", () => {
    const result = verify({
      observedBrand: "Brand A",
      observedManufacturer: "Maker A",
      observedBarcode: "1234567890123",
    });
    expect(result.outcomes).toEqual(["VERIFIED_APPROVED"]);
    expect(result.certificate?.number).toBe("DEMO-CERT-001");
    expect(result.requiresAction).toBe(false);
    expect(result.warnings.join()).toContain("Fictional");
  });
  it("recognition alone cannot confirm approval", () => {
    const result = verify({ identityConfirmed: false });
    expect(result.outcomes).toContain("IDENTITY_UNCERTAIN");
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("does not equate certificate holder with the inspected retailer", () => {
    expect(verify().outcomes).toEqual(["VERIFIED_APPROVED"]);
    expect(verify().certificate?.holderId).not.toBe(input().companyId);
  });
  it("normalizes benign whitespace and casing in observed names", () => {
    expect(
      verify({ observedBrand: " BRAND   A ", observedManufacturer: "maker a" })
        .outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("detects a different observed brand", () => {
    expect(verify({ observedBrand: "Brand B" }).outcomes).toContain(
      "BRAND_MISMATCH",
    );
  });
  it("detects a different observed manufacturer", () => {
    expect(verify({ observedManufacturer: "Maker B" }).outcomes).toContain(
      "MANUFACTURER_MISMATCH",
    );
  });
  it("detects a foreign variant even when the product name matches", () => {
    expect(verify({ variantId: "foreign-variant" }).outcomes).toContain(
      "PRODUCT_VARIANT_MISMATCH",
    );
  });
  it("does not extend exact SKU coverage to another variant of an approved brand", () => {
    const result = verify({ variantId: "variant-2" });
    expect(result.outcomes).toContain("PRODUCT_VARIANT_MISMATCH");
    expect(result.outcomes).toContain("OUT_OF_CERTIFICATION_SCOPE");
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("requires exact barcode matching", () => {
    expect(verify({ observedBarcode: "9999999999999" }).outcomes).toContain(
      "BARCODE_MISMATCH",
    );
  });
  it("accepts an exact observed SKU", () => {
    expect(verify({ observedVariant: "TEA-100" }).outcomes).toEqual([
      "VERIFIED_APPROVED",
    ]);
  });
  it("detects an observed product variant mismatch", () => {
    expect(verify({ observedVariant: "TEA-200" }).outcomes).toContain(
      "PRODUCT_VARIANT_MISMATCH",
    );
  });
  it("distinguishes expired HAC certificate from physical shelf-life", () => {
    const result = verify({}, { scopes: [expiredScope()] });
    expect(result.outcomes).toEqual(["CERTIFICATE_EXPIRED"]);
    expect(result.outcomes).not.toContain("PHYSICAL_PRODUCT_EXPIRED");
  });
  it("distinguishes expired physical product from a valid certificate", () => {
    const result = verify({ physicalExpiry: "2026-10-20" });
    expect(result.outcomes).toEqual(["PHYSICAL_PRODUCT_EXPIRED"]);
    expect(result.outcomes).not.toContain("CERTIFICATE_EXPIRED");
  });
  it("treats physical date-only expiry as the end of the business day in Colombo", () => {
    expect(
      verify({ physicalExpiry: "2026-10-21", at: "2026-10-21T18:29:59.998Z" })
        .outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
    expect(
      verify({ physicalExpiry: "2026-10-21", at: "2026-10-21T18:30:00.000Z" })
        .outcomes,
    ).toContain("PHYSICAL_PRODUCT_EXPIRED");
  });
  it("uses the inspection timestamp rather than today for certificate expiry", () => {
    expect(
      verify({ at: "2026-09-01T00:00:00Z" }, { scopes: [expiredScope()] })
        .outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("keeps simultaneous brand, manufacturer, certificate, and physical expiry issues", () => {
    const result = verify(
      {
        observedBrand: "Brand B",
        observedManufacturer: "Maker B",
        physicalExpiry: "2026-10-01",
      },
      { scopes: [expiredScope()] },
    );
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        "BRAND_MISMATCH",
        "MANUFACTURER_MISMATCH",
        "CERTIFICATE_EXPIRED",
        "PHYSICAL_PRODUCT_EXPIRED",
      ]),
    );
  });
  it("selects a valid replacement rather than an expired prior certificate", () => {
    const replacement = scope({ id: "scope-renewal" });
    replacement.certificate = {
      ...replacement.certificate,
      id: "cert-renewal",
      number: "DEMO-RENEWAL",
      supersedesId: "cert-1",
      effectiveAt: "2026-10-15T00:00:00Z",
    };
    const result = verify({}, { scopes: [expiredScope(), replacement] });
    expect(result.outcomes).toEqual(["VERIFIED_APPROVED"]);
    expect(result.certificate?.number).toBe("DEMO-RENEWAL");
  });
  it("does not apply a renewal before its effective timestamp", () => {
    const replacement = scope({ id: "scope-renewal" });
    replacement.certificate = {
      ...replacement.certificate,
      id: "cert-renewal",
      number: "DEMO-RENEWAL",
      supersedesId: "cert-1",
      effectiveAt: "2026-11-01T00:00:00Z",
    };
    const result = verify({}, { scopes: [expiredScope(), replacement] });
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
    expect(result.outcomes).toContain("CERTIFICATE_EXPIRED");
    expect(result.outcomes).toContain("APPROVAL_PENDING");
  });
  it.each(["SUSPENDED", "REVOKED"])(
    "reports %s certification independently of physical product expiry",
    (status) => {
      const value = scope();
      value.certificate.status = status;
      expect(verify({}, { scopes: [value] }).outcomes).toContain(
        `CERTIFICATE_${status}`,
      );
    },
  );
  it("evaluates historical certificate status from effective history entries", () => {
    const value = scope();
    value.certificate.status = "SUSPENDED";
    value.certificate.history = [
      { status: "ACTIVE", effectiveAt: "2026-01-01T00:00:00Z" },
      { status: "SUSPENDED", effectiveAt: "2026-10-22T00:00:00Z" },
    ];
    expect(verify({}, { scopes: [value] }).outcomes).toEqual([
      "VERIFIED_APPROVED",
    ]);
    expect(
      verify({ at: "2026-10-23T00:00:00Z" }, { scopes: [value] }).outcomes,
    ).toContain("CERTIFICATE_SUSPENDED");
  });
  it("requires review when a historical status cannot be established", () => {
    const value = scope();
    value.certificate.status = "SUSPENDED";
    value.certificate.history = [
      { status: "SUSPENDED", effectiveAt: "2026-10-22T00:00:00Z" },
    ];
    expect(verify({}, { scopes: [value] }).outcomes).toContain(
      "MANUAL_HAC_REVIEW_REQUIRED",
    );
  });
  it("requires a company relationship only where the recorded scope explicitly requires it", () => {
    expect(
      verify({}, { scopes: [scope({ requiresCompanyRelationship: true })] })
        .outcomes,
    ).toContain("COMPANY_RELATIONSHIP_NOT_VERIFIED");
    expect(
      verify(
        {},
        {
          scopes: [scope({ requiresCompanyRelationship: true })],
          companyItems: [
            {
              id: "relation",
              productId: "product-1",
              companyId: "retailer-1",
              status: "ACTIVE",
            },
          ],
        },
      ).outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("does not accept an expired or inactive company relationship", () => {
    expect(
      verify(
        {},
        {
          scopes: [scope({ requiresCompanyRelationship: true })],
          companyItems: [
            {
              id: "relation",
              productId: "product-1",
              companyId: "retailer-1",
              status: "ACTIVE",
              expiresAt: "2026-10-01T00:00:00Z",
            },
          ],
        },
      ).outcomes,
    ).toContain("COMPANY_RELATIONSHIP_NOT_VERIFIED");
  });
  it("does not mistake a retail location for a certified manufacturing facility", () => {
    expect(
      verify({}, { scopes: [scope({ facilityId: "manufacturing-facility" })] })
        .outcomes,
    ).toContain("INSUFFICIENT_INFORMATION");
    expect(
      verify(
        { manufacturingFacilityId: "manufacturing-facility" },
        { scopes: [scope({ facilityId: "manufacturing-facility" })] },
      ).outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("detects an out-of-scope manufacturing facility", () => {
    expect(
      verify(
        { manufacturingFacilityId: "wrong-facility" },
        { scopes: [scope({ facilityId: "manufacturing-facility" })] },
      ).outcomes,
    ).toContain("OUT_OF_CERTIFICATION_SCOPE");
  });
  it("requires review for an expired manufacturer license without mislabelling the HAC certificate", () => {
    const result = verify(
      {},
      {
        licenses: [
          {
            id: "license",
            manufacturerId: "maker-1",
            name: "Manufacturing license",
            number: "DEMO-L1",
            expiresAt: "2026-10-01T00:00:00Z",
          },
        ],
      },
    );
    expect(result.outcomes).toContain("REQUIRED_LICENSE_EXPIRED");
    expect(result.outcomes).not.toContain("CERTIFICATE_EXPIRED");
    expect(
      result.rules.find((rule) => rule.rule === "license.validity")?.sourceType,
    ).toBe("License");
  });
  it("does not evaluate optional licenses or unrelated manufacturer licenses", () => {
    expect(
      verify(
        {},
        {
          licenses: [
            {
              id: "license",
              manufacturerId: "maker-1",
              name: "Optional",
              number: "DEMO-L1",
              required: false,
              expiresAt: "2026-10-01T00:00:00Z",
            },
            {
              id: "unrelated",
              manufacturerId: "other",
              name: "Unrelated",
              number: "DEMO-L2",
              expiresAt: "2026-10-01T00:00:00Z",
            },
          ],
        },
      ).outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("only confirms restrictions from an explicit effective matching authority record", () => {
    const result = verify(
      {},
      {
        restrictions: [
          {
            id: "restriction",
            productId: "product-1",
            authority: "DEMO authority",
            reference: "DEMO-R1",
            reason: "Fictional restriction for testing",
            status: "ACTIVE",
            effectiveAt: "2026-10-01T00:00:00Z",
          },
        ],
      },
    );
    expect(result.outcomes).toContain("EXPLICITLY_RESTRICTED");
    expect(result.restrictions[0].reference).toBe("DEMO-R1");
  });
  it("does not call an unconfirmed candidate a confirmed banned product", () => {
    const result = verify(
      { identityConfirmed: false },
      {
        restrictions: [
          {
            id: "restriction",
            productId: "product-1",
            authority: "DEMO authority",
            reference: "DEMO-R1",
            reason: "Fictional restriction",
            status: "ACTIVE",
            effectiveAt: "2026-10-01T00:00:00Z",
          },
        ],
      },
    );
    expect(result.outcomes).not.toContain("EXPLICITLY_RESTRICTED");
    expect(result.outcomes).toContain("MANUAL_HAC_REVIEW_REQUIRED");
  });
  it("ignores unrelated, future, withdrawn, and ended restrictions", () => {
    const restriction = {
      id: "restriction",
      productId: "product-1",
      authority: "Demo",
      reference: "DEMO-R1",
      reason: "Test",
      status: "ACTIVE",
      effectiveAt: "2026-10-01T00:00:00Z",
    };
    expect(
      verify(
        {},
        {
          restrictions: [
            { ...restriction, productId: "other" },
            { ...restriction, effectiveAt: "2026-11-01T00:00:00Z" },
            { ...restriction, status: "WITHDRAWN" },
            { ...restriction, expiresAt: "2026-10-20T00:00:00Z" },
          ],
        },
      ).outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("unknown products never become approved or banned automatically", () => {
    const result = verify(
      { productId: null, variantId: null },
      { product: null, scopes: [] },
    );
    expect(result.outcomes).toEqual(["APPROVAL_NOT_FOUND"]);
    expect(result.certificate).toBeNull();
  });
  it("does not treat a non-HAC license as an HAC certificate", () => {
    const value = scope();
    value.certificate.type = "COMMERCIAL_LICENSE";
    expect(verify({}, { scopes: [value] }).outcomes).toContain(
      "APPROVAL_NOT_FOUND",
    );
  });
  it("does not approve a provisional master product with an accidental scope link", () => {
    const value = records();
    value.product!.status = "PROVISIONAL";
    expect(evaluateVerification(input(), value).outcomes).toContain(
      "APPROVAL_PENDING",
    );
    expect(evaluateVerification(input(), value).outcomes).not.toContain(
      "VERIFIED_APPROVED",
    );
  });
  it("prevents catalogue edits from silently expanding captured approved brand and manufacturer scope", () => {
    const result = verify(
      {},
      {
        scopes: [
          scope({
            brandName: "Original approved brand",
            manufacturerName: "Original approved maker",
          }),
        ],
      },
    );
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        "BRAND_MISMATCH",
        "MANUFACTURER_MISMATCH",
        "OUT_OF_CERTIFICATION_SCOPE",
      ]),
    );
  });
  it("includes rule version, timestamp, actual, expected, and source references for explainability", () => {
    const result = verify({ observedBrand: "Brand B" });
    expect(result.evaluatedAt).toBe(at);
    expect(result.ruleVersion).toBe("hac-verification/1.1.0");
    expect(result.masterDataVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      result.rules.find((rule) => rule.rule === "identity.brand"),
    ).toMatchObject({
      actual: "Brand B",
      expected: "Brand A",
      sourceId: "product-1",
      result: "FAIL",
      effectiveAt: at,
    });
  });
  it("fingerprints changes to certificate, license, restriction, and relationship source records", () => {
    const initial = verify().masterDataVersion;
    const value = scope();
    value.certificate.expiresAt = "2027-01-01T00:00:00Z";
    expect(verify({}, { scopes: [value] }).masterDataVersion).not.toBe(initial);
    expect(
      verify(
        {},
        {
          companyItems: [
            {
              id: "relationship",
              productId: "product-1",
              companyId: "retailer-1",
            },
          ],
        },
      ).masterDataVersion,
    ).not.toBe(initial);
    expect(verify({ at: "2026-10-22T00:00:00Z" }).masterDataVersion).toBe(
      initial,
    );
  });
  it("derives expired status from its actual date for earlier inspections", () => {
    const value = expiredScope();
    value.certificate.status = "EXPIRED";
    expect(
      verify({ at: "2026-09-01T00:00:00Z" }, { scopes: [value] }).outcomes,
    ).toEqual(["VERIFIED_APPROVED"]);
  });
  it("rejects nonexistent physical expiry calendar dates rather than rolling them forward", () => {
    expect(() => verify({ physicalExpiry: "2026-02-30" })).toThrow(
      "Invalid verification date",
    );
  });
  it("rejects invalid timestamps instead of producing an approval result", () => {
    expect(() => verify({ at: "invalid" })).toThrow(
      "Invalid verification date",
    );
  });
});
