import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { audit, hashPassword, requireRole, type AuthUser } from "./auth";
import { ApiError } from "./errors";
import { MARML_MATERIALS, MARML_SOURCE } from "../data/marml-materials";

const ADMIN = ["SUPER_ADMIN", "HAC_ADMIN"];
export const WORKSPACE_COMPANY_NAMES = [
  "Keells", "Cargills Food City", "Arpico", "Lanka Sathosa", "SPAR Sri Lanka",
  "Glomark", "Laugfs Supermarkets", "Ceylon Agro Industries", "Ceylon Biscuits", "Maliban",
] as const;
export const WORKSPACE_SUPERVISORS = ["Yaasir", "Imthad", "Farraj", "Mazhar", "Imaath"].map((name) => ({
  name, email: `${name.toLowerCase()}@supervisors.hac.test`,
}));
export const WORKSPACE_COMPANY_IDS = WORKSPACE_COMPANY_NAMES.map((_, index) => `workspace-company-${String(index + 1).padStart(2, "0")}`);
export const WORKSPACE_SUPERVISOR_IDS = WORKSPACE_SUPERVISORS.map((_, index) => `workspace-supervisor-${String(index + 1).padStart(2, "0")}`);
export const WORKSPACE_CHECKLIST_VERSION_ID = "workspace-checklist-marml-v1";
const SOURCE_COMPANY_ID = WORKSPACE_COMPANY_IDS[7];
export function isMarmlSourceCompanyName(value: string): boolean {
  return value.toLowerCase().replace(/\b(private|pvt|limited|ltd)\b/g, "").replace(/[^a-z]/g, "") === "ceylonagroindustries";
}
const string = z.string().trim().min(1).max(191);
const optionalCell = z.string().trim().max(10000).nullable().optional();
const supervisorInput = z.object({ name: string, email: z.string().trim().toLowerCase().pipe(z.email().max(191)) }).strict();
export const workspaceSetupSchema = z.object({
  companyNames: z.array(string).length(10).optional(),
  supervisors: z.array(supervisorInput).length(5),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.supervisors.map((item) => item.email)).size !== 5)
    ctx.addIssue({ code: "custom", path: ["supervisors"], message: "Use five different supervisor email addresses." });
  if (value.companyNames && new Set(value.companyNames.map((name) => name.toLowerCase())).size !== 10)
    ctx.addIssue({ code: "custom", path: ["companyNames"], message: "Use ten different company names." });
});
export type WorkspaceSetupInput = z.infer<typeof workspaceSetupSchema>;
const materialFields = z.object({
  name: string.optional(),
  category: z.enum(["MEAT_AND_MEAT_BASED_RAW_MATERIALS", "FLAVOURS"]).optional(),
  insNumber: z.string().trim().max(191).nullable().optional(),
  physicalState: z.enum(["s", "lq", "l", "pw"]).nullable().optional(),
  brand: z.string().trim().max(191).nullable().optional(),
  manufacturer: optionalCell, localSupplier: optionalCell, foreignSupplier: optionalCell,
  certificateBody: z.string().trim().max(191).nullable().optional(),
  certificateExpiry: z.iso.date().nullable().optional(),
  otherDocument: optionalCell, refNo: z.string().trim().max(191).nullable().optional(),
  remarks: optionalCell, transcriptionNotes: optionalCell,
  reviewStatus: z.enum(["SOURCE_LISTED_REQUIRES_REVIEW", "VERIFIED", "SUSPENDED", "REVOKED"]).optional(),
}).strict();
export const workspacePatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("material"), id: string, fields: materialFields }).strict(),
  z.object({ action: z.literal("company"), id: string, fields: z.object({
    legalName: string.optional(), tradingName: z.string().trim().max(191).nullable().optional(),
    registrationNumber: z.string().trim().max(191).nullable().optional(),
    email: z.email().nullable().optional(), phone: z.string().trim().max(100).nullable().optional(),
    category: string.optional(), locationId: string.optional(), locationName: string.optional(),
    address: z.string().trim().min(1).max(10000).optional(),
  }).strict() }).strict(),
  z.object({ action: z.literal("supervisor"), id: string, fields: z.object({
    name: string.optional(), email: z.string().trim().toLowerCase().pipe(z.email().max(191)).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(12).max(1024).optional(),
    companyIds: z.array(string).length(2).refine((ids) => ids[0] !== ids[1], "Choose two different companies.").optional(),
  }).strict() }).strict(),
]);
export type WorkspacePatchInput = z.infer<typeof workspacePatchSchema>;
type Dependencies = { database?: PrismaClient; passwordHasher?: typeof hashPassword; passwordGenerator?: () => string };
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const identifier = (prefix: string, name: string) => `${prefix}-${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
const entityName = (name: string | null | undefined, fallback: string) => (name?.split(",")[0].trim() || fallback).slice(0, 191);
export const materialCertificateDate = (value: string) => new Date(`${value}T23:59:59.999+05:30`);

const staffSelect = {
  id: true, name: true, email: true, isActive: true,
  assignments: { where: { isActive: true, revokedAt: null }, include: { company: { select: { id: true, legalName: true } } } },
} satisfies Prisma.UserSelect;

type WorkspaceReadDatabase = Pick<PrismaClient, "company" | "user" | "rawMaterialListing" | "checklistTemplateVersion">;
export async function getWorkspaceSetup(user: AuthUser, database: WorkspaceReadDatabase = db) {
  requireRole(user, ADMIN);
  const [companies, supervisors, materials, checklist] = await Promise.all([
    database.company.findMany({ where: { id: { in: WORKSPACE_COMPANY_IDS } }, include: { locations: true }, orderBy: { id: "asc" } }),
    database.user.findMany({ where: { id: { in: WORKSPACE_SUPERVISOR_IDS } }, select: staffSelect, orderBy: { id: "asc" } }),
    database.rawMaterialListing.findMany({ where: { sourceDocument: MARML_SOURCE.id }, include: { product: { include: { brand: true, manufacturer: true } } }, orderBy: { rowNumber: "asc" } }),
    database.checklistTemplateVersion.findUnique({ where: { id: WORKSPACE_CHECKLIST_VERSION_ID }, select: { id: true } }),
  ]);
  return {
    defaults: {
      companyNames: WORKSPACE_COMPANY_NAMES.map((name, index) => companies.find((company) => company.id === WORKSPACE_COMPANY_IDS[index])?.legalName || name),
      supervisors: WORKSPACE_SUPERVISORS.map((person, index) => {
        const existing = supervisors.find((supervisor) => supervisor.id === WORKSPACE_SUPERVISOR_IDS[index]);
        return existing ? { name: existing.name, email: existing.email } : person;
      }),
    },
    source: MARML_SOURCE, companies, supervisors, materials,
    checklistVersionId: checklist?.id || null,
    imported: companies.length === 10 && supervisors.length === 5 && materials.length === MARML_MATERIALS.length,
  };
}

async function productEntities(tx: Prisma.TransactionClient, values: { brand?: string | null; manufacturer?: string | null; localSupplier?: string | null; foreignSupplier?: string | null }) {
  const brandName = entityName(values.brand, "Brand not stated in supplied MARML");
  const manufacturerName = entityName(values.manufacturer, "Manufacturer not stated in supplied MARML");
  const brand = await tx.brand.upsert({ where: { name: brandName }, create: { id: identifier("marml-brand", brandName), name: brandName }, update: {} });
  const manufacturer = await tx.manufacturer.upsert({ where: { name: manufacturerName }, create: { id: identifier("marml-manufacturer", manufacturerName), name: manufacturerName }, update: {} });
  const supplierText = values.localSupplier || values.foreignSupplier;
  const supplierName = supplierText ? entityName(supplierText, "") : null;
  const supplier = supplierName ? await tx.supplier.upsert({ where: { name: supplierName }, create: { id: identifier("marml-supplier", supplierName), name: supplierName }, update: {} }) : null;
  return { brandId: brand.id, manufacturerId: manufacturer.id, supplierId: supplier?.id || null };
}

export async function provisionWorkspace(user: AuthUser, rawInput: unknown, dependencies: Dependencies = {}) {
  requireRole(user, ADMIN);
  const input = workspaceSetupSchema.parse(rawInput);
  if (!isMarmlSourceCompanyName(input.companyNames?.[7] || WORKSPACE_COMPANY_NAMES[7]))
    throw new ApiError(422, "MARML_SOURCE_COMPANY_MISMATCH", "The supplied MARML belongs to Ceylon Agro Industries. Keep that company in the eighth position; its approval scope cannot be transferred to another company.");
  const database = dependencies.database || db;
  const passwordHasher = dependencies.passwordHasher || hashPassword;
  const generatePassword = dependencies.passwordGenerator || (() => `Hac-${randomBytes(24).toString("base64url")}`);
  const credentials: Array<{ name: string; email: string; password: string; companyNames: string[] }> = [];
  let existingUsersPreserved = 0;
  const result = await database.$transaction(async (tx) => {
    for (const [index, defaultName] of WORKSPACE_COMPANY_NAMES.entries()) {
      const name = input.companyNames?.[index] || defaultName;
      const companyId = WORKSPACE_COMPANY_IDS[index];
      const company = await tx.company.upsert({ where: { id: companyId }, create: {
        id: companyId, legalName: name, tradingName: name, registrationNumber: null,
        category: index >= 7 ? "MANUFACTURER" : "RETAILER", status: "ACTIVE", isDemo: false,
      }, update: {} });
      if (index === 7 && !isMarmlSourceCompanyName(company.legalName))
        throw new ApiError(422, "MARML_SOURCE_COMPANY_MISMATCH", "The MARML source company profile no longer identifies Ceylon Agro Industries. Review that profile before importing its materials.");
      await tx.companyLocation.upsert({ where: { id: `${companyId}-main` }, create: {
        id: `${companyId}-main`, companyId, name: "Main location", type: index >= 7 ? "FACTORY" : "BRANCH",
        address: index === 7 ? MARML_SOURCE.plantAddress : "Address pending confirmation", isActive: true,
      }, update: {} });
    }
    for (const [index, person] of input.supervisors.entries()) {
      const userId = WORKSPACE_SUPERVISOR_IDS[index];
      const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
      if (existing) {
        if (existing.role !== "SUPERVISOR") throw new ApiError(409, "SETUP_ACCOUNT_CONFLICT", "A setup account identifier is already used by another role.");
        existingUsersPreserved++;
        continue;
      }
      if (await tx.user.findUnique({ where: { email: person.email }, select: { id: true } }))
        throw new ApiError(409, "SETUP_EMAIL_EXISTS", "A supervisor email already belongs to an existing account. Choose another email; existing accounts are preserved.");
      const password = generatePassword();
      const passwordHash = await passwordHasher(password);
      await tx.user.create({ data: { id: userId, ...person, role: "SUPERVISOR", companyId: null, isActive: true, passwordHash } });
      const companyIds = WORKSPACE_COMPANY_IDS.slice(index * 2, index * 2 + 2);
      for (const companyId of companyIds) await tx.supervisorCompanyAssignment.create({ data: { userId, companyId, isActive: true } });
      const names = await tx.company.findMany({ where: { id: { in: companyIds } }, select: { legalName: true }, orderBy: { id: "asc" } });
      credentials.push({ ...person, password, companyNames: names.map((company) => company.legalName) });
    }
    for (const row of MARML_MATERIALS) {
      const itemCode = `MARML-PSA0135-${String(row.rowNumber).padStart(3, "0")}`;
      const existingListing = await tx.rawMaterialListing.findUnique({ where: { sourceDocument_rowNumber: { sourceDocument: MARML_SOURCE.id, rowNumber: row.rowNumber } }, select: { id: true } });
      if (existingListing) continue;
      const entities = await productEntities(tx, row);
      const productId = `workspace-material-${String(row.rowNumber).padStart(3, "0")}`;
      const conflict = await tx.product.findFirst({ where: { OR: [
        { id: productId }, { itemCode },
        { normalizedName: row.name.toLowerCase(), brandId: entities.brandId, manufacturerId: entities.manufacturerId },
      ] }, select: { id: true } });
      if (conflict) throw new ApiError(409, "MARML_IDENTITY_CONFLICT", `MARML row ${row.rowNumber} conflicts with an existing catalogue identity or item code. Review the existing record before importing; it was not overwritten.`);
      const product = await tx.product.create({ data: {
        id: productId, itemCode,
        name: row.name, normalizedName: row.name.toLowerCase(), type: "RAW_MATERIAL", category: row.category,
        ...entities, status: "ACTIVE", isDemo: false,
        description: "Transcribed from the user-supplied MARML photographs. Historical source listing; current approval requires review of scope and printed expiry.",
      } });
      await tx.rawMaterialListing.create({ data: {
        id: `workspace-marml-${String(row.rowNumber).padStart(3, "0")}`, productId: product.id,
        sourceCompanyId: SOURCE_COMPANY_ID, sourceCompanyName: MARML_SOURCE.companyName,
        sourceDocument: MARML_SOURCE.id, sourceMetadata: jsonValue(MARML_SOURCE), sourceRow: jsonValue(row),
        ...row, certificateExpiry: row.certificateExpiry ? materialCertificateDate(row.certificateExpiry) : null,
        reviewStatus: "SOURCE_LISTED_REQUIRES_REVIEW",
      } });
      await tx.companyItem.create({ data: { companyId: SOURCE_COMPANY_ID, productId: product.id, relationship: "USER_SUPPLIED_MARML", status: "ACTIVE" } });
    }
    await tx.checklistTemplate.upsert({ where: { id: "workspace-checklist-marml" }, create: {
      id: "workspace-checklist-marml", name: "Raw material site inspection",
      description: "Operational starter checklist for recorded material inspections. Review and customise to the organisation's HAC policy.",
    }, update: {} });
    await tx.checklistTemplateVersion.upsert({ where: { id: WORKSPACE_CHECKLIST_VERSION_ID }, create: {
      id: WORKSPACE_CHECKLIST_VERSION_ID, templateId: "workspace-checklist-marml", version: 1, status: "PUBLISHED", publishedAt: new Date(),
    }, update: {} });
    const questions = [
      ["Identity", "Were the inspected material identities, labels and batch details checked against the records?"],
      ["Approval evidence", "Were certification scope, source documents and printed expiry dates checked?"],
      ["Storage", "Were material segregation, packaging integrity and storage conditions checked?"],
      ["Follow-up", "Were discrepancies and any required follow-up recorded?"],
    ];
    for (const [index, [section, question]] of questions.entries()) await tx.checklistQuestion.upsert({ where: { id: `workspace-checklist-question-${index + 1}` }, create: {
      id: `workspace-checklist-question-${index + 1}`, versionId: WORKSPACE_CHECKLIST_VERSION_ID,
      section, text: question, type: "COMPLIANCE", required: true, order: index,
      options: ["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"],
    }, update: {} });
    await audit(tx, user, "IMPORT_WORKSPACE", "WorkspaceSetup", MARML_SOURCE.id, undefined, {
      companyCount: 10, supervisorCount: 5, newSupervisorCount: credentials.length,
      source: MARML_SOURCE.id, materialCount: MARML_MATERIALS.length,
    });
    // Keep these reads in the same transaction: a failed summary must roll back
    // new accounts rather than commit unrecoverable one-time credentials.
    return getWorkspaceSetup(user, tx);
  }, { isolationLevel: "Serializable", timeout: 120000, maxWait: 10000 });
  return { ...result, credentials, materialsImported: result.materials.length, existingUsersPreserved };
}

export async function updateWorkspaceRecord(user: AuthUser, rawInput: unknown, database: PrismaClient = db) {
  requireRole(user, ADMIN);
  const input = workspacePatchSchema.parse(rawInput);
  if (!Object.keys(input.fields).length) throw new ApiError(400, "NO_CHANGES", "Choose at least one field to update.");
  return database.$transaction(async (tx) => {
    if (input.action === "material") {
      const before = await tx.rawMaterialListing.findUnique({ where: { id: input.id } });
      if (!before) throw new ApiError(404, "NOT_FOUND", "Material listing not found.");
      const fields = { ...input.fields };
      const next = { ...before, ...fields };
      const entities = await productEntities(tx, next);
      const { certificateExpiry, ...changes } = fields;
      await tx.product.update({ where: { id: before.productId }, data: {
        name: next.name, normalizedName: next.name.toLowerCase(), category: next.category, ...entities, version: { increment: 1 },
      } });
      const updated = await tx.rawMaterialListing.update({ where: { id: input.id }, data: {
        ...changes, ...(certificateExpiry !== undefined ? { certificateExpiry: certificateExpiry ? materialCertificateDate(certificateExpiry) : null } : {}),
        version: { increment: 1 },
      }, include: { product: { include: { brand: true, manufacturer: true } } } });
      await audit(tx, user, "UPDATE_MARML_LISTING", "RawMaterialListing", before.id, before, { ...changes, certificateExpiry: updated.certificateExpiry, version: updated.version }, before.sourceCompanyId);
      return updated;
    }
    if (input.action === "company") {
      if (!WORKSPACE_COMPANY_IDS.includes(input.id)) throw new ApiError(404, "NOT_FOUND", "Managed company not found.");
      const before = await tx.company.findUnique({ where: { id: input.id }, include: { locations: true } });
      if (!before) throw new ApiError(404, "NOT_FOUND", "Company not found.");
      const { locationId, locationName, address, ...fields } = input.fields;
      if ((locationName !== undefined || address !== undefined) && !locationId) throw new ApiError(422, "LOCATION_REQUIRED", "Choose the company location to update.");
      if (locationId) {
        if (!before.locations.some((location) => location.id === locationId)) throw new ApiError(422, "LOCATION_MISMATCH", "The location does not belong to this company.");
        await tx.companyLocation.update({ where: { id: locationId }, data: { ...(locationName !== undefined ? { name: locationName } : {}), ...(address !== undefined ? { address } : {}) } });
      }
      const result = await tx.company.update({ where: { id: input.id }, data: fields, include: { locations: true } });
      await audit(tx, user, "UPDATE", "Company", before.id, before, result, before.id);
      return result;
    }
    if (!WORKSPACE_SUPERVISOR_IDS.includes(input.id)) throw new ApiError(404, "NOT_FOUND", "Managed supervisor not found.");
    const before = await tx.user.findUnique({ where: { id: input.id }, select: { ...staffSelect, role: true } });
    if (!before || before.role !== "SUPERVISOR") throw new ApiError(404, "NOT_FOUND", "Supervisor not found.");
    const { companyIds, password, ...fields } = input.fields;
    if (companyIds) {
      const companies = await tx.company.findMany({ where: { id: { in: companyIds }, archivedAt: null, status: "ACTIVE" }, select: { id: true } });
      if (companies.length !== 2) throw new ApiError(422, "INVALID_ASSIGNMENT", "Choose two active companies.");
      await tx.supervisorCompanyAssignment.updateMany({ where: { userId: input.id, companyId: { notIn: companyIds }, isActive: true }, data: { isActive: false, revokedAt: new Date() } });
      for (const companyId of companyIds) await tx.supervisorCompanyAssignment.upsert({ where: { userId_companyId: { userId: input.id, companyId } }, create: { userId: input.id, companyId, isActive: true }, update: { isActive: true, revokedAt: null } });
    }
    const result = await tx.user.update({ where: { id: input.id }, data: {
      ...fields, ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
    }, select: staffSelect });
    if (fields.isActive === false || fields.email !== undefined || password !== undefined)
      await tx.session.deleteMany({ where: { userId: input.id } });
    await audit(tx, user, "UPDATE_SUPERVISOR_ACCESS", "User", input.id, before, result);
    return result;
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
