import {
  assertCompanyAccess,
  assertSameOrigin,
  audit,
  requireRole,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, handleError } from "@/lib/errors";
import { imageForm } from "@/lib/ai/upload";
import {
  prepareEvidence,
  storePrivateFile,
  readPrivateFile,
  deletePrivateFile,
  sha256,
} from "@/lib/evidence";
import { json } from "@/lib/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ kind: string; id: string }> };
async function owner(context: Context) {
  const { kind, id } = await context.params;
  if (!["product", "company"].includes(kind) || id.length > 100)
    throw new ApiError(404, "NOT_FOUND", "Record not found.");
  const record =
    kind === "product"
      ? await db.product.findUnique({ where: { id }, select: { id: true } })
      : await db.company.findUnique({ where: { id }, select: { id: true } });
  if (!record) throw new ApiError(404, "NOT_FOUND", "Record not found.");
  return { kind, id };
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const { kind, id } = await owner(context);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
    if (kind === "company") await assertCompanyAccess(user, id);
    const image = await db.catalogueImage.findUnique({
      where: { kind_ownerId: { kind, ownerId: id } },
    });
    if (!image)
      throw new ApiError(404, "NOT_FOUND", "No image has been added.");
    const bytes = await readPrivateFile(image.storedName);
    if (sha256(bytes) !== image.sha256)
      throw new ApiError(
        409,
        "IMAGE_INTEGRITY_FAILED",
        "The stored image failed verification.",
      );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(request: Request, context: Context) {
  let key: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const { kind, id } = await owner(context),
      form = await imageForm(request),
      file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(400, "FILE_REQUIRED", "Choose a JPEG or PNG image.");
    const prepared = await prepareEvidence(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    key = await storePrivateFile(
      "evidence",
      prepared.extension,
      prepared.buffer,
    );
    const row = await db.$transaction(async (tx) => {
      const value = {
        storedName: key!,
        mimeType: prepared.mimeType,
        sha256: prepared.sha256,
        byteSize: prepared.sizeBytes,
        uploadedById: user.id,
      };
      const image = await tx.catalogueImage.upsert({
        where: { kind_ownerId: { kind, ownerId: id } },
        create: { kind, ownerId: id, ...value },
        update: value,
      });
      await audit(
        tx,
        user,
        "SET_IMAGE",
        kind === "company" ? "Company" : "Product",
        id,
        undefined,
        { sha256: prepared.sha256 },
      );
      return image;
    });
    key = undefined;
    // Retain replaced artifacts: submitted report snapshots may still reference them.
    return json(
      { imageUrl: `/api/v1/catalogue-images/${kind}/${id}?v=${row.sha256}` },
      201,
    );
  } catch (e) {
    if (key) await deletePrivateFile(key);
    return handleError(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const { kind, id } = await owner(context);
    await db.$transaction(async (tx) => {
      await tx.catalogueImage.deleteMany({ where: { kind, ownerId: id } });
      await audit(
        tx,
        user,
        "REMOVE_IMAGE",
        kind === "company" ? "Company" : "Product",
        id,
      );
    });
    return json({ imageUrl: null });
  } catch (e) {
    return handleError(e);
  }
}
