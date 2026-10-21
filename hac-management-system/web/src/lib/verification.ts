/** Authoritative HAC verification. Image recognition never participates in approval decisions. */
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export const VERIFICATION_RULE_VERSION = "hac-verification/1.0.0";

export interface VerificationInput {
  productId?: string | null;
  variantId?: string | null;
  companyId: string;
  locationId?: string | null;
  manufacturingFacilityId?: string | null;
  at?: Date | string;
  observedBrand?: string | null;
  observedManufacturer?: string | null;
  observedBarcode?: string | null;
  observedVariant?: string | null;
  physicalExpiry?: Date | string | null;
  identityConfirmed: boolean;
}

type DateValue = Date | string;
export interface VerificationProduct {
  id: string;
  itemCode: string;
  name: string;
  status: string;
  brand: { id: string; name: string };
  manufacturer: { id: string; name: string };
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
  }>;
  updatedAt?: DateValue;
  isDemo?: boolean;
}
export interface VerificationCertificate {
  id: string;
  number: string;
  holderId: string;
  issuer: string;
  type: string;
  status: string;
  issuedAt?: DateValue;
  effectiveAt: DateValue;
  expiresAt: DateValue;
  supersedesId?: string | null;
  updatedAt?: DateValue;
  history?: Array<{ status: string; effectiveAt: DateValue }>;
}
export interface VerificationScope {
  id: string;
  productId: string;
  variantId?: string | null;
  facilityId?: string | null;
  brandName?: string | null;
  manufacturerName?: string | null;
  requiresCompanyRelationship: boolean;
  certificate: VerificationCertificate;
}
export interface VerificationRecords {
  product: VerificationProduct | null;
  scopes: VerificationScope[];
  companyItems: Array<{
    id: string;
    companyId: string;
    productId: string;
    status?: string;
    effectiveAt?: DateValue | null;
    expiresAt?: DateValue | null;
  }>;
  licenses: Array<{
    id: string;
    name: string;
    number: string;
    companyId?: string | null;
    manufacturerId?: string | null;
    status?: string;
    required?: boolean;
    expiresAt: DateValue;
    effectiveAt?: DateValue | null;
  }>;
  restrictions: Array<{
    id: string;
    productId?: string | null;
    manufacturerId?: string | null;
    authority: string;
    reference: string;
    reason: string;
    status: string;
    effectiveAt: DateValue;
    expiresAt?: DateValue | null;
  }>;
  masterDataVersion?: string;
}

export const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED_APPROVED: "HAC Approved — Verified",
  APPROVED_REQUIRES_PHYSICAL_CONFIRMATION:
    "Approved but Requires Physical Confirmation",
  APPROVAL_NOT_FOUND: "Unknown Product — HAC Approval Not Verified",
  BRAND_MISMATCH: "Brand Mismatch — Review Required",
  PRODUCT_VARIANT_MISMATCH: "Product Variant Not Covered by Approval",
  MANUFACTURER_MISMATCH: "Manufacturer Mismatch — Review Required",
  BARCODE_MISMATCH: "Barcode Mismatch — Review Required",
  COMPANY_RELATIONSHIP_NOT_VERIFIED: "Company Relationship Not Verified",
  CERTIFICATE_EXPIRED: "HAC Certificate Expired",
  CERTIFICATE_SUSPENDED: "HAC Certificate Suspended",
  CERTIFICATE_REVOKED: "HAC Certificate Revoked",
  REQUIRED_LICENSE_EXPIRED: "Required License Expired — Review Required",
  PHYSICAL_PRODUCT_EXPIRED: "Physical Product Expired",
  EXPLICITLY_RESTRICTED: "Confirmed Restricted/Banned Item",
  APPROVAL_PENDING: "Approval Pending",
  OUT_OF_CERTIFICATION_SCOPE: "Out of Certification Scope",
  IDENTITY_UNCERTAIN: "Identity Not Confirmed",
  INSUFFICIENT_INFORMATION: "Insufficient Information",
  MANUAL_HAC_REVIEW_REQUIRED: "Manual HAC Review Required",
};

