import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, requireRole, type AuthUser } from "./auth";
import { db } from "./db";
import { ApiError } from "./errors";
import { id, note } from "./http";

const START_ROLES = ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR"];
const ADMIN_ROLES = ["SUPER_ADMIN", "HAC_ADMIN"];

export const startInspectionSchema = z.object({
  companyId: id,
  locationId: id,
  checklistVersionId: id.nullable().optional(),
  type: z.enum([
    "INITIAL", "ROUTINE", "SURVEILLANCE", "RENEWAL", "FOLLOW_UP",
    "COMPLAINT", "SPECIAL", "UNANNOUNCED",
  ]).default("ROUTINE"),
  objectives: note.optional(),
}).strict();

export type StartInspectionInput = z.infer<typeof startInspectionSchema>;

/** A supervisor starts their own visit; the company assignment is the authorization. */
export async function startInspectionNow(
  user: AuthUser,
  input: StartInspectionInput,
  client: Pick<PrismaClient, "$transaction"> = db,
  at = new Date(),
) {
  requireRole(user, START_ROLES);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await client.$transaction(async (tx) => {
        // Re-read permissions in the same serializable transaction as creation.
        const inspector = await tx.user.findUnique({ where: { id: user.id } });
        if (!inspector?.isActive || !START_ROLES.includes(inspector.role)) {
          throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "An active supervisor or HAC administrator account is required.");
        }
        if (!ADMIN_ROLES.includes(inspector.role)) {
          const assignment = await tx.supervisorCompanyAssignment.findFirst({
            where: { userId: user.id, companyId: input.companyId, isActive: true, revokedAt: null },
          });
          if (!assignment) {
            throw new ApiError(403, "COMPANY_ACCESS_DENIED", "You can start inspections only for companies currently assigned to you.");
          }
        }
        const [company, location, checklist] = await Promise.all([
          tx.company.findUnique({ where: { id: input.companyId } }),
          tx.companyLocation.findUnique({ where: { id: input.locationId } }),
          input.checklistVersionId ? tx.checklistTemplateVersion.findUnique({ where: { id: input.checklistVersionId } }) : Promise.resolve(null),
        ]);
        if (!company || company.archivedAt || company.status !== "ACTIVE") {
          throw new ApiError(422, "COMPANY_UNAVAILABLE", "Choose an active company.");
        }
        if (!location?.isActive || location.companyId !== company.id) {
          throw new ApiError(422, "INVALID_LOCATION", "Choose an active location belonging to this company.");
        }
        if (input.checklistVersionId && (!checklist || checklist.status !== "PUBLISHED")) {
          throw new ApiError(422, "INVALID_CHECKLIST", "Choose a published inspection checklist.");
        }
        const existing = await tx.inspection.findFirst({
          where: { inspectorId: user.id, companyId: company.id, locationId: location.id, status: "IN_PROGRESS" },
          orderBy: { startedAt: "desc" },
        });
        if (existing) return { inspection: existing, created: false };
        const inspection = await tx.inspection.create({
          data: {
            companyId: company.id,
            locationId: location.id,
            inspectorId: user.id,
            checklistVersionId: checklist?.id ?? null,
            type: input.type,
            objectives: input.objectives,
            priority: "NORMAL",
            reference: `INS-${at.getUTCFullYear()}-${randomUUID().slice(0, 12).toUpperCase()}`,
            status: "IN_PROGRESS",
            startedAt: at,
            // Retain this date for sorting; no prior schedule is required.
            scheduledAt: at,
            masterDataVersion: `HAC-1@${at.toISOString()}`,
            isDemo: company.isDemo,
          },
        });
        await audit(tx, user, "SELF_START", "Inspection", inspection.id, undefined, {
          companyId: company.id,
          locationId: location.id,
          inspectorId: user.id,
          checklistVersionId: checklist?.id ?? null,
          status: "IN_PROGRESS",
          startedAt: at,
        }, company.id);
        return { inspection, created: true };
      }, { isolationLevel: "Serializable", timeout: 15000 });
    } catch (error) {
      // A concurrent tap may lock the same active-visit range; resume after one retry.
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code === "P2034") {
        if (attempt === 0) continue;
        throw new ApiError(409, "START_CONFLICT", "Reload and try starting the inspection again.");
      }
      throw error;
    }
  }
  throw new ApiError(409, "START_CONFLICT", "Reload and try starting the inspection again.");
}
