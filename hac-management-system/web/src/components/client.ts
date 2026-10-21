export type Row = Record<string, any>;
export async function api<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const result = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (result.status === 401 && !path.startsWith("/auth/login")) {
    window.location.href = "/login";
    throw new Error("Please sign in to continue.");
  }
  const body = await result.json().catch(() => ({
    error: { message: "The server could not complete the request." },
  }));
  if (!result.ok)
    throw new Error(
      body.error?.message ?? `Request failed (${result.status}).`,
    );
  return body.data ?? body;
}
export function date(value: unknown, time = false) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
export function label(value: unknown) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
export function array(value: any): Row[] {
  return Array.isArray(value)
    ? value
    : (value?.items ?? value?.records ?? value?.data ?? []);
}
