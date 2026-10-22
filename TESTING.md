# Validation

Run commands in `/workspace/HAC/hac-management-system/web`. `IMPLEMENTATION_STATUS.md` contains the final observed checks for this implementation session. Commands listed here are procedures, not claims they all passed.

```bash
npm run db:generate
npm run db:migrate:local
npm run db:seed
npm run typecheck
npm test
npm run build
```

Database generation/migration must succeed before claiming application readiness. The tested local migration path is the guarded SQL runner `db:migrate:local`; standard `db:migrate` subsequently passed and native schema comparison found no drift against local MySQL. Client generation uses official pinned Prisma WASM validation and the official client generator. Native Prisma engine downloads and official TensorFlow model downloads can be blocked independently of npm installation. Preserve TLS and artifact verification; do not disable assertions or replace actual integration checks with passing mocks.

## Automated coverage

- `verification.test.ts` uses fixed timestamps and deterministic authoritative-record fixtures for scope, brand, variant, manufacturer, certificate expiry/suspension/revocation, valid renewals, physical expiry, required license expiry, restrictions, unknown products, retailer/manufacturer distinction and simultaneous issues. These tests do not depend on image recognition.
- `security.test.ts` and `auth-route.test.ts` exercise password storage, expiring hashed sessions, secure cookie behavior, origins, company assignments, roles, redaction and login handling.
- `reports.test.ts` generates a 130-observation PDF and verifies A4 portrait/landscape pages, pagination through the last observation, saved investigation/declaration text, demonstration marking, draft watermarks and real image embedding. Workbook tests inspect actual saved values and ensure formula-looking notes remain strings.
- `evidence.test.ts` tests MIME/magic mismatch, corrupt images, size/pixel limits, metadata stripping, resizing, opaque private filenames and traversal rejection.
- `evidence-routes.test.ts` exercises submitted-inspection rejection, observation ownership, atomic version locking/signature invalidation, and unused-file cleanup when a concurrent operation wins.
- `report-routes.test.ts` tests company-role denial, authentication and company access before file reads, immutable artifact reuse, missing retained artifacts and hash mismatch rejection.
- `offline.test.ts` tests encrypted session-bound observation drafts and reconciliation controls. This does not validate full offline field operation or durable recovery after tab reload.
- `ai.test.ts` tests deterministic embedding ranking, top-three ordering, ambiguity/background rejection, grouped dataset splitting and metric calculations. `ai-runtime.test.ts` runs the installed TensorFlow CPU backend and tensor lifecycle. Neither is a trained packaging-recognition accuracy evaluation.
- `workspace-setup.test.ts` and `workspace-setup-route.test.ts` cover the administrator import/edit boundaries, retained source identity, repeat-import preservation and private credential/reset behavior. `start-inspection.test.ts` covers current assignment checks, active location/checklist validation and concurrent self-start handling. `marml-verification.test.ts` covers the 39-row transcription, review, original company scope, printed-date expiry, valid certificate renewals and reconciliation fingerprints. `tests/e2e/marml-workspace.spec.ts` checks the setup/edit/download screens and scoped start dialog with mocked APIs; the separate disposable-database HTTP run recorded in `IMPLEMENTATION_STATUS.md` validates actual persistence and downloads.

The 18 report/evidence tests across the four corresponding suites passed during development. The final full-suite count and build/API results belong in the implementation-status document rather than being inferred from that subset.

## Real backend integration

Start MySQL and the Node server, then run `HAC_INTEGRATION=1 npx tsx tests/api.integration.ts` (set `HAC_TEST_BASE_URL` if the local server uses another port). The runner must authenticate using the ignored local seed credential file and exercise saved database-backed records; never print credential values. It should verify assigned-company restrictions, actual verification, multi-product observations, unknown-product review, cases, evidence, checklist responses, declarations, submission immutability, review and retained PDF/XLSX downloads. Keep result artifacts private. An API mocked in a unit test does not prove MySQL connectivity or end-to-end inspection operation.

For repeated runs, use isolated newly generated fixture references or a separate test database. Do not reset retained production data. Confirm test output belongs to the current run and that all expected steps executed.

## Browser and camera checks

`tests/e2e/mobile-inspection.spec.ts` covers live query cancellation, material saving without optional identifiers, device-local large text and admin checklist revisions. `HAC_OBJECT_SCAN_TESTS=1` enables `tests/e2e/object-scan.spec.ts` after the real-image/backbone fixtures are prepared: it runs actual TensorFlow browser inference and a Chromium camera stream backed by an attributed real photograph, then verifies camera cleanup on background. Use a local server with `HAC_BASE_URL=http://localhost:<port>` for Next development-origin checks. See `docs/MOBILE_INSPECTIONS.md` for the model's source partitions and limits; a simulated camera stream is not a physical phone test.

Use Playwright or manual browser checks at desktop and common Android widths, including approximately 390 × 844. Check login, responsive navigation, company/inspection tables, product search, verification panel, unknown registration, save/continue, checklist answers, evidence errors, signatures, submission and download behavior. Camera testing must cover denied permissions, unavailable devices, switching cameras, background/foreground and actual secure-context behavior. A camera UI rendering in a screenshot does not prove capture or model inference.

Pretrained inference and the real training/publication/prediction/rollback lifecycle passed with explicitly synthetic illustration fixtures (`npm run test:ai-pretrained`, `npm run test:ai-training`). Synthetic models are archived afterward and are not claimed field-ready. The flagship visual acceptance scenario still requires independently collected product/background photographs, target-device live camera testing, and representative field evaluation. No representative image dataset or trained accuracy is supplied by the seed. Treat blocked model access, absent photographs and untested Android hardware as distinct limitations.

