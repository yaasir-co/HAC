# Run HAC from GitHub on Hostinger

Use this guide for a direct GitHub import into Hostinger Web App. Windows, Docker, `setup:local` and the demonstration seed are not part of hosted setup. These instructions do not change the hosting account or deploy anything automatically.

## Fix the current sign-in error

The reported `TypeError: Invalid URL` / `ERR_INVALID_URL` during sign-in comes from an invalid `APP_ORIGIN`. In the application's private environment settings, set `APP_ORIGIN` to the site's actual HTTPS origin: `https://` followed by the exact hostname shown in the browser. Include a nondefault port only if the site actually uses one. Do not include quote characters, spaces, `/login`, another path, or the variable name in its value. Use the same hostname when opening the application. `APP_URL` does not replace `APP_ORIGIN`.

Apply the environment change using the restart/redeploy operation available for the application. The origin fix resolves this URL error; database configuration and an existing administrator are separate requirements below. The setup fix also makes an invalid origin return a controlled `503 AUTH_CONFIGURATION_ERROR` and a static private log message rather than an uncaught URL exception.

## Import the branch containing the fixes

Merge the pull request containing the hosted-login setup changes into the branch Hostinger imports, or select that fix branch if branch selection is available. An open pull request does not update `main`. Confirm the build log's commit matches the intended revision.

Use these settings where the service exposes them:

| Setting | Value |
|---|---|
| Repository | `yaasir-co/HAC` |
| Application/root directory | Prefer `hac-management-system/web` when configurable |
| Node.js | 24.19 or newer within Node 24, for build and runtime |
| Install command | `npm ci --include=dev` |
| Normal build command | `npm run build` |
| Start command | `npm start` |

If an application-directory setting is unavailable, the repository-root scripts forward these commands to the web application. A root manifest can be detected as generic Node.js; a Next.js preset should use the nested application directory where possible. Keep `npm start` where a custom start command is supported: it starts the built standalone server, binds to all interfaces and respects the host-provided `PORT`. Do not substitute a static export or `next start` for this startup helper.

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

## Apply the schema, check it, and create the first administrator

The following commands become available from either the repository root or `hac-management-system/web` after the setup fixes are in the selected branch. Run them only against the intended database. Normal installation/build does not apply migrations or create users.

Use an application shell or SSH if the service offers one and it provides the application checkout with its installed build dependencies. Run:

```bash
npm run db:migrate
npm run db:check
```

`db:migrate` applies committed versioned Prisma migrations. Review pending migrations and back up a database with retained data before applying changes. An existing validated database must not be reset or replaced to fix login. If existing tables lack the expected migration history, stop and review their schema/history instead of forcing a reset. Do not use the local migration fallback on Hostinger.

`db:check` tests connectivity, checks the authentication tables and reports whether an active administrator exists. It prints diagnostic categories without printing the connection URI or password. Both `db:check` and `admin:create` generate the Prisma client before running, so they also work before the first application build. If an administrator already exists, use that account's saved credentials.

For a database containing **no users**, temporarily set these private environment variables:

| Variable | Purpose |
|---|---|
| `HAC_ADMIN_EMAIL` | The first administrator's real sign-in email |
| `HAC_ADMIN_PASSWORD` | A new private password containing 12 to 1024 characters |
| `HAC_ADMIN_NAME` | Optional display name; defaults to `HAC Administrator` |

Then run:

```bash
npm run admin:create
npm run db:check
```

The command creates one active `HAC_ADMIN` with a hashed password and an audit record. It refuses to run if **any user** already exists, including an inactive or non-administrator user. It never overwrites users, promotes an existing account or resets a password. Remove the temporary `HAC_ADMIN_EMAIL`, `HAC_ADMIN_PASSWORD` and `HAC_ADMIN_NAME` settings after success; retain the credentials privately and sign in at the configured origin.

### If the service provides no shell

Only if the build environment can reach the intended database and receives the private database and one-time administrator settings, temporarily replace the normal build command with:

```bash
npm run db:migrate && npm run db:check && npm run admin:create && npm run build
```

This is a one-time initialization path for an empty user table, not a recurring deployment command. After it succeeds, immediately restore `npm run build` and remove the temporary `HAC_ADMIN_*` settings before another deployment. The administrator command will deliberately fail on a later build once a user exists. If build-time database access or private environment variables are unavailable, use a supported private administration environment with database access instead; do not place secrets in source code or make an unauthenticated setup endpoint.

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
| Administrator creation refused because users exist | Use the existing account; this command is not password recovery |

Share only sanitized error categories when asking for help, never environment values, complete connection URIs or passwords. See [deployment and recovery](../DEPLOYMENT.md) for database privileges, backups and remaining production requirements.
