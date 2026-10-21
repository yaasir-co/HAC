import { qualityFailures } from "./quality-gate";
import { calibrateRejection, TRAINING_RECIPE } from "./calibration";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { audit, requireRole, type AuthUser } from "../auth";
import { ApiError } from "../errors";
import { jsonValue } from "../inspection";
import { EXTRACTOR, evaluate, partition, type Sample } from "./core";
import { extractImage } from "./extractor";
import { createPrototypeArtifact } from "./prototypes";

type Job = {
  format: "CHUNKED_TRAINING_V1";
  datasetVersion: number;
  processed: number;
  total: number;
  phase: string;
  lease?: string;
  leaseUntil?: number;
  error?: string;
};
function state(value: Prisma.JsonValue | null): Job | undefined {
  const job = (value as { job?: Job } | null)?.job;
  return job?.format === "CHUNKED_TRAINING_V1" ? job : undefined;
}
const select = {
  id: true,
  datasetId: true,
  version: true,
  status: true,
  metrics: true,
  createdAt: true,
} as const;
const cached = {
  embedding: { path: "$.extractorVersion", equals: EXTRACTOR.version },
};
export async function startTrainingJob(user: AuthUser, raw: unknown) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  const input = z
    .object({ datasetId: z.string().min(1).max(100) })
    .strict()
    .parse(raw);
  return db.$transaction(
    async (tx) => {
      const dataset = await tx.trainingDataset.findUnique({
        where: { id: input.datasetId },
        include: {
          images: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              captureGroup: true,
            },
          },
          models: { orderBy: { version: "desc" }, take: 1 },
        },
      });
      if (!dataset)
        throw new ApiError(404, "NOT_FOUND", "Training library not found.");
      const running = await tx.modelVersion.findFirst({
        where: { datasetId: dataset.id, status: "TRAINING" },
        select,
      });
      if (running && state(running.metrics)) return running;
      const last = dataset.models[0],
        prior = last?.metrics as {
          trainingRecipe?: string;
          datasetVersion?: number;
        } | null;
      if (
        last &&
        [
          "VALIDATED",
          "VALIDATION_REQUIRED",
          "PUBLISHED",
          "SUPERSEDED",
        ].includes(last.status) &&
        prior?.trainingRecipe === TRAINING_RECIPE &&
        prior.datasetVersion === dataset.version
      )
        return tx.modelVersion.findUniqueOrThrow({
          where: { id: last.id },
          select,
        });
      if (dataset.images.length > 10000)
        throw new ApiError(
          422,
          "LIBRARY_LIMIT",
          "Use another library when there are more than 10,000 images.",
        );
      if (
        !dataset.images.some((row) => row.productId) ||
        !dataset.images.some((row) => !row.productId)
      )
        throw new ApiError(
          422,
          "BACKGROUND_REQUIRED",
          "Add product photos and some unrelated/background photos before training.",
        );
      try {
        partition(dataset.images.map((row) => ({ ...row, embedding: [1] })));
      } catch (error) {
        throw new ApiError(422, "DIVERSITY_REQUIRED", (error as Error).message);
      }
      const processed = await tx.trainingImage.count({
        where: { datasetId: dataset.id, ...cached },
      });
      const job: Job = {
        format: "CHUNKED_TRAINING_V1",
        datasetVersion: dataset.version,
        processed,
        total: dataset.images.length,
        phase: "EXTRACTING",
      };
      const model = await tx.modelVersion.create({
        data: {
          datasetId: dataset.id,
          version: (dataset.models[0]?.version ?? 0) + 1,
          status: "TRAINING",
          extractor: EXTRACTOR.version,
          threshold: 0.82,
          margin: 0.04,
          createdById: user.id,
          metrics: jsonValue({ job }),
        },
        select,
      });
      await audit(
        tx,
        user,
        "START_TRAINING",
        "ModelVersion",
        model.id,
        undefined,
        { datasetId: dataset.id, total: job.total },
      );
      return model;
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
}
export async function stepTrainingJob(user: AuthUser, id: string) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  const model = await db.modelVersion.findUnique({ where: { id } });
  const job = model && state(model.metrics);
  if (!model || !job)
    throw new ApiError(404, "NOT_FOUND", "Training job not found.");
  if (model.status !== "TRAINING")
    return db.modelVersion.findUnique({ where: { id }, select });
  if ((job.leaseUntil ?? 0) > Date.now())
    return { ...model, artifact: undefined, busy: true };
  const lease = randomUUID(),
    next = { ...job, error: undefined, lease, leaseUntil: Date.now() + 120000 };
  const claimed = await db.modelVersion.updateMany({
    where: {
      id,
      status: "TRAINING",
      metrics: { equals: model.metrics as Prisma.InputJsonValue },
    },
    data: { metrics: jsonValue({ job: next }) },
  });
  if (!claimed.count)
    return { id, status: "TRAINING", busy: true, metrics: model.metrics };
  const owned = {
    id,
    status: "TRAINING",
    metrics: { path: "$.job.lease", equals: lease },
  };
  try {
    const dataset = await db.trainingDataset.findUniqueOrThrow({
      where: { id: model.datasetId },
    });
    if (dataset.version !== job.datasetVersion)
      throw new ApiError(
        409,
        "DATASET_CHANGED",
        "Photos changed during training. Start training again after uploads finish.",
      );
    const batch = await db.trainingImage.findMany({
      where: {
        datasetId: model.datasetId,
        OR: [
          { embedding: { equals: Prisma.DbNull } },
          { embedding: { equals: Prisma.JsonNull } },
          { embedding: { path: "$.extractorVersion", not: EXTRACTOR.version } },
        ],
      },
      orderBy: { id: "asc" },
      take: 8,
      select: { id: true, path: true },
    });
    if (batch.length) {
      for (const image of batch) {
        const features = await extractImage(await readFile(image.path));
        await db.trainingImage.update({
          where: { id: image.id },
          data: {
            embedding: jsonValue({
              extractorVersion: EXTRACTOR.version,
              vector: features.embedding,
            }),
          },
        });
      }
      const processed = await db.trainingImage.count({
        where: { datasetId: model.datasetId, ...cached },
      });
      await db.modelVersion.updateMany({
        where: owned,
        data: {
          metrics: jsonValue({
            job: {
              ...job,
              processed,
              phase: processed >= job.total ? "EVALUATING" : "EXTRACTING",
              leaseUntil: 0,
            },
          }),
        },
      });
      return db.modelVersion.findUnique({ where: { id }, select });
    }
    const images = await db.trainingImage.findMany({
      where: { datasetId: model.datasetId },
      select: {
        id: true,
        productId: true,
        variantId: true,
        captureGroup: true,
        embedding: true,
      },
    });
    const samples: Sample[] = images.map((row) => ({
      ...row,
      embedding: (row.embedding as { vector: number[] }).vector,
    }));
    const split = partition(samples),
      artifact = createPrototypeArtifact(
        split.train,
        model.threshold,
        model.margin,
      );
    // Only held-out validation photos choose thresholds; test data is evaluated once afterward.
    const calibration = calibrateRejection(split.validation, artifact);
    artifact.threshold = calibration.threshold;
    artifact.margin = calibration.margin;
    const validation = evaluate(split.validation, artifact);
    const test = evaluate(split.test, artifact),
      passed = qualityFailures(test).length === 0;
    artifact.sampleIds = samples.map((row) => row.id);
    const metrics = {
      job: { ...job, phase: "DONE", processed: job.total, leaseUntil: 0 },
      datasetVersion: dataset.version,
      trainingRecipe: TRAINING_RECIPE,
      calibration,
      passed,
      validation,
      test,
      split: {
        train: split.train.length,
        validation: split.validation.length,
        test: split.test.length,
      },
      splitIds: {
        train: split.train.map((row) => row.id),
        validation: split.validation.map((row) => row.id),
        test: split.test.map((row) => row.id),
      },
      qualityGate: {
        minTestAccuracy: 0.7,
        minForegroundRecall: 0.7,
        maxUnknownFalseIdentificationRate: 0.2,
      },
      prototypeCount: artifact.vectors.length,
      publicationBlockedReasons: qualityFailures(test),
      note: "Training-only diverse prototypes. Image count is not a guarantee of field accuracy. Review held-out results before publishing.",
    };
    await db.$transaction(
      async (tx) => {
        const current = await tx.trainingDataset.findUniqueOrThrow({
          where: { id: dataset.id },
        });
        if (current.version !== job.datasetVersion)
          throw new ApiError(
            409,
            "DATASET_CHANGED",
            "The photo library changed. Start training again.",
          );
        const updated = await tx.modelVersion.updateMany({
          where: owned,
          data: {
            artifact: jsonValue(artifact),
            metrics: jsonValue(metrics),
            threshold: artifact.threshold,
            margin: artifact.margin,
            status: passed ? "VALIDATED" : "VALIDATION_REQUIRED",
          },
        });
        if (!updated.count)
          throw new ApiError(
            409,
            "JOB_CHANGED",
            "This training job was cancelled or resumed elsewhere.",
          );
        for (const [name, rows] of Object.entries(split))
          await tx.trainingImage.updateMany({
            where: { id: { in: rows.map((row) => row.id) } },
            data: { split: name.toUpperCase() },
          });
        await tx.trainingDataset.update({
          where: { id: dataset.id },
          data: { status: passed ? "VALIDATED" : "VALIDATION_REQUIRED" },
        });
        await audit(tx, user, "TRAIN", "ModelVersion", id, undefined, {
          datasetId: dataset.id,
          metrics,
        });
      },
      { isolationLevel: "Serializable", timeout: 30000 },
    );
    return db.modelVersion.findUnique({ where: { id }, select });
  } catch (error) {
    await db.modelVersion.updateMany({
      where: owned,
      data: {
        status:
          error instanceof ApiError && error.code === "DATASET_CHANGED"
            ? "FAILED"
            : "TRAINING",
        metrics: jsonValue({
          job: {
            ...job,
            leaseUntil: 0,
            error:
              error instanceof ApiError
                ? error.message
                : "Training paused. Check server access to the image files and model download, then resume.",
          },
        }),
      },
    });
    throw error;
  }
}
export async function cancelTrainingJob(user: AuthUser, id: string) {
  requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN"]);
  await db.modelVersion.updateMany({
    where: { id, status: "TRAINING" },
    data: { status: "CANCELLED" },
  });
  await audit(db, user, "CANCEL_TRAINING", "ModelVersion", id, undefined, {
    cancelled: true,
  });
  return { id, status: "CANCELLED" };
}
