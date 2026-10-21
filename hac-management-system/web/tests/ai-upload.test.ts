import { it, expect } from "vitest";
import { imageForm } from "../src/lib/ai/upload";
it("bounds streaming multipart uploads before parsing image contents", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(20));
      controller.close();
    },
  });
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body,
    duplex: "half",
  } as RequestInit);
  await expect(imageForm(request, 10)).rejects.toMatchObject({
    status: 413,
    code: "FILE_TOO_LARGE",
  });
});
it("parses actual multipart image fields and rejects invalid multipart metadata", async () => {
  const form = new FormData();
  form.set("captureGroup", "test-group");
  form.set(
    "file",
    new File(["real bytes"], "test.jpg", { type: "image/jpeg" }),
  );
  const result = await imageForm(
    new Request("http://localhost/upload", { method: "POST", body: form }),
  );
  expect(result.get("captureGroup")).toBe("test-group");
  expect(result.get("file")).toBeInstanceOf(File);
  await expect(
    imageForm(
      new Request("http://localhost/upload", {
        method: "POST",
        body: "no multipart",
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
