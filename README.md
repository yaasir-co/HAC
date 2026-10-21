# HAC Intelligent Certification & Inspection

A new Next.js/TypeScript application at [`hac-management-system/web`](hac-management-system/web), with Prisma 7 and MySQL, built in this repository at the user's request. The original checkout contained only this README; there was no existing application or production data to migrate.

The application implements a real database-backed inspection workflow and keeps recognition, calculated verification, inspector observations, and authorized HAC decisions separate. Seeded companies, products, certificates, approvals and restrictions are **fictional demonstration data**. They make no statement about real Keells products or official HAC approval.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for verified functionality and remaining work. This is an initial integrated implementation, not a completed or certified production platform. Full requirements are preserved in [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md).

For a direct GitHub import into Hostinger, use [Hostinger setup and sign-in troubleshooting](docs/HOSTINGER_SETUP.md), including the `APP_ORIGIN` fix and opt-in database/administrator setup through the standard `npm run build` dropdown option.

## Development

For Windows PowerShell, follow [the exact Windows installation instructions](docs/WINDOWS_SETUP.md). They use Node.js 24, Git for Windows and Docker Desktop with Linux containers. The scripts generate fresh local secrets; do not copy the workspace .env or credential files.

Requires Node.js 24.19 or newer within the Node 24 release line, npm, and Docker Compose with a working Docker daemon. Run commands from `hac-management-system/web`:

```bash
npm ci --cache /tmp/hac-npm-cache
npm run setup:local
```

Setup creates a dedicated local MySQL database and random development passwords, preserving existing local configuration. Demo login credentials are stored privately in `.local/credentials.json`; read that file locally to sign in. There are no shared default passwords. Never commit `.env`, credentials, uploads or backups.

Complete the real database/client setup, then run:

```bash
npm run db:generate
npm run db:restore:if-empty
npm run db:migrate
npm run db:seed
npm run typecheck
npm test
npm run dev
```

The standard Prisma deploy/status and schema drift checks passed against local MySQL. The database setup documentation also includes the guarded local fallback used while the engine download was initially blocked. Production migrations must be reviewed and run with the standard Prisma deployment workflow; the local fallback refuses remote databases.

## Build from the repository root

The application remains in `hac-management-system/web`. The root `package.json` forwards common commands there, so a build service that starts at the repository root can find the project. With Node.js 24.19 or newer within Node 24, run from `HAC`:

```bash
npm ci
npm run build
npm start
```

Root installation runs a locked installation in the web directory, including the development dependencies needed to compile the application. The build generates the Prisma client and prepares the standalone Next.js server. `npm start` requires the application's configured MySQL database, applied migrations and private environment configuration; complete the local setup above before starting it on your machine. With `HAC_HOSTED_SETUP` unset or false, installation and build do not connect to or change the database. Explicit hosted setup with `HAC_HOSTED_SETUP=true` applies migrations and creates a first administrator only for an empty user table; see [Hostinger setup](docs/HOSTINGER_SETUP.md). No demonstration seeding or service deployment is part of these scripts. Root `npm test`, `npm run typecheck` and `npm run dev` also forward to the web application.

If a build service supports an application/root directory, prefer `hac-management-system/web`, with install command `npm ci --include=dev`, build command `npm run build`, and start command `npm start`. This also lets the service detect Next.js directly. See [build-directory configuration](DEPLOYMENT.md#repository-root-builds-and-application-directory) for details. Follow [Windows setup](docs/WINDOWS_SETUP.md) for the complete PowerShell installation sequence.

## Inspection workflow

1. Sign in as the generated supervisor and open the fictional Keells visit.
2. Start the inspection. Identify products by catalogue search, exact barcode or the scanner when a validated recognition model is published.
3. Confirm the physical identity, compare observed details and inspect the server's explainable verification results.
4. Save observations and linked investigations. Record unknown products as provisional; they remain unapproved.
5. Attach photographs, answer the general checklist, reconcile changed approval sources, and sign the declarations.
6. Submit an immutable snapshot, download its PDF/XLSX, and use the administrator account for authorized review.

The AI studio stores real camera/uploaded images and implements TensorFlow MobileNet feature extraction, versioned similarity indexes and held-out evaluation. It never supplies invented predictions or metrics. Actual official MobileNet extraction, real training/evaluation, publication, prediction and rollback passed using clearly labeled generated image fixtures. These synthetic tests verify integration and do not establish field accuracy. Test models were archived. Representative product photographs and device validation remain required.

## Documentation

- [Architecture](ARCHITECTURE.md), [database](docs/DATABASE_SCHEMA.md), [REST API](API_DOCUMENTATION.md)
- [Inspection workflow](INSPECTION_WORKFLOW.md), [report specification](REPORT_SPECIFICATION.md)
- [AI architecture](AI_MODEL_ARCHITECTURE.md), [security](SECURITY.md)
- [Deployment and recovery](DEPLOYMENT.md), [testing](TESTING.md)
- [Implementation status](IMPLEMENTATION_STATUS.md), [offline/mobile status](docs/OFFLINE_AND_MOBILE.md)
- [Hostinger setup](docs/HOSTINGER_SETUP.md), [Windows installation](docs/WINDOWS_SETUP.md)

No public deployment, production database changes, domain changes or external notifications were performed.
