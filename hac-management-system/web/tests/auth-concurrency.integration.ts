import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const credentials = JSON.parse(
    await readFile(".local/credentials.json", "utf8"),
  );
  const url = "http://127.0.0.1:3000/api/v1/auth/login";
  const attempt = (body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const unknown = {
    email: `parallel-${randomUUID()}@demo.hac.test`,
    password: "not a valid account password",
  };
  const invalid = await Promise.all([attempt(unknown), attempt(unknown)]);
  assert(
    invalid.every((r) => r.status === 401),
    "Concurrent failed attempts must not expose a bucket-creation conflict.",
  );
  const valid = await Promise.all([
    attempt(credentials.supervisor),
    attempt(credentials.supervisor),
  ]);
  assert(
    valid.every((r) => r.status === 200),
    "Concurrent valid logins must create independent sessions.",
  );
  for (const response of valid) {
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const logout = await fetch("http://127.0.0.1:3000/api/v1/auth/logout", {
      method: "POST",
      headers: { origin, cookie },
    });
    assert.equal(logout.status, 200);
  }
  await writeFile(
    ".local/auth-concurrency-results.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        passed: 2,
        concurrentInvalidStatuses: invalid.map((r) => r.status),
        concurrentValidStatuses: valid.map((r) => r.status),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "PASS concurrent account bucket creation, invalid credentials and independent valid sessions.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