## Production acceptance

Before release, verify actual Hostinger/runtime support, HTTPS and proxy origins, authorization across every role and company, persistent storage and backup restoration, request/body/time limits, concurrent submissions, durable jobs, independent security review and formal HAC policy configuration. The broader requested platform includes unimplemented features recorded in `IMPLEMENTATION_STATUS.md`; this initial test suite does not certify their completion.

## Current commands for integration suites

Start the local service before these commands. `npm run test:integration` exercises the full MySQL inspection workflow, including changed authority-source reconciliation and invalidated signatures. `npm run test:ai-api` checks private dataset/image APIs. `npm run test:ai-pretrained` downloads and runs the official image backbone. `npm run test:ai-training` performs genuine TensorFlow extraction and model lifecycle on synthetic images, archives its test models, and refuses to supersede an existing user-published model. `npm run test:e2e` runs desktop/mobile browser and camera-denial checks using the configured Chromium binary. All integration records are fictional and retained; no production database reset occurs.

## Final observed results

A clean frozen-lockfile installation, real local setup/generation/migrations/seed, TypeScript check, 115 automated tests, production build and standalone server startup passed. Eleven live inspection API groups, eight AI dataset/security groups, two concurrent-login checks and two desktop/mobile browser tests passed. Seven actual ML lifecycle checks also completed a synthetic Keells inspection with six saved outcomes and recognition provenance, investigation, evidence, declarations, immutable submission, actual 11-page A4 PDF and review; two trained test artifacts were archived. A separate disposable MySQL container restored 39 tables with retained observations and submitted snapshots, leaving the source untouched. These are local/synthetic integration outcomes, not field accuracy, native Android acceptance or production certification. Private result files retain the corresponding timestamps.

## Publication/Windows portability follow-up

The preserved implementation's unit suite passes 119 tests across 14 files after four regression cases for environment-default preservation, idempotence and Windows CRLF/exported bindings. `npm run typecheck` now runs `next typegen` before TypeScript so ignored generated declarations need not be committed. Integration npm commands use a cross-platform Node launcher; Windows browser tests use `npx.cmd playwright install chromium` unless an executable override is explicitly configured. See `docs/WINDOWS_SETUP.md`; native Windows execution remains unverified.

## Simple mobile inspections and bulk training regression

From `hac-management-system/web`, after `npm run build`, run:

```sh
npm test
# Requires the existing local Docker MySQL service (defaults to web-mysql-1, localhost:3307).
# Creates only a random ephemeral database/user and removes them in finally.
HAC_ISOLATED_TESTS=1 node tests/simple-inspection.integration.mjs
# Against a running local app:
HAC_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-inspection.spec.ts tests/e2e/product-training.spec.ts
```

The isolated HTTP regression exercises 10 companies/5 assigned supervisors/39 materials, lean search, inspection-only unknown items and idempotent retry, optional checklists, authenticated submission without a signature upload, and immutable downloadable PDFs under an intentionally unwritable primary storage directory. It uploads 105 synthetic noise images for one item and 7 background images, completes genuine TensorFlow extraction/evaluation in persisted batches, and verifies that the unsuitable model cannot pass publication. This verifies capacity and lifecycle, not field recognition accuracy. It requires outbound access to the official MobileNet model. Set `HAC_TEST_MYSQL_CONTAINER` to override the local Docker container name; the database port is 3307.

`HAC_QUICK_CAMERA_TESTS=1 HAC_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/quick-camera.spec.ts` additionally checks actual browser TensorFlow extraction from the local Chromium fake-camera stream, 75% filtering, two-to-four card scrolling, optional stable-frame AI capture, one-confirmation saving and continuing inference. Prepare a local YUV4MPEG fake-camera fixture at `.local/object-test/camera.y4m` (a legacy local fixture path; no experimental model is shipped) and cache the official `mobilenet_v1_0.25_224/model.json` with its relative weight shards in `.local/product-backbone`. API candidates in this UI regression are explicit fixtures; it does not claim prediction accuracy or physical-phone validation.

The catalogue/image update additionally checks admin-only image upload/removal, invalid image rejection, authenticated image downloads, company-logo access scope, required unlisted photo and identity details, duplicate manual records, concurrent known-product additions, and PDF inclusion of the saved unknown identity. `tests/e2e/catalogue-media.spec.ts` covers cancelled/stale catalogue searches and image editing; `tests/e2e/install-app.spec.ts` covers first mobile install prompting, the circular icon manifest and persisted dismissal. The quick-camera test also checks that an inspected candidate becomes disabled. Calibration unit tests check rejection of confusing background examples and prevent a high background-only accuracy from bypassing product recall requirements. The isolated real-image-extraction test remains synthetic lifecycle/capacity evidence, not an evaluation of the user's production library.

The same disposable-database run trains a separate model using 15 separable fictional illustrations, verifies that real held-out measurements pass, rejects supervisor publication, and permits explicit administrator publication. That model never reaches the production database or live scanner.

Current change validation: 259 unit tests and 22 Playwright workflows passed against a production build. `HAC_ISOLATED_TESTS=1 node tests/simple-inspection.integration.mjs` creates a disposable MySQL database and exercises real HTTP routes, training, private PDF downloads, catalogue compatibility, optional signatures, versioned removal and server capture. It must never target a production database. UI candidate fixtures are not prediction-accuracy evidence.
