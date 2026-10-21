import { z } from "zod";
import { assertSameOrigin, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleError } from "@/lib/errors";
import { body, json } from "@/lib/http";
import {
  startTrainingJob,
  stepTrainingJob,
  cancelTrainingJob,
} from "@/lib/ai/training-jobs";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const datasetId =
      new URL(request.url).searchParams.get("datasetId") || undefined;
    return json(
      await db.modelVersion.findMany({
        where: { datasetId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          datasetId: true,
          version: true,
          status: true,
          metrics: true,
          createdAt: true,
        },
      }),
    );
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const input = await body(
      request,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("start"),
          datasetId: z.string().min(1).max(100),
        }),
        z.object({
          action: z.enum(["step", "cancel"]),
          modelId: z.string().min(1).max(100),
        }),
      ]),
    );
    return json(
      input.action === "start"
        ? await startTrainingJob(user, { datasetId: input.datasetId })
        : input.action === "cancel"
          ? await cancelTrainingJob(user, input.modelId)
          : await stepTrainingJob(user, input.modelId),
    );
  } catch (error) {
    return handleError(error);
  }
}
