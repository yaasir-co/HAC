/**
 * Manual transcription of the three MARML photographs supplied by the user.
 * This preserves the historical source, its company scope and its printed dates.
 * A source-list entry is not a newly issued certificate or a claim of current approval.
 */
export const MARML_SOURCE = {
  id: "user-marml-ceylon-agro-psa0135-pages-1-3",
  title: "MASTER APPROVED RAW MATERIAL LIST - MARML",
  sourceType: "USER_SUPPLIED_PHOTOGRAPHS",
  companyName: "CEYLON AGRO INDUSTRIES LTD",
  plantAddress: "346, NEGOMBO ROAD, SEEDUWA",
  applicationNumber: "PSA0135",
  marmlType: "COMMON",
  suppliedPages: [1, 2, 3],
  declaredPageCount: 31,
  importedRowCount: 39,
  documentNumber: null,
  createdDateText: "10/03/2014",
  revisionDateText: null,
  authorizedByText: "Head TD",
  reviewRequired: true,
  notes:
    "Only pages 1-3 were supplied. Document-number punctuation and the small creation/authorization block need comparison with the original document. Blank cells remain blank. Certificate dates are transcribed as printed and must be evaluated at the inspection date. Company scope must not be extended to other companies automatically.",
} as const;

export type MarmlMaterialCategory =
  | "MEAT_AND_MEAT_BASED_RAW_MATERIALS"
  | "FLAVOURS";

export type MarmlMaterialRow = {
  rowNumber: number;
  sourcePage: 1 | 2 | 3;
  category: MarmlMaterialCategory;
  name: string;
  insNumber: string | null;
  physicalState: "s" | "lq" | "l" | "pw" | null;
  brand: string | null;
  manufacturer: string | null;
  localSupplier: string | null;
  foreignSupplier: string | null;
  certificateBody: string | null;
  certificateExpiry: string | null;
  otherDocument: string | null;
  refNo: string | null;
  remarks: string | null;
  transcriptionNotes: string | null;
  transcriptionConfidence: "CLEAR" | "REVIEW_REQUIRED";
};

const manufacturers = {
  pussalla: "Pussalla Meat Producers (Pvt) Ltd",
  prima: "Ceylon Grain Elevators PLC",
  nelna:
    "Nelna Farm (Pvt.) Ltd. Hathduwa Estate, Ranwala, Meethirigala",
  jfChicken: "Jaya Farm, Nattandiya Rd., Horagolla North, Marawila",
  anthoneys: "New Anthoney's Farms (Pvt) Ltd.",
  maxies: "Maxies Company (Pvt) Ltd",
  cic: "CIC Poultry Farms",
  delmo: "Delmo Chicken & Agro (Pvt) Ltd.",
  viscofan:
    "Naturin Viscofan GmbH, Badeniastrasse 13, D-69469 Weinheim, Germany",
  gelita:
    "Gelita Australia Pty Ltd, 50 Flood Road, Josephville Via Beaudesert, Queensland 4285, Australia",
  silesia:
    "Silesia Flavours South East Asia Pte Ltd, 7 Chin Bee Drive, Singapore 619857",
  kalsec:
    "Kalsec Inc., 3713 West Main Street, Kalamazoo, Michigan 49006 USA",
  ea:
    "Expressions Aromatiques, ZI de l'Argile, 460/112 Avenue de la Quiera, 06370 Mouans-Sartoux, France",
  rasarco:
    "Ceylon Essence & Beverage Company Limited, No. 15, Arthur's Place, Dehiwela",
  iberchem:
    "Scentium Flavours SL / Iberchem Aromas, S.L., Poligono Industrial Las Salinas, P.12-16, Alhama de Murcia, Murcia, 30840 Spain",
  flower:
    "Guangzhou Flower Flavours & Fragrances Co., Ltd, No. 1 Dongkeng Str., Dongfeng East Road, North Baiyun Ave., Yongping Str., Baiyun District, Guangzhou, Guangdong Province, China. Manufacturer: Guangdong Yahe Bio Tech Co., Ltd., No. 18, Chuangxing Road, Guangqing Industrial Park, Shijiao Town, Qingcheng District, Qingyuan, Guangdong Province, China",
} as const;

function material(
  rowNumber: number,
  name: string,
  values: Partial<Omit<MarmlMaterialRow, "rowNumber" | "sourcePage" | "category" | "name">>,
): MarmlMaterialRow {
  return {
    rowNumber,
    sourcePage: rowNumber <= 16 ? 1 : rowNumber <= 32 ? 2 : 3,
    category:
      rowNumber <= 28 ? "MEAT_AND_MEAT_BASED_RAW_MATERIALS" : "FLAVOURS",
    name,
    insNumber: null,
    physicalState: null,
    brand: null,
    manufacturer: null,
    localSupplier: null,
    foreignSupplier: null,
    certificateBody: null,
    certificateExpiry: null,
    otherDocument: null,
    refNo: null,
    remarks: null,
    transcriptionNotes: null,
    transcriptionConfidence: "CLEAR",
    ...values,
  };
}

