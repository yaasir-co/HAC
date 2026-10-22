import { queryCatalogue } from "@/lib/catalogue-query";
import { withCatalogueImages } from "@/lib/catalogue-images";
import type { Prisma } from "@prisma/client";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleError } from "@/lib/errors";
import { json } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
    const url = new URL(request.url),
      q = (url.searchParams.get("q") || "").trim().slice(0, 100),
      id = url.searchParams.get("id")?.slice(0, 100);
    return json(
      await withCatalogueImages(
        "product",
        await queryCatalogue({ q, id, take: id ? 1 : 12 }),
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}
