import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleError } from "@/lib/errors";
import { json } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const url = new URL(request.url),
      datasetId = (url.searchParams.get("datasetId") || "").slice(0, 100),
      productId = url.searchParams.get("productId");
    const [counts, groups, images, products] = await Promise.all([
      db.trainingImage.groupBy({
        by: ["productId"],
        where: { datasetId },
        _count: { _all: true },
      }),
      db.trainingImage.groupBy({
        by: ["productId", "captureGroup"],
        where: { datasetId },
        _count: { _all: true },
      }),
      productId !== null
        ? db.trainingImage.findMany({
            where: { datasetId, productId: productId || null },
            take: 24,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              label: true,
              captureGroup: true,
              quality: true,
            },
          })
        : [],
      db.product.findMany({
        where: { trainingImages: { some: { datasetId } } },
        select: { id: true, name: true, type: true, itemCode: true },
      }),
    ]);
    return json({
      counts: counts.map((row) => ({
        productId: row.productId,
        count: row._count._all,
        groups: groups.filter((group) => group.productId === row.productId)
          .length,
        product: products.find((product) => product.id === row.productId),
      })),
      images,
    });
  } catch (error) {
    return handleError(error);
  }
}
