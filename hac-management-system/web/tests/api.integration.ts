/** Run explicitly: HAC_INTEGRATION=1 npx tsx tests/api.integration.ts
 * Uses isolated, fictional fixtures in the local development database. It never deletes data.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

async function main() {
  if (process.env.HAC_INTEGRATION !== "1") {
    console.log(
      "HTTP integration checks were not run. Start the local application, then run HAC_INTEGRATION=1 npx tsx tests/api.integration.ts.",
    );
    process.exit(0);
  }
  const base = new URL(
    process.env.HAC_TEST_BASE_URL || "http://127.0.0.1:3000",
  );
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
    "Integration runner is limited to the local development server.",
  );
  const origin = process.env.APP_ORIGIN || base.origin;
  const credentials = JSON.parse(
    await readFile(
      new URL("../.local/credentials.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, { email: string; password: string }>;
  const results: Array<{ check: string; passed: boolean }> = [];
  const session: Record<string, string> = {};
  let fixtureCompanyId: string | undefined;
  let fixtureInspectionId: string | undefined;
  const png =
    "data:image/png;base64," +
    (
      await sharp({
        create: {
          width: 64,
          height: 32,
          channels: 3,
          background: { r: 235, g: 245, b: 235 },
        },
      })
        .png()
        .toBuffer()
    ).toString("base64");

  async function call(path: string, actor?: string, body?: unknown) {
    const response = await fetch(new URL(`/api/v1/${path}`, base), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined
          ? {}
          : { "content-type": "application/json", origin }),
        ...(actor ? { cookie: session[actor] } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("json")
      ? await response.json()
      : new Uint8Array(await response.arrayBuffer());
    return { response, data };
  }
  async function data<T = any>(
    path: string,
    actor: string,
    body?: unknown,
    status = body === undefined ? 200 : 201,
  ): Promise<T> {
    const result = await call(path, actor, body);
    assert.equal(
      result.response.status,
      status,
      `${path}: expected ${status}; received ${result.response.status} (${result.data?.error?.code || "no error code"})`,
    );
    return result.data.data as T;
  }
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ check: name, passed: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ check: name, passed: false });
      throw error;
    }
  }
  async function verify(
    productId?: string,
    variantId?: string,
    extra: object = {},
  ) {
    return data<any>(
      "verification",
      "supervisor",
      {
        companyId: fixtureCompanyId,
        productId,
        variantId,
        identityConfirmed: true,
        ...extra,
      },
      200,
    );
  }
  const runId = randomUUID();
  let supervisor: any;
  let inspection: any;
  let rice: any;
  let evidenceId: string | undefined;
  let mutation: any;
  let originalObservationId: string;

  try {
    await check("unauthenticated requests require a session", async () => {
      assert.equal((await call("auth/me")).response.status, 401);
      assert.equal((await call("companies")).response.status, 401);
    });
    await check(
      "local seeded users authenticate without exposing password hashes",
      async () => {
        for (const actor of ["admin", "supervisor", "restricted", "company"]) {
          const result = await call(
            "auth/login",
            undefined,
            credentials[actor],
          );
          assert.equal(
            result.response.status,
            200,
            `Login failed for local ${actor} account`,
          );
          const cookie = result.response.headers.get("set-cookie");
          assert(cookie, "Authentication must issue a session cookie.");
          assert(
            cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict"),
          );
          session[actor] = cookie.split(";")[0];
          assert(!("passwordHash" in result.data.data));
          if (actor === "supervisor") supervisor = result.data.data;
        }
        const demo = await data<any>("companies/demo-company-keells", "admin");
        assert.equal(
          demo.isDemo,
          true,
          "This runner only operates alongside the fictional seed dataset.",
        );
      },
    );
    await check(
      "unassigned supervisors cannot read or mutate assigned-company records",
      async () => {
        const list = await data<any[]>("companies", "restricted");
        assert.equal(list.length, 0);
        assert.equal(
          (await call("companies/demo-company-keells", "restricted")).response
            .status,
          403,
        );
        assert.equal(
          (await call("inspections/demo-inspection-keells", "restricted"))
            .response.status,
          403,
        );
        assert.equal(
          (
            await call(
              "inspections/demo-inspection-keells/start",
              "restricted",
              {},
            )
          ).response.status,
          403,
        );
        const own = await data<any[]>("companies", "supervisor");
        assert(own.some((company) => company.id === "demo-company-keells"));
        assert(!own.some((company) => company.id === "demo-company-c"));
        assert.equal(
          (await call("audit-logs", "supervisor")).response.status,
          403,
        );
        assert.equal(
          (
            await call(
              "reports/demo-inspection-keells?format=metadata",
              "company",
            )
          ).response.status,
          403,
        );
        assert.equal(
          (
            await call("companies", "supervisor", {
              legalName: "Unauthorized",
              registrationNumber: runId,
            })
          ).response.status,
          403,
        );
      },
    );
    await check(
      "administrator creates isolated company, location, assignment and visit",
      async () => {
        const company = await data<any>("companies", "admin", {
          legalName: `HTTP Integration ${runId}`,
          registrationNumber: `HTTP-${runId}`,
          isDemo: true,
        });
        fixtureCompanyId = company.id;
        const location = await data<any>("locations", "admin", {
          companyId: company.id,
          name: "Fictional integration branch",
          address: "Isolated local development fixture",
        });
        await data("assignments", "admin", {
          companyId: company.id,
          userId: supervisor.id,
        });
        const checklists = await data<any[]>("checklists", "admin");
        const checklist = checklists.find(
          (entry) => entry.id === "demo-checklist-v1",
        );
        assert(checklist, "Published seed checklist is required.");
        // Pick an unoccupied hour tomorrow; repeated runs retain their own fixtures.
        const existing = await data<any[]>("inspections?pageSize=100", "admin");
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCMinutes(0, 0, 0);
        let scheduledAt: Date | undefined;
        for (let hour = 0; hour < 24; hour++) {
          const candidate = new Date(tomorrow);
          candidate.setUTCHours(hour);
          if (
            !existing.some(
              (record) =>
                record.inspectorId === supervisor.id &&
                ["SCHEDULED", "IN_PROGRESS"].includes(record.status) &&
                Math.abs(
                  Date.parse(record.scheduledAt) - candidate.getTime(),
                ) <= 3_600_000,
            )
          ) {
            scheduledAt = candidate;
            break;
          }
        }
        assert(
          scheduledAt,
          "No free hour tomorrow. Archive or reschedule local test fixtures before repeating.",
        );
        inspection = await data<any>("inspections", "admin", {
          companyId: company.id,
          locationId: location.id,
          inspectorId: supervisor.id,
          scheduledAt: scheduledAt.toISOString(),
          checklistVersionId: checklist.id,
          objectives:
            "Isolated local HTTP integration fixture; no official HAC claim.",
        });
        fixtureInspectionId = inspection.id;
        assert.equal(inspection.status, "SCHEDULED");
        assert.equal(
          (await call(`inspections/${inspection.id}`, "company")).response
            .status,
          403,
        );
        assert.equal(
          (await call(`inspections/${inspection.id}`, "restricted")).response
            .status,
          403,
        );
        assert.equal(
          (await call(`inspections/${inspection.id}/start`, "restricted", {}))
            .response.status,
          403,
        );
        inspection = await data<any>(
          `inspections/${inspection.id}/start`,
          "supervisor",
          {},
          200,
        );
        assert.equal(inspection.status, "IN_PROGRESS");
        assert(inspection.startedAt && inspection.masterDataVersion);
      },
    );
    await check(
      "authority distinguishes exact approvals, discrepancies, expiry and restrictions",
      async () => {
        rice = await data<any>("products/demo-product-rice", "supervisor");
        const approved = await verify(rice.id, rice.variants[0].id);
        assert.deepEqual(approved.outcomes, ["VERIFIED_APPROVED"]);
        assert.equal(
          approved.certificate.holderId,
          "demo-company-b",
          "Manufacturer-held approval must cover a retailer when the scope permits it.",
        );
        const mismatch = await verify(rice.id, rice.variants[0].id, {
          observedBrand: "Different integration brand",
          physicalExpiry: "2000-01-01",
        });
        assert(
          mismatch.outcomes.includes("BRAND_MISMATCH") &&
            mismatch.outcomes.includes("PHYSICAL_PRODUCT_EXPIRED"),
        );
        assert(!mismatch.outcomes.includes("VERIFIED_APPROVED"));
        assert(
          (
            await verify(
              "demo-product-expired-certificate",
              "demo-variant-expired-certificate",
            )
          ).outcomes.includes("CERTIFICATE_EXPIRED"),
        );
        assert(
          (
            await verify("demo-product-license", "demo-variant-license")
          ).outcomes.includes("REQUIRED_LICENSE_EXPIRED"),
        );
        assert(
          (
            await verify("demo-product-variant", "demo-variant-mango")
          ).outcomes.includes("PRODUCT_VARIANT_MISMATCH"),
        );
        assert(
          (
            await verify(
              "demo-product-relationship",
              "demo-variant-relationship",
            )
          ).outcomes.includes("COMPANY_RELATIONSHIP_NOT_VERIFIED"),
        );
        assert(
          (
            await verify("demo-product-restricted", "demo-variant-restricted")
          ).outcomes.includes("EXPLICITLY_RESTRICTED"),
        );
        assert.deepEqual(
          (await verify("demo-product-renewed", "demo-variant-renewed"))
            .outcomes,
          ["VERIFIED_APPROVED"],
        );
        const unknown = await verify();
        assert(unknown.outcomes.includes("APPROVAL_NOT_FOUND"));
        assert(
          !unknown.outcomes.includes("EXPLICITLY_RESTRICTED"),
          "Missing products must never be inferred banned.",
        );
      },
    );
    await check(
      "observations persist authoritative verification and retry idempotently",
      async () => {
        mutation = {
          productId: rice.id,
          variantId: rice.variants[0].id,
          observedName: rice.name,
          observedBrand: rice.brand.name,
          identityConfirmed: true,
          conclusion: "VERIFIED_APPROVED",
          clientMutationId: randomUUID(),
        };
        const observation = await data<any>(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          mutation,
        );
        originalObservationId = observation.id;
        const retry = await data<any>(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          mutation,
          200,
        );
        assert.equal(retry.id, observation.id);
        for (const changed of [
          { physicalExpiry: "2000-01-01" },
          { manufactureDate: "2020-01-01T00:00:00.000Z" },
          { observedName: "Changed product name" },
        ]) {
          const conflict = await call(
            `inspections/${fixtureInspectionId}/observations`,
            "supervisor",
            { ...mutation, ...changed },
          );
          assert.equal(
            conflict.response.status,
            409,
            "Changed payloads must not reuse a successful mutation key.",
          );
          assert.equal(conflict.data.error.code, "IDEMPOTENCY_CONFLICT");
        }
        const detail = await data<any>(
          `inspections/${fixtureInspectionId}`,
          "supervisor",
        );
        assert.equal(detail.observations.length, 1);
        assert.deepEqual(detail.observations[0].verification.outcomes, [
          "VERIFIED_APPROVED",
        ]);
        const variantError = await call(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          {
            ...mutation,
            variantId: "demo-variant-tea",
            clientMutationId: randomUUID(),
          },
        );
        assert.equal(variantError.response.status, 422);
        const badOverride = await call(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          {
            ...mutation,
            observedBrand: "Mismatch",
            clientMutationId: randomUUID(),
          },
        );
        assert.equal(badOverride.response.status, 422);
        const override = {
          ...mutation,
          observedBrand: "Mismatch",
          notes: "Fictional inspector disagreement",
          overrideReason: "Inspector disagrees; authority result is preserved.",
          clientMutationId: randomUUID(),
        };
        const recorded = await data<any>(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          override,
        );
        const replayed = await data<any>(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          override,
          200,
        );
        assert.equal(
          recorded.id,
          replayed.id,
          "An exact override retry must compare its composed saved notes.",
        );
        assert(recorded.verification.outcomes.includes("BRAND_MISMATCH"));
      },
    );
    await check(
      "multiple findings and an unknown-product investigation remain linked to the visit",
      async () => {
        for (const entry of [
          {
            productId: "demo-product-tea",
            variantId: "demo-variant-tea",
            observedBrand: "Different integration brand",
          },
          {
            productId: "demo-product-expired-certificate",
            variantId: "demo-variant-expired-certificate",
          },
          {
            productId: "demo-product-physical-expiry",
            variantId: "demo-variant-physical-expiry",
            physicalExpiry: "2000-01-01",
          },
          {
            productId: "demo-product-restricted",
            variantId: "demo-variant-restricted",
          },
        ]) {
          await data(
            `inspections/${fixtureInspectionId}/observations`,
            "supervisor",
            {
              ...entry,
              identityConfirmed: true,
              conclusion: "Review required",
              notes: "Fictional integration observation",
              clientMutationId: randomUUID(),
            },
          );
        }
        const unknown = await data<any>(
          `inspections/${fixtureInspectionId}/unknown`,
          "supervisor",
          {
            name: `Unverified integration product ${runId}`,
            brandName: "Integration provisional brand",
            manufacturerName: "Integration provisional manufacturer",
            description: "No certification evidence supplied.",
            reason: "Fictional unknown product requires authorized HAC review.",
          },
        );
        assert.equal(unknown.product.status, "PROVISIONAL");
        assert.equal(unknown.investigation.inspectionId, fixtureInspectionId);
        assert.equal(unknown.investigation.companyId, fixtureCompanyId);
        const product = await data<any>(
          `products/${unknown.product.id}`,
          "supervisor",
        );
        const unverified = await data<any>(
          `inspections/${fixtureInspectionId}/observations`,
          "supervisor",
          {
            productId: product.id,
            variantId: product.variants[0].id,
            observedName: product.name,
            identityConfirmed: true,
            conclusion: "Unverified provisional product",
            clientMutationId: randomUUID(),
          },
        );
        assert(unverified.verification.outcomes.includes("APPROVAL_PENDING"));
        assert(!unverified.verification.outcomes.includes("VERIFIED_APPROVED"));
        const detail = await data<any>(
          `inspections/${fixtureInspectionId}`,
          "supervisor",
        );
        assert.equal(detail.observations.length, 7);
        assert(
          detail.findings.some(
            (finding: any) => finding.type === "BRAND_MISMATCH",
          ),
        );
        assert(
          detail.findings.some(
            (finding: any) => finding.type === "CERTIFICATE_EXPIRED",
          ),
        );
        assert(
          detail.findings.some(
            (finding: any) => finding.type === "PHYSICAL_PRODUCT_EXPIRED",
          ),
        );
        assert(
          detail.findings.some(
            (finding: any) => finding.type === "EXPLICITLY_RESTRICTED",
          ),
        );
      },
    );
    await check(
      "complaint, non-conformity and corrective action share authorized company context",
      async () => {
        const fields = {
          companyId: fixtureCompanyId,
          inspectionId: fixtureInspectionId,
          productId: rice.id,
          observationId: originalObservationId!,
          title: "Fictional integration finding",
          description: "Test-only discrepancy; no official finding.",
        };
        const complaint = await data<any>("complaints", "supervisor", fields);
        assert.equal(complaint.companyId, fixtureCompanyId);
        const nc = await data<any>("non-conformities", "supervisor", {
          ...fields,
          severity: "MINOR",
        });
        const action = await data<any>("corrective-actions", "supervisor", {
          nonConformityId: nc.id,
          rootCause: "Fictional integration root cause.",
          proposedAction: "Fictional integration corrective action.",
        });
        assert.equal(action.companyId, fixtureCompanyId);
        assert.equal(
          (await call(`non-conformities/${nc.id}`, "restricted")).response
            .status,
          403,
        );
      },
    );
    await check(
      "evidence upload is private and linked to its inspection",
      async () => {
        const form = new FormData();
        form.set("inspectionId", fixtureInspectionId!);
        form.set("observationId", originalObservationId!);
        form.set("description", "Fictional HTTP integration evidence.");
        form.set(
          "file",
          new Blob([Buffer.from(png.split(",")[1], "base64")], {
            type: "image/png",
          }),
          "integration-evidence.png",
        );
        const response = await fetch(new URL("/api/v1/evidence", base), {
          method: "POST",
          headers: { origin, cookie: session.supervisor },
          body: form,
        });
        const payload = await response.json();
        assert.equal(
          response.status,
          201,
          `Evidence upload returned ${response.status} (${payload?.error?.code || "no error code"})`,
        );
        evidenceId = payload.data.id;
        assert(evidenceId);
        const permitted = await call(`evidence/${evidenceId}`, "supervisor");
        assert.equal(permitted.response.status, 200);
        assert.equal(
          (await call(`evidence/${evidenceId}`, "restricted")).response.status,
          403,
        );
      },
    );
    await check(
      "checklist completion and signatures allow version-checked immutable submission",
      async () => {
        const detail = await data<any>(
          `inspections/${fixtureInspectionId}`,
          "supervisor",
        );
        for (const question of detail.checklistVersion.questions) {
          if (!question.required) continue;
          const answer =
            question.type === "COMPLIANCE"
              ? "COMPLIANT"
              : question.type === "YES_NO"
                ? true
                : question.type === "PASS_FAIL"
                  ? "PASS"
                  : question.type === "TEXT"
                    ? "Fictional integration answer"
                    : question.type === "NUMBER"
                      ? 1
                      : question.type === "DATE"
                        ? "2026-10-22"
                        : question.type === "MULTIPLE_CHOICE"
                          ? question.options[0]
                          : evidenceId;
          await data(
            `inspections/${fixtureInspectionId}/checklist`,
            "supervisor",
            { questionId: question.id, answer },
            200,
          );
        }
        await data(
          `inspections/${fixtureInspectionId}/sign`,
          "supervisor",
          { name: supervisor.name, role: "INSPECTOR", signature: png },
          200,
        );
        await data(
          `inspections/${fixtureInspectionId}/sign`,
          "supervisor",
          {
            name: "Representative unavailable for fictional test",
            role: "COMPANY_REPRESENTATIVE",
            reason:
              "No company representative participates in this automated local fixture.",
          },
          200,
        );
        const signed = await data<any>(
          `inspections/${fixtureInspectionId}`,
          "supervisor",
        );
        assert.equal(signed.signatures.length, 2);
        const stale = await call(
          `inspections/${fixtureInspectionId}/submit`,
          "supervisor",
          { version: signed.version - 1, declaration: true },
        );
        assert.equal(stale.response.status, 409);
        // A legal-basis source change must be reviewed even when the product remains approved.
        await data("company-items", "admin", {
          companyId: fixtureCompanyId,
          productId: rice.id,
          relationship: "RETAILER",
        });
        const changedAuthority = await call(
          `inspections/${fixtureInspectionId}/submit`,
          "supervisor",
          { version: signed.version, declaration: true },
        );
        assert.equal(changedAuthority.response.status, 409);
        assert.equal(changedAuthority.data.error.code, "REVALIDATION_REQUIRED");
        await data(
          `inspections/${fixtureInspectionId}/reconcile`,
          "supervisor",
          { version: signed.version, acknowledge: true },
          200,
        );
        const reconciled = await data<any>(
          `inspections/${fixtureInspectionId}`,
          "supervisor",
        );
        assert.equal(
          reconciled.signatures.length,
          0,
          "Reconciliation must invalidate declarations about the old authority data.",
        );
        await data(
          `inspections/${fixtureInspectionId}/sign`,
          "supervisor",
          { name: supervisor.name, role: "INSPECTOR", signature: png },
          200,
        );
        await data(
          `inspections/${fixtureInspectionId}/sign`,
          "supervisor",
          {
            name: "Representative unavailable for fictional test",
            role: "COMPANY_REPRESENTATIVE",
            reason:
              "No company representative participates in this automated local fixture.",
          },
          200,
        );
        const finalVersion = (
          await data<any>(`inspections/${fixtureInspectionId}`, "supervisor")
        ).version;
        inspection = await data<any>(
          `inspections/${fixtureInspectionId}/submit`,
          "supervisor",
          { version: finalVersion, declaration: true },
          200,
        );
        assert.equal(inspection.status, "SUBMITTED");
        assert.match(inspection.snapshotHash, /^[a-f0-9]{64}$/);
        assert.equal(inspection.snapshot.observations.length, 7);
        assert.equal(
          (
            await call(
              `inspections/${fixtureInspectionId}/observations`,
              "supervisor",
              { ...mutation, clientMutationId: randomUUID() },
            )
          ).response.status,
          409,
        );
        assert.equal(
          (
            await call(
              `inspections/${fixtureInspectionId}/sign`,
              "supervisor",
              { name: supervisor.name, role: "INSPECTOR", signature: png },
            )
          ).response.status,
          409,
        );
        const restored = await data<any>(
          `inspections/${fixtureInspectionId}`,
          "supervisor",
        );
        assert.equal(restored.snapshotHash, inspection.snapshotHash);
        assert.equal(restored.observations.length, 7);
      },
    );
    await check(
      "authoritative PDF export, administrator review and audit history remain protected",
      async () => {
        const pdf = await call(`reports/${fixtureInspectionId}`, "supervisor");
        assert.equal(pdf.response.status, 200);
        assert(
          pdf.response.headers.get("content-type")?.includes("application/pdf"),
        );
        assert.equal(Buffer.from(pdf.data).subarray(0, 4).toString(), "%PDF");
        assert(pdf.data.length > 1000);
        assert.equal(
          (await call(`reports/${fixtureInspectionId}`, "restricted")).response
            .status,
          403,
        );
        const unauthorized = await call(
          `inspections/${fixtureInspectionId}/review`,
          "supervisor",
          {
            decision: "APPROVED",
            reason: "Unauthorized self review must fail.",
          },
        );
        assert.equal(unauthorized.response.status, 403);
        const reviewed = await data<any>(
          `inspections/${fixtureInspectionId}/review`,
          "admin",
          {
            decision: "APPROVED",
            reason: "Fictional local HTTP integration workflow reviewed.",
          },
          200,
        );
        assert.equal(reviewed.status, "APPROVED");
        assert.equal(
          reviewed.snapshotHash,
          inspection.snapshotHash,
          "A review must not overwrite the submitted snapshot.",
        );
        const logs = await data<any[]>("audit-logs?pageSize=100", "admin");
        assert(
          logs.some(
            (log) =>
              log.action === "SUBMIT" && log.entityId === fixtureInspectionId,
          ),
        );
        const serialized = JSON.stringify(logs);
        for (const credential of Object.values(credentials))
          assert(!serialized.includes(credential.password));
      },
    );
  } finally {
    await writeFile(
      new URL("../.local/api-integration-results.json", import.meta.url),
      JSON.stringify(
        {
          runId,
          executedAt: new Date().toISOString(),
          fixtureCompanyId,
          fixtureInspectionId,
          results,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      `${results.filter((result) => result.passed).length} HTTP checks passed; ${results.filter((result) => !result.passed).length} failed. Isolated fixture records are retained in the local database.`,
    );
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "HTTP integration failed.",
  );
  process.exitCode = 1;
});
