import { z } from "zod";
import { db } from "./db";
import { audit, type AuthUser } from "./auth";
import { ApiError } from "./errors";
import {
  assertDraft,
  lockDraft,
  jsonValue,
  type InspectionDetail,
} from "./inspection";
import { imageForm } from "./ai/upload";
import {
  deletePrivateFile,
  prepareEvidence,
  storePrivateFile,
} from "./evidence";
import { verifyProduct, physicalExpiryInstant } from "./verification";
import { observationIdentity } from "./observation-identity";
const schema = z.object({
  name: z.string().trim().min(1).max(300),
  kind: z.enum(["PRODUCT", "RAW_MATERIAL"]),
  brandName: z.string().trim().min(1).max(300),
  manufacturerName: z.string().trim().max(300).optional(),
  barcode: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  batch: z.string().trim().max(300).optional(),
  quantity: z.coerce.number().positive().optional(),
  physicalExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      try {
        physicalExpiryInstant(value);
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid expiry date")
    .optional(),
  clientMutationId: z.string().min(8).max(100),
});
export async function recordUnlisted(
  request: Request,
  user: AuthUser,
  record: InspectionDetail,
) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new ApiError(
      422,
      "PHOTO_REQUIRED",
      "Take or upload a photo and enter the item's name and brand.",
    );
  const form = await imageForm(request),
    raw = Object.fromEntries(
      [...form.entries()].filter(
        ([key, value]) =>
          key !== "file" && typeof value === "string" && value !== "",
      ),
    );
  const p = schema.parse(raw),
    file = form.get("file");
  if (!(file instanceof File))
    throw new ApiError(
      422,
      "PHOTO_REQUIRED",
      "Take or upload a photo of the unlisted item.",
    );
  const photo = await prepareEvidence(
    new Uint8Array(await file.arrayBuffer()),
    file.type,
  );
  const identityKey = observationIdentity(null, p.name, p.kind, p.brandName),
    createdAt = new Date();
  const expected = {
    observedName: p.name,
    observedBrand: p.brandName,
    observedManufacturer: p.manufacturerName || null,
    observedBarcode: p.barcode || null,
    conclusion: `UNLISTED_${p.kind}`,
    notes: p.description || null,
    batch: p.batch || null,
    quantity: p.quantity ?? null,
    physicalExpiry: p.physicalExpiry
      ? physicalExpiryInstant(p.physicalExpiry)
      : null,
  };
  const existing = await db.observation.findUnique({
    where: { clientMutationId: p.clientMutationId },
    include: { evidence: true },
  });
  const publicRow = (row: typeof existing) =>
    row && {
      ...row,
      evidence: row.evidence.map(({ storedName: _path, ...image }) => ({
        ...image,
        url: `/api/v1/evidence/${image.id}`,
      })),
    };
  if (existing) {
    const canonical = (value: unknown) =>
      value instanceof Date ? value.toISOString() : value;
    if (
      existing.inspectionId !== record.id ||
      existing.createdById !== user.id ||
      existing.productId ||
      Object.entries(expected).some(
        ([key, value]) =>
          canonical(existing[key as keyof typeof existing]) !==
          canonical(value),
      ) ||
      !existing.evidence.some((image) => image.sha256 === photo.sha256)
    )
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used for different inspection content.",
      );
    return {
      observation: publicRow(existing),
      catalogueChanged: false,
      repeated: true,
    };
  }
  assertDraft(record);
  const duplicate = record.observations.some(
    (row) =>
      !row.productId &&
      row.observedName &&
      observationIdentity(
        null,
        row.observedName,
        row.conclusion.replace("UNLISTED_", ""),
        row.observedBrand || "",
      ) === identityKey,
  );
  if (duplicate)
    throw new ApiError(
      409,
      "ALREADY_INSPECTED",
      "This item is already on this inspection.",
    );
  const verification = await verifyProduct({
    companyId: record.companyId,
    locationId: record.locationId,
    identityConfirmed: true,
    at: createdAt,
  });
  let storedName: string | undefined;
  try {
    storedName = await storePrivateFile(
      "evidence",
      photo.extension,
      photo.buffer,
    );
    const saved = await db.$transaction(async (tx) => {
      await lockDraft(tx, record);
      const previous = await tx.observation.findFirst({
        where: { inspectionId: record.id, identityKey },
      });
      if (previous)
        throw new ApiError(
          409,
          "ALREADY_INSPECTED",
          "This item is already on this inspection.",
        );
      const observation = await tx.observation.create({
        data: {
          ...expected,
          inspectionId: record.id,
          identityKey,
          createdById: user.id,
          clientMutationId: p.clientMutationId,
          identityConfirmed: true,
          verification: jsonValue(verification),
          createdAt,
          evidence: {
            create: {
              inspectionId: record.id,
              uploadedById: user.id,
              originalName: `unlisted-item.${photo.extension}`,
              storedName: storedName!,
              mimeType: photo.mimeType,
              byteSize: photo.sizeBytes,
              sha256: photo.sha256,
              description: `Unlisted ${p.kind.toLowerCase()}: ${p.name}`,
            },
          },
        },
        include: { evidence: true },
      });
      await tx.inspectionFinding.create({
        data: {
          inspectionId: record.id,
          observationId: observation.id,
          type: "UNLISTED_ITEM",
          title: `Unlisted item: ${p.name}`,
          description:
            "Inspection-only record with photo and observed identity. No master catalogue entry or approval created.",
          severity: "OBSERVATION",
        },
      });
      await tx.inspectionSignature.deleteMany({
        where: { inspectionId: record.id },
      });
      await audit(
        tx,
        user,
        "RECORD_UNLISTED_ITEM",
        "Observation",
        observation.id,
        undefined,
        {
          name: p.name,
          brand: p.brandName,
          kind: p.kind,
          photoHash: photo.sha256,
          catalogueChanged: false,
        },
        record.companyId,
      );
      return observation;
    });
    storedName = undefined;
    return {
      observation: publicRow(saved),
      catalogueChanged: false,
      repeated: false,
    };
  } catch (error) {
    if (storedName) await deletePrivateFile(storedName);
    throw error;
  }
}
