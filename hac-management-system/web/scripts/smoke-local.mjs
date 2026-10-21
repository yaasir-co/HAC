import "dotenv/config";
import { readFile } from "node:fs/promises";
const base = new URL(process.env.HAC_TEST_BASE_URL || "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost"].includes(base.hostname))
  throw new Error(
    "Local readiness checks only permit a loopback development server.",
  );
const credentials = JSON.parse(
  await readFile(".local/credentials.json", "utf8"),
).admin;
const origin = process.env.APP_ORIGIN || base.origin;
let cookie = "";
async function call(path, body) {
  const response = await fetch(new URL(`/api/v1/${path}`, base), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie,
      origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Readiness check ${path} failed: ${response.status} ${result.error?.code || ""}`,
    );
  return result.data;
}
try {
  const login = await fetch(new URL("/api/v1/auth/login", base), {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(credentials),
    signal: AbortSignal.timeout(20000),
  });
  if (!login.ok) throw new Error(`Readiness sign-in failed: ${login.status}`);
  cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error("Readiness sign-in did not create a session.");
  const health = await call("health");
  if (health.database !== "connected")
    throw new Error("Database did not answer its readiness query.");
  const company = await call("companies/demo-company-keells");
  if (!company.isDemo)
    throw new Error("Expected isolated demonstration company not found.");
  const product = await call("products/demo-product-rice");
  const verification = await call("verification", {
    productId: product.id,
    variantId: product.variants[0].id,
    companyId: company.id,
    identityConfirmed: true,
  });
  if (verification.product?.id !== product.id || !verification.rules.length)
    throw new Error("Authoritative product verification did not execute.");
  const dashboard = await call("dashboard");
  if (!(dashboard.metrics.companies > 0))
    throw new Error("Dashboard did not return actual database records.");
  console.log(
    "PASS local application readiness: authenticated session, MySQL query, assigned demo data, authoritative verification and database dashboard.",
  );
} finally {
  if (cookie) await call("auth/logout", {}).catch(() => {});
}
