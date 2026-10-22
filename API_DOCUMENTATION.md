# REST API

The shared backend is served under `/api/v1`. All endpoints require an authenticated session except `POST /auth/login`. This document describes implemented handlers; it is not a claim that every requested future API exists.

## Conventions

JSON success responses contain `{ "data": ... }`; paginated responses also contain `meta: {page,pageSize,total}`. Errors contain `{ "error": {"code":"STABLE_CODE","message":"Readable explanation"} }`, with validation details where applicable. Typical statuses are 400 validation, 401 authentication, 403 permission, 404 missing record, 409 duplicate/state/version conflict, 413 oversized file, 415 invalid upload type, and 422 unmet workflow requirements.

Most lists accept `page` (default 1), `pageSize` (1–100, default 30), `q`, and where supported `status`. Sorting is defined by each handler, not a general caller-controlled sort expression. Locations and checklist lists currently have a 100-record cap rather than complete pagination. JSON mutations are bounded to 1 MB. IDs are server record IDs, not display names. Dates sent as timestamps use ISO 8601 with an explicit offset. The business timezone is Asia/Colombo.

Cookie-authenticated writes require `Origin` matching `APP_ORIGIN` (or the request origin in local development). Browser `fetch` sends this normally. CLI and Flutter clients must explicitly supply it and retain cookies. No bearer-token or public-signup endpoint is implemented.

## Authentication

| Method | Path | Body or behavior |
|---|---|---|
| POST | `/auth/login` | `{email,password}`; creates an expiring secure session |
| GET | `/auth/me` | Current user, without credential fields |
| POST | `/auth/logout` | Revokes the current session |

## Read and catalogue APIs

| Resource | Implemented access |
|---|---|
| `/dashboard` | Scoped live database metrics and recent operational records |
| `/health` | Authenticated database connectivity request |
| `/companies`, `/companies/{id}` | Scoped list and details; POST creates a company for HAC administrators |
| `/locations` | GET; POST `{companyId,name,address,type?}` by administrators |
| `/brands`, `/manufacturers`, `/suppliers` | Inspector/admin lists; administrator POST `{name}` |
| `/products`, `/items`, `/raw-materials` | Search/list/details and administrator creation; `/items` aliases products |
| `/certificates`, `/certificates/{id}` | Scoped records and scope/history; administrator creation |
| `/checklists` | Published versions and questions; administrator template creation |
| `/restrictions`, `/licenses` | Inspector/admin list and administrator creation |
| `/users` | Administrators list users and create permitted roles; inspectors see themselves |
| `/notifications` | Current user's notifications |
| `/audit-logs` | HAC administrator audit history |
| `/settings` | Implemented runtime policy display, not a settings-update API |
| `/reports` | Inspector/HAC-only scoped list of retained report artifacts |

Product creation requires `name`, `brandId`, `manufacturerId`, and at least one `variants` entry with `name` and unique `sku`. Optional fields include `itemCode`, `supplierId`, `type` (`PRODUCT` or `RAW_MATERIAL`), category, ingredients, origin, description and `isDemo`. New records begin as `DRAFT`; certification is a separate controlled process. Duplicate normalized product/brand/manufacturer combinations, SKUs and barcodes are constrained.

Certificate creation requires `number`, `holderId`, `issuer`, `issuedAt`, `effectiveAt`, `expiresAt`, and non-empty `scopes` containing `productId` and optional `variantId`, `facilityId`, `requiresCompanyRelationship`, `description`. Optional `supersedesId` links a renewal. Initial status is `PENDING` unless an authorized administrator explicitly records `ACTIVE`. This API captures scope metadata; it does not establish a public legal HAC policy.

Additional administrator links:

- `POST /company-items`: `{companyId,productId,relationship?,effectiveAt?,expiresAt?}`.
- `POST /assignments`: `{companyId,userId}` assigns an authorized active inspector.
- `POST /notifications/{id}/read` marks the current user's record read.
- `POST /jobs/expiry` runs deduplicated internal certificate-expiry notification checks. An external scheduler is not installed automatically.

## Verification and inspection

`POST /verification` takes `companyId`, optional `productId`, `variantId`, `locationId`, observed brand/manufacturer/barcode/variant, physical expiry, and `identityConfirmed`. The backend evaluates current authoritative data and returns multiple `outcomes`, explanatory `rules`, certificate references, `evaluatedAt`, `ruleVersion`, and `masterDataVersion`. This preview does not save an observation.

