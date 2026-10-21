import { assertSameOrigin, requireRole, requireUser } from "@/lib/auth";
import { handleError } from "@/lib/errors";
import { readJson } from "@/lib/request-body";
import { getWorkspaceSetup, provisionWorkspace, updateWorkspaceRecord } from "@/lib/workspace-setup";

export const runtime = "nodejs";
export const maxDuration = 120;
const json = (data: unknown, status = 200) => Response.json({ data }, {
  status, headers: { "Cache-Control": "private, no-store", "Pragma": "no-cache" },
});
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    return json(await getWorkspaceSetup(user));
  }
  catch (error) { return handleError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    return json(await provisionWorkspace(user, await readJson(request, 65536)), 201);
  } catch (error) { return handleError(error); }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    return json(await updateWorkspaceRecord(user, await readJson(request, 65536)));
  } catch (error) { return handleError(error); }
}
