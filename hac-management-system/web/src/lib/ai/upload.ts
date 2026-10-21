import { ApiError } from "../errors";
/** Bound multipart allocation even when a client streams without Content-Length. */
export async function imageForm(
  request: Request,
  maxBytes = 9_000_000,
): Promise<FormData> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new ApiError(
      400,
      "INVALID_MULTIPART",
      "Upload an image using multipart form data.",
    );
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes)
    throw new ApiError(413, "FILE_TOO_LARGE", "The image upload is too large.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError(400, "INVALID_MULTIPART", "Choose an image to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          413,
          "FILE_TOO_LARGE",
          "The image upload is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new ApiError(
      400,
      "INVALID_MULTIPART",
      "The image upload could not be read. Choose the image again.",
    );
  }
}
