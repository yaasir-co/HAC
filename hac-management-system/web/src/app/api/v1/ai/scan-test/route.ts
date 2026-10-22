import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/errors";
async function retired(request: Request) {
  try {
    await requireUser(request);
    return Response.json(
      {
        error: {
          code: "FEATURE_REMOVED",
          message:
            "The experimental test scanner has been removed. Use the product scanner with a published product model.",
        },
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleError(e);
  }
}
export const GET = retired;
export const POST = retired;
