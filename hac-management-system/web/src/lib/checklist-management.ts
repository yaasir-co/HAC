import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, requireRole, type AuthUser } from "./auth";
import { db } from "./db";
import { ApiError } from "./errors";
import { jsonValue } from "./inspection";
import { id, note, text } from "./http";

function revisionFailure(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")
    throw new ApiError(409, "VERSION_CONFLICT", "This checklist changed during saving. Reload before trying again.");
  throw error;
}

const question = z.object({
  id: id.optional(), section: text.default("General"), text: note.min(1),
  type: z.enum(["YES_NO", "COMPLIANCE", "PASS_FAIL", "MULTIPLE_CHOICE", "NUMERIC", "DATE", "TEXT", "PHOTOGRAPH", "ATTACHMENT", "SIGNATURE"]),
  options: z.array(text).max(50).nullable().optional(),
  condition: z.object({ questionId: id, equals: z.json() }).nullable().optional(),
  requiresEvidenceOn: z.array(z.json()).nullable().optional(),
}).strict();
export const checklistEditSchema = z.object({
  templateId: id.optional(), expectedVersion: z.number().int().positive().optional(),
  name: text, description: note.optional(), questions: z.array(question).max(300),
}).strict().superRefine((value, context) => {
  const ids = value.questions.flatMap(q => q.id ? [q.id] : []);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Question identifiers must be distinct." });
  for (const q of value.questions) {
    if (q.type === "MULTIPLE_CHOICE" && !q.options?.length) context.addIssue({ code: "custom", message: "A multiple choice question needs options." });
    if (q.condition && (!ids.includes(q.condition.questionId) || q.condition.questionId === q.id)) context.addIssue({ code: "custom", message: "A conditional question must refer to another retained question." });
  }
  if (value.templateId && !value.expectedVersion) context.addIssue({ code: "custom", message: "Reload the checklist before editing its version." });
});
export async function listManagedChecklists(user: AuthUser) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  return db.checklistTemplate.findMany({ include: { versions: { orderBy: { version: "desc" }, take: 1, include: { questions: { orderBy: { order: "asc" } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
}
export async function publishChecklist(user: AuthUser, raw: unknown, client: Pick<PrismaClient, "$transaction"> = db) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  const input = checklistEditSchema.parse(raw);
  return client.$transaction(async tx => {
    const existing = input.templateId ? await tx.checklistTemplate.findUnique({ where: { id: input.templateId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }) : null;
    if (input.templateId && !existing) throw new ApiError(404, "NOT_FOUND", "Checklist not found.");
    if (existing && existing.versions[0]?.version !== input.expectedVersion) throw new ApiError(409, "VERSION_CONFLICT", "This checklist changed. Reload before saving.");
    // Published content and existing responses remain immutable. An edit creates a new version.
    const template = existing ?? await tx.checklistTemplate.create({ data: { name: input.name, description: input.description } });
    const version = (existing?.versions[0]?.version ?? 0) + 1;
    const mapping = new Map(input.questions.filter(q => q.id).map(q => [q.id!, randomUUID()]));
    const result = await tx.checklistTemplateVersion.create({ data: {
      templateId: template.id, version, status: "PUBLISHED", publishedAt: new Date(),
      questions: { create: input.questions.map((q, order) => ({
        id: q.id ? mapping.get(q.id) : randomUUID(), section: q.section, text: q.text, type: q.type,
        required: false, order,
        options: q.options ? jsonValue(q.options) : undefined,
        condition: q.condition ? jsonValue({ ...q.condition, questionId: mapping.get(q.condition.questionId)! }) : undefined,
        requiresEvidenceOn: q.requiresEvidenceOn ? jsonValue(q.requiresEvidenceOn) : undefined,
      })) },
    }, include: { questions: true } });
    await tx.checklistTemplateVersion.updateMany({ where: { templateId: template.id, status: "PUBLISHED", id: { not: result.id } }, data: { status: "RETIRED" } });
    // A template's display name is shared; retain historical names in audit and submitted snapshots.
    if (existing) await tx.checklistTemplate.update({ where: { id: template.id }, data: { name: input.name, description: input.description } });
    await audit(tx, user, "PUBLISH", "ChecklistTemplateVersion", result.id, existing, { ...result, name: input.name });
    return result;
  }, { isolationLevel: "Serializable" }).catch(revisionFailure);
}
export async function archiveChecklist(user: AuthUser, templateId: string, client: Pick<PrismaClient, "$transaction"> = db) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  return client.$transaction(async tx => {
    const template = await tx.checklistTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new ApiError(404, "NOT_FOUND", "Checklist not found.");
    const result = await tx.checklistTemplateVersion.updateMany({ where: { templateId, status: "PUBLISHED" }, data: { status: "RETIRED" } });
    await audit(tx, user, "ARCHIVE", "ChecklistTemplate", templateId, template, { retired: true });
    return { id: templateId, retiredVersions: result.count };
  }, { isolationLevel: "Serializable" }).catch(revisionFailure);
}
