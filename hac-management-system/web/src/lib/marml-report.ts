import { PDFFont, PDFDocument, PDFPage, rgb } from "pdf-lib";

type Row = Record<string, unknown>;
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const array = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(record) : [];
const plain = (value: unknown): string =>
  value === null || value === undefined || value === "" ? "-" : String(value);
const clean = (value: unknown): string =>
  plain(value)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
const label = (value: unknown) => plain(value).replace(/_/g, " ");
function calendarDate(value: unknown): string | undefined {
  if (!value) return;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function shortDate(value: unknown): string {
  const date = calendarDate(value);
  return date ? date.split("-").reverse().join("-") : "-";
}

export const MARML_REPORT_HEADERS = [
  "NO",
  "RAW MATERIAL NAME (Full name with code)",
  "INS No",
  "P.S",
  "BRAND",
  "MANUFACTURER",
  "SUPPLIER LOCAL",
  "SUPPLIER FOREIGN",
  "NAME OF CB",
  "EXPIRY DATE",
  "OTHER DOCUMENT",
  "REF NO",
  "REMARK / INSPECTION",
] as const;

/** Each line is based on the saved observation and its snapshotted source listing. */
export function marmlInspectionRows(
  value: unknown,
): Array<{ category: string; values: string[] }> {
  const data = record(value);
  const inspectionDay = calendarDate(
    data.startedAt || data.scheduledAt || data.submittedAt,
  );
  const companyId = data.companyId || record(data.company).id;
  return array(data.observations).map((observation, index) => {
    const product = record(observation.product);
    const listing = record(product.rawMaterialListing);
    const verification = record(observation.verification);
    const certificate = record(verification.certificate);
    const hasCertificate = Object.keys(certificate).length > 0;
    const result =
      verification.primaryStatus ||
      (Array.isArray(verification.outcomes)
        ? verification.outcomes[0]
        : undefined) ||
      verification.label;
    const remarks: string[] = [];
    if (listing.remarks) remarks.push(String(listing.remarks));
    if (!Object.keys(listing).length && record(product.supplier).name)
      remarks.push(
        `Supplier (type not recorded): ${plain(record(product.supplier).name)}`,
      );
    if (listing.reviewStatus && listing.reviewStatus !== "VERIFIED")
      remarks.push(
        `Source: ${listing.reviewStatus === "SOURCE_LISTED_REQUIRES_REVIEW" ? "review required" : label(listing.reviewStatus)}`,
      );
    const expiry = calendarDate(listing.certificateExpiry);
    const sourceExpired = Boolean(
      expiry && inspectionDay && expiry < inspectionDay,
    );
    const outsideScope = Boolean(
      listing.sourceCompanyId &&
        companyId &&
        listing.sourceCompanyId !== companyId,
    );
    if (sourceExpired) remarks.push("Source cert. expired");
    if (hasCertificate && Object.keys(listing).length)
      remarks.push(
        `MARML source: ${plain(listing.certificateBody)} / ${shortDate(listing.certificateExpiry)}`,
      );
    if (outsideScope) remarks.push("Outside source company scope");
    remarks.push(
      `Detail ${index + 1}: ${label(observation.conclusion || "NOT_RECORDED")}`,
    );
    const coveredBySourceNote =
      (result === "MARML_REVIEW_REQUIRED" &&
        listing.reviewStatus === "SOURCE_LISTED_REQUIRES_REVIEW") ||
      (result === "MARML_CERTIFICATE_EXPIRED" && sourceExpired) ||
      (result === "OUT_OF_MARML_SCOPE" && outsideScope);
    if (!coveredBySourceNote)
      remarks.push(result ? label(result) : "Not evaluated");
    if (listing.sourcePage && listing.rowNumber)
      remarks.push(
        `Source p${plain(listing.sourcePage)}, row ${plain(listing.rowNumber)}`,
      );
    const name = listing.name || product.name || observation.observedName;
    return {
      category: listing.category
        ? label(listing.category)
        : "OTHER INSPECTED MATERIALS",
      values: [
        String(index + 1),
        `${plain(name)}${product.itemCode ? `\nItem: ${plain(product.itemCode)}` : ""}`,
        plain(listing.insNumber),
        plain(listing.physicalState),
        plain(
          observation.observedBrand ||
            listing.brand ||
            record(product.brand).name,
        ),
        plain(
          observation.observedManufacturer ||
            listing.manufacturer ||
            record(product.manufacturer).name,
        ),
        plain(listing.localSupplier),
        plain(listing.foreignSupplier),
        plain(
          hasCertificate
            ? certificate.issuer || certificate.type
            : listing.certificateBody,
        ),
        shortDate(
          hasCertificate ? certificate.expiresAt : listing.certificateExpiry,
        ),
        plain(listing.otherDocument),
        plain(listing.refNo),
        remarks.join("\n"),
      ],
    };
  });
}

type Metadata = {
  reference: string;
  revision: number;
  generatedAt: Date;
  status?: string;
};
const black = rgb(0.08, 0.08, 0.08),
  white = rgb(1, 1, 1),
  gray = rgb(0.92, 0.92, 0.92);

/** A4 landscape inspection register using the supplied MARML's grouped grid. */
export function appendMarmlInspectionRegister(
  document: PDFDocument,
  normal: PDFFont,
  bold: PDFFont,
  value: unknown,
  meta: Metadata,
): void {
  const data = record(value),
    company = record(data.company),
    location = record(data.location);
  const entries = marmlInspectionRows(data);
  const listings = array(data.observations).map((o) =>
    record(record(o.product).rawMaterialListing),
  );
  const metadata = listings.map((listing) =>
    record(listing.sourceMetadata || listing.sourceMetadataJson),
  );
  const unique = (key: string): string => {
    const values = [
      ...new Set(
        metadata
          .map((item) => item[key])
          .filter(Boolean)
          .map(String),
      ),
    ];
    return values.length === 1
      ? values[0]
      : values.length > 1
        ? "Multiple source lists"
        : "-";
  };
  const margin = 22,
    width = 797.89;
  const widths = [22, 145, 23, 24, 58, 145, 74, 50, 48, 52, 46, 30, 80.89];
  let page: PDFPage,
    y = 0,
    category: string | undefined,
    freshRowSpace = 0;
  const fontSize = 6.8,
    lineHeight = 8.8,
    bottom = 64;

  function wrap(
    value: unknown,
    maxWidth: number,
    size = fontSize,
    font = normal,
  ): string[] {
    const result: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (
          font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <=
          maxWidth
        ) {
          line = line ? `${line} ${word}` : word;
          continue;
        }
        if (line) result.push(line);
        line = "";
        for (const character of word) {
          if (
            font.widthOfTextAtSize(line + character, size) > maxWidth &&
            line
          ) {
            result.push(line);
            line = "";
          }
          line += character;
        }
      }
      result.push(line || " ");
    }
    return result;
  }
  function box(
    x: number,
    top: number,
    boxWidth: number,
    height: number,
    fill = white,
  ) {
    page.drawRectangle({
      x,
      y: top - height,
      width: boxWidth,
      height,
      color: fill,
      borderColor: black,
      borderWidth: 0.5,
    });
  }
  function cell(
    value: unknown,
    x: number,
    top: number,
    boxWidth: number,
    height: number,
    options: {
      font?: PDFFont;
      size?: number;
      fill?: ReturnType<typeof rgb>;
      centered?: boolean;
    } = {},
  ) {
    const font = options.font || normal,
      size = options.size || fontSize;
    box(x, top, boxWidth, height, options.fill);
    const lines = wrap(value, boxWidth - 6, size, font);
    const start = options.centered
      ? top - (height - lines.length * (size + 2)) / 2 - size
      : top - size - 4;
    lines.forEach((line, index) =>
      page.drawText(line, {
        x: options.centered
          ? x + Math.max(3, (boxWidth - font.widthOfTextAtSize(line, size)) / 2)
          : x + 3,
        y: start - index * (size + 2),
        size,
        font,
        color: options.fill === black ? white : black,
      }),
    );
  }
  function tableHeader() {
    const top = y,
      height = 44,
      groupHeight = 17;
    let x = margin;
    const headers = [
      "NO",
      "RAW MATERIAL NAME\n(Full name with code)",
      "INS\nNo",
      "P.S",
      "BRAND",
      "MANUFACTURER",
    ];
    for (let i = 0; i < 6; i++) {
      cell(headers[i], x, top, widths[i], height, {
        font: bold,
        size: 6.2,
        fill: black,
        centered: true,
      });
      x += widths[i];
    }
    cell("SUPPLIER", x, top, widths[6] + widths[7], groupHeight, {
      font: bold,
      size: 6.5,
      fill: black,
      centered: true,
    });
    cell("LOCAL", x, top - groupHeight, widths[6], height - groupHeight, {
      font: bold,
      size: 6.2,
      fill: black,
      centered: true,
    });
    x += widths[6];
    cell("FOREIGN", x, top - groupHeight, widths[7], height - groupHeight, {
      font: bold,
      size: 6.2,
      fill: black,
      centered: true,
    });
    x += widths[7];
    cell("HALAL CERTIFICATE", x, top, widths[8] + widths[9], groupHeight, {
      font: bold,
      size: 6.3,
      fill: black,
      centered: true,
    });
    cell("NAME OF CB", x, top - groupHeight, widths[8], height - groupHeight, {
      font: bold,
      size: 5.9,
      fill: black,
      centered: true,
    });
    x += widths[8];
    cell("EXPIRY DATE", x, top - groupHeight, widths[9], height - groupHeight, {
      font: bold,
      size: 5.9,
      fill: black,
      centered: true,
    });
    x += widths[9];
    for (const [index, heading] of [
      [10, "OTHER\nDOCUMENT"],
      [11, "REF\nNO"],
      [12, "REMARK /\nINSPECTION"],
    ] as const) {
      cell(heading, x, top, widths[index], height, {
        font: bold,
        size: 6,
        fill: black,
        centered: true,
      });
      x += widths[index];
    }
    y -= height;
  }
  function newPage() {
    page = document.addPage([841.89, 595.28]);
    page.drawRectangle({
      x: margin,
      y: 537,
      width: 64,
      height: 38,
      color: black,
    });
    page.drawText("HAC", {
      x: margin + 5,
      y: 546,
      size: 26,
      font: bold,
      color: white,
    });
    page.drawText("INSPECTED RAW MATERIAL LIST - MARML", {
      x: 98,
      y: 561,
      size: 14.2,
      font: bold,
      color: black,
    });
    page.drawText(
      "Saved inspection record | Source list values and observed results",
      { x: 99, y: 546, size: 7.2, font: normal, color: black },
    );
    const reference = wrap(
      `Document: ${meta.reference}\nRevision: ${meta.revision} | ${label(meta.status || data.status)}\nIssued: ${shortDate(meta.generatedAt)}`,
      167,
      6.3,
    );
    reference.forEach((line, index) =>
      page.drawText(line, {
        x: 650,
        y: 572 - index * 8.3,
        size: 6.3,
        font: normal,
        color: black,
      }),
    );
    if (data.isDemo || company.isDemo)
      page.drawText("FICTIONAL DEMONSTRATION RECORD", {
        x: 99,
        y: 534,
        size: 6,
        font: bold,
        color: rgb(0.6, 0.12, 0.12),
      });
    const companyLines = wrap(
      `COMPANY NAME: ${plain(company.legalName || company.tradingName)}`,
      600,
      10,
      bold,
    );
    const companyHeight = Math.max(25, companyLines.length * 12 + 8);
    y = 523;
    cell(companyLines.join("\n"), margin, y, 613, companyHeight, {
      font: bold,
      size: 10,
      fill: gray,
    });
    cell(
      `SOURCE APPLICATION:\n${unique("applicationNumber")}`,
      margin + 613,
      y,
      width - 613,
      companyHeight,
      { size: 7.2, fill: gray },
    );
    y -= companyHeight;
    const address = `PLANT / LOCATION: ${plain(location.name)} | ${plain(location.address)}`;
    const addressHeight = Math.max(
      23,
      wrap(address, 607, 7.2).length * 9.2 + 8,
    );
    cell(address, margin, y, 613, addressHeight, { size: 7.2 });
    cell(
      `MARML TYPE (SOURCE): ${unique("marmlType")}`,
      margin + 613,
      y,
      width - 613,
      addressHeight,
      { size: 7.2 },
    );
    y -= addressHeight;
    const sourceCompanies = [
      ...new Set(
        listings
          .map((listing) => listing.sourceCompanyName)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const detail = `INSPECTOR: ${plain(record(data.inspector).name)} | START: ${shortDate(data.startedAt)} | INSPECTION: ${plain(data.reference)}\nSOURCE LIST COMPANY: ${sourceCompanies.length ? sourceCompanies.join("; ") : "No source listing linked"}`;
    const detailHeight = Math.max(
      23,
      wrap(detail, width - 6, 7.2).length * 9.2 + 8,
    );
    cell(detail, margin, y, width, detailHeight, { size: 7.2 });
    y -= detailHeight;
    tableHeader();
    freshRowSpace = y - bottom - 15;
    category = undefined;
    page.drawText(
      "Certificate columns use the formal record when present, otherwise the source listing. This inspection does not issue or renew certification.",
      { x: margin, y: 51, size: 6.1, font: normal, color: black },
    );
  }
  function categoryBand(value: string) {
    cell(value, margin, y, width, 15, {
      font: bold,
      size: 7,
      fill: gray,
      centered: true,
    });
    y -= 15;
    category = value;
  }
  newPage();
  if (!entries.length) {
    cell("No material observations have been recorded.", margin, y, width, 30);
    return;
  }
  entries.forEach((entry) => {
    const cells = entry.values.map((value, index) =>
      wrap(value, widths[index] - 6),
    );
    const longest = Math.max(...cells.map((lines) => lines.length));
    const completeHeight = longest * lineHeight + 8;
    if (
      completeHeight <= freshRowSpace &&
      y - completeHeight - (category === entry.category ? 0 : 15) < bottom
    )
      newPage();
    let offset = 0;
    while (offset < longest) {
      if (y - 30 - (category === entry.category ? 0 : 15) < bottom) newPage();
      if (category !== entry.category) categoryBand(entry.category);
      const available = Math.max(1, Math.floor((y - bottom - 8) / lineHeight));
      const lines = Math.min(longest - offset, available);
      const height = lines * lineHeight + 8;
      let x = margin;
      cells.forEach((values, index) => {
        box(x, y, widths[index], height);
        const printed =
          index === 0 && offset > 0
            ? [entry.values[0], "cont."]
            : values.slice(offset, offset + lines);
        printed.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: x + 3,
            y: y - fontSize - 4 - lineIndex * lineHeight,
            size: fontSize,
            font: normal,
            color: black,
          }),
        );
        x += widths[index];
      });
      y -= height;
      offset += lines;
      if (offset < longest) newPage();
    }
  });
}
