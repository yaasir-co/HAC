import { ApiError } from "./errors";

/** Bound allocation while consuming a request, including clients without Content-Length. */
export async function readJson(
  request: Request,
  maxBytes = 1024 * 1024,
): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes)
    throw new ApiError(
      413,
      "BODY_TOO_LARGE",
      "The request body exceeds the permitted size.",
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
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
          "BODY_TOO_LARGE",
          "The request body exceeds the permitted size.",
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
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }
}
