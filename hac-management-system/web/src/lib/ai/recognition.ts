import { db } from "../db";
import { assertCompanyAccess, requireRole, type AuthUser } from "../auth";
import { ApiError } from "../errors";
import { jsonValue } from "../inspection";
import { withCatalogueImages } from "../catalogue-images";
import { EXTRACTOR, rank, type Artifact } from "./core";
export async function recognitionModel(
  user: AuthUser,
  inspectionId?: string,
  modelVersionId?: string,
) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
  if (inspectionId) {
    const inspection = await db.inspection.findUnique({
      where: { id: inspectionId },
      select: { companyId: true },
    });
    if (!inspection)
      throw new ApiError(404, "NOT_FOUND", "Inspection not found.");
    await assertCompanyAccess(user, inspection.companyId);
  }
  if (modelVersionId) requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  const model = modelVersionId
    ? await db.modelVersion.findUnique({ where: { id: modelVersionId } })
    : await db.modelVersion.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
      });
  if (!model?.artifact)
    throw new ApiError(
      409,
      "MODEL_NOT_PUBLISHED",
      "No product model has been published. Use catalogue search.",
    );
  return model;
}
export async function recordRecognition(
  user: AuthUser,
  embedding: number[],
  inspectionId?: string,
  modelVersionId?: string,
  loaded?: Awaited<ReturnType<typeof recognitionModel>>,
  strictForeground = false,
) {
  const model =
      loaded || (await recognitionModel(user, inspectionId, modelVersionId)),
    artifact = model.artifact as unknown as Artifact;
  if (
    artifact.extractor.version !== EXTRACTOR.version ||
    artifact.dimension !== embedding.length
  )
    throw new ApiError(
      409,
      "EXTRACTOR_VERSION_MISMATCH",
      "Reload the scanner to use the published model's feature extractor.",
    );
  const started = performance.now(),
    prediction = rank(embedding, artifact, 10, true);
  prediction.candidates = prediction.candidates.filter(
    (row) =>
      row.score >= 0.75 && !(strictForeground && prediction.backgroundClosest),
  );
  const products = await withCatalogueImages(
    "product",
    await db.product.findMany({
      where: {
        id: { in: prediction.candidates.map((row) => row.productId) },
        archivedAt: null,
      },
      include: { brand: true, variants: true },
    }),
  );
  const candidates = prediction.candidates
    .filter((row) => products.some((product) => product.id === row.productId))
    .map((row) => ({
      ...row,
      product: products.find((product) => product.id === row.productId),
    }));
  const record = await db.recognitionPrediction.create({
    data: {
      modelVersionId: model.id,
      userId: user.id,
      inspectionId,
      candidates: jsonValue(
        candidates.map(({ product: _product, ...row }) => row),
      ),
      uncertain: prediction.uncertain,
      latencyMs: Math.round(performance.now() - started),
    },
  });
  return {
    ...prediction,
    candidates,
    modelVersionId: model.id,
    predictionId: record.id,
    scoreMeaning: "Cosine similarity; not a probability or HAC approval.",
  };
}
