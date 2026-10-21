import { db } from "@/lib/db";
import { assertCompanyAccess, requireRole, requireUser } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { readPrivateFile, sha256 } from "@/lib/evidence";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
    const { id } = await context.params;
    const evidence = await db.inspectionEvidence.findUnique({
      where: { id },
      include: { inspection: { select: { companyId: true } } },
    });
    if (!evidence) throw new ApiError(404, "NOT_FOUND", "Evidence not found.");
    await assertCompanyAccess(user, evidence.inspection.companyId);
    let bytes: Buffer;
    try {
      bytes = await readPrivateFile(evidence.storedName);
    } catch {
      throw new ApiError(
        503,
        "EVIDENCE_UNAVAILABLE",
        "The evidence file is unavailable. Its retained record must be investigated.",
      );
    }
    if (sha256(bytes) !== evidence.sha256)
      throw new ApiError(
        409,
        "EVIDENCE_INTEGRITY_FAILED",
        "Evidence integrity verification failed. Contact an administrator.",
      );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": evidence.mimeType,
        "Content-Disposition": `inline; filename="evidence-${evidence.id}.${evidence.mimeType === "image/png" ? "png" : "jpg"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        ETag: `"${evidence.sha256}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
