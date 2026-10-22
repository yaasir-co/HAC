# Run HAC from GitHub on Hostinger

Use this guide for a direct GitHub import into Hostinger Web App. Windows, Docker, `setup:local` and the demonstration seed are not part of hosted setup. These instructions do not change the hosting account or deploy anything automatically.

## Fix the current sign-in error

The reported `TypeError: Invalid URL` / `ERR_INVALID_URL` during sign-in comes from an invalid `APP_ORIGIN`. In the application's private environment settings, set `APP_ORIGIN` to the site's actual HTTPS origin: `https://` followed by the exact hostname shown in the browser. Include a nondefault port only if the site actually uses one. Do not include quote characters, spaces, `/login`, another path, or the variable name in its value. Use the same hostname when opening the application. `APP_URL` does not replace `APP_ORIGIN`.

Apply the environment change using the restart/redeploy operation available for the application. The origin fix resolves this URL error; database configuration and an existing administrator are separate requirements below. The setup fix also makes an invalid origin return a controlled `503 AUTH_CONFIGURATION_ERROR` and a static private log message rather than an uncaught URL exception.

## Import the branch containing the fixes

Merge the pull request containing the hosted-login setup changes into the branch Hostinger imports, or select that fix branch if branch selection is available. An open pull request does not update `main`. Confirm the build log's commit matches the intended revision.

In the GitHub import form, keep these settings:

| Setting | Value |
|---|---|
| Repository | `yaasir-co/HAC` |
| Framework preset | Next.js |
| Application/root directory | `hac-management-system/web` |
| Node.js | `24.x`; verify the actual version is at least 24.19 |
| Build command dropdown | `npm run build` |

The setup below uses the existing `npm run build` option; a custom build command is unnecessary. If installation/start commands are separately configurable, use `npm ci --include=dev` and `npm start`. The start helper runs the standalone server and respects the host-provided `PORT`. Repository-root commands also forward to the web application if a different import flow lacks an application-directory setting.

## Configure the real database and private runtime settings

Use the existing intended Hostinger MySQL database if it has already been created and validated. Enter its actual connection details privately; do not copy the local `.env.example`, workspace credentials or demonstration database URL.

| Variable | Value to supply privately |
|---|---|
| `DATABASE_URL` | MySQL connection URI containing the actual database username, password, reachable hostname, port and database name issued for this application |
| `APP_ORIGIN` | The exact HTTPS origin described above |
| `DEMO_MODE` | `false` |
| `HAC_STORAGE_PATH` | A writable persistent private directory for evidence and reports |
| `UPLOAD_DIR` | A writable persistent private directory for training images |

URL-encode special characters in the URI's username and password components; do not encode the complete connection URI. Characters such as `@`, `:`, `/`, `#`, `?` and `%` in a password must not be interpreted as URI separators. Enter the completed URI without surrounding quote characters. A database name is not its server hostname: use the separate hostname supplied for application-to-database connections, not the local development address `127.0.0.1:3307`. Confirm network access and the provider's TLS requirements; the current runtime adapter does not implement custom database TLS configuration by appending URI query parameters.

Keep private storage outside public assets and confirm it survives rebuilds/restarts. Relative storage paths belong to the web directory; use provider-supported persistent absolute paths when available. The start helper sets `NODE_ENV=production`. Database credentials and administrator setup values must never use `NEXT_PUBLIC_*` names.

## Initialize through the standard build command

This setup requires the new hosted-build changes in the branch Hostinger imports. The build environment must receive the private database settings and be able to reach that database. Runtime-only database access is insufficient for this path.

Review the committed migrations and back up any retained data first. An existing validated database must not be reset or replaced to fix login. If existing tables lack the expected migration history, review their schema/history before proceeding. Do not use the local migration fallback on Hostinger.

Temporarily add these private environment variables alongside the runtime settings:

