# HAC Intelligent Certification & Inspection

A new Next.js/TypeScript application at [`hac-management-system/web`](hac-management-system/web), with Prisma 7 and MySQL, built in this repository at the user's request. The original checkout contained only this README; there was no existing application or production data to migrate.

The application implements a real database-backed inspection workflow and keeps recognition, calculated verification, inspector observations, and authorized HAC decisions separate. Seeded companies, products, certificates, approvals and restrictions are **fictional demonstration data**. They make no statement about real Keells products or official HAC approval.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for verified functionality and remaining work. This is an initial integrated implementation, not a completed or certified production platform. Full requirements are preserved in [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md).

## Development

For Windows PowerShell, follow [the exact Windows installation instructions](docs/WINDOWS_SETUP.md). They use Node.js 24, Git for Windows and Docker Desktop with Linux containers. The scripts generate fresh local secrets; do not copy the workspace .env or credential files.

Requires Node.js 24, npm, and Docker Compose with a working Docker daemon. Run commands from `hac-management-system/web`:

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
- [Windows installation](docs/WINDOWS_SETUP.md)

No public deployment, production database changes, domain changes or external notifications were performed.
