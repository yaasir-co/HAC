import { requireUser, requireRole, assertCompanyAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, handleError } from "@/lib/errors";
import { json } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ inspectionId: string }> },
) {
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
    const { inspectionId } = await context.params;
    const record = await db.inspection.findUnique({
      where: { id: inspectionId },
      select: {
        id: true,
        reference: true,
        companyId: true,
        locationId: true,
        inspectorId: true,
        status: true,
        version: true,
        startedAt: true,
        submittedAt: true,
        company: {
          select: { legalName: true, tradingName: true, isDemo: true },
        },
        location: { select: { name: true, address: true } },
        observations: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            productId: true,
            variantId: true,
            observedName: true,
            observedBrand: true,
            conclusion: true,
            notes: true,
            verification: true,
            createdAt: true,
            product: {
              select: {
                id: true,
                name: true,
                type: true,
                itemCode: true,
                brand: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!record) throw new ApiError(404, "NOT_FOUND", "Inspection not found.");
    await assertCompanyAccess(user, record.companyId);
    return json({
      ...record,
      observations: record.observations.map((row) => {
        const verification = row.verification as Record<string, unknown>;
        return {
          ...row,
          verification: {
            primaryStatus: verification.primaryStatus,
            label: verification.label,
            outcomes: verification.outcomes,
            requiresAction: verification.requiresAction,
          },
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