| Variable | Purpose |
|---|---|
| `HAC_HOSTED_SETUP` | `true` to enable migrations and first-account setup during this build |
| `HAC_ADMIN_EMAIL` | The first administrator's real sign-in email |
| `HAC_ADMIN_PASSWORD` | A new private password containing 12 to 1024 characters |
| `HAC_ADMIN_NAME` | Optional display name; defaults to `HAC Administrator` |

Keep the build dropdown set to **`npm run build`**, then start the build using Hostinger's available deployment control. The opted-in build:

1. Generates the Prisma client and applies reviewed versioned migrations with `prisma migrate deploy`.
2. Checks the required authentication tables.
3. Creates one active `HAC_ADMIN` with a hashed password and audit record only when the user table is empty.
4. Continues with the Next.js build and standalone assets.

Build logs should show `Hosted setup explicitly enabled...`, `Prisma migrations completed successfully.` and `Authentication tables are present.`, then administrator creation or a message that existing accounts were preserved, followed by Next.js compilation. A failed migration/setup stage stops the build; correct the reported cause instead of resetting the database.

If the log instead says `Hosted database setup is disabled...`, the build did not receive an enabled flag; check that the private setting is available during the build.

If **any user** already exists, including an inactive or non-administrator user, hosted setup skips account creation and preserves all existing passwords. It does not promote an account or reset a password. A repeated opted-in build therefore does not fail merely because the first account was already created. Use the saved credentials for an existing administrator.

After a successful setup, remove `HAC_HOSTED_SETUP` or set it to `false`, and remove `HAC_ADMIN_EMAIL`, `HAC_ADMIN_PASSWORD` and `HAC_ADMIN_NAME`. Keep `npm run build` unchanged. With the flag unset or false, future builds generate/compile the application without connecting to or changing the database. Retain the administrator credentials privately and sign in at the configured HTTPS origin.

## Optional manual setup through a shell

If the service offers a shell/SSH with the application checkout and installed build dependencies, these commands work from either the repository root or `hac-management-system/web`:

```bash
npm run db:migrate
npm run db:check
```

`db:check` reports connectivity, authentication tables and active-administrator presence without printing connection credentials. For an empty user table, set the private `HAC_ADMIN_*` values above, run `npm run admin:create`, then remove them. The manual administrator command deliberately **refuses** if any user exists; it is not password recovery. Both private diagnostic/admin commands generate the Prisma client before running.

If build-time database access is unavailable, use this supported private administration path or another authorized environment with database access. Do not add secrets to source code or create an unauthenticated setup endpoint.

## Read the error category

| Error or private log category | Meaning / next step |
|---|---|
| `ERR_INVALID_URL` at sign-in in the older build; `AUTH_CONFIGURATION_ERROR` / invalid `APP_ORIGIN` log after the fix | Correct the full HTTPS origin and restart the application |
| `403 INVALID_ORIGIN` | The browser origin differs from the configured scheme, hostname or port |
| `DATABASE_CONFIG_INVALID` | Supply a complete real MySQL connection URI |
| `DATABASE_AUTHENTICATION_FAILED` | Check database username/password and URI encoding |
| `DATABASE_NOT_FOUND` | Check the actual database name |
| `DATABASE_SCHEMA_NOT_READY` | Review/apply missing migrations; do not reset retained data |
| `DATABASE_ACCESS_DENIED` | Check the database user's permissions |
| `DATABASE_UNAVAILABLE` | Check hostname, port, network access and connection limits |
| `DATABASE_TLS_FAILED` | Check provider TLS requirements and supported certificate configuration |
| `DATABASE_CHECK_FAILED` / other `500 INTERNAL_ERROR` | Inspect the private runtime logs; these generic responses do not prove a password is wrong |
| Manual administrator creation refused because users exist | Use the existing account; this command is not password recovery |

Share only sanitized error categories when asking for help, never environment values, complete connection URIs or passwords. See [deployment and recovery](../DEPLOYMENT.md) for database privileges, backups and remaining production requirements.