export interface VerificationRule {
  rule: string;
  actual: string | null;
  expected: string | null;
  sourceType: string;
  sourceId: string | null;
  certificateId: string | null;
  effectiveAt: string;
  result: "PASS" | "FAIL" | "REVIEW";
  reason: string;
}
export interface VerificationResult {
  outcomes: string[];
  primaryStatus: string;
  label: string;
  labels: string[];
  rules: VerificationRule[];
  certificate:
    | (Omit<
        VerificationCertificate,
        "effectiveAt" | "expiresAt" | "issuedAt" | "updatedAt"
      > & { effectiveAt: string; expiresAt: string; issuedAt?: string })
    | null;
  product: {
    id: string;
    itemCode: string;
    name: string;
    brand: string;
    manufacturer: string;
    variant: string | null;
    isDemo: boolean;
  } | null;
  evaluatedAt: string;
  ruleVersion: string;
  masterDataVersion: string;
  requiresAction: boolean;
  warnings: string[];
  restrictions: VerificationRecords["restrictions"];
}

const normalize = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const date = (value: DateValue): Date => {
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime()))
    throw new Error("Invalid verification date");
  return result;
};
const iso = (value: DateValue) => date(value).toISOString();
export function physicalExpiryInstant(value: DateValue): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)
      throw new Error("Invalid verification date");
    return date(`${value}T23:59:59.999+05:30`);
  }
  return date(value);
}
const isActive = (status?: string) =>
  !status || ["ACTIVE", "APPROVED", "VALID"].includes(status.toUpperCase());
const priorities = [
  "EXPLICITLY_RESTRICTED",
  "CERTIFICATE_REVOKED",
  "CERTIFICATE_SUSPENDED",
  "PHYSICAL_PRODUCT_EXPIRED",
  "CERTIFICATE_EXPIRED",
  "REQUIRED_LICENSE_EXPIRED",
  "BRAND_MISMATCH",
  "MANUFACTURER_MISMATCH",
  "PRODUCT_VARIANT_MISMATCH",
  "BARCODE_MISMATCH",
  "COMPANY_RELATIONSHIP_NOT_VERIFIED",
  "OUT_OF_CERTIFICATION_SCOPE",
  "APPROVAL_PENDING",
  "IDENTITY_UNCERTAIN",
  "APPROVAL_NOT_FOUND",
  "INSUFFICIENT_INFORMATION",
  "MANUAL_HAC_REVIEW_REQUIRED",
  "APPROVED_REQUIRES_PHYSICAL_CONFIRMATION",
  "VERIFIED_APPROVED",
];