| Method | Path | Purpose and key fields |
|---|---|---|
| GET/POST | `/inspections` | List; schedule `{companyId,locationId,inspectorId,scheduledAt,checklistVersionId,type?,priority?,objectives?}` |
| GET | `/inspections/{id}` | Assigned visit, observations, questions/responses, findings, evidence and declarations |
| POST | `/inspections/{id}/start` | Start a scheduled inspection; capture actual time and master-data marker |
| POST | `/inspections/{id}/observations` | Save product/variant identity, physical observations and server-calculated verification |
| POST | `/inspections/{id}/unknown` | Record an unlisted inspection-only observation and finding; never creates a master product |
| POST | `/inspections/{id}/checklist` | `{questionId,answer,notes?}`; validates answer type and evidence references |
| POST | `/inspections/{id}/reconcile` | `{version,acknowledge:true}` re-evaluates sources, audits changes and invalidates declarations |
| POST | `/inspections/{id}/sign` | `{name,role,signature?,reason?}` with `INSPECTOR` or `COMPANY_REPRESENTATIVE` |
| POST | `/inspections/{id}/submit` | `{version,declaration:true}`; validates and freezes the snapshot |
| POST | `/inspections/{id}/review` | HAC administrator `{decision:"APPROVED"|"CLARIFICATION_REQUIRED",reason}` |

An observation requires `clientMutationId` (8–100 characters) and `conclusion`; accepted fields include `version`, `productId`, `variantId`, `observedName`, `observedBrand`, `observedManufacturer`, `observedBarcode`, `observedVariant`, `identityConfirmed`, `physicalExpiry`, `manufactureDate`, `batch`, `quantity`, `storageLocation`, `notes`, `overrideReason` and optional `recognitionPredictionId`. The prediction reference must belong to the acting inspector and this inspection; it can confirm only one observation. The saved snapshot retains the original prediction/model and accepted product. Reusing a mutation key with different content is rejected. Approval-like conclusions that contradict calculated issues require a recorded reason; they do not change certification records. Saved content changes invalidate prior declarations. Submitted observations cannot be edited through these handlers.

`unknown` requires a multipart photo, `name`, observed `brandName`, `kind` and `clientMutationId`; additional identity/physical fields are described below. It returns `{observation,catalogueChanged:false}`. The observation has no master product link. Reusing a mutation key with different content is rejected.


`submit` still requires `{version,declaration:true}`. The assigned supervisor may confirm electronically without a drawn signature; a representative signature is optional. An administrator cannot create an inspector declaration on another user's behalf. Authoritative-source reconciliation and snapshot immutability remain enforced.

`GET /catalogue-search?q=...` returns at most 12 lightweight master product matches, or one by `id`. `GET /inspections/{id}/mobile` returns a company-scoped compact workspace and saved results.

Administrator-only `GET /ai/training-library?datasetId=...&productId=...` returns per-item image/group counts and the latest 24 private previews. `GET /ai/training-jobs?datasetId=...` returns job metadata. `POST /ai/training-jobs` accepts `{action:"start",datasetId}`, `{action:"step",modelId}` or `{action:"cancel",modelId}`. Steps have a compare-and-swap lease, reuse cached real embeddings and persist progress. Training uses independent grouped partitions and training-only bounded prototypes; publication remains the existing explicit quality-gated administrator endpoint.


## Cases and controlled transitions

`GET` and `POST` are implemented for `/investigations`, `/complaints`, `/non-conformities`, `/corrective-actions`; detail GET is also available. Case creation takes company, optional inspection/product/observation references, title and description; priority, due date, assignment and severity apply where supported. References must belong to the same company and inspection. Company users can submit permitted complaints and corrective responses for their company; investigations and non-conformities require inspector/HAC roles.

`POST /{resource}/{id}/transition` records `{status,reason}` and supports the handler's allowed state transitions. Final decisions and corrective-action review require HAC administrator roles. Corrective-action creation requires `nonConformityId`, `rootCause`, `proposedAction`; optional title/evidence description/due date are supported. Closing a non-conformity requires an accepted corrective action. `POST /certificates/{id}/transition` and `/products/{id}/transition` similarly enforce administrator-controlled states and reason capture.

