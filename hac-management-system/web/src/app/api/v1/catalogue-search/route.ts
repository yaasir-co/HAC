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
    const where: Prisma.ProductWhereInput = {
      archivedAt: null,
      ...(id
        ? { id }
        : q
          ? {
              OR: [
                { name: { contains: q } },
                { itemCode: { contains: q } },
                { brand: { name: { contains: q } } },
                {
                  variants: {
                    some: { OR: [{ barcode: q }, { sku: { startsWith: q } }] },
                  },
                },
              ],
            }
          : {}),
    };
    // No count, certificate histories, company relations or source JSON on the typing path.
    return json(
      await db.product.findMany({
        where,
        take: id ? 1 : 12,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          itemCode: true,
          type: true,
          status: true,
          isDemo: true,
          brand: { select: { name: true } },
          variants: {
            select: { id: true, name: true, sku: true, barcode: true },
          },
        },
      }),
    );
  } catch (error) {
    return handleError(error);
  }
}