/** Pure, deterministic with `input.at`; retains all simultaneous issues and source references. */
export function evaluateVerification(
  input: VerificationInput,
  records: VerificationRecords,
): VerificationResult {
  const evaluatedAt = date(input.at ?? new Date());
  const timestamp = evaluatedAt.getTime();
  const outcomes = new Set<string>();
  const rules: VerificationRule[] = [];
  const warnings: string[] = [];
  const product = records.product;
  const variant =
    product?.variants.find((v) => v.id === input.variantId) ?? null;
  const addRule = (
    rule: string,
    result: VerificationRule["result"],
    reason: string,
    sourceType = "Product",
    sourceId: string | null = product?.id ?? null,
    actual: string | null = null,
    expected: string | null = null,
    certificateId: string | null = null,
  ) => {
    rules.push({
      rule,
      result,
      reason,
      sourceType,
      sourceId,
      actual,
      expected,
      certificateId,
      effectiveAt: evaluatedAt.toISOString(),
    });
  };
  const add = (outcome: string) => outcomes.add(outcome);
  let selectedScope: VerificationScope | undefined;
  let selectedStatus: string | undefined;
  const applicableRestrictions: VerificationRecords["restrictions"] = [];

  if (!input.companyId) {
    add("INSUFFICIENT_INFORMATION");
    addRule(
      "inspection.company",
      "FAIL",
      "An inspected company is required.",
      "Company",
      null,
    );
  }
  if (!input.identityConfirmed) {
    add("IDENTITY_UNCERTAIN");
    addRule(
      "identity.human-confirmation",
      "REVIEW",
      "A person must confirm physical product identity; recognition scores cannot confirm HAC approval.",
      "Observation",
      null,
      "unconfirmed",
      "confirmed",
    );
  } else {
    addRule(
      "identity.human-confirmation",
      "PASS",
      "The inspector confirmed the physical identity.",
      "Observation",
      null,
      "confirmed",
      "confirmed",
    );
  }

  if (!product || !input.productId || product.id !== input.productId) {
    add("APPROVAL_NOT_FOUND");
    addRule(
      "identity.catalogue",
      "REVIEW",
      "No matching central HAC product record was provided. Missing records do not establish prohibition.",
      "Product",
      input.productId ?? null,
    );
  } else {
    addRule(
      "identity.catalogue",
      "PASS",
      "Product identity references a central catalogue record.",
    );
    if (product.isDemo)
      warnings.push(
        "Fictional demonstration records. This result is not an official HAC approval claim.",
      );
    if (
      ["DRAFT", "PROVISIONAL", "PENDING", "PENDING_REVIEW"].includes(
        product.status.toUpperCase(),
      )
    ) {
      add("APPROVAL_PENDING");
      addRule(
        "approval.product-status",
        "REVIEW",
        "The product is awaiting an authorized HAC decision.",
        "Product",
        product.id,
        product.status,
        "ACTIVE",
      );
    } else if (!isActive(product.status)) {
      add("MANUAL_HAC_REVIEW_REQUIRED");
      addRule(
        "approval.product-status",
        "REVIEW",
        "The central product is not active; an authorized HAC review is required.",
        "Product",
        product.id,
        product.status,
        "ACTIVE",
      );
    }

    for (const [field, observed, expected, code] of [
      ["brand", input.observedBrand, product.brand.name, "BRAND_MISMATCH"],
      [
        "manufacturer",
        input.observedManufacturer,
        product.manufacturer.name,
        "MANUFACTURER_MISMATCH",
      ],
    ] as const) {
      if (observed?.trim()) {
        const matches = normalize(observed) === normalize(expected);
        if (!matches) add(code);
        addRule(
          `identity.${field}`,
          matches ? "PASS" : "FAIL",
          matches
            ? `Observed ${field} matches the catalogue.`
            : `Observed ${field} differs from the authoritative catalogue. The master record has not been changed.`,
          "Product",
          product.id,
          observed,
          expected,
        );
      }
    }
    if (input.variantId && !variant) {
      add("PRODUCT_VARIANT_MISMATCH");
      addRule(
        "identity.variant",
        "FAIL",
        "The selected variant does not belong to this product.",
        "ProductVariant",
        input.variantId,
        input.variantId,
        product.variants.map((v) => v.id).join(", "),
      );
    }
    if (input.observedVariant?.trim()) {
      const expected = variant
        ? [variant.name, variant.sku]
        : product.variants.flatMap((v) => [v.name, v.sku]);
      const matches = expected.some(
        (value) => normalize(value) === normalize(input.observedVariant!),
      );
      if (!matches) add("PRODUCT_VARIANT_MISMATCH");
      addRule(
        "identity.variant-label",
        matches ? "PASS" : "FAIL",
        matches
          ? "Observed variant matches the selected catalogue scope."
          : "The observed SKU or variant is not covered by the selected product identity.",
        "ProductVariant",
        variant?.id ?? null,
        input.observedVariant,
        expected.join(" / "),
      );
    }
    if (input.observedBarcode?.trim()) {
      const expected = variant
        ? [variant.barcode].filter((v): v is string => !!v)
        : product.variants
            .map((v) => v.barcode)
            .filter((v): v is string => !!v);
      const matches = expected.includes(input.observedBarcode.trim());
      if (!matches) add("BARCODE_MISMATCH");
      addRule(
        "identity.barcode",
        matches ? "PASS" : "FAIL",
        matches
          ? "The observed barcode exactly matches the selected product."
          : "The observed barcode does not identify this product or selected variant.",
        "ProductVariant",
        variant?.id ?? null,
        input.observedBarcode,
        expected.join(", ") || "No barcode recorded",
      );
    }

    const productScopes = records.scopes.filter(
      (s) =>
        s.productId === product.id &&
        ["HAC", "HAC_CERTIFICATE", "HALAL"].includes(
          s.certificate.type.toUpperCase(),
        ),
    );
    const variantScopes = productScopes.filter(
      (s) => !s.variantId || (!!variant && s.variantId === variant.id),
    );
    if (productScopes.length && !variantScopes.length) {
      add("OUT_OF_CERTIFICATION_SCOPE");
      add("PRODUCT_VARIANT_MISMATCH");
      addRule(
        "approval.variant-scope",
        "FAIL",
        "HAC records cover different exact SKU variants; brand or product name alone does not extend approval.",
        "CertificateScope",
        productScopes[0].id,
        variant?.id ?? null,
        productScopes.map((s) => s.variantId).join(", "),
        productScopes[0].certificate.id,
      );
    }
    if (!productScopes.length) {
      add("APPROVAL_NOT_FOUND");
      addRule(
        "approval.scope",
        "REVIEW",
        "No authoritative HAC certificate scope covers the product. This is not a restriction decision.",
      );
    }

    const companyRelationship = records.companyItems.find(
      (relation) =>
        relation.companyId === input.companyId &&
        relation.productId === product.id &&
        isActive(relation.status) &&
        (!relation.effectiveAt ||
          date(relation.effectiveAt).getTime() <= timestamp) &&
        (!relation.expiresAt ||
          date(relation.expiresAt).getTime() >= timestamp),
    );
    const statusOf = (scope: VerificationScope): string => {
      const cert = scope.certificate;
      if (date(cert.effectiveAt).getTime() > timestamp) return "PENDING";
      const history = [...(cert.history ?? [])]
        .filter((entry) => date(entry.effectiveAt).getTime() <= timestamp)
        .sort(
          (a, b) =>
            date(b.effectiveAt).getTime() - date(a.effectiveAt).getTime(),
        );
      const historicalStatus =
        history[0]?.status ??
        ((cert.history?.length ?? 0)
          ? "HISTORICAL_STATUS_UNKNOWN"
          : cert.status);
      if (
        [
          "REVOKED",
          "SUSPENDED",
          "PENDING",
          "DRAFT",
          "SUPERSEDED",
          "ARCHIVED",
          "HISTORICAL_STATUS_UNKNOWN",
        ].includes(historicalStatus.toUpperCase())
      )
        return historicalStatus.toUpperCase();
      if (date(cert.expiresAt).getTime() < timestamp) return "EXPIRED";
      if (
        !isActive(historicalStatus) &&
        historicalStatus.toUpperCase() !== "EXPIRED"
      )
        return historicalStatus.toUpperCase();
      return "VALID";
    };
    const scopeReady = (scope: VerificationScope) =>
      (!scope.requiresCompanyRelationship || !!companyRelationship) &&
      (!scope.facilityId ||
        scope.facilityId === input.manufacturingFacilityId) &&
      (!scope.brandName ||
        normalize(scope.brandName) === normalize(product.brand.name)) &&
      (!scope.manufacturerName ||
        normalize(scope.manufacturerName) ===
          normalize(product.manufacturer.name));
    // Prefer a currently valid and fully applicable renewal over expired or replaced records.
    const sorted = [...variantScopes].sort((a, b) => {
      const rank = (scope: VerificationScope) =>
        (statusOf(scope) === "VALID" ? 100 : 0) +
        (scopeReady(scope) ? 20 : 0) +
        (scope.variantId ? 2 : 0) -
        (date(scope.certificate.effectiveAt).getTime() > timestamp ? 30 : 0);
      return (
        rank(b) - rank(a) ||
        date(b.certificate.effectiveAt).getTime() -
          date(a.certificate.effectiveAt).getTime()
      );
    });
    selectedScope = sorted[0];
    if (selectedScope) {
      const cert = selectedScope.certificate;
      const status = statusOf(selectedScope);
      selectedStatus = status;
      const code: Record<string, string> = {
        EXPIRED: "CERTIFICATE_EXPIRED",
        SUSPENDED: "CERTIFICATE_SUSPENDED",
        REVOKED: "CERTIFICATE_REVOKED",
        PENDING: "APPROVAL_PENDING",
        DRAFT: "APPROVAL_PENDING",
      };
      if (status !== "VALID") add(code[status] ?? "MANUAL_HAC_REVIEW_REQUIRED");
      const futureRenewal = variantScopes.find(
        (candidate) =>
          candidate.certificate.supersedesId === cert.id &&
          date(candidate.certificate.effectiveAt).getTime() > timestamp,
      );
      if (status !== "VALID" && futureRenewal) {
        add("APPROVAL_PENDING");
        addRule(
          "certificate.renewal-pending",
          "REVIEW",
          "A recorded replacement is not effective yet and cannot extend the expired or inactive approval.",
          "Certificate",
          futureRenewal.certificate.id,
          iso(futureRenewal.certificate.effectiveAt),
          evaluatedAt.toISOString(),
          futureRenewal.certificate.id,
        );
      }
      addRule(
        "certificate.validity",
        status === "VALID" ? "PASS" : "FAIL",
        status === "VALID"
          ? "The HAC certificate is effective and valid at the inspection timestamp."
          : `The applicable HAC certificate is ${status.toLowerCase()} at the inspection timestamp.`,
        "Certificate",
        cert.id,
        `${status}; expires ${iso(cert.expiresAt)}`,
        `Effective by ${evaluatedAt.toISOString()} and unexpired, active approval`,
        cert.id,
      );
      for (const [scopeField, actual, expected, code] of [
        [
          "brand",
          product.brand.name,
          selectedScope.brandName,
          "BRAND_MISMATCH",
        ],
        [
          "manufacturer",
          product.manufacturer.name,
          selectedScope.manufacturerName,
          "MANUFACTURER_MISMATCH",
        ],
      ] as const) {
        if (expected && normalize(actual) !== normalize(expected)) {
          add(code);
          add("OUT_OF_CERTIFICATION_SCOPE");
          addRule(
            `approval.${scopeField}-scope`,
            "FAIL",
            "The current catalogue attribute differs from the value captured in the approval scope. Catalogue editing cannot expand certification.",
            "CertificateScope",
            selectedScope.id,
            actual,
            expected,
            cert.id,
          );
        }
      }
      if (selectedScope.requiresCompanyRelationship) {
        if (!companyRelationship) add("COMPANY_RELATIONSHIP_NOT_VERIFIED");
        addRule(
          "approval.company-relationship",
          companyRelationship ? "PASS" : "FAIL",
          companyRelationship
            ? "The configured company-product relationship is valid."
            : "This scope explicitly requires a current company-product relationship; none was verified.",
          "CertificateScope",
          selectedScope.id,
          companyRelationship?.id ?? null,
          input.companyId,
          cert.id,
        );
      } else {
        addRule(
          "approval.company-relationship",
          "PASS",
          "This product scope does not require the retailer to be the certificate holder.",
          "CertificateScope",
          selectedScope.id,
          input.companyId,
          "Manufacturer-held certificate is allowed by this recorded scope",
          cert.id,
        );
      }
      if (selectedScope.facilityId) {
        if (!input.manufacturingFacilityId) {
          add("INSUFFICIENT_INFORMATION");
          addRule(
            "approval.manufacturing-facility",
            "REVIEW",
            "The certificate covers a specific manufacturing facility. The retail inspection location is not a manufacturing-facility identity.",
            "CertificateScope",
            selectedScope.id,
            null,
            selectedScope.facilityId,
            cert.id,
          );
        } else if (selectedScope.facilityId !== input.manufacturingFacilityId) {
          add("OUT_OF_CERTIFICATION_SCOPE");
          addRule(
            "approval.manufacturing-facility",
            "FAIL",
            "The observed manufacturing facility is outside the recorded approval scope.",
            "CertificateScope",
            selectedScope.id,
            input.manufacturingFacilityId,
            selectedScope.facilityId,
            cert.id,
          );
        } else {
          addRule(
            "approval.manufacturing-facility",
            "PASS",
            "The manufacturing facility matches the recorded approval scope.",
            "CertificateScope",
            selectedScope.id,
            input.manufacturingFacilityId,
            selectedScope.facilityId,
            cert.id,
          );
        }
      }
    }
    for (const license of records.licenses) {
      if (
        license.required === false ||
        (license.manufacturerId !== product.manufacturer.id &&
          license.companyId !== input.companyId)
      )
        continue;
      if (
        license.effectiveAt &&
        date(license.effectiveAt).getTime() > timestamp
      )
        continue;
      const expired = date(license.expiresAt).getTime() < timestamp;
      if (expired) add("REQUIRED_LICENSE_EXPIRED");
      addRule(
        "license.validity",
        expired ? "FAIL" : "PASS",
        `${license.name} (${license.number}) ${expired ? "has expired" : "is unexpired"}. This is a required license, separate from the HAC certificate.`,
        "License",
        license.id,
        iso(license.expiresAt),
        `Unexpired at ${evaluatedAt.toISOString()}`,
      );
      if (license.status && !isActive(license.status) && !expired) {
        add("MANUAL_HAC_REVIEW_REQUIRED");
        addRule(
          "license.status",
          "REVIEW",
          `The required license has status ${license.status}; authorized review is required.`,
          "License",
          license.id,
          license.status,
          "ACTIVE",
        );
      }
    }
    for (const restriction of records.restrictions) {
      const matches =
        restriction.productId === product.id ||
        (!!restriction.manufacturerId &&
          restriction.manufacturerId === product.manufacturer.id);
      if (
        !matches ||
        !isActive(restriction.status) ||
        date(restriction.effectiveAt).getTime() > timestamp ||
        (restriction.expiresAt &&
          date(restriction.expiresAt).getTime() < timestamp)
      )
        continue;
      applicableRestrictions.push(restriction);
      add(
        input.identityConfirmed
          ? "EXPLICITLY_RESTRICTED"
          : "MANUAL_HAC_REVIEW_REQUIRED",
      );
      addRule(
        "restriction.authoritative-record",
        input.identityConfirmed ? "FAIL" : "REVIEW",
        `${input.identityConfirmed ? "" : "Candidate identity requires confirmation. "}${restriction.authority}: ${restriction.reason}`,
        "RestrictionRecord",
        restriction.id,
        restriction.reference,
        "No applicable active restriction",
      );
    }
  }

  if (input.physicalExpiry) {
    const physicalExpiry = physicalExpiryInstant(input.physicalExpiry);
    const expired = physicalExpiry.getTime() < timestamp;
    if (expired) add("PHYSICAL_PRODUCT_EXPIRED");
    addRule(
      "physical.shelf-life",
      expired ? "FAIL" : "PASS",
      expired
        ? "The observed physical product has expired. This does not change the HAC certificate dates."
        : "The observed physical shelf-life date has not passed.",
      "Observation",
      null,
      physicalExpiry.toISOString(),
      `Unexpired at ${evaluatedAt.toISOString()}`,
    );
  }
  if (product && selectedScope && outcomes.size === 0) add("VERIFIED_APPROVED");
  else if (
    product &&
    selectedScope &&
    outcomes.size === 1 &&
    outcomes.has("IDENTITY_UNCERTAIN") &&
    isActive(selectedScope.certificate.status) &&
    date(selectedScope.certificate.expiresAt).getTime() >= timestamp
  )
    add("APPROVED_REQUIRES_PHYSICAL_CONFIRMATION");
  if (!outcomes.size) add("INSUFFICIENT_INFORMATION");
  const list = [...outcomes].sort(
    (a, b) => priorities.indexOf(a) - priorities.indexOf(b),
  );
  const selectedCertificate = selectedScope?.certificate;
  return {
    outcomes: list,
    primaryStatus: list[0],
    label: VERIFICATION_LABELS[list[0]] ?? list[0],
    labels: list.map((value) => VERIFICATION_LABELS[value] ?? value),
    rules,
    certificate: selectedCertificate
      ? {
          id: selectedCertificate.id,
          number: selectedCertificate.number,
          holderId: selectedCertificate.holderId,
          issuer: selectedCertificate.issuer,
          type: selectedCertificate.type,
          status:
            selectedStatus === "VALID"
              ? "ACTIVE"
              : (selectedStatus ?? selectedCertificate.status),
          supersedesId: selectedCertificate.supersedesId,
          effectiveAt: iso(selectedCertificate.effectiveAt),
          expiresAt: iso(selectedCertificate.expiresAt),
          ...(selectedCertificate.issuedAt
            ? { issuedAt: iso(selectedCertificate.issuedAt) }
            : {}),
        }
      : null,
    product: product
      ? {
          id: product.id,
          itemCode: product.itemCode,
          name: product.name,
          brand: product.brand.name,
          manufacturer: product.manufacturer.name,
          variant: variant?.name ?? null,
          isDemo: !!product.isDemo,
        }
      : null,
    evaluatedAt: evaluatedAt.toISOString(),
    ruleVersion: VERIFICATION_RULE_VERSION,
    masterDataVersion:
      records.masterDataVersion ??
      `sha256:${createHash("sha256")
        .update(
          JSON.stringify({
            product,
            scopes: [...records.scopes].sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
            companyItems: [...records.companyItems].sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
            licenses: [...records.licenses].sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
            restrictions: [...records.restrictions].sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
          }),
        )
        .digest("hex")}`,
    requiresAction: list.some((outcome) => outcome !== "VERIFIED_APPROVED"),
    warnings,
    restrictions: applicableRestrictions,
  };
}

