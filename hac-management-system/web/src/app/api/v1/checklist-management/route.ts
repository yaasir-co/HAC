import { z } from "zod";
import { assertSameOrigin, requireRole, requireUser } from "@/lib/auth";
import { handleError } from "@/lib/errors";
import { body, id, json } from "@/lib/http";
import { listManagedChecklists, publishChecklist, archiveChecklist } from "@/lib/checklist-management";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const user = await requireUser(request); return json(await listManagedChecklists(user)); }
  catch (error) { return handleError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireUser(request); requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    return json(await publishChecklist(user, await body(request, z.unknown())), 201);
  } catch (error) { return handleError(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireUser(request); requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const input = await body(request, z.object({ templateId: id }).strict());
    return json(await archiveChecklist(user, input.templateId));
  } catch (error) { return handleError(error); }
}
