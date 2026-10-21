import { z } from "zod";
import { readJson } from "./request-body";
export const json = (data: unknown, status = 200, meta?: unknown) =>
  Response.json(
    { data, ...(meta ? { meta } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  return schema.parse(await readJson(request, 1024 * 1024));
}
export const id = z.string().min(1).max(100);
export const text = z.string().trim().min(1).max(300);
export const note = z.string().trim().max(10000);
export const date = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v));
export function pagination(request: Request) {
  const u = new URL(request.url);
  return {
    page: Math.max(
      1,
      Math.min(100000, Number(u.searchParams.get("page")) || 1),
    ),
    pageSize: Math.max(
      1,
      Math.min(100, Number(u.searchParams.get("pageSize")) || 30),
    ),
    q: (u.searchParams.get("q") || "").slice(0, 100),
  };
}
