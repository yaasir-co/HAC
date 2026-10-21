import { db } from "@/lib/db";
import { audit, requireRole, requireUser } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { getInspection } from "@/lib/inspection";
import {
  deletePrivateFile,
  readPrivateFile,
  sha256,
  storePrivateFile,
} from "@/lib/evidence";
import { renderInspectionPdf, renderInspectionWorkbook } from "@/lib/reports";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ inspectionId: string }> },
) {
  let uncommittedFile: string | undefined;
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
    const { inspectionId } = await context.params,
      inspection = await getInspection(user, inspectionId);
    const format = (
      new URL(request.url).searchParams.get("format") || "pdf"
    ).toLowerCase();
    if (format === "metadata") {
      const reports = await db.inspectionReport.findMany({
        where: { inspectionId },
        select: {
          id: true,
          reference: true,
          revision: true,
          format: true,
          sha256: true,
          snapshotHash: true,
          createdAt: true,
        },
        orderBy: [{ revision: "desc" }, { format: "asc" }],
      });
      return Response.json(
        {
          data: {
            inspectionReference: inspection.reference,
            status: inspection.status,
            reports,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!["pdf", "xlsx"].includes(format))
      throw new ApiError(
        400,
        "INVALID_FORMAT",
        "Choose pdf, xlsx or metadata.",
      );
    const where = {
      inspectionId_revision_format: {
        inspectionId,
        revision: inspection.version,
        format: format.toUpperCase(),
      },
    };
    let artifact = await db.inspectionReport.findUnique({ where });
    if (!artifact) {
      const source =
        inspection.submittedAt && inspection.snapshot
          ? {
              ...(inspection.snapshot as Record<string, unknown>),
              status: inspection.status,
              reviewedAt: inspection.reviewedAt,
              reviewedById: inspection.reviewedById,
              reviewReason: inspection.reviewReason,
            }
          : inspection;
      const snapshotHash = sha256(Buffer.from(JSON.stringify(source))),
        reference = `HACR-${inspection.id}-R${inspection.version}-${format.toUpperCase()}`;
      const metadata = {
        reference,
        revision: inspection.version,
        generatedAt: new Date(),
        status: inspection.status,
        snapshotHash: inspection.snapshotHash || snapshotHash,
      };
      const bytes =
        format === "pdf"
          ? await renderInspectionPdf(source, metadata, readPrivateFile)
          : await renderInspectionWorkbook(source, metadata);
      uncommittedFile = await storePrivateFile(
        "reports",
        format as "pdf" | "xlsx",
        bytes,
      );
      try {
        artifact = await db.$transaction(async (tx) => {
          const report = await tx.inspectionReport.create({
            data: {
              inspectionId,
              reference,
              revision: inspection.version,
              format: format.toUpperCase(),
              sha256: sha256(bytes),
              storedName: uncommittedFile!,
              generatedById: user.id,
              snapshotHash,
            },
          });
          await audit(
            tx,
            user,
            "GENERATE",
            "InspectionReport",
            report.id,
            undefined,
            {
              reference,
              revision: report.revision,
              format: report.format,
              sha256: report.sha256,
              snapshotHash,
            },
            inspection.companyId,
          );
          return report;
        });
        uncommittedFile = undefined;
      } catch (error) {
        // Concurrent identical requests retain one immutable artifact and discard only our unused file.
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        )
          artifact = await db.inspectionReport.findUnique({ where });
        else throw error;
        if (uncommittedFile) {
          await deletePrivateFile(uncommittedFile);
          uncommittedFile = undefined;
        }
      }
    }
    if (!artifact)
      throw new ApiError(
        503,
        "REPORT_UNAVAILABLE",
        "The report could not be generated. Please retry.",
      );
    let bytes: Buffer;
    try {
      bytes = await readPrivateFile(artifact.storedName);
    } catch {
      throw new ApiError(
        503,
        "REPORT_UNAVAILABLE",
        "The retained report file is unavailable. Restore its artifact from backup.",
      );
    }
    if (sha256(bytes) !== artifact.sha256)
      throw new ApiError(
        409,
        "REPORT_INTEGRITY_FAILED",
        "Report integrity verification failed. Contact an administrator.",
      );
    const name = inspection.reference.replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}-R${artifact.revision}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ETag: `"${artifact.sha256}"`,
        "X-Report-Reference": artifact.reference,
        "X-Report-SHA256": artifact.sha256,
        "X-Report-Revision": String(artifact.revision),
      },
    });
  } catch (error) {
    if (uncommittedFile) await deletePrivateFile(uncommittedFile);
    return handleError(error);
  }
}
