import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, PDFArray } from "pdf-lib";
import { inflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { MARML_MATERIALS, MARML_SOURCE } from "../src/data/marml-materials";
import { marmlInspectionRows } from "../src/lib/marml-report";
import {
  renderInspectionPdf,
  renderInspectionWorkbook,
  summarizeInspection,
} from "../src/lib/reports";

const meta = {
  reference: "DEMO-REPORT-001",
  revision: 7,
  generatedAt: new Date("2026-10-21T04:00:00Z"),
  snapshotHash: "a".repeat(64),
};
function fixture(count = 3) {
  return {
    id: "inspection",
    reference: "DEMO-INS-001",
    status: "SUBMITTED",
    isDemo: true,
    company: { legalName: "Fictional Demonstration Retailer", isDemo: true },
    location: { name: "Colombo Branch", address: "Fictional address" },
    inspector: { name: "Demonstration Inspector" },
    scheduledAt: "2026-10-21T03:00:00Z",
    startedAt: "2026-10-21T03:10:00Z",
    submittedAt: "2026-10-21T04:00:00Z",
    masterDataVersion: "fixtures-v1",
    checklistVersion: {
      templateId: "checklist",
      version: 1,
      questions: [
        { id: "q1", section: "Storage", text: "Are materials segregated?" },
      ],
    },
    responses: [
      {
        questionId: "q1",
        answer: "COMPLIANT",
        notes: "Observed separate storage",
      },
    ],
    observations: Array.from({ length: count }, (_, i) => ({
      id: `obs-${i}`,
      product: {
        name: `Distinct saved product ${i}`,
        itemCode: `HAC-${i}`,
        brand: { name: "Fixture Brand" },
        manufacturer: { name: "Fixture Manufacturer" },
      },
      variant: { sku: `SKU-${i}` },
      batch: `BATCH-${i}`,
      identityConfirmed: true,
      physicalExpiry: "2027-10-21T00:00:00Z",
      notes:
        "Packaging physically checked against the exact registered product record. ".repeat(
          4,
        ),
      conclusion: i === 0 ? "COMPLIANT" : "REVIEW",
      verification: {
        outcomes:
          i === 0
            ? ["VERIFIED_APPROVED"]
            : ["BRAND_MISMATCH", "CERTIFICATE_EXPIRED"],
        certificate: {
          number: `DEMO-CERT-${i}`,
          expiresAt: "2026-10-20T23:59:59Z",
        },
        evaluatedAt: "2026-10-21T03:12:00Z",
        ruleVersion: "fixture-rules-1",
        rules: [
          {
            rule: "brand.identity",
            sourceId: "brand-fixture",
            actual: "Observed Brand",
            expected: "Fixture Brand",
            result: i === 0 ? "PASS" : "FAIL",
            reason:
              "Compared the saved physical observation with the authoritative record.",
          },
        ],
      },
    })),
    findings: [
      {
        id: "f1",
        title: "Saved brand mismatch",
        severity: "MINOR",
        description: "The product brand differs.",
        status: "OPEN",
      },
    ],
    investigations: [
      {
        reference: "DEMO-INV-001",
        title: "Review identity",
        description: "Investigate photographed packaging.",
        priority: "HIGH",
        status: "AWAITING_TRIAGE",
      },
    ],
    nonConformities: [],
    evidence: [],
    signatures: [
      {
        name: "Demonstration Inspector",
        role: "INSPECTOR",
        signedAt: "2026-10-21T04:00:00Z",
      },
      {
        name: "Representative unavailable",
        role: "COMPANY_REPRESENTATIVE",
        reason: "No representative present",
        signedAt: "2026-10-21T04:00:00Z",
      },
    ],
  };
}
function decodedPages(doc: PDFDocument): string[] {
  return doc.getPages().map((page) => {
    const contents: string[] = [];
    const streams = page.node.Contents();
    if (!streams) return "";
    const array = streams instanceof PDFArray ? streams.asArray() : [streams];
    for (const reference of array) {
      const stream = doc.context.lookup(reference);
      if (stream instanceof PDFRawStream) {
        let bytes = Buffer.from(stream.getContents());
        try {
          bytes = inflateSync(bytes);
        } catch {}
        const raw = bytes.toString("latin1");
        contents.push(
          raw.replace(/<([0-9a-f]+)>/gi, (_, hex) =>
            Buffer.from(hex, "hex").toString("latin1"),
          ),
        );
      }
    }
    return contents
      .join("\n")
      .split("\n")
      .filter((line) => line.endsWith(" Tj"))
      .map((line) => line.slice(0, -3))
      .join(" ");
  });
}
const decodedPageText = (doc: PDFDocument) => decodedPages(doc).join("\n");

function marmlFixture() {
  return {
    ...fixture(0),
    isDemo: false,
    companyId: "source-company",
    company: {
      id: "source-company",
      legalName: MARML_SOURCE.companyName,
      isDemo: false,
    },
    location: { name: "Seeduwa Plant", address: MARML_SOURCE.plantAddress },
    observations: MARML_MATERIALS.map((material, index) => ({
      id: `marml-observation-${index + 1}`,
      product: {
        name: material.name,
        itemCode: `MARML-PSA0135-${String(index + 1).padStart(3, "0")}`,
        brand: { name: material.brand || "Not recorded" },
        manufacturer: { name: material.manufacturer || "Not recorded" },
        rawMaterialListing: {
          ...material,
          sourceCompanyId: "source-company",
          sourceCompanyName: MARML_SOURCE.companyName,
          sourceMetadata: MARML_SOURCE,
          sourceDocument: MARML_SOURCE.id,
          reviewStatus: "SOURCE_LISTED_REQUIRES_REVIEW",
        },
      },
      observedBrand: material.brand,
      observedManufacturer: material.manufacturer,
      conclusion: "REVIEW",
      notes: `Saved inspection notes for source row ${material.rowNumber}.`,
      physicalExpiry: "2027-10-21T00:00:00Z",
      verification: {
        outcomes: ["MARML_REVIEW_REQUIRED"],
        primaryStatus: "MARML_REVIEW_REQUIRED",
        certificate: null,
        rules: [],
      },
    })),
  };
}

describe("inspection reporting from saved values", () => {
  it("counts overlapping findings without calling an unknown item prohibited", () => {
    const summary = summarizeInspection(fixture());
    expect(summary.total).toBe(3);
    expect(summary.verified).toBe(1);
    expect(summary.unverified).toBe(2);
    expect(summary.brandMismatches).toBe(2);
    expect(summary.expiredCertificates).toBe(2);
    expect(summary.restricted).toBe(0);
  });
  it("renders paginated A4 portrait and landscape pages including the last saved observation", async () => {
    const pdf = await renderInspectionPdf(fixture(130), meta);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(15);
    expect(doc.getPages().some((p) => p.getWidth() > p.getHeight())).toBe(true);
    for (const page of doc.getPages()) {
      expect(Math.min(page.getWidth(), page.getHeight())).toBeCloseTo(
        595.28,
        1,
      );
      expect(Math.max(page.getWidth(), page.getHeight())).toBeCloseTo(
        841.89,
        1,
      );
    }
    const printed = decodedPageText(doc);
    expect(printed).toContain("Distinct saved product 129");
    expect(printed).toContain("DEMO-INV-001");
    expect(printed).toContain("No representative present");
    expect(printed).toContain("FICTIONAL DEMONSTRATION DATA");
    expect(printed).not.toContain("DRAFT - NOT SUBMITTED");
  });
  it("watermarks unsubmitted reports and embeds real evidence bytes", async () => {
    const value = {
      ...fixture(1),
      status: "IN_PROGRESS",
      submittedAt: null,
      evidence: [
        {
          id: "ev-1",
          storedName: "evidence/image.png",
          mimeType: "image/png",
          description: "Saved evidence image",
          sha256: "b".repeat(64),
        },
      ],
    };
    const image = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#00aa55" },
    })
      .png()
      .toBuffer();
    value.evidence[0].sha256 = createHash("sha256").update(image).digest("hex");
    let requested = "";
    const bytes = await renderInspectionPdf(value, meta, async (key) => {
      requested = key;
      return image;
    });
    const doc = await PDFDocument.load(bytes);
    const printed = decodedPageText(doc);
    expect(requested).toBe("evidence/image.png");
    expect(printed).toContain("DRAFT - NOT SUBMITTED");
    expect(printed).toContain("Saved evidence image");
  });
  it("exports actual saved product and checklist cells as strings without formula execution", async () => {
    const value = fixture(2);
    value.observations[0].notes = '=HYPERLINK("https://attacker.test","open")';
    const bytes = await renderInspectionWorkbook(value, meta);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet("Product observations")!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell("B2").value).toBe("Distinct saved product 0");
    expect(sheet.getCell("N2").value).toBe(value.observations[0].notes);
    expect(sheet.getCell("N2").type).toBe(ExcelJS.ValueType.String);
    expect(workbook.getWorksheet("Checklist")!.getCell("C2").value).toBe(
      "COMPLIANT",
    );
  });

  it("starts with the supplied MARML grid and repeats company and grouped headers on continuation pages", async () => {
    const value = marmlFixture();
    const doc = await PDFDocument.load(await renderInspectionPdf(value, meta));
    const printedPages = decodedPages(doc);
    const registerPages = printedPages.filter((page) =>
      page.includes("INSPECTED RAW MATERIAL LIST - MARML"),
    );
    expect(registerPages.length).toBeGreaterThan(1);
    expect(printedPages[0]).toContain("INSPECTED RAW MATERIAL LIST - MARML");
    expect(doc.getPage(0).getWidth()).toBeGreaterThan(
      doc.getPage(0).getHeight(),
    );
    for (const page of registerPages) {
      expect(page).toContain("COMPANY NAME:");
      expect(page).toContain(MARML_SOURCE.companyName);
      expect(page).toContain("SUPPLIER");
      expect(page).toContain("LOCAL");
      expect(page).toContain("FOREIGN");
      expect(page).toContain("HALAL CERTIFICATE");
      expect(page).toContain("PSA0135");
    }
    const printed = printedPages.join("\n");
    const registerText = registerPages.join("\n");
    expect(registerText).toContain(MARML_MATERIALS[0].name);
    expect(registerText).toContain(MARML_MATERIALS[38].name);
    expect(registerText).toContain("MARML-PSA0135-039");
    expect(printed).toContain(MARML_MATERIALS[0].name);
    expect(printed).toContain(MARML_MATERIALS[38].name);
    expect(printed).toContain("MARML-PSA0135-039");
    expect(printed).toContain("Source cert. expired");
    expect(printed).toContain("31-12-2026");
    expect(printed).toContain("Saved inspection notes for source row 39.");
    expect(printed).not.toContain("MASTER APPROVED RAW MATERIAL LIST - MARML");
  });

  it("retains a long manufacturer's final characters when a MARML row spans pages", async () => {
    const value = marmlFixture();
    value.observations = [value.observations[0]];
    value.observations[0].product.rawMaterialListing.manufacturer =
      "A long saved manufacturer address. ".repeat(150) +
      "END-OF-SAVED-ADDRESS";
    value.observations[0].observedManufacturer =
      value.observations[0].product.rawMaterialListing.manufacturer;
    const doc = await PDFDocument.load(await renderInspectionPdf(value, meta));
    const pages = decodedPages(doc);
    expect(
      pages.filter((page) =>
        page.includes("INSPECTED RAW MATERIAL LIST - MARML"),
      ).length,
    ).toBeGreaterThan(2);
    expect(
      pages
        .filter((page) => page.includes("INSPECTED RAW MATERIAL LIST - MARML"))
        .join("\n"),
    ).toContain("END-OF-SAVED-ADDRESS");
  });

  it("uses a formal renewal when present and labels the older MARML date as source information", async () => {
    const value = marmlFixture();
    const observation = {
      ...value.observations[0],
      verification: {
        ...value.observations[0].verification,
        outcomes: ["VERIFIED_APPROVED"],
        primaryStatus: "VERIFIED_APPROVED",
        certificate: {
          number: "ACTUAL-RENEWAL-REFERENCE",
          issuer: "Current recorded issuer",
          expiresAt: "2027-11-30",
        },
      },
    };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await renderInspectionWorkbook(
        { ...value, observations: [observation] },
        meta,
      )) as never,
    );
    const register = workbook.getWorksheet("MARML inspection register")!;
    expect(register.getCell("I2").value).toBe("Current recorded issuer");
    expect(register.getCell("J2").value).toBe("30-11-2027");
    expect(String(register.getCell("M2").value)).toContain(
      "MARML source: HAC / 11-09-2025",
    );
    expect(String(register.getCell("M2").value)).toContain(
      "Source cert. expired",
    );
  });

  it("shows source-company mismatch and preserves missing fields without inventing certification", async () => {
    const value = marmlFixture();
    value.companyId = "another-company";
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await renderInspectionWorkbook(value, meta)) as never,
    );
    const register = workbook.getWorksheet("MARML inspection register")!;
    expect(register.rowCount).toBe(40);
    expect(register.getCell("C2").value).toBe("-");
    expect(register.getCell("H2").value).toBe("-");
    expect(String(register.getCell("M2").value)).toContain(
      "Outside source company scope",
    );
    expect(String(register.getCell("M2").value)).toContain("review required");
    expect(
      summarizeInspection({
        observations: [
          { verification: { outcomes: ["MARML_CERTIFICATE_EXPIRED"] } },
        ],
      }).expiredCertificates,
    ).toBe(1);
    const crossCompany = {
      ...value,
      company: { id: "another-company", legalName: "Keells", isDemo: false },
      location: {
        name: "Recorded branch",
        address: "Address recorded for this inspection",
      },
    };
    const doc = await PDFDocument.load(
      await renderInspectionPdf(crossCompany, meta),
    );
    const first = decodedPages(doc)[0];
    expect(first).toContain("COMPANY NAME: Keells");
    expect(first).toContain(`SOURCE LIST COMPANY: ${MARML_SOURCE.companyName}`);
    expect(first).toContain("Address recorded for this inspection");
    expect(first).not.toContain(MARML_SOURCE.plantAddress);
    const unclassified = marmlInspectionRows({
      observations: [
        {
          product: {
            name: "Saved product",
            supplier: { name: "Unclassified supplier" },
          },
        },
      ],
    })[0].values;
    expect(unclassified[6]).toBe("-");
    expect(unclassified[7]).toBe("-");
    expect(unclassified[8]).toBe("-");
    expect(unclassified[9]).toBe("-");
    expect(unclassified[12]).toContain(
      "Supplier (type not recorded): Unclassified supplier",
    );
  });
});
