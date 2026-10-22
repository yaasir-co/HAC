import { databaseDiagnostic } from "./database-diagnostics";
import { db } from "./db";
export type ImageKind = "product" | "company";
export async function withCatalogueImages<T extends { id: string }>(
  kind: ImageKind,
  records: T[],
) {
  if (!records.length)
    return records.map((row) => ({ ...row, imageUrl: null as string | null }));
  let images: { ownerId: string; sha256: string }[] = [];
  try {
    images = await db.catalogueImage.findMany({
      where: { kind, ownerId: { in: records.map((row) => row.id) } },
      select: { ownerId: true, sha256: true },
    });
  } catch (error) {
    if (databaseDiagnostic(error)?.code !== "DATABASE_SCHEMA_NOT_READY")
      throw error;
    console.warn(
      "[catalogue] Display images unavailable: DATABASE_SCHEMA_NOT_READY",
    );
  }
  const byId = new Map(
    images.map((image) => [
      image.ownerId,
      `/api/v1/catalogue-images/${kind}/${encodeURIComponent(image.ownerId)}?v=${image.sha256}`,
    ]),
  );
  return records.map((row) => ({ ...row, imageUrl: byId.get(row.id) || null }));
}
