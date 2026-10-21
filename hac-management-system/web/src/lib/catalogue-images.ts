import { db } from "./db";
export type ImageKind = "product" | "company";
export async function withCatalogueImages<T extends { id: string }>(
  kind: ImageKind,
  records: T[],
) {
  if (!records.length)
    return records.map((row) => ({ ...row, imageUrl: null as string | null }));
  const images = await db.catalogueImage.findMany({
    where: { kind, ownerId: { in: records.map((row) => row.id) } },
    select: { ownerId: true, sha256: true },
  });
  const byId = new Map(
    images.map((image) => [
      image.ownerId,
      `/api/v1/catalogue-images/${kind}/${encodeURIComponent(image.ownerId)}?v=${image.sha256}`,
    ]),
  );
  return records.map((row) => ({ ...row, imageUrl: byId.get(row.id) || null }));
}
