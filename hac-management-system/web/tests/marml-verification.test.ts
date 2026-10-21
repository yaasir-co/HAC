import { describe, expect, it } from "vitest";
import {
  evaluateVerification,
  type VerificationInput,
  type VerificationMarmlListing,
  type VerificationRecords,
} from "../src/lib/verification";
import { MARML_MATERIALS, MARML_SOURCE } from "../src/data/marml-materials";

const listing: VerificationMarmlListing = {
  id: "listing-29", sourceCompanyId: "ceylon-agro",
  sourceCompanyName: MARML_SOURCE.companyName,
  sourceCompany: { legalName: "Ceylon Agro Industries" },
  sourceDocument: MARML_SOURCE.title, sourcePage: 2, rowNumber: 29,
  certificateBody: "MUIS", certificateExpiry: "2026-12-31T18:29:59.999Z",
  reviewStatus: "SOURCE_LISTED_REQUIRES_REVIEW", version: 1,
};
const input: VerificationInput = {
  productId: "material-29", companyId: "ceylon-agro",
  at: "2026-10-21T12:00:00Z", identityConfirmed: true,
};
function records(patch: Partial<VerificationMarmlListing> = {}): VerificationRecords {
  return {
    product: {
      id: "material-29", itemCode: "MARML-PSA0135-029", name: "Apple Flavour 1101909925",
      status: "ACTIVE", brand: { id: "brand", name: "Not stated in source" },
      manufacturer: { id: "maker", name: "Silesia" }, variants: [],
      rawMaterialListing: { ...listing, ...patch },
    }, scopes: [], companyItems: [], licenses: [], restrictions: [],
  };
}
describe("company-scoped MARML verification", () => {
  it("imports only the 39 supplied rows and preserves printed certificate dates", () => {
    expect(MARML_MATERIALS.map((row) => row.rowNumber)).toEqual(Array.from({ length: 39 }, (_, index) => index + 1));
    expect(MARML_SOURCE.suppliedPages).toEqual([1, 2, 3]);
    expect(MARML_SOURCE.declaredPageCount).toBe(31);
    expect(MARML_MATERIALS.find((row) => row.rowNumber === 29)?.certificateExpiry).toBe("2026-12-31");
    expect(MARML_MATERIALS.find((row) => row.rowNumber === 37)?.certificateExpiry).toBe("2026-06-23");
    expect(MARML_MATERIALS.filter((row) => row.certificateExpiry && row.certificateExpiry >= "2026-10-21")).toHaveLength(1);
  });
  it("treats an imported list as a reviewable source without inventing a certificate", () => {
    const result = evaluateVerification(input, records());
    expect(result.outcomes).toContain("MARML_REVIEW_REQUIRED");
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
    expect(result.certificate).toBeNull();
    expect(result.approvalBasis).toBeNull();
    expect(result.rules.find((rule) => rule.rule === "marml.company-scope")?.sourceId).toBe(listing.id);
  });
  it("accepts an admin-verified unexpired source only for its named company", () => {
    const master = records({ reviewStatus: "VERIFIED" });
    const approved = evaluateVerification(input, master);
    expect(approved.outcomes).toEqual(["VERIFIED_APPROVED"]);
    expect(approved.approvalBasis).toBe("ADMIN_VERIFIED_MARML");
    expect(approved.certificate).toBeNull();
    const other = evaluateVerification({ ...input, companyId: "keells" }, master);
    expect(other.outcomes).toContain("OUT_OF_MARML_SCOPE");
    expect(other.outcomes).not.toContain("VERIFIED_APPROVED");
    expect(other.approvalBasis).toBeNull();
  });
  it("keeps source expiry, company scope and physical expiry as simultaneous findings", () => {
    const result = evaluateVerification({ ...input, companyId: "keells", physicalExpiry: "2026-10-01" }, records({ certificateExpiry: "2025-12-31", reviewStatus: "VERIFIED" }));
    expect(result.outcomes).toEqual(expect.arrayContaining(["MARML_CERTIFICATE_EXPIRED", "OUT_OF_MARML_SCOPE", "PHYSICAL_PRODUCT_EXPIRED"]));
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("does not expand the source scope by renaming the company profile", () => {
    const result = evaluateVerification(input, records({ reviewStatus: "VERIFIED", sourceCompany: { legalName: "Another Retailer" } }));
    expect(result.outcomes).toContain("OUT_OF_MARML_SCOPE");
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("keeps a printed expiry valid through the end of its Sri Lankan calendar day", () => {
    const master = records({ reviewStatus: "VERIFIED" });
    expect(evaluateVerification({ ...input, at: "2026-12-31T18:29:59.999Z" }, master).outcomes).toEqual(["VERIFIED_APPROVED"]);
    expect(evaluateVerification({ ...input, at: "2026-12-31T18:30:00Z" }, master).outcomes).toContain("MARML_CERTIFICATE_EXPIRED");
  });
  it.each(["SUSPENDED", "REVOKED"])("blocks a %s source even when its date is unexpired", (status) => {
    const result = evaluateVerification(input, records({ reviewStatus: status }));
    expect(result.outcomes).toContain(`MARML_${status}`);
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("requires a certificate date and human confirmation independently of administrator review", () => {
    expect(evaluateVerification(input, records({ reviewStatus: "VERIFIED", certificateExpiry: null })).outcomes).toContain("MARML_REVIEW_REQUIRED");
    const result = evaluateVerification({ ...input, identityConfirmed: false }, records({ reviewStatus: "VERIFIED" }));
    expect(result.outcomes).toContain("IDENTITY_UNCERTAIN");
    expect(result.outcomes).toContain("APPROVED_REQUIRES_PHYSICAL_CONFIRMATION");
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("does not let a reviewed MARML hide a physical brand mismatch", () => {
    const result = evaluateVerification({ ...input, observedBrand: "Different physical brand" }, records({ reviewStatus: "VERIFIED" }));
    expect(result.outcomes).toContain("BRAND_MISMATCH");
    expect(result.outcomes).not.toContain("VERIFIED_APPROVED");
  });
  it("uses an independently valid certificate renewal over an old MARML reference", () => {
    const master = records({ certificateExpiry: "2025-12-31" });
    master.scopes = [{
      id: "scope", productId: input.productId!, requiresCompanyRelationship: false,
      certificate: { id: "renewal", number: "TEST-CURRENT", holderId: "maker-company", issuer: "Test authority", type: "HAC", status: "ACTIVE", effectiveAt: "2026-01-01", expiresAt: "2027-01-01" },
    }];
    const result = evaluateVerification(input, master);
    expect(result.outcomes).toEqual(["VERIFIED_APPROVED"]);
    expect(result.approvalBasis).toBe("CERTIFICATE");
    expect(result.certificate?.id).toBe("renewal");
    expect(result.warnings.join(" ")).toContain("MARML reference");
  });
  it("changes the authoritative version when an administrator edits the MARML", () => {
    const before = evaluateVerification(input, records());
    const after = evaluateVerification(input, records({ reviewStatus: "VERIFIED", version: 2 }));
    expect(after.masterDataVersion).not.toBe(before.masterDataVersion);
  });
});
