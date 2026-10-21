import { createHash } from "node:crypto";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  degrees,
} from "pdf-lib";
import ExcelJS from "exceljs";
import QRCode from "qrcode";
import {
  appendMarmlInspectionRegister,
  MARML_REPORT_HEADERS,
  marmlInspectionRows,
} from "./marml-report";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const rows = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(record) : [];
const plain = (value: unknown): string =>
  value === null || value === undefined || value === ""
    ? "-"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
const text = (value: unknown) =>
  plain(value)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
const date = (value: unknown) => {
  if (!value) return "-";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? "-"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
};
const label = (value: unknown) => plain(value).replace(/_/g, " ");
const colors = {
  navy: rgb(0.055, 0.12, 0.2),
  green: rgb(0.06, 0.38, 0.27),
  muted: rgb(0.38, 0.43, 0.47),
  line: rgb(0.84, 0.87, 0.88),
  pale: rgb(0.95, 0.97, 0.96),
  white: rgb(1, 1, 1),
  red: rgb(0.63, 0.17, 0.17),
};
export interface ReportMetadata {
  reference: string;
  revision: number;
  generatedAt: Date;
  status?: string;
  snapshotHash?: string;
}
export type EvidenceLoader = (storedName: string) => Promise<Uint8Array>;

/** Real saved record values only; counts deliberately overlap when issues coexist. */
export function summarizeInspection(value: unknown) {
  const data = record(value);
  const observations = rows(data.observations);
  const outcomes = (entry: RecordValue): string[] => {
    const v = record(entry.verification);
    return Array.isArray(v.outcomes)
      ? v.outcomes.map(String)
      : [String(v.primaryStatus || "")];
  };
  const count = (...terms: string[]) =>
    observations.filter((o) =>
      outcomes(o).some((outcome) =>
        terms.some((term) => outcome.toUpperCase() === term),
      ),
    ).length;
  return {
    total: observations.length,
    verified: count("VERIFIED_APPROVED", "APPROVED"),
    unverified: observations.filter(
      (o) =>
        !outcomes(o).some((s) => ["VERIFIED_APPROVED", "APPROVED"].includes(s)),
    ).length,
    brandMismatches: count("BRAND_MISMATCH"),
    variantMismatches: count("PRODUCT_VARIANT_MISMATCH", "VARIANT_MISMATCH"),
    expiredCertificates: count("CERTIFICATE_EXPIRED", "MARML_CERTIFICATE_EXPIRED"),
    expiredProducts: count("PHYSICAL_PRODUCT_EXPIRED"),
    restricted: count(
      "EXPLICITLY_RESTRICTED",
      "EXPLICITLY_RESTRICTED_BANNED",
      "RESTRICTED",
      "CONFIRMED_RESTRICTED",
      "RESTRICTED_BANNED",
    ),
    investigations: rows(data.investigations).length,
    nonConformities: rows(data.nonConformities).length,
    findings: rows(data.findings).length,
  };
}

