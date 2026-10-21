import { fileURLToPath } from "node:url";
import { execFile, execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../../", import.meta.url));
if (process.env.HAC_ISOLATED_TESTS !== "1")
  throw new Error(
    "Set HAC_ISOLATED_TESTS=1. This test creates and drops its own ephemeral database/user on the local Docker MySQL server.",
  );
const app = join(root, "hac-management-system/web");
const suffix = randomBytes(6).toString("hex");
const database = `hac_marml_${suffix}`,
  databaseUser = `hac_marml_${suffix}`;
const databasePassword = randomBytes(24).toString("hex"),
  adminPassword = randomBytes(24).toString("hex");
const privateDir = mkdtempSync("/tmp/hac-marml-private-");
mkdirSync(join(privateDir, "denied"), { mode: 0o500 });
const base = "http://127.0.0.1:3199";
const env = {
  ...process.env,
  PORT: "3199",
  NODE_ENV: "production",
  HAC_HOSTED_SETUP: "false",
  DATABASE_URL: `mysql://${databaseUser}:${databasePassword}@127.0.0.1:3307/${database}`,
  APP_ORIGIN: base,
  HAC_ADMIN_EMAIL: "local-validation-admin@example.test",
  HAC_ADMIN_PASSWORD: adminPassword,
  HAC_STORAGE_PATH: join(privateDir, "denied"),
  HAC_STORAGE_FALLBACK_PATH: join(privateDir, "persistent-fallback"),
  UPLOAD_DIR: join(privateDir, "uploads"),
  npm_config_cache: join(privateDir, "npm-cache"),
  PRISMA_HIDE_UPDATE_MESSAGE: "true",
};
const secrets = [databasePassword, adminPassword];
function sql(statement) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.HAC_TEST_MYSQL_CONTAINER || "web-mysql-1",
      "sh",
      "-c",
      'exec env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --user=root --batch --skip-column-names',
    ],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}
