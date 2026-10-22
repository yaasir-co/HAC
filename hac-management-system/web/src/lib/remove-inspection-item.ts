import { z } from "zod";
import { db } from "./db";
import { audit, type AuthUser } from "./auth";
import { ApiError } from "./errors";
import {
  assertDraft,
  assertInspector,
  getInspection,
  lockDraft,
} from "./inspection";
export async function removeInspectionItem(
  user: AuthUser,
  inspectionId: string,
  raw: unknown,
) {
  const input = z
    .object({
      observationId: z.string().min(1).max(100),
      version: z.number().int().positive(),
    })
    .strict()
    .parse(raw);
  const inspection = await getInspection(user, inspectionId);
  assertInspector(user, inspection);
  assertDraft(inspection);
  const item = inspection.observations.find(
    (row) => row.id === input.observationId,
  );
  if (!item)
    throw new ApiError(
      404,
      "OBSERVATION_NOT_FOUND",
      "This item is no longer on this inspection. Refresh the list.",
    );
  if (input.version !== inspection.version)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The inspection changed. Refresh and review the list before removing this item.",
    );
  await db.$transaction(
    async (tx) => {
      await lockDraft(tx, inspection);
      // Formal cases remain attached to the inspection. Removing an observation never deletes a case.
      await tx.investigation.updateMany({
        where: { observationId: item.id },
        data: { observationId: null },
      });
      await tx.nonConformity.updateMany({
        where: { observationId: item.id },
        data: { observationId: null },
      });
      await tx.inspectionFinding.deleteMany({
        where: { observationId: item.id },
      });
      await tx.inspectionEvidence.deleteMany({
        where: { observationId: item.id },
      });
      if (item.recognitionPredictionId)
        await tx.recognitionPrediction.updateMany({
          where: { id: item.recognitionPredictionId },
          data: { acceptedProductId: null },
        });
      await tx.observation.delete({ where: { id: item.id } });
      await tx.inspectionSignature.deleteMany({ where: { inspectionId } });
      // Retain opaque evidence files and existing report revisions for audit/backup; exclude removed evidence from the new report.
      await audit(
        tx,
        user,
        "REMOVE_INSPECTED_ITEM",
        "Observation",
        item.id,
        { ...item },
        { inspectionId, signaturesCleared: true },
        inspection.companyId,
      );
    },
    { isolationLevel: "Serializable", timeout: 30000 },
  );
  return {
    removed: true,
    observationId: item.id,
    version: inspection.version + 1,
  };
}