/** Loads authoritative records. Callers must authorize the inspection/company before invoking. */
export async function verifyProduct(
  input: VerificationInput,
  options: { db?: PrismaClient | Prisma.TransactionClient } = {},
): Promise<VerificationResult> {
  const database = options.db ?? (await import("./db")).db;
  const product = input.productId
    ? await database.product.findUnique({
        where: { id: input.productId },
        include: { brand: true, manufacturer: true, variants: true },
      })
    : null;
  if (!product)
    return evaluateVerification(input, {
      product: null,
      scopes: [],
      companyItems: [],
      licenses: [],
      restrictions: [],
    });
  const [scopes, companyItems, licenses, restrictions] = await Promise.all([
    database.certificateScope.findMany({
      where: { productId: product.id },
      include: { certificate: { include: { history: true } } },
    }),
    database.companyItem.findMany({
      where: { productId: product.id, companyId: input.companyId },
    }),
    database.license.findMany({
      where: {
        OR: [
          { manufacturerId: product.manufacturerId },
          { companyId: input.companyId },
        ],
      },
    }),
    database.restrictionRecord.findMany({
      where: {
        OR: [
          { productId: product.id },
          { manufacturerId: product.manufacturerId },
        ],
      },
    }),
  ]);
  return evaluateVerification(input, {
    product,
    scopes,
    companyItems,
    licenses,
    restrictions,
  });
}
