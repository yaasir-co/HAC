import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, PDFArray } from "pdf-lib";
import { inflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import sharp from "sharp";
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
function decodedPageText(doc: PDFDocument) {
  const contents: string[] = [];
  for (const page of doc.getPages()) {
    const streams = page.node.Contents();
    if (!streams) continue;
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
  }
  return contents.join("\n");
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
});
