import { describe, expect, it } from "vitest";
import { readJson } from "../src/lib/request-body";
const request = (body: string, headers?: Record<string, string>) =>
  new Request("https://hac.test", { method: "POST", body, headers });
describe("bounded request body reader", () => {
  it("reads valid multilingual JSON within its byte budget", async () => {
    expect(
      await readJson(request(JSON.stringify({ message: "ආයුබෝවන්" })), 100),
    ).toEqual({ message: "ආයුබෝවන්" });
  });
  it("rejects oversized declared bodies before consuming the stream", async () => {
    await expect(
      readJson(request("{}", { "content-length": "999999" }), 100),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("limits actual bytes even when Content-Length is absent or misleading", async () => {
    await expect(
      readJson(request(JSON.stringify({ value: "x".repeat(200) })), 100),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(
        request(JSON.stringify({ value: "x".repeat(200) }), {
          "content-length": "2",
        }),
        100,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects invalid and missing JSON with stable client errors", async () => {
    await expect(readJson(request("{invalid}"))).rejects.toMatchObject({
      code: "INVALID_JSON",
      status: 400,
    });
    await expect(
      readJson(new Request("https://hac.test", { method: "POST" })),
    ).rejects.toMatchObject({ code: "INVALID_JSON", status: 400 });
  });
});