class PageLayout {
  page!: PDFPage;
  y = 0;
  section = "";
  readonly margin = 40;
  constructor(
    readonly doc: PDFDocument,
    readonly normal: PDFFont,
    readonly bold: PDFFont,
    readonly meta: ReportMetadata,
    readonly isDraft: boolean,
  ) {}
  newPage(section: string, landscape = false) {
    this.section = section;
    this.page = this.doc.addPage(
      landscape ? [841.89, 595.28] : [595.28, 841.89],
    );
    const w = this.page.getWidth(),
      h = this.page.getHeight();
    this.page.drawRectangle({
      x: 0,
      y: h - 12,
      width: w,
      height: 12,
      color: colors.green,
    });
    this.page.drawText("HAC", {
      x: this.margin,
      y: h - 49,
      size: 22,
      font: this.bold,
      color: colors.navy,
    });
    this.page.drawText("CERTIFICATION & INSPECTION", {
      x: this.margin + 65,
      y: h - 43,
      size: 8,
      font: this.bold,
      color: colors.green,
    });
    this.page.drawText(text(this.meta.reference), {
      x:
        w -
        this.margin -
        this.normal.widthOfTextAtSize(text(this.meta.reference), 8),
      y: h - 43,
      size: 8,
      font: this.normal,
      color: colors.muted,
    });
    this.page.drawLine({
      start: { x: this.margin, y: h - 62 },
      end: { x: w - this.margin, y: h - 62 },
      thickness: 0.6,
      color: colors.line,
    });
    this.y = h - 89;
    this.page.drawText(text(section), {
      x: this.margin,
      y: this.y,
      size: 17,
      font: this.bold,
      color: colors.navy,
    });
    this.y -= 27;
  }
  ensure(
    height: number,
    landscape = this.page.getWidth() > this.page.getHeight(),
  ) {
    if (this.y - height < 54)
      this.newPage(
        this.section +
          (this.section.endsWith("(continued)") ? "" : " (continued)"),
        landscape,
      );
  }
  wrap(value: unknown, width: number, size = 9, font = this.normal): string[] {
    const paragraphs = text(value).split("\n");
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const proposal = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(proposal, size) <= width) {
          line = proposal;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        if (font.widthOfTextAtSize(word, size) > width) {
          let part = "";
          for (const c of word) {
            if (font.widthOfTextAtSize(part + c, size) > width) {
              lines.push(part);
              part = "";
            }
            part += c;
          }
          line = part;
        } else line = word;
      }
      lines.push(line || " ");
    }
    return lines;
  }
  paragraph(
    value: unknown,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) {
    const size = options.size || 9,
      font = options.bold ? this.bold : this.normal;
    const lines = this.wrap(
      value,
      this.page.getWidth() - this.margin * 2,
      size,
      font,
    );
    for (const line of lines) {
      this.ensure(size + 5);
      this.page.drawText(line, {
        x: this.margin,
        y: this.y,
        size,
        font,
        color: options.color || colors.navy,
      });
      this.y -= size + 5;
    }
    this.y -= 5;
  }
  keyValue(key: string, value: unknown) {
    this.paragraph(key.toUpperCase(), {
      size: 7,
      bold: true,
      color: colors.muted,
    });
    this.paragraph(value, { size: 10 });
    this.y -= 3;
  }
  table(headers: string[], values: unknown[][], proportions?: number[]) {
    const width = this.page.getWidth() - this.margin * 2;
    const weights = proportions || headers.map(() => 1),
      total = weights.reduce((a, b) => a + b, 0),
      widths = weights.map((v) => (v / total) * width);
    const header = () => {
      this.ensure(35);
      let x = this.margin;
      const headerLines = headers.map((h, i) =>
        this.wrap(h, widths[i] - 12, 7, this.bold),
      );
      const height = Math.max(...headerLines.map((v) => v.length)) * 10 + 14;
      this.page.drawRectangle({
        x: this.margin,
        y: this.y - height,
        width,
        height,
        color: colors.navy,
      });
      for (let i = 0; i < headers.length; i++) {
        headerLines[i].forEach((line, j) =>
          this.page.drawText(line, {
            x: x + 6,
            y: this.y - 12 - j * 10,
            size: 7,
            font: this.bold,
            color: colors.white,
          }),
        );
        x += widths[i];
      }
      this.y -= height;
    };
    header();
    for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
      const cells = headers.map((_, i) =>
        this.wrap(values[rowIndex][i], widths[i] - 12, 8),
      );
      let offset = 0;
      const max = Math.max(...cells.map((v) => v.length));
      while (offset < max) {
        if (this.y - 26 < 54) {
          this.newPage(
            this.section,
            this.page.getWidth() > this.page.getHeight(),
          );
          header();
        }
        const available = Math.max(1, Math.floor((this.y - 54 - 12) / 11));
        const lineCount = Math.min(max - offset, available);
        const height = lineCount * 11 + 12;
        if (rowIndex % 2 === 0)
          this.page.drawRectangle({
            x: this.margin,
            y: this.y - height,
            width,
            height,
            color: colors.pale,
          });
        let x = this.margin;
        cells.forEach((lines, i) => {
          lines.slice(offset, offset + lineCount).forEach((line, j) =>
            this.page.drawText(line, {
              x: x + 6,
              y: this.y - 13 - j * 11,
              size: 8,
              font: this.normal,
              color: colors.navy,
            }),
          );
          x += widths[i];
        });
        this.y -= height;
        this.page.drawLine({
          start: { x: this.margin, y: this.y },
          end: { x: this.margin + width, y: this.y },
          thickness: 0.4,
          color: colors.line,
        });
        offset += lineCount;
        if (offset < max) {
          this.newPage(
            this.section,
            this.page.getWidth() > this.page.getHeight(),
          );
          header();
        }
      }
    }
    this.y -= 18;
  }
  finish() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const width = p.getWidth();
      p.drawLine({
        start: { x: this.margin, y: 40 },
        end: { x: width - this.margin, y: 40 },
        thickness: 0.5,
        color: colors.line,
      });
      p.drawText(
        `Revision ${this.meta.revision} | ${this.isDraft ? "DRAFT - NOT SUBMITTED" : "Controlled inspection record"} | Asia/Colombo`,
        {
          x: this.margin,
          y: 26,
          size: 7,
          font: this.normal,
          color: colors.muted,
        },
      );
      p.drawText(`${i + 1} / ${pages.length}`, {
        x: width - this.margin - 27,
        y: 26,
        size: 8,
        font: this.bold,
        color: colors.muted,
      });
      if (this.isDraft)
        p.drawText("DRAFT", {
          x: width * 0.23,
          y: p.getHeight() * 0.43,
          size: 65,
          font: this.bold,
          color: colors.red,
          opacity: 0.08,
          rotate: degrees(35),
        });
    });
  }
}

