import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, audit, requireUser } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import {
  assertDraft,
  assertInspector,
  getInspection,
  lockDraft,
} from "@/lib/inspection";
import {
  deletePrivateFile,
  MAX_EVIDENCE_BYTES,
  prepareEvidence,
  storePrivateFile,
} from "@/lib/evidence";

export const runtime = "nodejs";
const fields = z.object({
  inspectionId: z.string().min(1).max(100),
  observationId: z.string().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});

async function limitedForm(request: Request): Promise<FormData> {
  const limit = MAX_EVIDENCE_BYTES + 65536;
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new ApiError(413, "FILE_TOO_LARGE", "Evidence upload exceeds 8 MB.");
  const type = request.headers.get("content-type");
  if (!type?.startsWith("multipart/form-data;"))
    throw new ApiError(
      415,
      "MULTIPART_REQUIRED",
      "Upload evidence as multipart form data.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "EMPTY_UPLOAD", "Select an image.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new ApiError(
        413,
        "FILE_TOO_LARGE",
        "Evidence upload exceeds 8 MB.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": type },
    }).formData();
  } catch {
    throw new ApiError(400, "INVALID_UPLOAD", "The upload could not be read.");
  }
}

export async function POST(request: Request) {
  let storedName: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const form = await limitedForm(request);
    const values = fields.parse({
      inspectionId: form.get("inspectionId"),
      observationId: form.get("observationId") || undefined,
      description: form.get("description") || undefined,
      capturedAt: form.get("capturedAt") || undefined,
    });
    const inspection = await getInspection(user, values.inspectionId);
    assertInspector(user, inspection);
    assertDraft(inspection);
    if (
      values.observationId &&
      !inspection.observations.some((o) => o.id === values.observationId)
    )
      throw new ApiError(
        422,
        "OBSERVATION_MISMATCH",
        "The observation does not belong to this inspection.",
      );
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(400, "FILE_REQUIRED", "Select a JPEG or PNG image.");
    const prepared = await prepareEvidence(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    storedName = await storePrivateFile(
      "evidence",
      prepared.extension,
      prepared.buffer,
    );
    const originalName =
      file.name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(-180) ||
      `image.${prepared.extension}`;
    const evidence = await db.$transaction(async (tx) => {
      await lockDraft(tx, inspection);
      const result = await tx.inspectionEvidence.create({
        data: {
          inspectionId: inspection.id,
          observationId: values.observationId,
          uploadedById: user.id,
          originalName,
          storedName: storedName!,
          mimeType: prepared.mimeType,
          byteSize: prepared.sizeBytes,
          sha256: prepared.sha256,
          description: values.description,
          capturedAt: values.capturedAt
            ? new Date(values.capturedAt)
            : undefined,
        },
      });
      await tx.inspectionSignature.deleteMany({
        where: { inspectionId: inspection.id },
      });
      await audit(
        tx,
        user,
        "UPLOAD",
        "InspectionEvidence",
        result.id,
        undefined,
        {
          inspectionId: inspection.id,
          sha256: result.sha256,
          byteSize: result.byteSize,
          description: result.description,
        },
        inspection.companyId,
      );
      return result;
    });
    const { storedName: _storedName, ...publicEvidence } = evidence;
    return Response.json(
      { data: { ...publicEvidence, url: `/api/v1/evidence/${evidence.id}` } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (storedName) await deletePrivateFile(storedName);
    return handleError(error);
  }
}
