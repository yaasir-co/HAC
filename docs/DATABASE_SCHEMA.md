# Database schema and migration policy

The application uses Prisma 7 with the MariaDB driver adapter against MySQL 8.4. `web/prisma/schema.prisma` is the canonical schema. This repository originally contained only a README; the first migration creates new tables and does not transform an existing production system.

## Domains

| Domain | Models and relationships |
| --- | --- |
| Identity | User, Session, LoginRateLimit, AuditLog, Notification; expiring sessions store only token hashes |
| Companies | Company → CompanyLocation; SupervisorCompanyAssignment joins users and companies; CompanyItem joins central products and retailers/suppliers |
| Catalogue | Product → Brand, Manufacturer, optional Supplier; ProductVariant provides unique SKU and optional unique barcode |
| Certification | Certificate → holder Company, CertificateScope → exact Product/optional ProductVariant; optional manufacturing facility; CertificateHistory preserves status effective dates; renewal self-reference identifies replacements |
| Policy inputs | License separates commercial licenses from HAC certificates; RestrictionRecord requires an explicit authority/reference/effective period |
| Inspections | Inspection → company, location, assigned inspector, optional checklist version; Observation, ChecklistResponse, InspectionFinding, InspectionEvidence, InspectionSignature. Published question edits create a new version; removal retires future availability. |
| Follow-up | Investigation and InvestigationEvent, Complaint, NonConformity → CorrectiveAction |
| Reporting | InspectionReport stores immutable revision/format references, integrity hashes, private storage filenames and snapshot hash |
| Recognition | TrainingDataset → TrainingImage and ModelVersion; RecognitionPrediction records actual model version and candidates |

All database timestamps are UTC instants. Date display uses Asia/Colombo. Certificate expiry and physical shelf-life dates are distinct fields and rules. A company possessing a product does not imply it holds its manufacturing certificate.

## Integrity and concurrency

Foreign keys protect the main company/catalogue/certification/inspection relationships. Unique constraints prevent duplicate item codes, SKUs, barcodes, company-product pairs, company assignments and per-inspection checklist answers. A normalized name/brand/manufacturer compound key detects obvious duplicate master products. Observation `clientMutationId` uniquely identifies synchronized mutations. Inspection `version` supports optimistic concurrency; submitted observations are preserved in an inspection snapshot and integrity hash. Audit records have no update/delete application endpoint.

The database does not independently encode every workflow transition. Authorization, permitted state transitions, cross-object scope checks and submission immutability are enforced by the shared backend. Production operators must give the application a least-privilege account and restrict direct database access. Audit-log immutability against privileged database administrators requires external append-only archival, which remains a production hardening task.

## Local operation

From `hac-management-system/web`, run `npm run setup:local`, `npm run db:generate`, `npm run db:migrate:local`, then `npm run db:seed`. Setup generates private random credentials while preserving existing environment values and credentials. Missing nonsecret local defaults are appended. Docker exposes MySQL only on `127.0.0.1:3307` and persists data in a named volume. Do not use `docker compose down -v` when preserving local records.

`db:seed` requires `DEMO_MODE=true`. It creates missing demonstration records with stable IDs and leaves existing records unchanged. All seeded approvals, certificates and restrictions explicitly state that they are fictional; no official approval is asserted for real Keells products. No trained AI model is seeded.

## Changes and recovery

Use versioned additive migrations. Review generated SQL, back up before applying to an existing database, and use `prisma migrate deploy` for reviewed migrations. Do not use `migrate reset` or unreviewed `db push` against retained data. MySQL DDL is not generally transactionally reversible; recovery requires a tested backup and forward correction. Secrets belong in environment configuration, never in migrations or tracked seeds.

## Verified local fallback and native engine limitation

The restricted cloud network initially returned HTTP 403 for native engine checksum downloads from `binaries.prisma.sh`; the host later became reachable. Integrity checks were not disabled. The official schema-engine WASM does not support a MySQL driver adapter, so it cannot substitute for Prisma Migrate here.

`db:generate` uses the exact-version official Prisma internals/client-generator packages to validate with the shipped WASM parser and generate the real Prisma driver-adapter client. These internal APIs are pinned to Prisma 7.10.1 together with the CLI, client and adapter. Upgrade them together and rerun integration tests.

`db:migrate:local` is a separate, deliberately limited MySQL SQL runner, not a claim that Prisma Migrate executed. It only accepts localhost and the `hac_dev` database, refuses to baseline existing unknown tables, takes an advisory lock, rejects destructive statements, checks already-applied SHA-256 checksums and refuses unfinished migrations. The reviewed additive initial migration creates 38 tables plus indexes and foreign keys. It writes the Prisma-compatible `_prisma_migrations` ledger so a subsequently available native Prisma CLI can recognize the exact migration. MySQL DDL cannot be rolled back automatically; a partial failure remains recorded and requires inspection/recovery.

The standard `db:migrate` command remains `prisma migrate deploy` for reviewed deployment targets, once the native binary checksum/download destination is reachable. The local fallback intentionally refuses remote databases. Before deployment, run native migration status/deploy and a schema-drift check in staging; native `prisma migrate deploy` subsequently recognized the applied migration with no pending changes, and `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reported no difference against actual MySQL.

Current-instance evidence: real MySQL 8.4.11 answered a functional database query; the local migration applied 96 SQL statements and reran with no pending changes; seed ran twice without replacing existing records; the database-backed engine returned expected outcomes for approved manufacturer-held scope, brand mismatch, certificate expiry, physical expiry, variant mismatch, explicit restriction, missing company relationship, expired commercial license and valid renewal. No trained model was seeded.

## Retaining cloud development state

Docker named volumes may not survive a new cloud machine. `npm run backup:local` writes an ignored private `.local/backups/current.sql.gz` while leaving the live database intact. Keep this together with both private storage roots. `npm run db:restore:if-empty` restores a retained backup only into the provably empty localhost:3307/hac_dev database; it skips populated databases. The explicit `restore:local -- --restore-backup` command also refuses any existing tables. These local scripts do not authorize a production restore. Fresh-cloud-task restoration is not claimed merely because instructions are saved.