export async function renderInspectionPdf(
  value: unknown,
  meta: ReportMetadata,
  loadEvidence?: EvidenceLoader,
): Promise<Uint8Array> {
  const data = record(value),
    company = record(data.company),
    location = record(data.location),
    inspector = record(data.inspector);
  const document = await PDFDocument.create();
  document.setTitle(`HAC Inspection ${plain(data.reference)}`);
  document.setAuthor("HAC Certification & Inspection");
  document.setSubject(`Inspection report revision ${meta.revision}`);
  document.setCreationDate(meta.generatedAt);
  document.setModificationDate(meta.generatedAt);
  const normal = await document.embedFont(StandardFonts.Helvetica),
    bold = await document.embedFont(StandardFonts.HelveticaBold);
  const isDraft = !data.submittedAt,
    layout = new PageLayout(document, normal, bold, meta, isDraft);
  appendMarmlInspectionRegister(document, normal, bold, data, meta);
  layout.newPage("Inspection details");
  layout.paragraph(company.legalName || company.tradingName, {
    size: 22,
    bold: true,
  });
  if (company.isDemo || data.isDemo)
    layout.paragraph(
      "FICTIONAL DEMONSTRATION DATA - Not an official HAC certification statement.",
      { bold: true, color: colors.red },
    );
  layout.keyValue("Inspection reference", data.reference);
  layout.keyValue(
    "Branch / location",
    `${plain(location.name)}\n${plain(location.address)}`,
  );
  layout.table(
    ["Inspection type", "Planned visit", "Actual start"],
    [[label(data.type), date(data.scheduledAt), date(data.startedAt)]],
  );
  layout.table(
    ["Inspector", "Report status", "Submission"],
    [
      [
        inspector.name,
        label(meta.status || data.status),
        date(data.submittedAt),
      ],
    ],
  );
  layout.keyValue("Report issue date", date(meta.generatedAt));
  layout.keyValue("Document reference", meta.reference);
  layout.paragraph(
    "Image recognition suggests identity. Recorded certification outcomes are calculated from HAC master records and remain distinct from physical observations and formal approval decisions.",
    { size: 9 },
  );
  const qr = await QRCode.toBuffer(`HAC-REPORT:${meta.reference}`, {
    width: 180,
    margin: 1,
  });
  const image = await document.embedPng(qr);
  layout.ensure(92);
  layout.page.drawImage(image, {
    x: layout.margin,
    y: layout.y - 76,
    width: 76,
    height: 76,
  });
  layout.y -= 91;
  layout.paragraph(
    "Verify the document reference and SHA-256 hash through the authenticated report metadata endpoint. Access remains limited to authorized users.",
    { size: 8, color: colors.muted },
  );
  layout.newPage("Executive summary");
  const summary = summarizeInspection(data);
  layout.table(
    ["Measure", "Saved observations"],
    Object.entries(summary).map(([key, value]) => [
      key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      value,
    ]),
    [3, 1],
  );
  layout.paragraph(
    "Counts can overlap: one observation can contain a brand mismatch, certificate expiry, and physical product expiry simultaneously. Unknown catalogue entries do not imply a prohibited product.",
  );
  layout.keyValue(
    "Checklist version",
    `${plain(record(data.checklistVersion).templateId)} / ${plain(record(data.checklistVersion).version)}`,
  );
  layout.keyValue("HAC data version", data.masterDataVersion);
  if (meta.snapshotHash)
    layout.keyValue("Submitted snapshot SHA-256", meta.snapshotHash);
  layout.newPage("Detailed product verification checklist", true);
  const observations = rows(data.observations);
  if (!observations.length)
    layout.paragraph("No product observations have been recorded.");
  else
    layout.table(
      [
        "No. / product",
        "SKU / batch",
        "Brand / manufacturer",
        "System verification",
        "Certificate / expiry",
        "Physical expiry",
        "Inspector observation / evidence",
      ],
      observations.map((o, i) => {
        const p = record(o.product),
          v = record(o.variant),
          verification = record(o.verification),
          certificate = record(verification.certificate);
        const linkedEvidence = rows(data.evidence)
          .filter((e) => e.observationId === o.id)
          .map((e) => String(e.id));
        return [
          `${i + 1}. ${plain(p.name || o.observedName)}\n${plain(p.itemCode)}`,
          `${plain(v.sku || o.observedVariant)}\nBatch: ${plain(o.batch)}`,
          `${plain(o.observedBrand || record(p.brand).name)}\n${plain(o.observedManufacturer || record(p.manufacturer).name)}`,
          Array.isArray(verification.outcomes)
            ? verification.outcomes.map(label).join("\n")
            : label(verification.primaryStatus || verification.label),
          `${plain(certificate.number)}\n${date(certificate.expiresAt)}`,
          date(o.physicalExpiry),
          `${label(o.conclusion)}\n${plain(o.notes)}\nEvidence: ${linkedEvidence.join(", ") || "-"}`,
        ];
      }),
      [1.3, 0.9, 1.15, 1.3, 1, 0.85, 1.5],
    );
  // Explanations preserve simultaneous issues and authoritative source references.
  layout.newPage("Verification basis and explanations");
  for (const o of observations) {
    const p = record(o.product),
      v = record(o.verification);
    layout.paragraph(`${plain(p.name || o.observedName)} (${plain(o.id)})`, {
      bold: true,
    });
    const rules = rows(v.rules || v.checks);
    if (!rules.length)
      layout.paragraph("No detailed rule explanations were stored.");
    else
      layout.table(
        ["Rule / source", "Actual / expected", "Result / reason"],
        rules.map((r) => [
          `${plain(r.rule || r.code || r.name)}\n${plain(r.sourceReference || r.sourceId || r.recordId)}`,
          `${plain(r.actual)}\nExpected: ${plain(r.expected)}`,
          `${label(r.result || r.outcome || r.status)}\n${plain(r.reason || r.message)}`,
        ]),
        [1.1, 1, 1.6],
      );
    layout.paragraph(
      `Evaluated: ${date(v.evaluatedAt)} | Rule version: ${plain(v.ruleVersion)} | Identity physically confirmed: ${o.identityConfirmed ? "Yes" : "No"}`,
      { size: 8, color: colors.muted },
    );
  }
  layout.newPage("General inspection checklist");
  const questions = rows(record(data.checklistVersion).questions),
    responses = rows(data.responses);
  layout.table(
    ["Section / question", "Answer", "Inspector notes"],
    questions.map((q) => {
      const r = responses.find((r) => r.questionId === q.id) || {};
      return [
        `${plain(q.section)}\n${plain(q.text)}`,
        r.answer === undefined ? "Not answered" : plain(r.answer),
        r.notes,
      ];
    }),
    [2, 1, 1.5],
  );
  layout.newPage("Findings and non-conformities");
  const findings = rows(data.findings);
  if (findings.length)
    layout.table(
      ["Finding", "Severity / status", "Description"],
      findings.map((f) => [
        `${plain(f.title)}\n${plain(f.id)}`,
        `${label(f.severity)}\n${label(f.status)}`,
        f.description,
      ]),
      [1.3, 1, 2],
    );
  else layout.paragraph("No inspection findings recorded.");
  const ncs = rows(data.nonConformities);
  if (ncs.length)
    layout.table(
      ["Reference / finding", "Severity / due date", "Responsibility / status"],
      ncs.map((n) => [
        `${plain(n.reference)}\n${plain(n.title)}\n${plain(n.description)}`,
        `${label(n.severity)}\n${date(n.dueAt)}`,
        `${plain(n.responsibleParty)}\n${label(n.status)}`,
      ]),
      [2, 1, 1.2],
    );
  layout.newPage("Investigations and follow-up");
  const investigations = rows(data.investigations);
  if (investigations.length)
    layout.table(
      [
        "Reference / priority",
        "Investigation / reason",
        "Status / assigned reviewer",
      ],
      investigations.map((i) => [
        `${plain(i.reference)}\n${label(i.priority)}`,
        `${plain(i.title)}\n${plain(i.description)}`,
        `${label(i.status)}\n${plain(i.assignedToId)}`,
      ]),
      [1, 2, 1],
    );
  else layout.paragraph("No investigations linked to this inspection.");
  layout.newPage("Evidence appendix");
  const evidence = rows(data.evidence);
  if (!evidence.length) layout.paragraph("No evidence images attached.");
  for (const e of evidence) {
    layout.ensure(265);
    layout.paragraph(`Evidence ${plain(e.id)}`, { bold: true });
    layout.paragraph(
      `${plain(e.description)}\nCaptured: ${date(e.capturedAt || e.createdAt)} | Observation: ${plain(e.observationId)}`,
      { size: 8 },
    );
    let rendered = false;
    if (loadEvidence && e.storedName) {
      try {
        const bytes = await loadEvidence(String(e.storedName));
        if (
          e.sha256 &&
          createHash("sha256").update(bytes).digest("hex") !== String(e.sha256)
        )
          throw new Error("Evidence integrity mismatch");
        const image =
          String(e.mimeType) === "image/png"
            ? await document.embedPng(bytes)
            : await document.embedJpg(bytes);
        const scale = Math.min(
          (layout.page.getWidth() - 80) / image.width,
          190 / image.height,
        );
        layout.ensure(image.height * scale + 12);
        layout.page.drawImage(image, {
          x: layout.margin,
          y: layout.y - image.height * scale,
          width: image.width * scale,
          height: image.height * scale,
        });
        layout.y -= image.height * scale + 12;
        rendered = true;
      } catch {
        /* Missing artifacts stay explicit in controlled report. */
      }
    }
    if (!rendered)
      layout.paragraph(
        "Image unavailable in this report; inspect the authorized evidence record.",
        { color: colors.red },
      );
    layout.paragraph(`SHA-256: ${plain(e.sha256)}`, {
      size: 7,
      color: colors.muted,
    });
  }
  layout.newPage("Declarations, signatures and review");
  layout.paragraph(
    "Inspector declaration: The saved observations describe the inspection as recorded. Product identity suggestions do not establish certification. Formal HAC decisions remain restricted to authorized staff.",
  );
  for (const s of rows(data.signatures)) {
    layout.ensure(160);
    layout.keyValue(label(s.role), `${plain(s.name)} | ${date(s.signedAt)}`);
    if (s.reason)
      layout.paragraph(
        `Signature refusal / unavailability reason: ${plain(s.reason)}`,
      );
    if (
      typeof s.signature === "string" &&
      s.signature.startsWith("data:image/png;base64,") &&
      s.signature.length < 700000
    ) {
      try {
        const image = await document.embedPng(
          Buffer.from(s.signature.split(",")[1], "base64"),
        );
        const scale = Math.min(240 / image.width, 70 / image.height);
        layout.page.drawImage(image, {
          x: layout.margin,
          y: layout.y - image.height * scale,
          width: image.width * scale,
          height: image.height * scale,
        });
        layout.y -= image.height * scale + 12;
      } catch {
        layout.paragraph(
          "Signature image could not be rendered. The original signed record is retained.",
        );
      }
    }
  }
  if (!rows(data.signatures).length)
    layout.paragraph("No signatures recorded.");
  layout.keyValue("HAC review status", meta.status || data.status);
  layout.keyValue(
    "Reviewer / review date",
    `${plain(data.reviewedById)} / ${date(data.reviewedAt)}`,
  );
  if (data.reviewReason) layout.keyValue("Review reason", data.reviewReason);
  layout.paragraph(
    "This report is generated from the saved inspection revision. Formal amendments must retain previous report artifacts. Dates are displayed in Asia/Colombo; source timestamps are stored unambiguously.",
    { size: 8, color: colors.muted },
  );
  layout.finish();
  return document.save();
}

