# Development and deployment operations

No production service has been deployed. A successful build or local demonstration does not establish production readiness. Review `IMPLEMENTATION_STATUS.md` and `TESTING.md` for observed validation and remaining blockers.

## Local prerequisites and setup

Use the existing isolated checkout at `/workspace/HAC`; no additional worktree is required. The web directory is `hac-management-system/web`. The environment provides Node.js 24 and Docker. This application uses MySQL 8.4, Prisma 7 and a persistent private filesystem. GPU hardware is not required for the initial CPU embedding workflow.

```bash
cd /workspace/HAC/hac-management-system/web
npm ci --cache /tmp/hac-npm-cache
npm run setup:local
npm run db:generate
npm run db:restore:if-empty
npm run db:migrate
npm run db:seed
npm run dev
```

`setup:local` creates ignored local configuration with random database passwords and random demonstration login credentials, then starts a Docker Compose MySQL service. It preserves existing configuration. Keep `.env` and `.local/credentials.json` private; never commit them. The seed is development-only and requires `DEMO_MODE=true`. It labels fictional records and does not install a trained AI model.

The cloud proxy initially denied native Prisma downloads. The official pinned WASM client generator and a separately guarded local SQL runner allowed implementation and tests to proceed without disabling verification. Native artifact access later worked: standard `prisma migrate deploy` recognized the migration, and native schema comparison reported no drift against actual MySQL. The local fallback remains available as `db:migrate:local`, limited to localhost/hac_dev with advisory locking, checksums, unfinished-migration refusal and no destructive SQL. Production migration safety still requires reviewing and testing the actual target.

Run `npm run build` then `npm start` to validate the production Node server locally. The build copies public/static assets into the standalone output; the start helper loads external environment configuration and resolves private storage paths before starting it. Private data and environment files are explicitly excluded from file tracing. `GET /api/v1/health` is authenticated and must successfully execute a database query. Keep the process running through the platform's supported service supervisor in a real deployment; do not rely on a development terminal session.

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Private MySQL connection string; use a dedicated restricted application account |
| `APP_ORIGIN` | Exact externally visible origin, such as `https://inspection.example.org`; required for reliable proxy deployment and CSRF validation |
| `HAC_STORAGE_PATH` | Persistent evidence/report directory; default `.local/storage` in the web working directory |
| `UPLOAD_DIR` | Persistent AI training-image directory; default `uploads` |
| `DEMO_MODE` | Explicit opt-in for development demonstration seeding; keep false in production |
| `NODE_ENV` | `production` for production server and Secure session cookies |

`APP_URL` exists in initial local setup configuration but is not the authorization origin setting. No session signing secret is needed because opaque random session tokens are stored hashed in MySQL. Do not expose any database credentials in `NEXT_PUBLIC_*` variables. Store production values through the host's secure environment configuration, never in source control or chat.

Required outbound destinations depend on setup: npm registry for installation, the verified Prisma artifact host where the chosen CLI needs it, and `storage.googleapis.com` for the pinned official TensorFlow Layers model and weights. Browser devices also need the official model host on first inference load. No external paid AI API is required. A blocked model host must leave training/inference unavailable rather than substituted with sample results.

## Hostinger compatibility checklist to verify on the actual plan

The connected hosting account and plan have not been inspected. Before deploying, verify that the selected plan supports a persistent Node.js process and the required Node version, Next.js Node route handlers, configured environment variables, MySQL connectivity, private persistent storage outside public assets, sufficient upload/request limits, HTTPS and secure cookies, process restart/health monitoring, and scheduled jobs. Static-only hosting cannot run this backend.

The current synchronous training handler is bounded to 1,500 images and can exceed short request timeouts; suitable timeouts or a background worker are required. CPU resources and browser camera behavior need representative-device testing. Do not put private files in a public document root to work around a hosting limitation. If the plan cannot meet these requirements, use a compatible Node service/VPS with MySQL and persistent storage.

The expiry-notification handler is `POST /api/v1/jobs/expiry`, restricted to HAC administrators. An authenticated scheduler integration has not been provisioned; do not embed a human session cookie in a cron command. A least-privilege service-job authentication mechanism should be implemented before scheduled production operation.

## Database changes and least privilege

Apply only reviewed versioned migrations after taking a recoverable backup and testing the migration against a restored copy. `prisma migrate deploy` applies pending migration files; it does not justify resetting an existing database. Never use `migrate reset` or `db push --accept-data-loss` against retained user data.

Use a separate migrator account for DDL. The runtime account should have only the table-level permissions needed by application operations, with no grant, schema administration or user-management privileges. The current immutable-record protection is enforced by API workflows; database-level immutable audit archival and privilege hardening require production design and verification.

## Backup

Back up MySQL and both private file roots as one recoverable set. A logical database backup alone does not preserve evidence or generated report artifacts. During a maintenance window stop application writes and training/removal jobs while keeping MySQL running; capture the database and file copies, then resume service. For large deployments use a coordinated database/storage snapshot process instead.

A development Docker logical backup can use the container's existing environment without putting a password in command arguments:

```bash
cd /workspace/HAC/hac-management-system/web
backup_dir=".local/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
docker compose exec -T mysql sh -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysqldump --user="$MYSQL_USER" --single-transaction --no-tablespaces "$MYSQL_DATABASE"' > "$backup_dir/database.sql"
chmod 600 "$backup_dir/database.sql"
```

Copy the configured `HAC_STORAGE_PATH` and `UPLOAD_DIR` into that backup set with their relative structure, plus the migration revision and necessary non-secret configuration. For defaults, these are `.local/storage` and `uploads`; do not assume defaults when environment values differ. Record SHA-256 checksums of the backup artifacts. Encrypt backups using the organization's managed backup mechanism, restrict access and store a copy outside the application host. Do not include plaintext demonstration credentials in shared backup artifacts.

## Recovery rehearsal

Provision a separate empty MySQL instance/database and empty private storage roots. Restore the SQL with a restricted restore account configured through a secure MySQL option file, for example `mysql --defaults-extra-file=/secure/mysql-restore.cnf hac_restore_rehearsal < database.sql`. Restore file roots to their configured rehearsal locations. Point a separate application instance at those restored resources; never run this command against the active production database.

Verify migrations match, authenticate using a controlled rehearsal account, fetch an assigned submitted inspection, download retained PDFs and evidence, compare their SHA-256 values to database metadata, and check the audit history and report versions. Exercise a new draft only in the rehearsal database. Record recovery time and missing dependencies. Production cutover, credential rotation and any destructive cleanup require an explicit operator-approved recovery plan; no such operation has been performed here.

## Operational work still required

Configure structured centralized logs, alerting, capacity monitoring, disk usage limits, secret rotation, secure transport/trust settings for managed MySQL, a restore rehearsal, independent security review, representative recognition evaluation and actual hosting validation before a production release. User-facing password reset, MFA, mail delivery, durable background jobs and native Android distribution are not supplied by the initial setup.

## Local recovery evidence

`npm run backup:local` produced a private compressed logical snapshot. `npm run test:restore` restored it inside a separately created disposable MySQL container and verified the schema, saved observations and submitted snapshots before removing that container. It never overwrites the running database. The supplied `restore:local -- --restore-backup` command refuses a nonempty local database; `db:restore:if-empty` supports restoring retained cloud workspace data only when empty. This database-only test does not substitute for a coordinated production database-plus-file recovery rehearsal or prove restoration in a new cloud task.
