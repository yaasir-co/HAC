import { detectImageType } from "@/lib/evidence";
import sharp from "sharp";
import { assertSameOrigin, requireUser, requireRole } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { imageForm } from "@/lib/ai/upload";
import { foregroundRegion } from "@/lib/ai/foreground";
import { extractImage } from "@/lib/ai/extractor";
import { EXTRACTOR, rank, type Artifact } from "@/lib/ai/core";
import { recognitionModel, recordRecognition } from "@/lib/ai/recognition";
import { json } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireRole(user, ["SUPER_ADMIN", "HAC_ADMIN", "SUPERVISOR", "AUDITOR"]);
    const form = await imageForm(request),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 8_000_000 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new ApiError(
        400,
        "INVALID_IMAGE",
        "Capture a JPEG, PNG or WebP image of at most 8 MB.",
      );
    const inspectionId = String(form.get("inspectionId") || "") || undefined,
      modelId = String(form.get("modelVersionId") || "") || undefined;
    if ((inspectionId?.length || 0) > 100 || (modelId?.length || 0) > 100)
      throw new ApiError(
        400,
        "INVALID_REFERENCE",
        "Invalid inspection or model reference.",
      );
    const model = await recognitionModel(user, inspectionId, modelId),
      artifact = model.artifact as unknown as Artifact;
    if (artifact.extractor.version !== EXTRACTOR.version)
      throw new ApiError(
        409,
        "EXTRACTOR_VERSION_MISMATCH",
        "Retrain this model with the current extractor.",
      );
    const uploaded = Buffer.from(await file.arrayBuffer());
    const detected =
      detectImageType(uploaded) ||
      (uploaded.length >= 12 &&
      uploaded.toString("ascii", 0, 4) === "RIFF" &&
      uploaded.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null);
    if (detected !== file.type)
      throw new ApiError(
        415,
        "INVALID_IMAGE",
        "Capture a JPEG, PNG or WebP whose contents match its file type.",
      );
    let original: Buffer;
    try {
      original = await sharp(uploaded, {
        limitInputPixels: 20_000_000,
      })
        .rotate()
        .resize(640, 640, { fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .toColourspace("srgb")
        .png()
        .toBuffer();
    } catch {
      throw new ApiError(
        415,
        "INVALID_IMAGE",
        "The captured image could not be decoded.",
      );
    }
    const sample = await sharp(original)
      .resize(96, 96, { fit: "fill" })
      .raw()
      .toBuffer();
    const region = foregroundRegion(new Uint8Array(sample), 96, 96);
    let embedding = (await extractImage(original)).embedding,
      focused = false;
    if (region) {
      const metadata = await sharp(original).metadata(),
        width = metadata.width!,
        height = metadata.height!;
      const alpha = Buffer.from(region.mask.map((value) => (value ? 255 : 0)));
      const mask = await sharp(alpha, {
        raw: { width: 96, height: 96, channels: 1 },
      })
        .blur(1)
        .resize(width, height)
        .greyscale()
        .raw()
        .toBuffer();
      const rgb = await sharp(original).raw().toBuffer();
      for (let i = 0; i < width * height; i++) {
        const a = mask[i] / 255;
        for (let c = 0; c < 3; c++)
          rgb[i * 3 + c] = Math.round(rgb[i * 3 + c] * a + 235 * (1 - a));
      }
      const bounds = region.bounds,
        left = Math.floor(bounds.x * width),
        top = Math.floor(bounds.y * height);
      const processed = await sharp(rgb, {
        raw: { width, height, channels: 3 },
      })
        .extract({
          left,
          top,
          width: Math.max(
            1,
            Math.min(width - left, Math.ceil(bounds.width * width)),
          ),
          height: Math.max(
            1,
            Math.min(height - top, Math.ceil(bounds.height * height)),
          ),
        })
        .png()
        .toBuffer();
      const candidate = (await extractImage(processed)).embedding,
        a = rank(embedding, artifact),
        b = rank(candidate, artifact);
      // Use preprocessing only when the actual published index supports it more strongly.
      if (
        (a.uncertain && !b.uncertain) ||
        (a.uncertain === b.uncertain &&
          b.bestSimilarity > a.bestSimilarity + 0.01)
      ) {
        embedding = candidate;
        focused = true;
      }
    }
    const prediction = await recordRecognition(
      user,
      embedding,
      inspectionId,
      modelId,
      model,
      true,
    );
    return json({
      ...prediction,
      processing: {
        automaticCapture: true,
        foregroundDetected: !!region,
        foregroundFocusUsed: focused,
      },
      guidance: prediction.candidates.length
        ? "Choose the product you see."
        : "Show me the product again. Move closer and use a clear, well-lit background.",
    });
  } catch (error) {
    return handleError(error);
  }
}