export async function renderInspectionWorkbook(
  value: unknown,
  meta: ReportMetadata,
): Promise<Buffer> {
  const data = record(value),
    workbook = new ExcelJS.Workbook();
  workbook.creator = "HAC Certification & Inspection";
  workbook.created = meta.generatedAt;
  const add = (name: string, headers: string[], values: unknown[][]) => {
    const sheet = workbook.addWorksheet(name, {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    sheet.addRow(headers);
    for (const row of values)
      sheet.addRow(
        row.map((v) =>
          v instanceof Date ? v : typeof v === "number" ? v : plain(v),
        ),
      );
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF102337" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((c) => {
      c.width = 28;
    });
    sheet.eachRow((r) => (r.alignment = { wrapText: true, vertical: "top" }));
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: headers.length },
    };
    return sheet;
  };
  const register = add(
    "MARML inspection register",
    [...MARML_REPORT_HEADERS],
    marmlInspectionRows(data).map((entry) => entry.values),
  );
  register.getColumn(2).width = 40;
  register.getColumn(6).width = 48;
  register.getColumn(13).width = 42;
  add(
    "Inspection",
    ["Field", "Value"],
    [
      ["Reference", data.reference],
      ["Document", meta.reference],
      ["Revision", meta.revision],
      ["Company", record(data.company).legalName],
      ["Location", record(data.location).name],
      ["Inspector", record(data.inspector).name],
      ["Status", meta.status || data.status],
      ["Submitted", date(data.submittedAt)],
      ["Demonstration data", data.isDemo ? "Yes" : "No"],
      ["Counts may overlap", "One observation can have multiple issues"],
      ...Object.entries(summarizeInspection(data)),
    ],
  );
  add(
    "Product observations",
    [
      "Observation ID",
      "Product",
      "Item code",
      "SKU",
      "Observed brand",
      "Observed manufacturer",
      "Batch",
      "Quantity",
      "System outcomes",
      "Certificate",
      "Certificate expiry",
      "Physical expiry",
      "Conclusion",
      "Notes",
    ],
    rows(data.observations).map((o) => {
      const p = record(o.product),
        v = record(o.verification),
        certificate = record(v.certificate);
      return [
        o.id,
        p.name || o.observedName,
        p.itemCode,
        record(o.variant).sku,
        o.observedBrand,
        o.observedManufacturer,
        o.batch,
        o.quantity,
        plain(v.outcomes),
        certificate.number,
        date(certificate.expiresAt),
        date(o.physicalExpiry),
        o.conclusion,
        o.notes,
      ];
    }),
  );
  add(
    "Checklist",
    ["Section", "Question", "Answer", "Notes"],
    rows(record(data.checklistVersion).questions).map((q) => {
      const r = rows(data.responses).find((r) => r.questionId === q.id) || {};
      return [q.section, q.text, r.answer, r.notes];
    }),
  );
  add(
    "Findings",
    ["Reference", "Title", "Severity", "Description", "Status"],
    rows(data.findings).map((f) => [
      f.id,
      f.title,
      f.severity,
      f.description,
      f.status,
    ]),
  );
  add(
    "Investigations",
    ["Reference", "Title", "Priority", "Description", "Status", "Assigned to"],
    rows(data.investigations).map((i) => [
      i.reference,
      i.title,
      i.priority,
      i.description,
      i.status,
      i.assignedToId,
    ]),
  );
  add(
    "Non-conformities",
    [
      "Reference",
      "Title",
      "Severity",
      "Description",
      "Status",
      "Responsible party",
      "Due date",
    ],
    rows(data.nonConformities).map((n) => [
      n.reference,
      n.title,
      n.severity,
      n.description,
      n.status,
      n.responsibleParty,
      date(n.dueAt),
    ]),
  );
  add(
    "Evidence",
    ["ID", "Observation ID", "Description", "Captured", "SHA-256"],
    rows(data.evidence).map((e) => [
      e.id,
      e.observationId,
      e.description,
      date(e.capturedAt || e.createdAt),
      e.sha256,
    ]),
  );
  add(
    "Signatures",
    ["Name", "Role", "Signed at", "Refusal / unavailability reason"],
    rows(data.signatures).map((s) => [
      s.name,
      s.role,
      date(s.signedAt),
      s.reason,
    ]),
  );
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
