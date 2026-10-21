import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "./errors";
import { assertCompanyAccess, audit, requireRole, type AuthUser } from "./auth";
import { verifyProduct } from "./verification";

export const inspectionInclude = {
  company: true,
  location: true,
  inspector: { select: { id: true, name: true, email: true } },
  checklistVersion: {
    include: {
      template: true,
      questions: { orderBy: { order: "asc" as const } },
    },
  },
  observations: {
    include: {
      product: { include: { brand: true, manufacturer: true } },
      recognitionPrediction: true,
      variant: true,
      evidence: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  responses: true,
  findings: true,
  evidence: true,
  signatures: true,
  investigations: true,
  nonConformities: true,
  complaints: true,
} satisfies Prisma.InspectionInclude;
export type InspectionDetail = Prisma.InspectionGetPayload<{
  include: typeof inspectionInclude;
}>;
export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export async function getInspection(user: AuthUser, inspectionId: string) {
  const record = await db.inspection.findUnique({
    where: { id: inspectionId },
    include: inspectionInclude,
  });
  if (!record) throw new ApiError(404, "NOT_FOUND", "Inspection not found.");
  await assertCompanyAccess(user, record.companyId);
  return record;
}
export function assertInspector(
  user: AuthUser,
  record: { inspectorId: string },
) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
  if (
    !["SUPER_ADMIN", "HAC_ADMIN"].includes(user.role) &&
    record.inspectorId !== user.id
  )
    throw new ApiError(
      403,
      "NOT_ASSIGNED",
      "Only the assigned inspector can change this inspection.",
    );
}
export function assertDraft(record: { status: string }) {
  if (record.status !== "IN_PROGRESS")
    throw new ApiError(
      409,
      "INSPECTION_LOCKED",
      "Start this inspection before making changes. Submitted inspections are immutable.",
    );
}
export async function lockDraft(
  tx: Prisma.TransactionClient,
  record: { id: string; version: number },
) {
  const changed = await tx.inspection.updateMany({
    where: { id: record.id, version: record.version, status: "IN_PROGRESS" },
    data: { version: { increment: 1 } },
  });
  if (changed.count !== 1)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The inspection changed. Reload before retrying.",
    );
}
export function answerValid(
  type: string,
  answer: unknown,
  options: unknown,
): boolean {
  switch (type) {
    case "YES_NO":
      return (
        typeof answer === "boolean" || ["YES", "NO"].includes(String(answer))
      );
    case "COMPLIANCE":
      return ["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"].includes(
        String(answer),
      );
    case "PASS_FAIL":
      return ["PASS", "FAIL"].includes(String(answer));
    case "NUMBER":
    case "NUMERIC":
      return typeof answer === "number" && Number.isFinite(answer);
    case "DATE":
      return (
        typeof answer === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(answer) &&
        !isNaN(Date.parse(answer))
      );
    case "MULTIPLE_CHOICE":
      return Array.isArray(options) && options.includes(answer);
    case "TEXT":
      return (
        typeof answer === "string" &&
        answer.trim().length > 0 &&
        answer.length <= 10000
      );
    case "PHOTOGRAPH":
    case "ATTACHMENT":
    case "SIGNATURE":
      return typeof answer === "string" && answer.length > 0;
    default:
      return false;
  }
}
export function isQuestionVisible(
  condition: unknown,
  responses: Map<string, unknown>,
): boolean {
  if (!condition) return true;
  const c = condition as { questionId?: string; equals?: unknown };
  if (!c.questionId) return false;
  return (
    JSON.stringify(responses.get(c.questionId)) === JSON.stringify(c.equals)
  );
}
export async function submitInspection(
  user: AuthUser,
  id: string,
  version: number,
) {
  const record = await getInspection(user, id);
  assertInspector(user, record);
  assertDraft(record);
  if (record.version !== version)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The inspection changed. Review it before submitting.",
    );
  if (!record.observations.length)
    throw new ApiError(
      422,
      "OBSERVATIONS_REQUIRED",
      "Record at least one product observation.",
    );
  const answers = new Map(
    record.responses.map((r) => [r.questionId, r.answer]),
  );
  for (const question of record.checklistVersion.questions) {
    if (!isQuestionVisible(question.condition, answers)) continue;
    const response = record.responses.find((r) => r.questionId === question.id);
    if (
      question.required &&
      (!response ||
        !answerValid(question.type, response.answer, question.options))
    )
      throw new ApiError(
        422,
        "CHECKLIST_INCOMPLETE",
        `Answer the required question: ${question.text}`,
      );
    if (
      response &&
      Array.isArray(question.requiresEvidenceOn) &&
      question.requiresEvidenceOn.includes(response.answer) &&
      (!record.evidence.length || !response.notes?.trim())
    )
      throw new ApiError(
        422,
        "CHECKLIST_EVIDENCE_REQUIRED",
        `Provide evidence and notes for: ${question.text}`,
      );
  }
  const inspectorSignature = record.signatures.find(
    (s) => s.role === "INSPECTOR" && s.userId === record.inspectorId,
  );
  if (!inspectorSignature)
    throw new ApiError(
      422,
      "SIGNATURE_REQUIRED",
      "The assigned inspector must sign the declaration.",
    );
  const companySignature = record.signatures.find(
    (s) => s.role === "COMPANY_REPRESENTATIVE",
  );
  if (
    !companySignature ||
    (!companySignature.signature && !companySignature.reason)
  )
    throw new ApiError(
      422,
      "REPRESENTATIVE_REQUIRED",
      "Record the company representative signature or the reason it is unavailable.",
    );
  return db.$transaction(
    async (tx) => {
      await lockDraft(tx, record);
      // A serializable read binds the snapshot to one consistent authoritative record set.
      const reconciled = [];
      for (const observation of record.observations) {
        const verification = await verifyProduct(
          {
            productId: observation.productId,
            variantId: observation.variantId,
            companyId: record.companyId,
            locationId: record.locationId,
            at: observation.createdAt,
            observedBrand: observation.observedBrand,
            observedManufacturer: observation.observedManufacturer,
            observedBarcode: observation.observedBarcode,
            observedVariant: observation.observedVariant,
            physicalExpiry: observation.physicalExpiry,
            identityConfirmed: observation.identityConfirmed,
          },
          { db: tx },
        );
        const previous = observation.verification as {
          outcomes?: string[];
          masterDataVersion?: string;
        };
        if (
          JSON.stringify(previous.outcomes) !==
            JSON.stringify(verification.outcomes) ||
          previous.masterDataVersion !== verification.masterDataVersion
        )
          throw new ApiError(
            409,
            "REVALIDATION_REQUIRED",
            `Approval sources changed for ${observation.observedName || observation.product?.name || "an observation"}. Reconcile the inspection and review the updated results before signing again.`,
          );
        reconciled.push({ ...observation, verification });
      }
      const submittedAt = new Date();
      const snapshot = {
        ...record,
        snapshot: undefined,
        snapshotHash: undefined,
        observations: reconciled,
        status: "SUBMITTED",
        submittedAt,
        version: version + 1,
      };
      const value = jsonValue(snapshot);
      const hash = createHash("sha256")
        .update(JSON.stringify(value))
        .digest("hex");
      const updated = await tx.inspection.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt,
          snapshot: value,
          snapshotHash: hash,
        },
      });
      await audit(
        tx,
        user,
        "SUBMIT",
        "Inspection",
        id,
        { status: record.status },
        { status: "SUBMITTED", snapshotHash: hash },
        record.companyId,
      );
      const reviewers = await tx.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "HAC_ADMIN"] }, isActive: true },
        select: { id: true },
      });
      await tx.notification.createMany({
        data: reviewers.map((reviewer) => ({
          userId: reviewer.id,
          title: "Inspection awaiting review",
          message: `${record.reference} was submitted by ${user.name}.`,
          href: `/inspections/${id}`,
        })),
      });
      return updated;
    },
    { isolationLevel: "Serializable", timeout: 30000 },
  );
}