function poultry(
  rowNumber: number,
  name: string,
  brand: string,
  manufacturer: string,
  certificateExpiry: string,
  localSupplier: string | null = null,
): MarmlMaterialRow {
  return material(rowNumber, name, {
    physicalState: "s",
    brand,
    manufacturer,
    localSupplier,
    certificateBody: "HAC",
    certificateExpiry,
  });
}

function collagen(rowNumber: number, name: string): MarmlMaterialRow {
  return material(rowNumber, name, {
    brand: "Viscofan",
    manufacturer: manufacturers.viscofan,
    localSupplier: "Aletek International (Private) Limited",
    certificateBody: "HAC",
    certificateExpiry: "2025-08-11",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes:
      "Compare the product/calibre/lot code and manufacturer address with the original document before treating the transcription as a confirmed exact identity. The photograph does not provide a certificate number.",
  });
}

const iberchemReview =
  "The small manufacturer-address text is transcribed from the photograph and should be checked against the original document.";
const flowerReview =
  "The long manufacturer/address cell is small and soft in the photograph; confirm the Yahe company spelling, road spelling and full address against the original document. No certificate number is visible.";

export const MARML_MATERIALS: MarmlMaterialRow[] = [
  poultry(1, "Chicken Boneless Meat", "Star Chicken", manufacturers.pussalla, "2025-09-11"),
  poultry(2, "Chicken Boneless Meat", "Prima", manufacturers.prima, "2025-12-31"),
  poultry(3, "Chicken Drumstick", "Prima", manufacturers.prima, "2025-12-31", "Ceylon Grain Elevators"),
  {
    ...poultry(4, "Chicken MDM", "Nelna", manufacturers.nelna, "2025-06-05"),
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: "Confirm the small estate/address spelling in the manufacturer cell against the original document.",
  },
  {
    ...poultry(5, "Chicken MSM", "JF Chicken", manufacturers.jfChicken, "2025-09-09"),
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: "Confirm the small manufacturer-address spelling against the original document.",
  },
  poultry(6, "Chicken Skin", "Anthoney's", manufacturers.anthoneys, "2025-06-03", "New Anthoney's Farms (Pvt) Ltd."),
  poultry(7, "Chicken Skin", "Maxie's", manufacturers.maxies, "2025-12-31", "Maxies Company (Pvt) Ltd"),
  poultry(8, "Chicken Skin", "CIC", manufacturers.cic, "2025-12-31", "CIC Poultry Farms"),
  poultry(9, "Chicken Skin (Delmo)", "Delmo", manufacturers.delmo, "2025-12-31"),
  poultry(10, "Chicken Skin (Prima)", "Prima", manufacturers.prima, "2025-12-31"),
  poultry(11, "Chicken Skin (Pussalla)", "Star Chicken", manufacturers.pussalla, "2025-09-11"),
  poultry(12, "Chicken Wing", "Prima", manufacturers.prima, "2025-12-31", "Ceylon Grain Elevators"),
  collagen(13, "Collagen Casings NDX H Caliber 21 500215292 (584154)"),
  collagen(14, "Collagen Casings NDX H Calliber 27 500216167 (Lot 584551)"),
  collagen(15, "Collagen Casings Sample NDXH 26 TRA BA 70 M23-03526 500215308"),
  collagen(16, "Collagen Casings Sample NDXH 28 TRA BA 50 M23-03103 500215373"),
  collagen(17, "Collagen Casings NDX H Caliber 26 500215308 (584154)"),
  material(18, "Edible Bovine Gelatine", {
    brand: "Gelita",
    manufacturer: manufacturers.gelita,
    localSupplier: "Aletek International (Private) Limited",
    certificateBody: "HAC",
    certificateExpiry: "2025-08-11",
  }),
  poultry(19, "Mechanically Deboned Meat (MDM)", "Anthoney's", manufacturers.anthoneys, "2025-06-03", "New Anthoney's Farms (Pvt) Ltd."),
  poultry(20, "Mechanically Deboned Meat (MDM)", "Maxie's", manufacturers.maxies, "2025-12-31", "Maxies Company (Pvt) Ltd"),
  poultry(21, "Mechanically Deboned Meat (MDM)", "CIC", manufacturers.cic, "2025-12-31", "CIC Poultry Farms"),
  poultry(22, "Minced Chicken Meat", "Prima", manufacturers.prima, "2025-12-31"),
  poultry(23, "Poultry Meat", "Delmo", manufacturers.delmo, "2025-12-31"),
  poultry(24, "Skin on Boneless Thigh Meat", "Prima", manufacturers.prima, "2025-12-31", "Ceylon Grain Elevators"),
  poultry(25, "Skinless Boneless Breast Chicken", "Anthoney's", manufacturers.anthoneys, "2025-06-03"),
  poultry(26, "Skinless Boneless Breast Chicken", "Maxie's", manufacturers.maxies, "2025-12-31"),
  poultry(27, "Skinless Boneless Breast Chicken", "CIC", manufacturers.cic, "2025-12-31"),
  poultry(28, "Skinless Boneless Thigh Meat", "Prima", manufacturers.prima, "2025-12-31"),
  material(29, "Apple Flavour 1101909925", {
    physicalState: "lq",
    manufacturer: manufacturers.silesia,
    certificateBody: "MUIS",
    certificateExpiry: "2026-12-31",
    refNo: "138",
    remarks: "Ref: 75/20",
  }),
  material(30, "Aquaresin® Curry Spice Korma Style, NS 22.39.167", {
    brand: "Kalsec",
    manufacturer: manufacturers.kalsec,
    certificateBody: "IFANCA",
    certificateExpiry: "2025-03-31",
    refNo: "1",
    remarks: "Re: 116/21",
  }),
  material(31, "Aquaresin® Ginger, NS (13-06-39)", {
    physicalState: "lq",
    manufacturer: manufacturers.kalsec,
    certificateBody: "IFANCA",
    certificateExpiry: "2025-03-31",
    refNo: "2",
    remarks: "Ref: 116/21",
  }),
  material(32, "Arome Tomate LA 05409 (Tomato Flavour LA 05409)", {
    physicalState: "lq",
    brand: "EA",
    manufacturer: manufacturers.ea,
    certificateBody: "HQC",
    certificateExpiry: "2025-11-08",
    refNo: "3",
    remarks: "Ref: 63/17",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: "Confirm the small French manufacturer-address line and product code against the original document.",
  }),
  material(33, "Banana (H 039)", {
    physicalState: "lq",
    brand: "RASARCO",
    manufacturer: manufacturers.rasarco,
    certificateBody: "HAC",
    certificateExpiry: "2025-01-31",
  }),
  material(34, "Butter Flavor 61.3176", {
    physicalState: "lq",
    brand: "Iberchem",
    manufacturer: manufacturers.iberchem,
    certificateBody: "HFCE",
    certificateExpiry: "2025-07-31",
    refNo: "4",
    remarks: "Company already verified Ref: 400/16",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: iberchemReview,
  }),
  material(35, "Butter Flavour 68.06691", {
    physicalState: "l",
    brand: "Iberchem",
    manufacturer: manufacturers.iberchem,
    certificateBody: "HFCE",
    certificateExpiry: "2025-07-31",
    refNo: "4",
    remarks: "Ref: 70/17",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: "Confirm the final product-code digits and the small manufacturer-address text against the original document.",
  }),
  material(36, "Butter Flavour 68.3661", {
    physicalState: "lq",
    brand: "Iberchem",
    manufacturer: manufacturers.iberchem,
    localSupplier: "Dollor Corporation, 14, Dam Street, Colombo 12",
    certificateBody: "HFCE",
    certificateExpiry: "2025-07-31",
    refNo: "4",
    remarks: "Ref: 70/17",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: "Supplier spelling follows the photograph and needs verification; also compare the small manufacturer-address text with the original document.",
  }),
  material(37, "Cheese Flavour E1218046", {
    physicalState: "pw",
    manufacturer: manufacturers.flower,
    certificateBody: "SSPY",
    certificateExpiry: "2026-06-23",
    refNo: "5",
    remarks: "Master MARML: 2211",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: flowerReview,
  }),
  material(38, "Cheese Powder 62.4839", {
    physicalState: "pw",
    brand: "Iberchem",
    manufacturer: manufacturers.iberchem,
    certificateBody: "HFCE",
    certificateExpiry: "2025-07-31",
    refNo: "4",
    remarks: "Ref: 70/17",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: iberchemReview,
  }),
  material(39, "Cheese Powder CP-01", {
    physicalState: "pw",
    manufacturer: manufacturers.flower,
    certificateBody: "SSPY",
    certificateExpiry: "2026-06-23",
    refNo: "5",
    remarks: "Master MARML: 2211",
    transcriptionConfidence: "REVIEW_REQUIRED",
    transcriptionNotes: flowerReview,
  }),
];
