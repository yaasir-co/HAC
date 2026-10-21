import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  requireUser,
  requireRole,
  assertCompanyAccess,
  accessibleCompanyIds,
  assertSameOrigin,
  audit,
  hashPassword,
  type AuthUser,
} from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { body, json, pagination, id, text, note, date } from "@/lib/http";
import {
  getInspection,
  inspectionInclude,
  assertInspector,
  assertDraft,
  lockDraft,
  answerValid,
  submitInspection,
  jsonValue,
} from "@/lib/inspection";
import { physicalExpiryInstant, verifyProduct } from "@/lib/verification";
import { prepareEvidence } from "@/lib/evidence";
import { startInspectionNow, startInspectionSchema } from "@/lib/start-inspection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ADMIN = ["SUPER_ADMIN", "HAC_ADMIN"];
const INSPECTORS = [...ADMIN, "SUPERVISOR", "AUDITOR"];
const reference = (prefix: string) =>
  `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 12).toUpperCase()}`;
const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const productInclude = {
  brand: true,
  manufacturer: true,
  supplier: true,
  rawMaterialListing: true,
  variants: true,
  scopes: { include: { certificate: { include: { holder: true } } } },
  companies: {
    include: { company: { select: { id: true, legalName: true } } },
  },
} satisfies Prisma.ProductInclude;
const companySelect = {
  id: true,
  legalName: true,
  tradingName: true,
  isDemo: true,
};
const optionalId = id.optional();
const optionalDate = date.optional();
const statusFilter = (req: Request) =>
  new URL(req.url).searchParams.get("status") || undefined;