## PDF download permission errors (`EACCES`)

`EACCES` during report generation indicates a private filesystem permission problem, not an incorrect supervisor password. The database username is not necessarily the hosting account's filesystem username; do not construct `/home/...` from the database username.

This update tries the configured `HAC_STORAGE_PATH` first. On `EACCES`, `EPERM` or a read-only filesystem, it uses persistent storage under the running OS user's home: `~/.hac-private/<database-host-and-name-hash>/`. It stores evidence/reports with opaque filenames, private permissions and the same database file keys. Training uploads also use the fallback if `UPLOAD_DIR/ai` is unwritable. It never substitutes temporary `/tmp` storage or places files in `public_html`.

Prefer setting `HAC_STORAGE_PATH` and `UPLOAD_DIR` to persistent directories actually owned/writable by the Node application user. Optionally set `HAC_STORAGE_FALLBACK_PATH` to another owned persistent **private** directory. Never use `chmod 777`. If both locations are unwritable, the response is `STORAGE_NOT_WRITABLE`; Hostinger must supply an owned persistent directory. Persistence of the user's home across deployments must be confirmed with Hostinger. Back up both primary and fallback roots and the upload directory alongside the database.

Existing files are read from either root and their hashes are verified. An already retained report that exists only in an inaccessible or deleted directory requires restoring/moving the original artifact to the matching private key; the system does not silently replace immutable reports. Redeploy the latest GitHub source after merging the implementation PR; restoring a previous deployment source will not include these changes. Keep the build command **npm run build**. The earlier supervisor-flow update introduced no further migration; the catalogue/image update below adds one.

## Catalogue photos, duplicate protection and install update

This update adds migration `20261021200000_catalogue_media_and_unique_items` (the `CatalogueImage` table and an observation identity key/index). Deploy the **latest GitHub source** after merging the PR. Set `HAC_HOSTED_SETUP=true` for that deployment and retain **npm run build**; this runs the existing reviewed migration process against the configured database. After a successful build, set the flag back to `false`. Existing accounts, training images/models, observations, submitted snapshots and PDF artifacts remain. Legacy duplicate rows are preserved; new additions of those identities are blocked.

A missing migration now returns a safe `DATABASE_SCHEMA_NOT_READY` message instead of an unexplained loading/error cycle. Check the deployment log for successful database setup. Existing administrators are not recreated or assigned a new password.

Keep the persistent private storage directories writable and backed up. Catalogue images use the same private opaque-key storage as evidence, are re-encoded to remove metadata, and are served only after authentication. A company logo is restricted to staff with company access. No uploaded images are placed under `public_html` or cached by the service worker.

The public app icons use the supplied circular HAC logo (PNG 192/512 and Apple touch icon). Supported Android browsers show the native install option after **Install app** is tapped. iPhone users receive Share → Add to Home Screen instructions. Browsers control install eligibility; a site cannot force native installation. The first-visit message is dismissed per browser/device, can be reopened with **Install HAC app**, and stays hidden in standalone mode. Existing installed apps may retain an OS-cached icon until their manifest/icon update is processed.

## Mobile review/scanner update

Deploy the latest GitHub source after merging the mobile review/scanner pull request; rebuilding “previous deployment source” retains old code. Keep the app root `hac-management-system/web` and `npm run build`. This update adds no migration. Existing earlier migrations still need to be applied using the documented hosted setup flag if pending.

P2039 is a Prisma driver wrapper and alone does not identify the underlying database cause. This update uses simpler parameterised catalogue queries and records safe structured `driverCodes` for wrapped failures. If search still fails after deploying the new source, provide the new error code/driverCodes line without credentials. Local disposable MySQL validation does not verify the live Hostinger database.

The v4 installed icon uses the supplied circular HAC artwork. The manifest is not service-worker cached; existing OS installations may require one remove/reinstall if their old icon persists.
