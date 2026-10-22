import { Prisma } from "@prisma/client";
import { db } from "./db";
type ProductRow = {
  id: string;
  name: string;
  itemCode: string;
  type: string;
  category: string;
  status: string;
  isDemo: boolean | number;
  version: number;
  brandId: string;
  brandName: string;
  manufacturerId: string;
  manufacturerName: string;
};
/** Parameterised portable SQL avoids relation-query/JSON SQL generation on older hosted MySQL/MariaDB versions. */
type CatalogueOptions = {
  q?: string;
  id?: string;
  status?: string;
  type?: string;
  take?: number;
  skip?: number;
  companyIds?: string[];
};
export function catalogueWhere({
  q = "",
  id,
  status,
  type,
  companyIds,
}: CatalogueOptions) {
  const query = q.trim().slice(0, 100),
    terms: Prisma.Sql[] = [Prisma.sql`p.archivedAt IS NULL`];
  if (id) terms.push(Prisma.sql`p.id = ${id}`);
  if (status) terms.push(Prisma.sql`p.status = ${status}`);
  if (type) terms.push(Prisma.sql`p.type = ${type}`);
  if (companyIds)
    terms.push(
      companyIds.length
        ? Prisma.sql`EXISTS (SELECT 1 FROM CompanyItem ci WHERE ci.productId=p.id AND ci.companyId IN (${Prisma.join(companyIds)}))`
        : Prisma.sql`1=0`,
    );
  if (query && !id)
    terms.push(
      Prisma.sql`(LOCATE(LOWER(${query}),LOWER(p.name))>0 OR LOCATE(LOWER(${query}),LOWER(p.itemCode))>0 OR LOCATE(LOWER(${query}),LOWER(b.name))>0 OR LOCATE(LOWER(${query}),LOWER(m.name))>0 OR EXISTS (SELECT 1 FROM ProductVariant v WHERE v.productId=p.id AND (v.barcode=${query} OR LOCATE(LOWER(${query}),LOWER(v.sku))>0)))`,
    );
  return Prisma.join(terms, " AND ");
}
export async function countCatalogue(options: CatalogueOptions) {
  const rows = await db.$queryRaw<{ total: bigint | number }[]>(
    Prisma.sql`SELECT COUNT(*) AS total FROM Product p JOIN Brand b ON b.id=p.brandId JOIN Manufacturer m ON m.id=p.manufacturerId WHERE ${catalogueWhere(options)}`,
  );
  return Number(rows[0]?.total || 0);
}
export async function queryCatalogue(options: CatalogueOptions) {
  const { take = 20, skip = 0 } = options,
    condition = catalogueWhere(options);

  const records = await db.$queryRaw<ProductRow[]>(
    Prisma.sql`SELECT p.id,p.name,p.itemCode,p.type,p.category,p.status,p.isDemo,p.version,p.brandId,b.name AS brandName,p.manufacturerId,m.name AS manufacturerName FROM Product p JOIN Brand b ON b.id=p.brandId JOIN Manufacturer m ON m.id=p.manufacturerId WHERE ${condition} ORDER BY p.name,p.id LIMIT ${Math.max(1, Math.min(100, Math.floor(take)))} OFFSET ${Math.max(0, Math.floor(skip))}`,
  );
  const variants = records.length
    ? await db.$queryRaw<
        {
          id: string;
          productId: string;
          name: string;
          sku: string;
          barcode: string | null;
        }[]
      >(
        Prisma.sql`SELECT id,productId,name,sku,barcode FROM ProductVariant WHERE productId IN (${Prisma.join(records.map((row) => row.id))}) ORDER BY id`,
      )
    : [];
  return records.map(({ brandName, manufacturerName, ...row }) => ({
    ...row,
    isDemo: Boolean(row.isDemo),
    brand: { id: row.brandId, name: brandName },
    manufacturer: { id: row.manufacturerId, name: manufacturerName },
    variants: variants.filter((variant) => variant.productId === row.id),
  }));
}