## Recognition, evidence and downloads

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/ai/datasets` | Administrator dataset list/create `{name,description?}` |
| GET | `/ai/datasets/{id}` | Samples, quality metadata and model history |
| POST | `/ai/datasets/{id}/images` | Multipart `file`, `captureGroup`, optional `productId` and `variantId`; null product means background |
| GET/DELETE | `/ai/images/{id}` | Authorized sample retrieval/removal; published provenance is retained |
| POST | `/ai/datasets/{id}/train` | Actual TensorFlow features/index/evaluation, optional threshold and margin |
| GET | `/ai/models`, `/ai/models/{id}` | Administrator model history and actual artifacts |
| POST | `/ai/models/{id}/publish`, `/rollback` | Administrator publication gate/rollback |
| POST | `/ai/models/{id}/archive` | Administrator `{reason}` archives a version and retains source provenance |
| GET | `/ai/published` | Current published artifact for inspectors |
| POST | `/ai/predict` | `{embedding,extractorVersion,inspectionId?,modelVersionId?}`; actual index ranking, uncertainty and recorded version |
| POST | `/evidence` | Private, validated inspection image upload |
| GET | `/evidence/{id}` | Authorized integrity-checked image |
| GET | `/reports/{inspectionId}?format=pdf|xlsx|metadata` | Internal inspector/HAC controlled document/download metadata |

Explicit `modelVersionId` testing is administrator-only. Recognition does not approve a product. See `AI_MODEL_ARCHITECTURE.md` for minimum capture-group diversity and honest evaluation limits; see `REPORT_SPECIFICATION.md` for upload sizes, storage, hashes and report content.

### Catalogue photos and unlisted photo observations

- `GET /catalogue-images/{product|company}/{id}`: authenticated private display image, byte-hash verified; company access is checked for logos.
- `POST /catalogue-images/{product|company}/{id}`: HAC administrator multipart upload with `file` (JPEG/PNG, max 8 MB); re-encoded privately. Returns `{imageUrl}`. Does not change approval or train the model.
- `DELETE /catalogue-images/{product|company}/{id}`: HAC administrator removes the current display image.
- Catalogue/search, mobile inspection and prediction responses include `imageUrl` when present. List searches load lean product metadata and only the raw-material expiry summary, not full certificate/source histories.
- `POST /inspections/{id}/unknown` now requires multipart form data: `file`, `name`, `brandName`, `kind`, `clientMutationId`; optional `manufacturerName`, `barcode`, `batch`, `quantity`, `physicalExpiry` (YYYY-MM-DD), `description`. Photo and inspection-only observation commit atomically. JSON-only requests receive `PHOTO_REQUIRED`.
- `/observations` requires an existing `productId`; use `/unknown` for photographed unlisted records. `ALREADY_INSPECTED` rejects a duplicate product identity across variants/mutation keys. A database unique index also protects concurrent inserts. Exact retry keys retain the existing idempotency checks.

### Mobile review and scanner update

- `POST /inspections/{id}/remove-item`: `{observationId,version}`; assigned supervisor/admin, draft only. Uses optimistic version locking, clears signatures and retains formal cases/audit references. Submitted inspections cannot be edited.
- Signing accepts the current inspection `version`; a stale version is rejected. A genuine drawn signature is optional for submission.
- `POST /ai/capture`: authenticated inspector/admin multipart `file` (JPEG/PNG/WebP, max 8 MB), optional `inspectionId` and `modelVersionId`. Validates image bytes and dimensions; extracts real features and optionally suppresses a reliable foreground background. Returns persisted recognition metadata, candidates, guidance and processing flags. Raw frames are transient. Explicit model versions are administrator-only.
- `/ai/predict` and `/ai/capture` return up to ten distinct products at similarity >=0.75. Recognition remains human-confirmed and does not grant approval.
- `/ai/scan-test` returns authenticated HTTP 410 `FEATURE_REMOVED`; no catalogue seeding is performed.
- Catalogue search uses parameterised SQL with bounded pagination and company scoping. Missing optional display/source-summary tables do not hide product identities. Wrapped Prisma P2039/P2010 errors return a safe `DATABASE_QUERY_FAILED` response and log structured driver codes without query text or credentials.
