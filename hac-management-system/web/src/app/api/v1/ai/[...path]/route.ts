import { recordRecognition } from "@/lib/ai/recognition";
import { qualityFailures, type GateMetrics } from "@/lib/ai/quality-gate";
import { withCatalogueImages } from "@/lib/catalogue-images";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  requireRole,
  assertSameOrigin,
  assertCompanyAccess,
  audit,
} from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { readJson } from "@/lib/request-body";
import {
  EXTRACTOR,
  createArtifact,
  evaluate,
  hamming,
  partition,
  rank,
  type Artifact,
  type Sample,
} from "@/lib/ai/core";
import { prepareImage, extractImage } from "@/lib/ai/extractor";
import { imageForm } from "@/lib/ai/upload";
import { writablePrivateDirectory } from "@/lib/private-storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ADMIN = ["SUPER_ADMIN", "HAC_ADMIN"],
  INSPECTOR = [...ADMIN, "SUPERVISOR", "AUDITOR"];
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function publicImage<T extends { path: string; embedding: unknown }>(image: T) {
  const { path: _path, embedding: _embedding, ...safe } = image;
  return safe;
}
const result = (data: unknown, status = 200) =>
  Response.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
async function inspectPermission(
  user: Awaited<ReturnType<typeof requireUser>>,
  inspectionId?: string,
) {
  if (!inspectionId) return;
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
  });
  if (!inspection)
    throw new ApiError(404, "NOT_FOUND", "Inspection not found.");
  await assertCompanyAccess(user, inspection.companyId);
}
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const user = await requireUser(request),
      segments = (await context.params).path,
      method = request.method;
    assertSameOrigin(request);
    if (segments[0] === "published" && method === "GET") {
      requireRole(user, INSPECTOR);
      const model = await db.modelVersion.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
      });
      if (!model) return result(null);
      return result({
        id: model.id,
        version: model.version,
        extractor: model.extractor,
        artifact: model.artifact,
        metrics: model.metrics,
        publishedAt: model.publishedAt,
      });
    }
    if (segments[0] === "predict" && method === "POST") {
      requireRole(user, INSPECTOR);
      const input = z
        .object({
          extractorVersion: z.literal(EXTRACTOR.version),
          embedding: z
            .array(z.number().finite().min(-1).max(1))
            .min(32)
            .max(4096)
            .refine(
              (values) => values.some((value) => value !== 0),
              "An image feature vector cannot be zero.",
            ),
          inspectionId: z.string().optional(),
          modelVersionId: z.string().optional(),
        })
        .parse(await readJson(request, 128 * 1024));
      return result(
        await recordRecognition(
          user,
          input.embedding,
          input.inspectionId,
          input.modelVersionId,
        ),
      );
    }
    requireRole(user, ADMIN);
    if (segments[0] === "datasets" && !segments[1]) {
      if (method === "GET")
        return result(
          await db.trainingDataset.findMany({
            include: {
              _count: { select: { images: true } },
              models: { orderBy: { createdAt: "desc" }, take: 5 },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      if (method === "POST") {
        const input = z
          .object({
            name: z.string().min(3).max(150),
            description: z.string().max(2000).optional(),
          })
          .parse(await readJson(request, 128 * 1024));
        const record = await db.trainingDataset.create({
          data: { ...input, createdById: user.id },
        });
        await audit(
          db,
          user,
          "CREATE",
          "TrainingDataset",
          record.id,
          undefined,
          record,
        );
        return result(record, 201);
      }
    }
    if (segments[0] === "datasets" && segments[1]) {
      const dataset = await db.trainingDataset.findUnique({
        where: { id: segments[1] },
        include: {
          images: {
            omit: { embedding: segments[2] === "images" && method === "POST" },
            include: { product: { include: { brand: true } } },
            orderBy: { createdAt: "desc" },
          },
          models: {
            orderBy: { version: "desc" },
            omit: { artifact: segments[2] === "images" && method === "POST" },
          },
        },
      });
      if (!dataset)
        throw new ApiError(404, "NOT_FOUND", "Training dataset not found.");
      if (!segments[2] && method === "GET")
        return result({
          ...dataset,
          images: dataset.images.map(publicImage),
          models: dataset.models.map((model) => {
            const { artifact: _artifact, ...safe } = model;
            return safe;
          }),
        });
      if (segments[2] === "images" && method === "POST") {
        if (Number(request.headers.get("content-length") || 0) > 9_000_000)
          throw new ApiError(
            413,
            "FILE_TOO_LARGE",
            "Images must be at most 8 MB.",
          );
        const form = await imageForm(request),
          file = form.get("file");
        if (!(file instanceof File) || file.size > 8_000_000 || file.size === 0)
          throw new ApiError(
            400,
            "INVALID_IMAGE",
            "Choose a JPEG, PNG or WebP image up to 8 MB.",
          );
        const productId =
            z
              .string()
              .max(100)
              .parse(form.get("productId") || "") || null,
          variantId =
            z
              .string()
              .max(100)
              .parse(form.get("variantId") || "") || null;
        const captureGroup = z
          .string()
          .min(1)
          .max(150)
          .parse(form.get("captureGroup"));
        const product = productId
          ? await db.product.findUnique({
              where: { id: productId },
              include: { variants: true },
            })
          : null;
        if (productId && !product)
          throw new ApiError(
            400,
            "INVALID_PRODUCT",
            "Choose an existing master product.",
          );
        if (variantId && !product?.variants.some((v) => v.id === variantId))
          throw new ApiError(
            400,
            "INVALID_VARIANT",
            "The variant must belong to the selected product.",
          );
        let image: Awaited<ReturnType<typeof prepareImage>>;
        try {
          image = await prepareImage(Buffer.from(await file.arrayBuffer()));
        } catch {
          throw new ApiError(
            400,
            "INVALID_IMAGE",
            "The file must decode as a supported JPEG, PNG or WebP image.",
          );
        }
        if (dataset.images.some((row) => row.sha256 === image.sha256))
          throw new ApiError(
            409,
            "DUPLICATE_IMAGE",
            "This image is already in the dataset.",
          );
        const near = dataset.images.filter(
          (row) =>
            row.perceptualHash &&
            hamming(row.perceptualHash, image.perceptualHash) <= 6,
        );
        if (
          near.some(
            (row) => row.productId !== productId || row.variantId !== variantId,
          )
        )
          throw new ApiError(
            409,
            "CONFLICTING_DUPLICATE",
            "A nearly identical image has a different product label. Review labels before adding it.",
          );
        const linkedGroups = [
          ...new Set([captureGroup, ...near.map((row) => row.captureGroup)]),
        ].sort();
        const mergedGroup = linkedGroups[0];
        const id = randomUUID(),
          filename = path.join(
            await writablePrivateDirectory("training"),
            `${id}.jpg`,
          );
        await writeFile(filename, image.bytes, { flag: "wx", mode: 0o600 });
        try {
          const record = await db.$transaction(async (tx) => {
            if (linkedGroups.length > 1)
              await tx.trainingImage.updateMany({
                where: {
                  datasetId: dataset.id,
                  captureGroup: { in: linkedGroups },
                },
                data: { captureGroup: mergedGroup },
              });
            const row = await tx.trainingImage.create({
              data: {
                id,
                datasetId: dataset.id,
                productId,
                variantId,
                label: product?.name || "Unknown / background",
                path: filename,
                mimeType: "image/jpeg",
                width: image.width,
                height: image.height,
                sha256: image.sha256,
                perceptualHash: image.perceptualHash,
                captureGroup: mergedGroup,
                quality: {
                  blurScore: image.blurScore,
                  nearDuplicate: near.length > 0,
                  warnings: [
                    ...(image.blurScore < 40
                      ? ["Image may be blurred; review before training."]
                      : []),
                    ...(near.length
                      ? [
                          "Near-duplicate grouped with existing images to prevent split leakage.",
                        ]
                      : []),
                  ],
                },
              },
            });
            await tx.trainingDataset.update({
              where: { id: dataset.id },
              data: { version: { increment: 1 }, status: "COLLECTING_DATA" },
            });
            await audit(
              tx,
              user,
              "CAPTURE",
              "TrainingImage",
              row.id,
              undefined,
              { datasetId: dataset.id, productId, sha256: image.sha256 },
            );
            return row;
          });
          return result(publicImage(record), 201);
        } catch (error) {
          await unlink(filename).catch(() => {});
          throw error;
        }
      }
      if (segments[2] === "train" && method === "POST") {
        const input = z
          .object({
            threshold: z.number().min(0.5).max(0.99).default(0.82),
            margin: z.number().min(0.01).max(0.4).default(0.04),
          })
          .parse(await readJson(request, 128 * 1024));
        if (dataset.images.length > 1500)
          throw new ApiError(
            409,
            "WORKER_REQUIRED",
            "This deployment trains at most 1500 samples. Configure a background training worker for larger datasets.",
          );
        const classes = new Set(
          dataset.images
            .filter((i) => i.productId)
            .map((i) => `${i.productId}:${i.variantId ?? ""}`),
        );
        if (classes.size < 2 || !dataset.images.some((i) => !i.productId))
          throw new ApiError(
            400,
            "INSUFFICIENT_CLASSES",
            "Add at least two product classes and an unknown/background class before training.",
          );
        // First validate grouped splits, before downloading or performing costly extraction.
        try {
          partition(
            dataset.images.map((i) => ({
              id: i.id,
              productId: i.productId,
              variantId: i.variantId,
              captureGroup: i.captureGroup,
              embedding: [1],
            })),
          );
        } catch (error) {
          throw new ApiError(
            400,
            "INSUFFICIENT_DIVERSITY",
            error instanceof Error
              ? error.message
              : "Collect independent capture groups.",
          );
        }
        const version = (dataset.models[0]?.version ?? 0) + 1;
        const model = await db.modelVersion.create({
          data: {
            datasetId: dataset.id,
            version,
            status: "TRAINING",
            extractor: EXTRACTOR.version,
            threshold: input.threshold,
            margin: input.margin,
            createdById: user.id,
          },
        });
        try {
          const samples: Sample[] = [];
          for (const image of dataset.images) {
            const cached = image.embedding as {
              extractorVersion?: string;
              vector?: number[];
            } | null;
            let embedding =
              cached?.extractorVersion === EXTRACTOR.version
                ? cached.vector
                : undefined;
            if (!embedding) {
              embedding = (await extractImage(await readFile(image.path)))
                .embedding;
              await db.trainingImage.update({
                where: { id: image.id },
                data: {
                  embedding: json({
                    extractorVersion: EXTRACTOR.version,
                    vector: embedding,
                  }),
                },
              });
            }
            samples.push({
              id: image.id,
              productId: image.productId,
              variantId: image.variantId,
              captureGroup: image.captureGroup,
              embedding,
            });
          }
          const split = partition(samples),
            artifact = createArtifact(
              split.train,
              input.threshold,
              input.margin,
            ),
            validation = evaluate(split.validation, artifact),
            test = evaluate(split.test, artifact);
          artifact.sampleIds = samples.map((sample) => sample.id);
          const passed =
            test.accuracy >= 0.7 &&
            test.falseIdentificationRate !== null &&
            test.falseIdentificationRate <= 0.2;
          const metrics = {
            validation,
            test,
            split: {
              train: split.train.length,
              validation: split.validation.length,
              test: split.test.length,
            },
            splitIds: {
              train: split.train.map((s) => s.id),
              validation: split.validation.map((s) => s.id),
              test: split.test.map((s) => s.id),
            },
            datasetVersion: dataset.version,
            passed,
            qualityGate: {
              minTestAccuracy: 0.7,
              maxUnknownFalseIdentificationRate: 0.2,
            },
            note: "Small held-out metrics are not a production accuracy guarantee. Independent field validation is required.",
          };
          await db.$transaction(async (tx) => {
            for (const [name, rows] of Object.entries(split))
              await tx.trainingImage.updateMany({
                where: { id: { in: rows.map((i) => i.id) } },
                data: { split: name.toUpperCase() },
              });
            await tx.modelVersion.update({
              where: { id: model.id },
              data: {
                status: passed ? "VALIDATED" : "VALIDATION_REQUIRED",
                artifact: json(artifact),
                metrics: json(metrics),
              },
            });
            await tx.trainingDataset.update({
              where: { id: dataset.id },
              data: { status: passed ? "VALIDATED" : "VALIDATION_REQUIRED" },
            });
            await audit(
              tx,
              user,
              "TRAIN",
              "ModelVersion",
              model.id,
              undefined,
              { datasetId: dataset.id, version, metrics },
            );
          });
          return result(
            await db.modelVersion.findUnique({ where: { id: model.id } }),
          );
        } catch (error) {
          await db.modelVersion.update({
            where: { id: model.id },
            data: {
              status: "FAILED",
              metrics: {
                error:
                  "Feature extraction or training failed; no usable artifact was published.",
              },
            },
          });
          console.error(
            "[ai] training failed",
            error instanceof Error ? error.message : "unknown",
          );
          throw new ApiError(
            503,
            "TRAINING_FAILED",
            "Training did not complete. Ensure the official TensorFlow model host storage.googleapis.com is reachable, then retry. No model was published.",
          );
        }
      }
    }
    if (segments[0] === "images" && segments[1]) {
      const image = await db.trainingImage.findUnique({
        where: { id: segments[1] },
      });
      if (!image)
        throw new ApiError(404, "NOT_FOUND", "Training image not found.");
      if (method === "GET")
        return new Response(new Uint8Array(await readFile(image.path)), {
          headers: {
            "Content-Type": image.mimeType,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      if (method === "DELETE") {
        const preserved = await db.modelVersion.findMany({
          where: {
            datasetId: image.datasetId,
            status: { in: ["PUBLISHED", "SUPERSEDED", "ARCHIVED"] },
          },
        });
        if (
          preserved.some((model) => {
            const artifact = model.artifact as unknown as Artifact | null;
            return artifact?.sampleIds?.includes(image.id);
          })
        )
          throw new ApiError(
            409,
            "PUBLISHED_DATASET_IMMUTABLE",
            "This sample supports a published model. Preserve its training provenance; collect a new dataset version instead.",
          );
        await db.$transaction(async (tx) => {
          await tx.trainingImage.delete({ where: { id: image.id } });
          await tx.trainingDataset.update({
            where: { id: image.datasetId },
            data: { version: { increment: 1 }, status: "COLLECTING_DATA" },
          });
          await audit(tx, user, "REMOVE", "TrainingImage", image.id, {
            datasetId: image.datasetId,
            sha256: image.sha256,
          });
        });
        await unlink(image.path).catch(() => {});
        return result({ removed: true });
      }
    }
    if (segments[0] === "models") {
      if (!segments[1] && method === "GET")
        return result(
          await db.modelVersion.findMany({
            include: { dataset: true },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      if (segments[1] && !segments[2] && method === "GET") {
        const model = await db.modelVersion.findUnique({
          where: { id: segments[1] },
        });
        if (!model?.artifact)
          throw new ApiError(
            404,
            "MODEL_ARTIFACT_MISSING",
            "This model does not have an actual trained artifact.",
          );
        return result(model);
      }
      if (segments[1] && segments[2] === "archive" && method === "POST") {
        const input = z
          .object({ reason: z.string().trim().min(5).max(2000) })
          .parse(await readJson(request, 128 * 1024));
        const before = await db.modelVersion.findUnique({
          where: { id: segments[1] },
        });
        if (!before)
          throw new ApiError(404, "NOT_FOUND", "Model version not found.");
        const archived = await db.$transaction(async (tx) => {
          const row = await tx.modelVersion.update({
            where: { id: before.id },
            data: { status: "ARCHIVED" },
          });
          await audit(
            tx,
            user,
            "ARCHIVE_MODEL",
            "ModelVersion",
            row.id,
            { status: before.status },
            { status: "ARCHIVED", reason: input.reason },
          );
          return row;
        });
        return result(archived);
      }
      if (
        segments[1] &&
        ["publish", "rollback"].includes(segments[2]) &&
        method === "POST"
      ) {
        const model = await db.modelVersion.findUnique({
            where: { id: segments[1] },
          }),
          metrics = model?.metrics as {
            passed?: boolean;
            test?: GateMetrics;
          } | null;
        if (
          !model ||
          !model.artifact ||
          !metrics?.passed ||
          qualityFailures(metrics.test).length > 0 ||
          !["VALIDATED", "SUPERSEDED", "PUBLISHED"].includes(model.status)
        )
          throw new ApiError(
            409,
            "MODEL_NOT_VALIDATED",
            `Publishing blocked. ${qualityFailures(metrics?.test).join(" ") || "Train and validate this model before publishing."}`,
          );
        const artifact = model.artifact as unknown as Artifact;
        const sourceCount = await db.trainingImage.count({
          where: { id: { in: artifact.sampleIds }, datasetId: model.datasetId },
        });
        if (sourceCount !== artifact.sampleIds.length)
          throw new ApiError(
            409,
            "MODEL_PROVENANCE_MISSING",
            "Restore the model's source images or retrain before publication.",
          );
        if (segments[2] === "publish") {
          const dataset = await db.trainingDataset.findUniqueOrThrow({
            where: { id: model.datasetId },
          });
          if (
            (model.metrics as { datasetVersion?: number }).datasetVersion !==
            dataset.version
          )
            throw new ApiError(
              409,
              "DATASET_CHANGED_RETRAIN",
              "The dataset changed after training. Retrain and review the new metrics before publishing.",
            );
        }
        const published = await db.$transaction(async (tx) => {
          await tx.modelVersion.updateMany({
            where: { status: "PUBLISHED" },
            data: { status: "SUPERSEDED" },
          });
          const row = await tx.modelVersion.update({
            where: { id: model.id },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(),
              publishedById: user.id,
            },
          });
          await audit(
            tx,
            user,
            segments[2] === "rollback" ? "ROLLBACK_MODEL" : "PUBLISH_MODEL",
            "ModelVersion",
            model.id,
            { status: model.status },
            { status: "PUBLISHED" },
          );
          return row;
        });
        return result(published);
      }
    }
    throw new ApiError(404, "NOT_FOUND", "AI endpoint not found.");
  } catch (error) {
    return handleError(error);
  }
}
export const GET = route,
  POST = route,
  DELETE = route;