function run(args) {
  return new Promise((resolve, reject) =>
    execFile(
      "npm",
      args,
      { cwd: root, env, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = stdout + stderr;
        if (secrets.some((secret) => output.includes(secret)))
          return reject(new Error("Sensitive command output"));
        if (error)
          return reject(
            new Error(`Private command failed (${args.join(" ")}): ${output}`),
          );
        resolve(output);
      },
    ),
  );
}
let server;
const serverLog = join(privateDir, "server.log");
const sessions = {};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(
  path,
  actor,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      origin: base,
      ...(sessions[actor] ? { cookie: sessions[actor] } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.headers.get("content-type")?.includes("json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { response, data };
}
async function call(
  path,
  actor,
  body,
  status = body === undefined ? 200 : 201,
  method,
) {
  const result = await request(path, actor, body, method);
  assert.equal(
    result.response.status,
    status,
    `${path}: expected ${status}, got ${result.response.status} ${result.data?.error?.code || ""}`,
  );
  return result;
}
async function data(path, actor, body, status, method) {
  return (await call(path, actor, body, status, method)).data.data;
}
async function login(actor, email, password) {
  const result = await call("auth/login", undefined, { email, password }, 200);
  sessions[actor] = result.response.headers.get("set-cookie").split(";")[0];
  return result.data.data;
}
async function stop() {
  if (!server) return;
  const child = server;
  server = undefined;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    pause(2000),
  ]);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
}
try {
  sql(
    `CREATE DATABASE \`${database}\`; CREATE USER '${databaseUser}'@'%' IDENTIFIED BY '${databasePassword}'; GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${databaseUser}'@'%';`,
  );
  // Complete MySQL's initial caching_sha2 exchange over the container's private socket.
  execFileSync(
    "docker",
    [
      "exec",
      "-e",
      `MYSQL_PWD=${databasePassword}`,
      process.env.HAC_TEST_MYSQL_CONTAINER || "web-mysql-1",
      "mysql",
      `--user=${databaseUser}`,
      `--database=${database}`,
      "--execute=SELECT 1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await run(["run", "db:migrate"]);
  await run(["run", "admin:create"]);
  console.log(
    "PASS standard migrations and private initial administrator on a fresh isolated MySQL database.",
  );
  const log = serverLog;
  const { openSync } = await import("node:fs");
  const stream = openSync(log, "w");
  server = spawn("npm", ["start"], {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", stream, stream],
  });
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, "Production server exited");
    try {
      if ((await fetch(`${base}/login`)).status === 200) break;
    } catch {}
    await pause(200);
    if (i === 99) throw new Error("Production startup timeout");
  }
  await login("admin", env.HAC_ADMIN_EMAIL, adminPassword);
  await call("workspace-setup", undefined, undefined, 401);
  let setup = await data("workspace-setup", "admin");
  const imported = await call("workspace-setup", "admin", {
    companyNames: setup.defaults.companyNames,
    supervisors: setup.defaults.supervisors,
  });
  assert(imported.response.headers.get("cache-control").includes("no-store"));
  setup = imported.data.data;
  assert.equal(setup.companies.length, 10);
  assert.equal(setup.supervisors.length, 5);
  assert.equal(setup.materials.length, 39);
  assert.equal(setup.credentials.length, 5);
  assert.equal(
    new Set(setup.credentials.map((person) => person.password)).size,
    5,
  );
  assert(
    setup.companies.every((company) => company.registrationNumber === null),
  );
  for (const [index, credential] of setup.credentials.entries()) {
    secrets.push(credential.password);
    const person = await login(
      `supervisor${index}`,
      credential.email,
      credential.password,
    );
    assert.equal(person.role, "SUPERVISOR");
    const assigned = await data("companies?pageSize=100", `supervisor${index}`);
    const entries =
      assigned.items || assigned.records || assigned.data || assigned;
    assert.equal(entries.length, 2);
    assert.equal(setup.supervisors[index].assignments.length, 2);
    await call("workspace-setup", `supervisor${index}`, undefined, 403);
  }
  const safePreview = JSON.stringify(await data("workspace-setup", "admin"));
  assert(!secrets.some((secret) => safePreview.includes(secret)));
  console.log(
    "PASS administrator import: 10 companies, 5 distinct-password supervisors, 2 scoped assignments each, 39 materials, no secret values in later previews.",
  );
  await call("ai/scan-test", undefined, undefined, 401);
  await call("ai/scan-test", "supervisor0", {}, 403);
  const testItems = await data("ai/scan-test", "admin", {}, 201);
  assert.equal(testItems.products.length, 5);
  assert(testItems.products.every((product) => product.isDemo));
  const model = await data("ai/scan-test", "supervisor0");
  assert.equal(model.artifact.dimension, 1024);
  assert.equal(model.artifact.labels.length, 7);
  assert.equal(model.products.length, 5);
  const testVerification = await data(
    "verification",
    "supervisor0",
    {
      productId: "scan-test-laptop",
      companyId: setup.companies[0].id,
      identityConfirmed: true,
    },
    200,
  );
  assert.equal(testVerification.certificate, null);
  assert.notEqual(testVerification.primaryStatus, "VERIFIED_APPROVED");
  const repeatedTestItems = await data("ai/scan-test", "admin", {}, 201);
  assert.deepEqual(
    testItems.products.map((p) => p.id),
    repeatedTestItems.products.map((p) => p.id),
  );
  const found = await data(
    "products?q=Chicken%20Boneless&pageSize=16",
    "supervisor0",
  );
  assert(found.length > 0);
  assert(found.every((product) => product.variants.length === 0));
  await call("checklist-management", "supervisor0", undefined, 403);
  const firstChecklist = await data(
    "checklist-management",
    "admin",
    {
      name: "Local validation optional checklist",
      questions: [
        { id: "local-q1", text: "First optional question", type: "YES_NO" },
        {
          id: "local-q2",
          text: "Will be removed from the next version",
          type: "TEXT",
        },
      ],
    },
    201,
  );
  const historyVisit = await data("inspections/start-now", "supervisor1", {
    companyId: setup.companies[2].id,
    locationId: setup.companies[2].locations[0].id,
    checklistVersionId: firstChecklist.id,
  });
  const secondChecklist = await data(
    "checklist-management",
    "admin",
    {
      templateId: firstChecklist.templateId,
      expectedVersion: 1,
      name: "Local validation revised checklist",
      questions: [
        { id: "local-q1", text: "First optional question", type: "YES_NO" },
      ],
    },
    201,
  );
  assert.equal(secondChecklist.version, 2);
  assert.equal(secondChecklist.questions.length, 1);
  await call(
    "checklist-management",
    "admin",
    {
      templateId: firstChecklist.templateId,
      expectedVersion: 1,
      name: "Stale edit",
      questions: [],
    },
    409,
  );
  await data(
    "checklist-management",
    "admin",
    { templateId: firstChecklist.templateId },
    200,
    "DELETE",
  );
  const availableChecklists = await data("checklists", "supervisor1");
  assert(
    !availableChecklists.some(
      (checklist) => checklist.templateId === firstChecklist.templateId,
    ),
  );
  const retainedVisit = await data(
    `inspections/${historyVisit.id}`,
    "supervisor1",
  );
  assert.equal(retainedVisit.checklistVersion.id, firstChecklist.id);
  assert.equal(retainedVisit.checklistVersion.questions.length, 2);
  console.log(
    "PASS actual catalogue search and five uncertified test objects; optional versioned admin checklist editing/removal preserves the questions in an existing visit.",
  );
  const checklist = setup.checklistVersionId;
  const keells = setup.companies[0],
    sourceCompany = setup.companies[7];
  const visit = { companyId: keells.id, locationId: keells.locations[0].id };
  const starts = await Promise.all([
    request("inspections/start-now", "supervisor0", visit),
    request("inspections/start-now", "supervisor0", visit),
  ]);
  assert(
    starts.every((result) => [200, 201].includes(result.response.status)),
    "Concurrent self-start failed",
  );
  assert.equal(starts[0].data.data.id, starts[1].data.data.id);
  assert.equal(starts[0].data.data.status, "IN_PROGRESS");
  assert.equal(starts[0].data.data.checklistVersionId, null);
  await call(
    "inspections/start-now",
    "supervisor0",
    { ...visit, inspectorId: setup.supervisors[1].id },
    400,
  );
  await call(
    "inspections/start-now",
    "supervisor0",
    {
      ...visit,
      companyId: sourceCompany.id,
      locationId: sourceCompany.locations[0].id,
    },
    403,
  );
  const inspection = await data("inspections/start-now", "supervisor3", {
    companyId: sourceCompany.id,
    locationId: sourceCompany.locations[0].id,
    checklistVersionId: checklist,
    objectives: "LOCAL INTEGRATION VALIDATION ONLY; not a real site visit.",
  });
  assert.equal(inspection.inspectorId, setup.supervisors[3].id);
  console.log(
    "PASS assigned supervisors self-start without scheduling; concurrent starts resume one draft, forged identities/unassigned companies rejected.",
  );
  const mobile = await data(
    `inspections/${inspection.id}/mobile`,
    "supervisor3",
  );
  assert.equal(mobile.observations.length, 0);
  await call(
    `inspections/${inspection.id}/mobile`,
    "supervisor0",
    undefined,
    403,
  );
  const lightweight = await data("catalogue-search?q=Chicken", "supervisor3");
  assert(lightweight.length > 0 && lightweight.length <= 12);
  assert(!("certificates" in lightweight[0]));
  assert(!("rawMaterialListing" in lightweight[0]));
  const beforeCount = Number(
    sql(`SELECT COUNT(*) FROM \`${database}\`.Product;`).trim(),
  );
  const unknownKey = randomUUID();
  const unknown = await data(
    `inspections/${inspection.id}/unknown`,
    "supervisor3",
    {
      name: "Unlisted inspection-only material",
      kind: "RAW_MATERIAL",
      clientMutationId: unknownKey,
    },
  );
  assert.equal(unknown.catalogueChanged, false);
  assert.equal(unknown.observation.productId, null);
  const retry = await data(
    `inspections/${inspection.id}/unknown`,
    "supervisor3",
    {
      name: "Unlisted inspection-only material",
      kind: "RAW_MATERIAL",
      clientMutationId: unknownKey,
    },
    200,
  );
  assert.equal(unknown.observation.id, retry.observation.id);
  assert.equal(
    Number(sql(`SELECT COUNT(*) FROM \`${database}\`.Product;`).trim()),
    beforeCount,
  );
  await call(
    `inspections/${inspection.id}/unknown`,
    "supervisor3",
    {
      name: "Changed payload",
      kind: "RAW_MATERIAL",
      clientMutationId: unknownKey,
    },
    409,
  );
  console.log(
    "PASS lightweight search, scoped mobile endpoint, and idempotent unlisted observation without any master catalogue writes.",
  );
  const first = setup.materials.find((material) => material.rowNumber === 1);
  const apple = setup.materials.find((material) => material.rowNumber === 29);
  const originalSource = JSON.stringify(first.sourceRow);
  let verify = await data(
    "verification",
    "supervisor3",
    {
      companyId: sourceCompany.id,
      productId: first.productId,
      identityConfirmed: true,
    },
    200,
  );
  assert(verify.outcomes.includes("MARML_CERTIFICATE_EXPIRED"));
  await data(
    "workspace-setup",
    "admin",
    {
      action: "material",
      id: apple.id,
      fields: {
        reviewStatus: "VERIFIED",
        remarks: "Reviewed for local integration validation only",
      },
    },
    200,
    "PATCH",
  );
  verify = await data(
    "verification",
    "supervisor3",
    {
      companyId: sourceCompany.id,
      productId: apple.productId,
      identityConfirmed: true,
    },
    200,
  );
  assert.equal(verify.primaryStatus, "VERIFIED_APPROVED");
  assert.equal(verify.approvalBasis, "ADMIN_VERIFIED_MARML");
  assert.equal(verify.certificate, null);
  const savedName = "Chicken Boneless Meat - local validation saved name";
  await data(
    "workspace-setup",
    "admin",
    {
      action: "material",
      id: first.id,
      fields: { name: savedName, remarks: "Saved before submission" },
    },
    200,
    "PATCH",
  );
  for (const material of [first, apple]) {
    await data(`inspections/${inspection.id}/observations`, "supervisor3", {
      productId: material.productId,
      observedName: material.rowNumber === 1 ? savedName : material.name,
      identityConfirmed: true,
      conclusion: "REVIEW",
      notes:
        "Local validation only: inspected packaging and recorded source/date results.",
      batch: `LOCAL-TEST-${material.rowNumber}`,
      physicalExpiry: "2028-01-01",
      clientMutationId: randomUUID(),
    });
  }
  let detail = await data(`inspections/${inspection.id}`, "supervisor3");
  assert(
    detail.checklistVersion.questions.some((question) => question.required),
  );
  assert.equal(detail.responses.length, 0);
  const sharp = createRequire(join(app, "package.json"))("sharp");
  const library = await data("ai/datasets", "admin", {
    name: "SYNTHETIC upload capacity and resumable training validation",
  });
  await call(
    "ai/training-jobs",
    "supervisor0",
    { action: "start", datasetId: library.id },
    403,
  );
  for (let i = 0; i < 112; i++) {
    const bytes = await sharp(randomBytes(224 * 224 * 3), {
      raw: { width: 224, height: 224, channels: 3 },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set(
      "file",
      new File([bytes], `synthetic-${i}.jpg`, { type: "image/jpeg" }),
    );
    form.set("productId", i < 105 ? first.productId : "");
    form.set("captureGroup", randomUUID());
    const response = await fetch(
      `${base}/api/v1/ai/datasets/${library.id}/images`,
      {
        method: "POST",
        headers: { origin: base, cookie: sessions.admin },
        body: form,
      },
    );
    assert.equal(response.status, 201, `Synthetic upload ${i} failed`);
  }
  const counts = await data(
    `ai/training-library?datasetId=${library.id}&productId=${first.productId}`,
    "admin",
  );
  assert.equal(
    counts.counts.find((row) => row.productId === first.productId).count,
    105,
  );
  assert.equal(counts.images.length, 24);
  assert(counts.images.every((image) => !("path" in image)));
  let job = await data(
    "ai/training-jobs",
    "admin",
    { action: "start", datasetId: library.id },
    200,
  );
  const resumed = await data(
    "ai/training-jobs",
    "admin",
    { action: "start", datasetId: library.id },
    200,
  );
  assert.equal(resumed.id, job.id);
  for (let step = 0; job.status === "TRAINING" && step < 25; step++) {
    job = await data(
      "ai/training-jobs",
      "admin",
      { action: "step", modelId: job.id },
      200,
    );
    assert.equal(job.metrics.job.total, 112);
    console.log(
      `PASS real TensorFlow training batch: ${job.metrics.job.processed}/112 (${job.status}).`,
    );
  }
  assert.equal(job.status, "VALIDATION_REQUIRED");
  assert.equal(job.metrics.job.processed, 112);
  assert.equal(job.metrics.job.phase, "DONE");
  assert.equal(job.metrics.passed, false);
  const publish = await request(`ai/models/${job.id}/publish`, "admin", {});
  assert(
    publish.response.status >= 400,
    "Random noise must not pass publication quality gate",
  );
  assert.equal(await data("ai/published", "supervisor3"), null);
  console.log(
    "PASS genuine 105-photo product upload + 7 background photos, saved counts/limited previews, actual resumable TensorFlow extraction and held-out evaluation; random-noise model cannot be published. Not an accuracy benchmark.",
  );

  detail = await data(`inspections/${inspection.id}`, "supervisor3");
  await data(
    `inspections/${inspection.id}/submit`,
    "supervisor3",
    { version: detail.version, declaration: true },
    200,
  );
  detail = await data(`inspections/${inspection.id}`, "supervisor3");
  assert.equal(detail.status, "SUBMITTED");
  assert.equal(detail.snapshot.responses.length, 0);
  assert.equal(detail.snapshot.signatures.length, 1);
  assert.equal(detail.snapshot.signatures[0].signature, null);
  assert.equal(detail.snapshot.signatures[0].userId, setup.supervisors[3].id);
  const noChecklistInspectionId = starts[0].data.data.id;
  await data(
    `inspections/${noChecklistInspectionId}/observations`,
    "supervisor0",
    {
      productId: "scan-test-laptop",
      observedName: "Laptop - LOCAL VALIDATION ONLY",
      identityConfirmed: true,
      conclusion: "REVIEW",
      notes: "Camera test object only; no certification.",
      clientMutationId: randomUUID(),
    },
  );
  const noChecklistDetail = await data(
    `inspections/${noChecklistInspectionId}`,
    "supervisor0",
  );
  await data(
    `inspections/${noChecklistInspectionId}/submit`,
    "supervisor0",
    { version: noChecklistDetail.version, declaration: true },
    200,
  );
  const nullChecklistReport = await call(
    `reports/${noChecklistInspectionId}?format=pdf`,
    "supervisor0",
  );
  assert.equal(nullChecklistReport.data.subarray(0, 5).toString(), "%PDF-");
  console.log(
    "PASS submission without any signature upload or representative, optional checklist and PDF generated/downloaded using persistent fallback under a read-only primary storage path.",
  );
  const savedObservation = detail.snapshot.observations.find(
    (observation) => observation.productId === first.productId,
  );
  assert.equal(savedObservation.product.rawMaterialListing.name, savedName);
  assert.equal(
    JSON.stringify(savedObservation.product.rawMaterialListing.sourceRow),
    originalSource,
  );
  const report = await call(
    `reports/${inspection.id}?format=pdf`,
    "supervisor3",
  );
  assert.equal(report.data.subarray(0, 5).toString(), "%PDF-");
  const reportHash = createHash("sha256").update(report.data).digest("hex");
  writeFileSync(join(privateDir, "inspection.pdf"), report.data);
  const pdfText = execFileSync(
    "pdftotext",
    ["-raw", join(privateDir, "inspection.pdf"), "-"],
    { encoding: "utf8" },
  );
  assert(pdfText.includes("INSPECTED RAW MATERIAL LIST"));
  assert(pdfText.includes(savedName));
  assert(pdfText.includes("Apple Flavour"));
  assert(pdfText.replace(/\s+/g, " ").includes("Saved before submission"));
  assert(
    report.response.headers.get("content-disposition").includes("attachment"),
  );
  console.log(
    "PASS admin review/expiry/scope rules, saved material observations, checklist, signatures, immutable submission and downloadable MARML PDF containing both saved rows.",
  );
  await data(
    "workspace-setup",
    "admin",
    {
      action: "material",
      id: first.id,
      fields: { name: "Changed after submission" },
    },
    200,
    "PATCH",
  );
  detail = await data(`inspections/${inspection.id}`, "supervisor3");
  assert.equal(
    detail.snapshot.observations.find(
      (observation) => observation.productId === first.productId,
    ).product.rawMaterialListing.name,
    savedName,
  );
  const sameReport = await call(
    `reports/${inspection.id}?format=pdf`,
    "supervisor3",
  );
  assert.equal(
    createHash("sha256").update(sameReport.data).digest("hex"),
    reportHash,
  );
  await data(
    "workspace-setup",
    "admin",
    {
      action: "company",
      id: sourceCompany.id,
      fields: { legalName: "Unrelated Company" },
    },
    200,
    "PATCH",
  );
  verify = await data(
    "verification",
    "supervisor3",
    {
      companyId: sourceCompany.id,
      productId: apple.productId,
      identityConfirmed: true,
    },
    200,
  );
  assert(verify.outcomes.includes("OUT_OF_MARML_SCOPE"));
  await data(
    "workspace-setup",
    "admin",
    {
      action: "company",
      id: sourceCompany.id,
      fields: { legalName: sourceCompany.legalName },
    },
    200,
    "PATCH",
  );
  const replacement = randomBytes(24).toString("hex");
  secrets.push(replacement);
  await data(
    "workspace-setup",
    "admin",
    {
      action: "supervisor",
      id: setup.supervisors[0].id,
      fields: {
        password: replacement,
        companyIds: [setup.companies[1].id, setup.companies[2].id],
      },
    },
    200,
    "PATCH",
  );
  await call("auth/me", "supervisor0", undefined, 401);
  await call(
    "auth/login",
    undefined,
    {
      email: setup.credentials[0].email,
      password: setup.credentials[0].password,
    },
    401,
  );
  await login("supervisor0", setup.credentials[0].email, replacement);
  await call("inspections/start-now", "supervisor0", visit, 403);
  const repeated = await data("workspace-setup", "admin", {
    companyNames: setup.defaults.companyNames,
    supervisors: setup.defaults.supervisors,
  });
  assert.equal(repeated.credentials.length, 0);
  assert.equal(
    repeated.materials.find((material) => material.id === first.id).name,
    "Changed after submission",
  );
  assert.deepEqual(
    repeated.supervisors[0].assignments
      .map((assignment) => assignment.companyId)
      .sort(),
    [setup.companies[1].id, setup.companies[2].id].sort(),
  );
  const audit = JSON.stringify(await data("audit-logs?pageSize=100", "admin"));
  assert(!secrets.some((secret) => audit.includes(secret)));
  console.log(
    "PASS later edits preserve submitted snapshot/PDF; source profile rename cannot transfer approval; password reset revokes sessions, reassignment applies immediately, repeated import preserves edits and returns no old credentials.",
  );
} catch (error) {
  let details = "";
  try {
    details = readFileSync(serverLog, "utf8").slice(-4000);
  } catch {}
  for (const secret of secrets)
    details = details.replaceAll(secret, "[REDACTED]");
  details = details.replace(/mysql:\/\/[^\s'\"]+/g, "[REDACTED_URL]");
  console.error("Sanitized isolated server diagnostics:", details);
  throw error;
} finally {
  await stop();
  sql(
    `DROP DATABASE IF EXISTS \`${database}\`; DROP USER IF EXISTS '${databaseUser}'@'%';`,
  );
  rmSync(privateDir, { recursive: true, force: true });
}
