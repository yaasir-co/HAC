import { requireRole, requireUser, assertSameOrigin, audit } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { SCAN_TEST_NAMES } from "@/lib/ai/object-test-core";
import artifact from "@/data/scan-test/model.json";
import evaluation from "@/data/scan-test/evaluation.json";
export const runtime = "nodejs";
const roles = ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"];
const labels = ["laptop", "phone", "pen", "pencil", "book"] as const;
const ids = labels.map(label => `scan-test-${label}`);
export async function GET(request: Request) {
  try {
    const user = await requireUser(request); requireRole(user, roles);
    const products = await db.product.findMany({ where: { id: { in: ids }, isDemo: true, archivedAt: null }, include: { brand: true, variants: true } });
    return json({ artifact, evaluation, products });
  } catch (error) { return handleError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireUser(request); requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
    const products = await db.$transaction(async tx => {
      const brand = await tx.brand.upsert({ where: { name: "Scanner test objects" }, update: {}, create: { name: "Scanner test objects" } });
      const manufacturer = await tx.manufacturer.upsert({ where: { name: "Unspecified — scan testing only" }, update: {}, create: { name: "Unspecified — scan testing only" } });
      const result = [];
      for (const label of labels) {
        const id = `scan-test-${label}`, existing = await tx.product.findUnique({ where: { id } });
        if (existing && !existing.isDemo) throw new ApiError(409, "TEST_PRODUCT_CONFLICT", "A non-test record already uses a reserved test identifier.");
        const name = `${SCAN_TEST_NAMES[label]} — SCAN TEST`;
        const product = existing ?? await tx.product.create({ data: { id, itemCode: `SCAN-TEST-${label.toUpperCase()}`, name, normalizedName: name.toLowerCase(), brandId: brand.id, manufacturerId: manufacturer.id, status: "ACTIVE", type: "FINISHED_PRODUCT", category: "SCAN_TEST", isDemo: true, description: "Camera testing only. This record has no HAC certificate or approval. Person detections are not product records." } });
        result.push(product);
      }
      await audit(tx, user, "CREATE_TEST_CATALOGUE", "Product", "scan-test-objects", undefined, { productIds: ids, certificationCreated: false });
      return result;
    });
    return json({ products }, 201);
  } catch (error) { return handleError(error); }
}