async function scoped(user: AuthUser) {
  const ids = await accessibleCompanyIds(user);
  return ids ? { in: ids } : undefined;
}
async function ensureLinks(
  user: AuthUser,
  companyId: string,
  inspectionId?: string,
  observationId?: string,
  productId?: string,
) {
  await assertCompanyAccess(user, companyId);
  if (inspectionId) {
    const i = await db.inspection.findUnique({ where: { id: inspectionId } });
    if (!i || i.companyId !== companyId)
      throw new ApiError(
        422,
        "INVALID_REFERENCE",
        "Inspection and company do not match.",
      );
  }
  if (observationId) {
    const o = await db.observation.findUnique({ where: { id: observationId } });
    if (
      !o ||
      !inspectionId ||
      o.inspectionId !== inspectionId ||
      (productId && o.productId !== productId)
    )
      throw new ApiError(
        422,
        "INVALID_REFERENCE",
        "Observation does not belong to this inspection and product.",
      );
  }
}
async function get(
  request: Request,
  path: string[],
  user: AuthUser,
): Promise<Response> {
  const [resource, recordId, action] = path;
  const { page, pageSize, q } = pagination(request);
  const skip = (page - 1) * pageSize;
  const companyId = await scoped(user);
  const status = statusFilter(request);
  const paged = (data: unknown[], total: number) =>
    json(data, 200, { page, pageSize, total });
  switch (resource) {
    case "health": {
      await db.$queryRaw`SELECT 1`;
      return json({
        status: "ok",
        database: "connected",
        time: new Date().toISOString(),
      });
    }
    case "dashboard": {
      const companies = { id: companyId, archivedAt: null };
      const visits = { companyId };
      const [
        companyCount,
        productCount,
        activeCertificates,
        openInspections,
        openInvestigations,
        openFindings,
        inspections,
        recentFindings,
        expiringCertificates,
      ] = await Promise.all([
        db.company.count({ where: companies }),
        db.product.count({
          where: {
            archivedAt: null,
            ...(companyId ? { companies: { some: { companyId } } } : {}),
          },
        }),
        db.certificate.count({
          where: {
            status: "ACTIVE",
            expiresAt: { gte: new Date() },
            ...(companyId
              ? {
                  OR: [
                    { holderId: companyId },
                    {
                      scopes: {
                        some: {
                          product: { companies: { some: { companyId } } },
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
        }),
        db.inspection.count({
          where: { ...visits, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
        }),
        db.investigation.count({
          where: { companyId, status: { notIn: ["RESOLVED", "CLOSED"] } },
        }),
        db.inspectionFinding.count({
          where: { inspection: { companyId }, status: "OPEN" },
        }),
        db.inspection.findMany({
          where: {
            ...visits,
            status: { in: ["SCHEDULED", "IN_PROGRESS", "SUBMITTED"] },
          },
          include: {
            company: { select: companySelect },
            location: true,
            inspector: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: "asc" },
          take: 8,
        }),
        db.inspectionFinding.findMany({
          where: { inspection: { companyId } },
          include: {
            inspection: {
              select: {
                id: true,
                reference: true,
                company: { select: companySelect },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
        db.certificate.findMany({
          where: {
            status: "ACTIVE",
            expiresAt: {
              gte: new Date(),
              lte: new Date(Date.now() + 90 * 86400000),
            },
            ...(companyId ? { holderId: companyId } : {}),
          },
          include: { holder: { select: companySelect } },
          orderBy: { expiresAt: "asc" },
          take: 6,
        }),
      ]);
      return json({
        metrics: {
          companies: companyCount,
          products: productCount,
          activeCertificates,
          openInspections,
          openInvestigations,
          openFindings,
        },
        inspections,
        recentFindings,
        expiringCertificates,
        businessTimezone: "Asia/Colombo",
      });
    }
    case "companies": {
      if (recordId) {
        await assertCompanyAccess(user, recordId);
        const company = await db.company.findUnique({
          where: { id: recordId },
          include: {
            locations: true,
            assignments: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            items: {
              include: {
                product: {
                  include: { brand: true, manufacturer: true, variants: true, rawMaterialListing: true },
                },
              },
            },
            certificates: true,
            inspections: { orderBy: { scheduledAt: "desc" }, take: 20 },
            investigations: { take: 20 },
            nonConformities: { take: 20 },
          },
        });
        if (!company)
          throw new ApiError(404, "NOT_FOUND", "Company not found.");
        return json(company);
      }
      const where: Prisma.CompanyWhereInput = {
        id: companyId,
        archivedAt: null,
        ...(q
          ? {
              OR: [
                { legalName: { contains: q } },
                { registrationNumber: { contains: q } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        db.company.findMany({
          where,
          include: {
            locations: true,
            _count: { select: { inspections: true, items: true } },
          },
          skip,
          take: pageSize,
          orderBy: { legalName: "asc" },
        }),
        db.company.count({ where }),
      ]);
      return paged(data, total);
    }
    case "locations": {
      const where: Prisma.CompanyLocationWhereInput = {
        companyId,
        ...(new URL(request.url).searchParams.get("companyId")
          ? { companyId: new URL(request.url).searchParams.get("companyId")! }
          : {}),
      };
      if (typeof where.companyId === "string")
        await assertCompanyAccess(user, where.companyId);
      const data = await db.companyLocation.findMany({
        where,
        include: { company: { select: companySelect } },
        take: 100,
      });
      return paged(data, data.length);
    }
    case "brands":
    case "manufacturers":
    case "suppliers": {
      requireRole(user, INSPECTORS);
      const where = { ...(q ? { name: { contains: q } } : {}) };
      if (resource === "brands") {
        const [d, n] = await Promise.all([
          db.brand.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          db.brand.count({ where }),
        ]);
        return paged(d, n);
      }
      if (resource === "manufacturers") {
        const [d, n] = await Promise.all([
          db.manufacturer.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          db.manufacturer.count({ where }),
        ]);
        return paged(d, n);
      }
      const [d, n] = await Promise.all([
        db.supplier.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { name: "asc" },
        }),
        db.supplier.count({ where }),
      ]);
      return paged(d, n);
    }
    case "products":
    case "items":
    case "raw-materials": {
      const staff = !INSPECTORS.includes(user.role);
      const scope: Prisma.ProductWhereInput = staff
        ? { companies: { some: { companyId } } }
        : {};
      const visibleProductInclude = {
        ...productInclude,
        companies: {
          where: { companyId },
          include: { company: { select: companySelect } },
        },
      };
      if (recordId) {
        const product = await db.product.findFirst({
          where: { id: recordId, ...scope },
          include: visibleProductInclude,
        });
        if (!product)
          throw new ApiError(404, "NOT_FOUND", "Product not found.");
        return json(product);
      }
      const where: Prisma.ProductWhereInput = {
        ...scope,
        archivedAt: null,
        ...(resource === "raw-materials" ? { type: "RAW_MATERIAL" } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { itemCode: { contains: q } },
                { brand: { name: { contains: q } } },
                {
                  variants: {
                    some: { OR: [{ barcode: q }, { sku: { contains: q } }] },
                  },
                },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        db.product.findMany({
          where,
          include: visibleProductInclude,
          skip,
          take: pageSize,
          orderBy: { name: "asc" },
        }),
        db.product.count({ where }),
      ]);
      return paged(data, total);
    }
    case "certificates": {
      const scope: Prisma.CertificateWhereInput = companyId
        ? {
            OR: [
              { holderId: companyId },
              {
                scopes: {
                  some: { product: { companies: { some: { companyId } } } },
                },
              },
            ],
          }
        : {};
      if (recordId) {
        const r = await db.certificate.findFirst({
          where: { id: recordId, ...scope },
          include: {
            holder: true,
            history: true,
            scopes: {
              include: {
                product: { include: { brand: true, manufacturer: true } },
                variant: true,
              },
            },
          },
        });
        if (!r) throw new ApiError(404, "NOT_FOUND", "Certificate not found.");
        return json(r);
      }
      const where: Prisma.CertificateWhereInput = {
        ...scope,
        ...(status ? { status } : {}),
        ...(q ? { number: { contains: q } } : {}),
      };
      const [data, total] = await Promise.all([
        db.certificate.findMany({
          where,
          include: {
            holder: { select: companySelect },
            scopes: { include: { product: true } },
            history: true,
          },
          skip,
          take: pageSize,
          orderBy: { expiresAt: "asc" },
        }),
        db.certificate.count({ where }),
      ]);
      return paged(data, total);
    }
    case "checklists": {
      requireRole(user, INSPECTORS);
      const d = await db.checklistTemplateVersion.findMany({
        where: { status: "PUBLISHED" },
        include: { template: true, questions: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return paged(d, d.length);
    }
    case "inspections": {
      if (recordId) {
        const record = await getInspection(user, recordId);
        if (!INSPECTORS.includes(user.role))
          return json({
            id: record.id,
            reference: record.reference,
            status: record.status,
            scheduledAt: record.scheduledAt,
            submittedAt: record.submittedAt,
            company: record.company,
            location: record.location,
            inspector: record.inspector,
            nonConformities: record.nonConformities,
          });
        return json(record);
      }
      const where: Prisma.InspectionWhereInput = {
        companyId,
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q } },
                { company: { legalName: { contains: q } } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        db.inspection.findMany({
          where,
          include: {
            company: { select: companySelect },
            location: true,
            inspector: { select: { id: true, name: true } },
            _count: { select: { observations: true, findings: true } },
          },
          skip,
          take: pageSize,
          orderBy: { scheduledAt: "desc" },
        }),
        db.inspection.count({ where }),
      ]);
      return paged(data, total);
    }
    case "investigations": {
      requireRole(user, INSPECTORS);
      if (recordId) {
        const r = await db.investigation.findUnique({
          where: { id: recordId },
          include: {
            company: { select: companySelect },
            product: true,
            events: { orderBy: { createdAt: "asc" } },
          },
        });
        if (!r)
          throw new ApiError(404, "NOT_FOUND", "Investigation not found.");
        await assertCompanyAccess(user, r.companyId);
        return json({
          ...r,
          events: INSPECTORS.includes(user.role)
            ? r.events
            : r.events.filter((e) => e.visibility === "COMPANY"),
        });
      }
      const where: Prisma.InvestigationWhereInput = {
        companyId,
        ...(status ? { status } : {}),
        ...(q
          ? { OR: [{ title: { contains: q } }, { reference: { contains: q } }] }
          : {}),
      };
      const [data, total] = await Promise.all([
        db.investigation.findMany({
          where,
          include: { company: { select: companySelect }, product: true },
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.investigation.count({ where }),
      ]);
      return paged(data, total);
    }
    case "complaints": {
      const where: Prisma.ComplaintWhereInput = {
        companyId,
        ...(status ? { status } : {}),
        ...(q ? { title: { contains: q } } : {}),
      };
      if (recordId) {
        const r = await db.complaint.findUnique({
          where: { id: recordId },
          include: { company: { select: companySelect } },
        });
        if (!r) throw new ApiError(404, "NOT_FOUND", "Complaint not found.");
        await assertCompanyAccess(user, r.companyId);
        return json(r);
      }
      const [d, n] = await Promise.all([
        db.complaint.findMany({
          where,
          include: { company: { select: companySelect } },
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.complaint.count({ where }),
      ]);
      return paged(d, n);
    }
    case "non-conformities": {
      const where: Prisma.NonConformityWhereInput = {
        companyId,
        ...(status ? { status } : {}),
        ...(q ? { title: { contains: q } } : {}),
      };
      if (recordId) {
        const r = await db.nonConformity.findUnique({
          where: { id: recordId },
          include: {
            company: { select: companySelect },
            correctiveActions: true,
          },
        });
        if (!r) throw new ApiError(404, "NOT_FOUND", "Finding not found.");
        await assertCompanyAccess(user, r.companyId);
        return json(r);
      }
      const [d, n] = await Promise.all([
        db.nonConformity.findMany({
          where,
          include: {
            company: { select: companySelect },
            correctiveActions: true,
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.nonConformity.count({ where }),
      ]);
      return paged(d, n);
    }
    case "corrective-actions": {
      const where: Prisma.CorrectiveActionWhereInput = {
        companyId,
        ...(status ? { status } : {}),
        ...(q ? { title: { contains: q } } : {}),
      };
      if (recordId) {
        const r = await db.correctiveAction.findUnique({
          where: { id: recordId },
          include: { company: { select: companySelect }, nonConformity: true },
        });
        if (!r)
          throw new ApiError(404, "NOT_FOUND", "Corrective action not found.");
        await assertCompanyAccess(user, r.companyId);
        return json(r);
      }
      const [d, n] = await Promise.all([
        db.correctiveAction.findMany({
          where,
          include: { company: { select: companySelect }, nonConformity: true },
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.correctiveAction.count({ where }),
      ]);
      return paged(d, n);
    }
    case "users": {
      requireRole(user, INSPECTORS);
      const where: Prisma.UserWhereInput = ADMIN.includes(user.role)
        ? {}
        : { id: user.id };
      const [d, n] = await Promise.all([
        db.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            companyId: true,
            isActive: true,
          },
          skip,
          take: pageSize,
        }),
        db.user.count({ where }),
      ]);
      return paged(d, n);
    }
    case "notifications": {
      const where = { userId: user.id };
      const [d, n] = await Promise.all([
        db.notification.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.notification.count({ where }),
      ]);
      return paged(d, n);
    }
    case "audit-logs": {
      requireRole(user, ADMIN);
      const [d, n] = await Promise.all([
        db.auditLog.findMany({
          include: { user: { select: { name: true, email: true } } },
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.auditLog.count(),
      ]);
      return paged(d, n);
    }
    case "restrictions": {
      requireRole(user, INSPECTORS);
      const d = await db.restrictionRecord.findMany({
        include: { product: true, manufacturer: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      });
      return paged(d, await db.restrictionRecord.count());
    }
    case "licenses": {
      requireRole(user, INSPECTORS);
      const where: Prisma.LicenseWhereInput = companyId
        ? {
            OR: [
              { companyId },
              {
                manufacturer: {
                  products: { some: { companies: { some: { companyId } } } },
                },
              },
            ],
          }
        : {};
      const d = await db.license.findMany({
        where,
        include: { company: { select: companySelect }, manufacturer: true },
        skip,
        take: pageSize,
      });
      return paged(d, await db.license.count({ where }));
    }
    case "reports": {
      requireRole(user, INSPECTORS);
      const d = await db.inspectionReport.findMany({
        where: { inspection: { companyId } },
        include: {
          inspection: {
            select: { reference: true, company: { select: companySelect } },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      });
      return paged(
        d,
        await db.inspectionReport.count({
          where: { inspection: { companyId } },
        }),
      );
    }
    case "settings":
      return json({
        timezone: "Asia/Colombo",
        ruleVersion: "HAC-1",
        offlineSubmission: false,
        expiryNotificationDays: [90, 60, 30, 14, 7],
        approvalAuthority: "Authorized HAC administrators",
        demoDataNotice:
          "All seeded approvals and certificates are fictional demonstration records.",
      });
    default:
      throw new ApiError(404, "NOT_FOUND", "API resource not found.");
  }
}
const observationSchema = z.object({
  recognitionPredictionId: optionalId,
  version: z.number().int().positive().optional(),
  productId: optionalId,
  variantId: optionalId,
  observedName: text.optional(),
  observedBrand: text.optional(),
  observedManufacturer: text.optional(),
  observedBarcode: text.optional(),
  observedVariant: text.optional(),
  physicalExpiry: z
    .string()
    .max(40)
    .refine((v) => !isNaN(Date.parse(v)), "Invalid expiry date")
    .optional(),
  manufactureDate: optionalDate,
  batch: text.optional(),
  quantity: z.number().min(0).max(1e12).optional(),
  storageLocation: text.optional(),
  notes: note.optional(),
  conclusion: text,
  identityConfirmed: z.boolean().default(false),
  clientMutationId: z.string().min(8).max(100),
  overrideReason: note.optional(),
});
const caseSchema = z.object({
  companyId: id,
  inspectionId: optionalId,
  productId: optionalId,
  observationId: optionalId,
  title: text,
  description: note.min(1),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  dueAt: optionalDate,
  assignedToId: optionalId,
});
async function post(
  request: Request,
  path: string[],
  user: AuthUser,
): Promise<Response> {
  const [resource, recordId, action] = path;
  if (resource === "inspections" && recordId === "start-now" && !action) {
    const input = await body(request, startInspectionSchema);
    const result = await startInspectionNow(user, input);
    return json(result.inspection, result.created ? 201 : 200);
  }
  if (resource === "verification") {
    requireRole(user, INSPECTORS);
    const p = await body(
      request,
      z.object({
        productId: optionalId,
        variantId: optionalId,
        companyId: id,
        locationId: optionalId,
        observedBrand: text.optional(),
        observedManufacturer: text.optional(),
        observedBarcode: text.optional(),
        observedVariant: text.optional(),
        physicalExpiry: z.string().max(40).optional(),
        identityConfirmed: z.boolean().default(false),
      }),
    );
    await assertCompanyAccess(user, p.companyId);
    if (p.locationId) {
      const l = await db.companyLocation.findUnique({
        where: { id: p.locationId },
      });
      if (!l || l.companyId !== p.companyId)
        throw new ApiError(
          422,
          "INVALID_LOCATION",
          "Location does not belong to this company.",
        );
    }
    return json(await verifyProduct({ ...p, at: new Date() }));
  }
  if (resource === "inspections" && recordId) {
    const record = await getInspection(user, recordId);
    if (action === "review") {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          decision: z.enum(["APPROVED", "CLARIFICATION_REQUIRED"]),
          reason: note.min(5),
        }),
      );
      if (record.status !== "SUBMITTED")
        throw new ApiError(
          409,
          "INVALID_STATE",
          "Only submitted inspections can be reviewed.",
        );
      const updated = await db.$transaction(async (tx) => {
        const r = await tx.inspection.updateMany({
          where: { id: recordId, status: "SUBMITTED", version: record.version },
          data: {
            status: p.decision,
            reviewedAt: new Date(),
            reviewedById: user.id,
            reviewReason: p.reason,
            version: { increment: 1 },
          },
        });
        if (!r.count)
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "Inspection was already reviewed.",
          );
        await audit(
          tx,
          user,
          "REVIEW",
          "Inspection",
          recordId,
          { status: record.status },
          p,
          record.companyId,
        );
        await tx.notification.create({
          data: {
            userId: record.inspectorId,
            title: "Inspection review complete",
            message: `${record.reference}: ${p.decision}. ${p.reason}`,
            href: `/inspections/${recordId}`,
          },
        });
        return tx.inspection.findUnique({ where: { id: recordId } });
      });
      return json(updated);
    }
    assertInspector(user, record);
    if (action === "start") {
      if (record.status === "IN_PROGRESS") return json(record);
      if (record.status !== "SCHEDULED")
        throw new ApiError(
          409,
          "INVALID_STATE",
          "Only scheduled inspections can be started.",
        );
      const updated = await db.$transaction(async (tx) => {
        const changed = await tx.inspection.updateMany({
          where: { id: recordId, status: "SCHEDULED", version: record.version },
          data: {
            status: "IN_PROGRESS",
            startedAt: new Date(),
            masterDataVersion: `HAC-1@${new Date().toISOString()}`,
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "Inspection changed. Reload and try again.",
          );
        await audit(
          tx,
          user,
          "START",
          "Inspection",
          recordId,
          { status: record.status },
          { status: "IN_PROGRESS" },
          record.companyId,
        );
        return tx.inspection.findUnique({ where: { id: recordId } });
      });
      return json(updated);
    }
    if (action === "submit") {
      const p = await body(
        request,
        z.object({
          version: z.number().int().positive(),
          declaration: z.literal(true),
        }),
      );
      return json(await submitInspection(user, recordId, p.version));
    }
    if (action !== "observations") assertDraft(record);
    if (action === "observations") {
      const p = await body(request, observationSchema);
      const existing = await db.observation.findUnique({
        where: { clientMutationId: p.clientMutationId },
      });
      if (existing) {
        if (
          existing.inspectionId !== recordId ||
          existing.createdById !== user.id
        )
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This mutation key is already in use.",
          );
        // Compare the complete persisted content, using the same date and note transformations as creation.
        // Version is transport metadata: a successful exact retry remains safe after the draft advances.
        const expected = {
          recognitionPredictionId: p.recognitionPredictionId,
          productId: p.productId,
          variantId: p.variantId,
          observedName: p.observedName,
          observedBrand: p.observedBrand,
          observedManufacturer: p.observedManufacturer,
          observedBarcode: p.observedBarcode,
          observedVariant: p.observedVariant,
          physicalExpiry: p.physicalExpiry
            ? physicalExpiryInstant(p.physicalExpiry)
            : undefined,
          manufactureDate: p.manufactureDate,
          batch: p.batch,
          quantity: p.quantity,
          storageLocation: p.storageLocation,
          notes:
            [
              p.notes,
              p.overrideReason
                ? `Inspector disagreement: ${p.overrideReason}`
                : null,
            ]
              .filter(Boolean)
              .join("\n") || undefined,
          conclusion: p.conclusion,
          identityConfirmed: p.identityConfirmed,
        };
        const canonical = (value: unknown) =>
          value instanceof Date ? value.toISOString() : (value ?? null);
        for (const key of Object.keys(expected) as Array<
          keyof typeof expected
        >) {
          if (canonical(existing[key]) !== canonical(expected[key]))
            throw new ApiError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "The mutation key was already used with different observation data.",
            );
        }
        return json(existing);
      }
      assertDraft(record);
      if (p.version !== undefined && p.version !== record.version)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "The inspection changed since this observation was prepared. Reload and review it.",
        );
      if (p.variantId) {
        const v = await db.productVariant.findUnique({
          where: { id: p.variantId },
        });
        if (!v || v.productId !== p.productId)
          throw new ApiError(
            422,
            "INVALID_VARIANT",
            "The selected variant does not belong to this product.",
          );
      }
      if(p.recognitionPredictionId){const prediction=await db.recognitionPrediction.findUnique({where:{id:p.recognitionPredictionId},include:{observation:{select:{id:true}}}});if(!prediction||prediction.userId!==user.id||prediction.inspectionId!==recordId||prediction.observation)throw new ApiError(422,"INVALID_RECOGNITION_REFERENCE","Recognition must belong to this inspector and inspection and must not already be confirmed.");}
      const createdAt = new Date();
      const verification = await verifyProduct({
        ...p,
        companyId: record.companyId,
        locationId: record.locationId,
        at: createdAt,
      });
      if (
        verification.requiresAction &&
        /^(APPROVED|VERIFIED_APPROVED|HAC APPROVED)/i.test(p.conclusion) &&
        !p.overrideReason
      )
        throw new ApiError(
          422,
          "OVERRIDE_REASON_REQUIRED",
          "Explain why your observation differs from the calculated verification.",
        );
      const {
        overrideReason,
        physicalExpiry,
        version: _version,
        ...fields
      } = p;
      const result = await db.$transaction(async (tx) => {
        await lockDraft(tx, record);
        const observation = await tx.observation.create({
          data: {
            ...fields,
            physicalExpiry: physicalExpiry
              ? new Date(
                  /^\d{4}-\d{2}-\d{2}$/.test(physicalExpiry)
                    ? `${physicalExpiry}T23:59:59.999+05:30`
                    : physicalExpiry,
                )
              : undefined,
            notes:
              [
                p.notes,
                overrideReason
                  ? `Inspector disagreement: ${overrideReason}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n") || undefined,
            inspectionId: recordId,
            verification: jsonValue(verification),
            createdById: user.id,
            createdAt,
          },
        });
        if(p.recognitionPredictionId)await tx.recognitionPrediction.update({where:{id:p.recognitionPredictionId},data:{acceptedProductId:p.productId}});
        const issues = verification.outcomes.filter(
          (o) =>
            ![
              "VERIFIED_APPROVED",
              "APPROVED_REQUIRES_PHYSICAL_CONFIRMATION",
            ].includes(o),
        );
        if (issues.length)
          await tx.inspectionFinding.createMany({
            data: issues.map((type) => ({
              inspectionId: recordId,
              observationId: observation.id,
              type,
              title: type.replace(/_/g, " "),
              description:
                verification.rules
                  .filter((r) => r.result !== "PASS")
                  .map((r) => r.reason)
                  .join("; ") || verification.label,
              severity:
                type === "EXPLICITLY_RESTRICTED_BANNED" ||
                type === "EXPLICITLY_RESTRICTED"
                  ? "CRITICAL"
                  : "OBSERVATION",
            })),
          });
        // Signing is a declaration of all saved content; further changes invalidate it.
        await tx.inspectionSignature.deleteMany({
          where: { inspectionId: recordId },
        });
        await audit(
          tx,
          user,
          "OBSERVE",
          "Observation",
          observation.id,
          undefined,
          observation,
          record.companyId,
        );
        return observation;
      });
      return json(result, 201);
    }
    if (action === "unknown") {
      const p = await body(
        request,
        z.object({
          name: text,
          brandName: text.optional(),
          manufacturerName: text.optional(),
          barcode: text.optional(),
          description: note,
          reason: note.min(1),
          priority: z
            .enum(["LOW", "NORMAL", "HIGH", "CRITICAL"])
            .default("NORMAL"),
        }),
      );
      const result = await db.$transaction(async (tx) => {
        await lockDraft(tx, record);
        if (
          p.barcode &&
          (await tx.productVariant.findUnique({
            where: { barcode: p.barcode },
          }))
        )
          throw new ApiError(
            409,
            "PRODUCT_EXISTS",
            "This barcode is already in the catalogue. Select the existing product.",
          );
        const brand = await tx.brand.upsert({
          where: { name: p.brandName || "Unspecified — provisional" },
          update: {},
          create: { name: p.brandName || "Unspecified — provisional" },
        });
        const manufacturer = await tx.manufacturer.upsert({
          where: { name: p.manufacturerName || "Unspecified — provisional" },
          update: {},
          create: { name: p.manufacturerName || "Unspecified — provisional" },
        });
        const product = await tx.product.create({
          data: {
            itemCode: reference("PROV"),
            name: p.name,
            normalizedName: normalize(p.name),
            brandId: brand.id,
            manufacturerId: manufacturer.id,
            description: p.description,
            status: "PROVISIONAL",
            isDemo: record.isDemo,
            variants: {
              create: {
                name: "Unverified variant",
                sku: reference("PROV-SKU"),
                barcode: p.barcode,
              },
            },
            companies: {
              create: {
                companyId: record.companyId,
                relationship: "OBSERVED",
                status: "PENDING",
              },
            },
          },
        });
        const investigation = await tx.investigation.create({
          data: {
            reference: reference("INV"),
            companyId: record.companyId,
            inspectionId: recordId,
            productId: product.id,
            title: `Unknown product: ${p.name}`,
            description: p.reason,
            priority: p.priority,
            createdById: user.id,
            events: {
              create: { userId: user.id, type: "CREATED", message: p.reason },
            },
          },
        });
        await tx.inspectionSignature.deleteMany({
          where: { inspectionId: recordId },
        });
        await audit(
          tx,
          user,
          "REGISTER_PROVISIONAL",
          "Product",
          product.id,
          undefined,
          { product, investigation },
          record.companyId,
        );
        return { product, investigation };
      });
      return json(result, 201);
    }
    if (action === "checklist") {
      const p = await body(
        request,
        z.object({ questionId: id, answer: z.json(), notes: note.optional() }),
      );
      const question = record.checklistVersion?.questions.find(
        (q) => q.id === p.questionId,
      );
      if (!question || !answerValid(question.type, p.answer, question.options))
        throw new ApiError(
          422,
          "INVALID_ANSWER",
          "Answer does not match the checklist question.",
        );
      if (
        ["PHOTOGRAPH", "ATTACHMENT"].includes(question.type) &&
        !record.evidence.some((e) => e.id === p.answer)
      )
        throw new ApiError(
          422,
          "INVALID_EVIDENCE",
          "Choose evidence attached to this inspection.",
        );
      const result = await db.$transaction(async (tx) => {
        await lockDraft(tx, record);
        const response = await tx.checklistResponse.upsert({
          where: {
            inspectionId_questionId: {
              inspectionId: recordId,
              questionId: p.questionId,
            },
          },
          update: { answer: jsonValue(p.answer), notes: p.notes },
          create: {
            inspectionId: recordId,
            questionId: p.questionId,
            answer: jsonValue(p.answer),
            notes: p.notes,
          },
        });
        await tx.inspectionSignature.deleteMany({
          where: { inspectionId: recordId },
        });
        await audit(
          tx,
          user,
          "ANSWER",
          "ChecklistResponse",
          response.id,
          undefined,
          response,
          record.companyId,
        );
        return response;
      });
      return json(result);
    }
    if (action === "reconcile") {
      const p = await body(
        request,
        z.object({
          version: z.number().int().positive(),
          acknowledge: z.literal(true),
        }),
      );
      if (p.version !== record.version)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Reload the inspection before reconciliation.",
        );
      const result = await db.$transaction(
        async (tx) => {
          await lockDraft(tx, record);
          const changes = [];
          for (const o of record.observations) {
            const verification = await verifyProduct(
              {
                productId: o.productId,
                variantId: o.variantId,
                companyId: record.companyId,
                locationId: record.locationId,
                at: o.createdAt,
                observedBrand: o.observedBrand,
                observedManufacturer: o.observedManufacturer,
                observedBarcode: o.observedBarcode,
                observedVariant: o.observedVariant,
                physicalExpiry: o.physicalExpiry,
                identityConfirmed: o.identityConfirmed,
              },
              { db: tx },
            );
            await tx.observation.update({
              where: { id: o.id },
              data: { verification: jsonValue(verification) },
            });
            await tx.inspectionFinding.deleteMany({
              where: { observationId: o.id },
            });
            const issues = verification.outcomes.filter(
              (v) =>
                ![
                  "VERIFIED_APPROVED",
                  "APPROVED_REQUIRES_PHYSICAL_CONFIRMATION",
                ].includes(v),
            );
            if (issues.length)
              await tx.inspectionFinding.createMany({
                data: issues.map((type) => ({
                  inspectionId: recordId,
                  observationId: o.id,
                  type,
                  title: type.replace(/_/g, " "),
                  description: verification.label,
                  severity:
                    type === "EXPLICITLY_RESTRICTED"
                      ? "CRITICAL"
                      : "OBSERVATION",
                })),
              });
            changes.push({
              observationId: o.id,
              previous: o.verification,
              current: verification,
            });
          }
          await tx.inspectionSignature.deleteMany({
            where: { inspectionId: recordId },
          });
          await audit(
            tx,
            user,
            "RECONCILE",
            "Inspection",
            recordId,
            undefined,
            { changes },
            record.companyId,
          );
          return {
            changes,
            version: record.version + 1,
            signaturesInvalidated: true,
          };
        },
        { isolationLevel: "Serializable", timeout: 30000 },
      );
      return json(result);
    }
    if (action === "sign") {
      const p = await body(
        request,
        z.object({
          name: text,
          role: z.enum(["INSPECTOR", "COMPANY_REPRESENTATIVE"]),
          signature: z.string().max(500000).optional(),
          reason: note.optional(),
        }),
      );
      if (p.role === "INSPECTOR" && user.id !== record.inspectorId)
        throw new ApiError(
          403,
          "SIGNATURE_IDENTITY",
          "The assigned inspector must sign their own declaration.",
        );
      if (
        p.signature &&
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.signature)
      )
        throw new ApiError(
          422,
          "INVALID_SIGNATURE",
          "Signature must be a PNG image.",
        );
      if (
        p.role === "COMPANY_REPRESENTATIVE" &&
        !p.signature &&
        !p.reason?.trim()
      )
        throw new ApiError(
          422,
          "SIGNATURE_REASON_REQUIRED",
          "Record why the representative signature is unavailable.",
        );
      if (p.signature) {
        const prepared = await prepareEvidence(
          Buffer.from(p.signature.split(",")[1], "base64"),
          "image/png",
        );
        p.signature = `data:image/png;base64,${prepared.buffer.toString("base64")}`;
      }
      const result = await db.$transaction(async (tx) => {
        await lockDraft(tx, record);
        const signature = await tx.inspectionSignature.upsert({
          where: {
            inspectionId_role: { inspectionId: recordId, role: p.role },
          },
          update: { ...p, userId: user.id, signedAt: new Date() },
          create: { ...p, inspectionId: recordId, userId: user.id },
        });
        await audit(
          tx,
          user,
          "SIGN",
          "InspectionSignature",
          signature.id,
          undefined,
          signature,
          record.companyId,
        );
        return signature;
      });
      return json(result);
    }
    throw new ApiError(404, "NOT_FOUND", "Inspection action not found.");
  }
  if (recordId && action === "transition")
    return transition(request, resource, recordId, user);
  switch (resource) {
    case "companies": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          legalName: text,
          tradingName: text.optional(),
          registrationNumber: z.preprocess(
            (value) => typeof value === "string" ? value.trim() || null : value ?? null,
            text.nullable(),
          ),
          category: text.default("RETAILER"),
          industry: text.optional(),
          email: z.email().optional(),
          phone: text.optional(),
          isDemo: z.boolean().default(false),
        }),
      );
      const r = await db.$transaction(async (tx) => {
        const r = await tx.company.create({ data: p });
        await audit(tx, user, "CREATE", "Company", r.id, undefined, r, r.id);
        return r;
      });
      return json(r, 201);
    }
    case "locations": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          companyId: id,
          name: text,
          address: note.min(1),
          type: text.default("BRANCH"),
        }),
      );
      await assertCompanyAccess(user, p.companyId);
      const r = await db.$transaction(async (tx) => {
        const r = await tx.companyLocation.create({ data: p });
        await audit(
          tx,
          user,
          "CREATE",
          "CompanyLocation",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "brands":
    case "manufacturers":
    case "suppliers": {
      requireRole(user, ADMIN);
      const p = await body(request, z.object({ name: text }));
      const r = await db.$transaction(async (tx) => {
        const r =
          resource === "brands"
            ? await tx.brand.create({ data: p })
            : resource === "manufacturers"
              ? await tx.manufacturer.create({ data: p })
              : await tx.supplier.create({ data: p });
        await audit(tx, user, "CREATE", resource, r.id, undefined, r);
        return r;
      });
      return json(r, 201);
    }
    case "products":
    case "items":
    case "raw-materials": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          name: text,
          itemCode: text.optional(),
          type: z
            .enum(["PRODUCT", "RAW_MATERIAL"])
            .default(resource === "raw-materials" ? "RAW_MATERIAL" : "PRODUCT"),
          category: text.default("FOOD"),
          brandId: id,
          manufacturerId: id,
          supplierId: optionalId,
          description: note.optional(),
          ingredients: note.optional(),
          origin: text.optional(),
          isDemo: z.boolean().default(false),
          variants: z
            .array(
              z.object({
                name: text,
                sku: text,
                barcode: text.optional(),
                packageSize: text.optional(),
                packaging: text.optional(),
                flavour: text.optional(),
              }),
            )
            .min(1)
            .max(30),
        }),
      );
      const { variants, ...fields } = p;
      const r = await db.$transaction(async (tx) => {
        const r = await tx.product.create({
          data: {
            ...fields,
            itemCode: p.itemCode || reference("HAC"),
            normalizedName: normalize(p.name),
            status: "DRAFT",
            variants: { create: variants },
          },
          include: productInclude,
        });
        await audit(tx, user, "CREATE", "Product", r.id, undefined, r);
        return r;
      });
      return json(r, 201);
    }
    case "company-items": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          companyId: id,
          productId: id,
          relationship: text.default("RETAILER"),
          effectiveAt: date.optional(),
          expiresAt: optionalDate,
        }),
      );
      await assertCompanyAccess(user, p.companyId);
      const r = await db.$transaction(async (tx) => {
        const r = await tx.companyItem.upsert({
          where: {
            companyId_productId: {
              companyId: p.companyId,
              productId: p.productId,
            },
          },
          create: p,
          update: { ...p, status: "ACTIVE" },
        });
        await audit(
          tx,
          user,
          "LINK",
          "CompanyItem",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "assignments": {
      requireRole(user, ADMIN);
      const p = await body(request, z.object({ companyId: id, userId: id }));
      const inspector = await db.user.findUnique({ where: { id: p.userId } });
      if (!inspector || !INSPECTORS.includes(inspector.role))
        throw new ApiError(
          422,
          "INVALID_INSPECTOR",
          "Select an active inspector.",
        );
      const r = await db.$transaction(async (tx) => {
        const r = await tx.supervisorCompanyAssignment.upsert({
          where: {
            userId_companyId: { userId: p.userId, companyId: p.companyId },
          },
          create: p,
          update: { isActive: true, revokedAt: null },
        });
        await audit(
          tx,
          user,
          "ASSIGN",
          "SupervisorCompanyAssignment",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "certificates": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          number: text,
          holderId: id,
          issuer: text,
          type: z.enum(["HAC", "EXTERNAL_HALAL"]).default("HAC"),
          status: z.enum(["PENDING", "ACTIVE"]).default("PENDING"),
          issuedAt: date,
          effectiveAt: date,
          expiresAt: date,
          supersedesId: optionalId,
          isDemo: z.boolean().default(false),
          scopes: z
            .array(
              z.object({
                productId: id,
                variantId: optionalId,
                facilityId: optionalId,
                requiresCompanyRelationship: z.boolean().default(false),
                description: note.optional(),
              }),
            )
            .min(1)
            .max(200),
        }),
      );
      if (p.expiresAt <= p.effectiveAt || p.issuedAt > p.expiresAt)
        throw new ApiError(
          422,
          "INVALID_DATES",
          "Certificate expiry must follow its effective and issue dates.",
        );
      const scopes: Prisma.CertificateScopeCreateManyCertificateInput[] = [];
      for (const s of p.scopes) {
        const product = await db.product.findUnique({
          where: { id: s.productId },
          include: { brand: true, manufacturer: true, variants: true },
        });
        if (
          !product ||
          (s.variantId && !product.variants.some((v) => v.id === s.variantId))
        )
          throw new ApiError(
            422,
            "INVALID_SCOPE",
            "Scope variant must belong to the selected product.",
          );
        scopes.push({
          ...s,
          brandName: product.brand.name,
          manufacturerName: product.manufacturer.name,
        });
      }
      const { scopes: _scopes, ...fields } = p;
      const r = await db.$transaction(async (tx) => {
        const r = await tx.certificate.create({
          data: {
            ...fields,
            scopes: { create: scopes },
            history: {
              create: {
                status: p.status,
                effectiveAt: p.effectiveAt,
                reason:
                  "Initial certificate record entered by authorized administrator",
                createdById: user.id,
              },
            },
          },
          include: { scopes: true, holder: true },
        });
        await audit(
          tx,
          user,
          "CREATE",
          "Certificate",
          r.id,
          undefined,
          r,
          p.holderId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "restrictions": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          productId: optionalId,
          manufacturerId: optionalId,
          authority: text,
          reference: text,
          reason: note.min(1),
          scope: note.min(1),
          effectiveAt: date,
          expiresAt: optionalDate,
        }),
      );
      if (!p.productId && !p.manufacturerId)
        throw new ApiError(
          422,
          "RESTRICTION_SCOPE_REQUIRED",
          "Choose a product or manufacturer.",
        );
      if (p.expiresAt && p.expiresAt <= p.effectiveAt)
        throw new ApiError(
          422,
          "INVALID_DATES",
          "Restriction expiry must follow its effective date.",
        );
      const r = await db.$transaction(async (tx) => {
        const r = await tx.restrictionRecord.create({
          data: { ...p, createdById: user.id },
        });
        await audit(
          tx,
          user,
          "RESTRICT",
          "RestrictionRecord",
          r.id,
          undefined,
          r,
        );
        return r;
      });
      return json(r, 201);
    }
    case "licenses": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          companyId: optionalId,
          manufacturerId: optionalId,
          name: text,
          number: text,
          authority: text,
          effectiveAt: date,
          expiresAt: date,
          required: z.boolean().default(true),
        }),
      );
      if (!p.companyId && !p.manufacturerId)
        throw new ApiError(
          422,
          "LICENSE_HOLDER_REQUIRED",
          "Choose a company or manufacturer.",
        );
      if (p.expiresAt <= p.effectiveAt)
        throw new ApiError(
          422,
          "INVALID_DATES",
          "License expiry must follow its effective date.",
        );
      const r = await db.$transaction(async (tx) => {
        const r = await tx.license.create({ data: p });
        await audit(
          tx,
          user,
          "CREATE",
          "License",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "checklists": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          name: text,
          description: note.optional(),
          questions: z
            .array(
              z.object({
                id: id.optional(),
                section: text,
                text: note.min(1),
                type: z.enum([
                  "YES_NO",
                  "COMPLIANCE",
                  "PASS_FAIL",
                  "MULTIPLE_CHOICE",
                  "NUMERIC",
                  "DATE",
                  "TEXT",
                  "PHOTOGRAPH",
                  "ATTACHMENT",
                  "SIGNATURE",
                ]),
                required: z.boolean().default(true),
                options: z.array(text).optional(),
                condition: z
                  .object({ questionId: id, equals: z.json() })
                  .optional(),
                requiresEvidenceOn: z.array(z.json()).optional(),
              }),
            )
            .min(1)
            .max(300),
        }),
      );
      const ids = new Set(p.questions.map((q) => q.id).filter(Boolean));
      for (const q of p.questions) {
        if (q.condition && !ids.has(q.condition.questionId))
          throw new ApiError(
            422,
            "INVALID_CONDITION",
            "Conditional questions must reference a question ID in this template.",
          );
        if (q.type === "MULTIPLE_CHOICE" && !q.options?.length)
          throw new ApiError(
            422,
            "OPTIONS_REQUIRED",
            "Multiple choice questions need options.",
          );
      }
      const r = await db.$transaction(async (tx) => {
        const template = await tx.checklistTemplate.create({
          data: { name: p.name, description: p.description },
        });
        const r = await tx.checklistTemplateVersion.create({
          data: {
            templateId: template.id,
            version: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            questions: {
              create: p.questions.map((q, index) => ({
                ...q,
                order: index,
                options: q.options ? jsonValue(q.options) : undefined,
                condition: q.condition ? jsonValue(q.condition) : undefined,
                requiresEvidenceOn: q.requiresEvidenceOn
                  ? jsonValue(q.requiresEvidenceOn)
                  : undefined,
              })),
            },
          },
          include: { template: true, questions: true },
        });
        await audit(
          tx,
          user,
          "PUBLISH",
          "ChecklistTemplateVersion",
          r.id,
          undefined,
          r,
        );
        return r;
      });
      return json(r, 201);
    }
    case "inspections": {
      requireRole(user, INSPECTORS);
      const p = await body(
        request,
        z.object({
          companyId: id,
          locationId: id,
          inspectorId: id,
          scheduledAt: date,
          checklistVersionId: id.nullable().optional(),
          type: z
            .enum([
              "INITIAL",
              "ROUTINE",
              "SURVEILLANCE",
              "RENEWAL",
              "FOLLOW_UP",
              "COMPLAINT",
              "SPECIAL",
              "UNANNOUNCED",
            ])
            .default("ROUTINE"),
          priority: text.default("NORMAL"),
          objectives: note.optional(),
        }),
      );
      await assertCompanyAccess(user, p.companyId);
      if (!ADMIN.includes(user.role) && p.inspectorId !== user.id)
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You can schedule inspections only for yourself.",
        );
      const [location, inspector, checklist, assignment] = await Promise.all([
        db.companyLocation.findUnique({ where: { id: p.locationId } }),
        db.user.findUnique({ where: { id: p.inspectorId } }),
        p.checklistVersionId ? db.checklistTemplateVersion.findUnique({
          where: { id: p.checklistVersionId },
        }) : Promise.resolve(null),
        db.supervisorCompanyAssignment.findFirst({
          where: {
            userId: p.inspectorId,
            companyId: p.companyId,
            isActive: true,
            revokedAt: null,
          },
        }),
      ]);
      if (
        !location ||
        location.companyId !== p.companyId ||
        !location.isActive ||
        !inspector?.isActive ||
        !INSPECTORS.includes(inspector.role) ||
        (p.checklistVersionId && (!checklist || checklist.status !== "PUBLISHED")) ||
        (!ADMIN.includes(inspector.role) && !assignment)
      )
        throw new ApiError(
          422,
          "INVALID_ASSIGNMENT",
          "Choose a published checklist, a company location, and an assigned active inspector.",
        );
      const r = await db.$transaction(async (tx) => {
        const conflict = await tx.inspection.findFirst({
          where: {
            inspectorId: p.inspectorId,
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
            scheduledAt: {
              gte: new Date(p.scheduledAt.getTime() - 3600000),
              lte: new Date(p.scheduledAt.getTime() + 3600000),
            },
          },
        });
        if (conflict)
          throw new ApiError(
            409,
            "SCHEDULING_CONFLICT",
            "The inspector already has a visit within one hour of this time.",
          );
        const r = await tx.inspection.create({
          data: {
            ...p,
            reference: reference("INS"),
            isDemo: (
              await tx.company.findUniqueOrThrow({ where: { id: p.companyId } })
            ).isDemo,
          },
        });
        await audit(
          tx,
          user,
          "SCHEDULE",
          "Inspection",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "investigations":
    case "complaints":
    case "non-conformities": {
      if (resource !== "complaints") requireRole(user, INSPECTORS);
      const p = await body(
        request,
        caseSchema.extend({
          severity: z
            .enum(["OBSERVATION", "MINOR", "MAJOR", "CRITICAL"])
            .default("MINOR"),
          responsibleParty: text.optional(),
        }),
      );
      await ensureLinks(
        user,
        p.companyId,
        p.inspectionId,
        p.observationId,
        p.productId,
      );
      if (p.assignedToId) {
        const assigned = await db.user.findUnique({
          where: { id: p.assignedToId },
        });
        if (!assigned?.isActive || !INSPECTORS.includes(assigned.role))
          throw new ApiError(
            422,
            "INVALID_ASSIGNEE",
            "Choose an active HAC investigator.",
          );
      }
      const { severity, responsibleParty, ...fields } = p;
      const r = await db.$transaction(async (tx) => {
        if (fields.inspectionId) {
          const linked = await tx.inspection.findUniqueOrThrow({
            where: { id: fields.inspectionId },
          });
          if (linked.status === "IN_PROGRESS") {
            await lockDraft(tx, linked);
            await tx.inspectionSignature.deleteMany({
              where: { inspectionId: linked.id },
            });
          }
        }
        if (resource === "investigations") {
          const r = await tx.investigation.create({
            data: {
              ...fields,
              reference: reference("INV"),
              createdById: user.id,
              events: {
                create: {
                  userId: user.id,
                  type: "CREATED",
                  message: p.description,
                },
              },
            },
          });
          await audit(
            tx,
            user,
            "CREATE",
            "Investigation",
            r.id,
            undefined,
            r,
            p.companyId,
          );
          return r;
        }
        if (resource === "complaints") {
          const { observationId: _o, dueAt: _d, ...c } = fields;
          const r = await tx.complaint.create({
            data: { ...c, reference: reference("CMP"), createdById: user.id },
          });
          await audit(
            tx,
            user,
            "CREATE",
            "Complaint",
            r.id,
            undefined,
            r,
            p.companyId,
          );
          return r;
        }
        const { priority: _p, assignedToId: _a, ...n } = fields;
        const r = await tx.nonConformity.create({
          data: {
            ...n,
            severity,
            responsibleParty,
            reference: reference("NC"),
            createdById: user.id,
          },
        });
        await audit(
          tx,
          user,
          "CREATE",
          "NonConformity",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "corrective-actions": {
      const p = await body(
        request,
        z.object({
          nonConformityId: id,
          title: text.optional(),
          rootCause: note.min(1),
          proposedAction: note.min(1),
          evidenceDescription: note.optional(),
          dueAt: optionalDate,
        }),
      );
      const nc = await db.nonConformity.findUnique({
        where: { id: p.nonConformityId },
      });
      if (!nc)
        throw new ApiError(404, "NOT_FOUND", "Non-conformity not found.");
      await assertCompanyAccess(user, nc.companyId);
      if (nc.status === "CLOSED")
        throw new ApiError(
          409,
          "CASE_CLOSED",
          "Reopen the non-conformity before submitting an action.",
        );
      const r = await db.$transaction(async (tx) => {
        const r = await tx.correctiveAction.create({
          data: {
            ...p,
            title: p.title || `Response to ${nc.reference}`,
            reference: reference("CA"),
            companyId: nc.companyId,
            createdById: user.id,
          },
        });
        await audit(
          tx,
          user,
          "SUBMIT",
          "CorrectiveAction",
          r.id,
          undefined,
          r,
          nc.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "users": {
      requireRole(user, ADMIN);
      const p = await body(
        request,
        z.object({
          email: z.email(),
          name: text,
          password: z.string().min(12).max(1024),
          role: z.enum([
            "HAC_ADMIN",
            "SUPERVISOR",
            "AUDITOR",
            "COMPANY_ADMIN",
            "COMPANY_STAFF",
          ]),
          companyId: optionalId,
        }),
      );
      if (p.role === "HAC_ADMIN" && user.role !== "SUPER_ADMIN")
        throw new ApiError(
          403,
          "ROLE_ESCALATION",
          "Only a super administrator can create HAC administrators.",
        );
      if (p.role.startsWith("COMPANY_") && !p.companyId)
        throw new ApiError(
          422,
          "COMPANY_REQUIRED",
          "Company users require an assigned company.",
        );
      const { password, ...fields } = p;
      const passwordHash = await hashPassword(password);
      const r = await db.$transaction(async (tx) => {
        const r = await tx.user.create({
          data: { ...fields, email: p.email.toLowerCase(), passwordHash },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            companyId: true,
          },
        });
        await audit(
          tx,
          user,
          "CREATE",
          "User",
          r.id,
          undefined,
          r,
          p.companyId,
        );
        return r;
      });
      return json(r, 201);
    }
    case "notifications": {
      if (!recordId || action !== "read") break;
      const result = await db.notification.updateMany({
        where: { id: recordId, userId: user.id },
        data: { readAt: new Date() },
      });
      if (!result.count)
        throw new ApiError(404, "NOT_FOUND", "Notification not found.");
      return json({ read: true });
    }
    case "jobs": {
      requireRole(user, ADMIN);
      if (recordId !== "expiry") break;
      let count = 0;
      const certificates = await db.certificate.findMany({
        where: {
          status: "ACTIVE",
          expiresAt: { lte: new Date(Date.now() + 90 * 86400000) },
        },
        include: {
          holder: {
            include: {
              assignments: { where: { isActive: true, revokedAt: null } },
            },
          },
        },
      });
      const admins = await db.user.findMany({
        where: { role: { in: ADMIN }, isActive: true },
        select: { id: true },
      });
      for (const cert of certificates) {
        const days = Math.ceil(
          (cert.expiresAt.getTime() - Date.now()) / 86400000,
        );
        const period = [7, 14, 30, 60, 90].find((p) => days <= p) ?? 90;
        for (const userId of new Set([
          ...admins.map((a) => a.id),
          ...cert.holder.assignments.map((a) => a.userId),
        ])) {
          const key = `expiry:${cert.id}:${cert.version}:${period}:${userId}`;
          await db.notification.upsert({
            where: { dedupeKey: key },
            update: {},
            create: {
              userId,
              dedupeKey: key,
              title:
                days < 0 ? "Certificate expired" : "Certificate expiry warning",
              message: `${cert.number} ${days < 0 ? "expired" : "expires"} ${cert.expiresAt.toISOString().slice(0, 10)}.`,
              href: "/certificates",
            },
          });
          count++;
        }
      }
      await audit(db, user, "EXPIRY_CHECK", "Job", "expiry", undefined, {
        notificationsChecked: count,
      });
      return json({ notificationsChecked: count });
    }
  }
  throw new ApiError(404, "NOT_FOUND", "API action not found.");
}
async function transition(
  request: Request,
  resource: string,
  recordId: string,
  user: AuthUser,
): Promise<Response> {
  const p = await body(
    request,
    z.object({ status: text, reason: note.min(5), effectiveAt: optionalDate }),
  );
  if (resource === "certificates") {
    requireRole(user, ADMIN);
    if (!["ACTIVE", "SUSPENDED", "REVOKED", "SUPERSEDED"].includes(p.status))
      throw new ApiError(422, "INVALID_STATE", "Unknown certificate decision.");
    const before = await db.certificate.findUnique({ where: { id: recordId } });
    if (!before) throw new ApiError(404, "NOT_FOUND", "Certificate not found.");
    const r = await db.$transaction(async (tx) => {
      const r = await tx.certificate.update({
        where: { id: recordId },
        data: {
          status: p.status,
          version: { increment: 1 },
          history: {
            create: {
              status: p.status,
              effectiveAt: p.effectiveAt || new Date(),
              reason: p.reason,
              createdById: user.id,
            },
          },
        },
      });
      await audit(
        tx,
        user,
        "DECIDE",
        "Certificate",
        r.id,
        before,
        { ...r, reason: p.reason },
        r.holderId,
      );
      return r;
    });
    return json(r);
  }
  if (resource === "products" || resource === "items") {
    requireRole(user, ADMIN);
    if (!["DRAFT", "PENDING_REVIEW", "ACTIVE", "ARCHIVED"].includes(p.status))
      throw new ApiError(422, "INVALID_STATE", "Unknown catalogue state.");
    const before = await db.product.findUnique({ where: { id: recordId } });
    if (!before) throw new ApiError(404, "NOT_FOUND", "Product not found.");
    const r = await db.$transaction(async (tx) => {
      const r = await tx.product.update({
        where: { id: recordId },
        data: {
          status: p.status,
          version: { increment: 1 },
          archivedAt: p.status === "ARCHIVED" ? new Date() : null,
        },
      });
      await audit(tx, user, "REVIEW", "Product", r.id, before, {
        ...r,
        reason: p.reason,
      });
      return r;
    });
    return json(r);
  }
  if (resource === "investigations") {
    requireRole(user, INSPECTORS);
    const before = await db.investigation.findUnique({
      where: { id: recordId },
    });
    if (!before)
      throw new ApiError(404, "NOT_FOUND", "Investigation not found.");
    await assertCompanyAccess(user, before.companyId);
    const allowed: Record<string, string[]> = {
      AWAITING_TRIAGE: ["UNDER_INVESTIGATION", "ESCALATED"],
      SUBMITTED: ["AWAITING_TRIAGE"],
      UNDER_INVESTIGATION: [
        "AWAITING_COMPANY_RESPONSE",
        "AWAITING_HAC_REVIEW",
        "ADDITIONAL_EVIDENCE_REQUIRED",
        "ESCALATED",
      ],
      AWAITING_COMPANY_RESPONSE: ["UNDER_INVESTIGATION", "AWAITING_HAC_REVIEW"],
      ADDITIONAL_EVIDENCE_REQUIRED: ["UNDER_INVESTIGATION"],
      AWAITING_HAC_REVIEW: [
        "RESOLVED",
        "ADDITIONAL_EVIDENCE_REQUIRED",
        "ESCALATED",
      ],
      ESCALATED: ["UNDER_INVESTIGATION", "AWAITING_HAC_REVIEW", "RESOLVED"],
      RESOLVED: ["CLOSED", "REOPENED"],
      CLOSED: ["REOPENED"],
      REOPENED: ["UNDER_INVESTIGATION"],
    };
    if (!allowed[before.status]?.includes(p.status))
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        `Cannot move ${before.status} to ${p.status}.`,
      );
    if (["RESOLVED", "CLOSED", "REOPENED"].includes(p.status))
      requireRole(user, ADMIN);
    const r = await db.$transaction(async (tx) => {
      const changed = await tx.investigation.updateMany({
        where: { id: recordId, status: before.status },
        data: {
          status: p.status,
          resolvedAt: p.status === "RESOLVED" ? new Date() : undefined,
        },
      });
      if (!changed.count)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Investigation changed. Reload and retry.",
        );
      await tx.investigationEvent.create({
        data: {
          investigationId: recordId,
          userId: user.id,
          type: p.status,
          message: p.reason,
        },
      });
      await audit(
        tx,
        user,
        "TRANSITION",
        "Investigation",
        recordId,
        before,
        p,
        before.companyId,
      );
      return tx.investigation.findUnique({ where: { id: recordId } });
    });
    return json(r);
  }
  if (resource === "complaints") {
    requireRole(user, INSPECTORS);
    const before = await db.complaint.findUnique({ where: { id: recordId } });
    if (!before) throw new ApiError(404, "NOT_FOUND", "Complaint not found.");
    await assertCompanyAccess(user, before.companyId);
    const allowed: Record<string, string[]> = {
      SUBMITTED: ["UNDER_REVIEW", "UNDER_INVESTIGATION"],
      UNDER_REVIEW: ["UNDER_INVESTIGATION", "RESOLVED"],
      UNDER_INVESTIGATION: ["RESOLVED"],
      RESOLVED: ["CLOSED", "REOPENED"],
      CLOSED: ["REOPENED"],
      REOPENED: ["UNDER_INVESTIGATION"],
    };
    if (!allowed[before.status]?.includes(p.status))
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        "This complaint transition is not allowed.",
      );
    if (["RESOLVED", "CLOSED", "REOPENED"].includes(p.status))
      requireRole(user, ADMIN);
    const r = await db.$transaction(async (tx) => {
      const r = await tx.complaint.updateMany({
        where: { id: recordId, status: before.status },
        data: { status: p.status },
      });
      if (!r.count)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Complaint changed. Reload and retry.",
        );
      await audit(
        tx,
        user,
        "TRANSITION",
        "Complaint",
        recordId,
        before,
        p,
        before.companyId,
      );
      return tx.complaint.findUnique({ where: { id: recordId } });
    });
    return json(r);
  }
  if (resource === "non-conformities") {
    requireRole(user, ADMIN);
    const before = await db.nonConformity.findUnique({
      where: { id: recordId },
    });
    if (!before)
      throw new ApiError(404, "NOT_FOUND", "Non-conformity not found.");
    const allowed: Record<string, string[]> = {
      OPEN: ["IN_PROGRESS", "CLOSED"],
      IN_PROGRESS: ["CLOSED"],
      CLOSED: ["REOPENED"],
      REOPENED: ["IN_PROGRESS", "CLOSED"],
    };
    if (!allowed[before.status]?.includes(p.status))
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        "This finding transition is not allowed.",
      );
    if (
      p.status === "CLOSED" &&
      !(await db.correctiveAction.findFirst({
        where: { nonConformityId: recordId, status: "ACCEPTED" },
      }))
    )
      throw new ApiError(
        422,
        "ACTION_REVIEW_REQUIRED",
        "Accept a corrective action before closing this finding.",
      );
    const r = await db.$transaction(async (tx) => {
      const r = await tx.nonConformity.updateMany({
        where: { id: recordId, status: before.status },
        data: { status: p.status },
      });
      if (!r.count)
        throw new ApiError(409, "VERSION_CONFLICT", "Finding changed.");
      await audit(
        tx,
        user,
        "TRANSITION",
        "NonConformity",
        recordId,
        before,
        p,
        before.companyId,
      );
      return tx.nonConformity.findUnique({ where: { id: recordId } });
    });
    return json(r);
  }
  if (resource === "corrective-actions") {
    requireRole(user, ADMIN);
    const before = await db.correctiveAction.findUnique({
      where: { id: recordId },
    });
    if (!before)
      throw new ApiError(404, "NOT_FOUND", "Corrective action not found.");
    const allowed: Record<string, string[]> = {
      SUBMITTED: ["ACCEPTED", "REJECTED", "CHANGES_REQUESTED"],
      CHANGES_REQUESTED: ["ACCEPTED", "REJECTED"],
      ACCEPTED: ["REOPENED"],
      REJECTED: ["REOPENED"],
      REOPENED: ["ACCEPTED", "REJECTED", "CHANGES_REQUESTED"],
    };
    if (!allowed[before.status]?.includes(p.status))
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        "This corrective action transition is not allowed.",
      );
    const r = await db.$transaction(async (tx) => {
      const r = await tx.correctiveAction.updateMany({
        where: { id: recordId, status: before.status },
        data: {
          status: p.status,
          reviewedById: user.id,
          reviewNotes: p.reason,
          reviewedAt: new Date(),
        },
      });
      if (!r.count)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Corrective action changed.",
        );
      await audit(
        tx,
        user,
        "REVIEW",
        "CorrectiveAction",
        recordId,
        before,
        p,
        before.companyId,
      );
      return tx.correctiveAction.findUnique({ where: { id: recordId } });
    });
    return json(r);
  }
  throw new ApiError(404, "NOT_FOUND", "Workflow not found.");
}
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return await get(request, (await context.params).path, user);
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    return await post(request, (await context.params).path, user);
  } catch (error) {
    return handleError(error);
  }
}
