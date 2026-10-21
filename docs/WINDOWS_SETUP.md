# Run HAC locally on Windows

These instructions use the existing implementation in the `codex/hac-implementation` branch of [yaasir-co/HAC](https://github.com/yaasir-co/HAC). They do not deploy or publish a running service. The initial implementation and automated checks were exercised in Linux; execution on a Windows machine has not been verified. See [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) for verified functionality and remaining work.

## 1. Install prerequisites

Use Windows 11 or a Windows version supported by your Docker Desktop release. Install:

- **Git for Windows** from [git-scm.com](https://git-scm.com/download/win).
- **Node.js 24.19 or newer in the Node 24 release line**, including npm, from [nodejs.org](https://nodejs.org/en/download). The application uses Node's `--use-env-proxy` option. Do not use an older Node release.
- **Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop/), with the **WSL 2 backend** and **Linux containers** enabled. Start Docker Desktop and wait until its engine is running.

If Docker Desktop requires WSL, follow its installer instructions. Installing WSL for the first time can require an **Administrator PowerShell** window and a restart:

```powershell
wsl --install
```

Do not rerun WSL installation merely because it is already installed. Enable virtualization in firmware if required by Docker Desktop. After installing prerequisites, open a **new ordinary PowerShell window** so updated PATH entries are available, then check:

```powershell
git --version
node --version
npm.cmd --version
docker version
docker compose version
```

`docker version` must report a responding server, not only a client. No separate Windows MySQL installation is needed: Docker Compose runs the dedicated MySQL 8.4 development database on `127.0.0.1:3307`.

## 2. Download the implementation branch

Choose a directory for your source code. The following creates a `source` directory in your Windows profile, then clones the implementation branch:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\source" | Out-Null
Set-Location "$env:USERPROFILE\source"
git clone --branch codex/hac-implementation --single-branch https://github.com/yaasir-co/HAC.git
Set-Location .\HAC\hac-management-system\web
```

If the repository is private, complete GitHub's normal browser/credential-manager sign-in when Git prompts. Do not put a token or password in the clone URL.

If you already have a clone, use its actual path instead. Check and preserve existing local changes before switching branches:

```powershell
Set-Location C:\path\to\HAC
git status --short
git fetch origin refs/heads/codex/hac-implementation:refs/remotes/origin/codex/hac-implementation
git switch codex/hac-implementation
Set-Location .\hac-management-system\web
```

If the local branch does not yet exist, use `git switch --track origin/codex/hac-implementation`. Stop if Git reports conflicting local changes; commit or otherwise preserve your work before switching. Do not use `reset --hard`, `clean`, or force checkout as an installation step.

## 3. Install dependencies and initialize the local database

Run every command below from `HAC\hac-management-system\web`, in order. Stop and investigate any command that fails rather than continuing with incomplete setup.

```powershell
npm.cmd ci
npm.cmd run setup:local
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run typecheck
npm.cmd test
```

**Do not copy `.env.example` to `.env` first.** `setup:local` creates a real local `.env` with randomly generated database passwords, creates private random demo login credentials, and starts MySQL. The example file contains a placeholder connection password and is documentation only.

The database target created by setup is the dedicated local `hac_dev` database. Seeding requires `DEMO_MODE=true` and adds fictional demonstration companies, certificates, products and users. The seed preserves existing records. It makes no official HAC approval statement about real Keells products.

The Prisma generation command uses the repository's pinned generator. The migration command applies the committed versioned SQL migrations; it does not reset the database. Downloads may require access to the npm registry and `binaries.prisma.sh`. Preserve TLS/checksum verification if your network blocks a download; do not disable it.

If an existing `.env` was manually created, inspect its target before running migrations or seeding. Do not point these development instructions at a production database. If it contains only example placeholders, move that file to a private backup outside the checkout and rerun setup; preserve any real credentials or retained database configuration.

## 4. Start the application and sign in

Keep the first PowerShell window open:

```powershell
npm.cmd run dev
```

When the server is ready, open:

**http://localhost:3000**

Use that exact hostname. The generated local `APP_ORIGIN` is `http://localhost:3000`; signing in through `127.0.0.1`, a LAN IP address, or a different port can fail origin checks.

Open a **second PowerShell window**, navigate to the same web directory, and view your private generated credentials:

```powershell
Set-Location "$env:USERPROFILE\source\HAC\hac-management-system\web"
notepad .local\credentials.json
```

Use the `admin` account to manage master data and the training studio, or the `supervisor` account to open assigned inspections. Passwords are generated individually on your machine; there is no shared default password. Do not commit, upload, paste into issues, or share `.env` or `.local\credentials.json`.

With the application still running, verify actual authenticated database-backed operation from that second window:

```powershell
npm.cmd run smoke:local
```

This check reads the private local credentials without printing their values, verifies database connectivity and saved demo records, calls authoritative verification, checks the dashboard, and logs out its temporary session.

## 5. Run optional integration and browser checks

Keep the server running in the first window. From the second window, run:

```powershell
npm.cmd run test:integration
npm.cmd run test:ai-api
```

These checks create and retain clearly fictional records in the local development database. They are not intended for production databases and do not reset retained records.

Install Playwright's Chromium once, then run the desktop/mobile browser checks:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The default browser configuration uses Playwright's installed browser on Windows. If you explicitly set `PLAYWRIGHT_CHROMIUM_PATH`, it must point to a valid Windows executable; do not copy the cloud environment's `/usr/bin/chromium` path.

For actual pretrained TensorFlow image extraction and the synthetic model lifecycle checks:

```powershell
npm.cmd run test:ai-pretrained
npm.cmd run test:ai-training
```

These need the official pretrained files at `storage.googleapis.com`. The training test uses generated illustrations of fictional products, exercises real extraction/training/evaluation/publication/prediction/rollback, and archives its test models afterward. It refuses to supersede a preexisting user-published model. Its metrics do **not** establish accuracy on real product packaging. A fresh seed deliberately contains no trained or published model; barcode and manual catalogue lookup remain available.

Browser camera access depends on permission and an available camera. Real target-device camera operation and field recognition still require independent testing. Windows local checks do not build or complete the Flutter application.

## 6. Stop and restart safely

Press **Ctrl+C** in the application window to stop the development server. To stop MySQL while keeping its data:

```powershell
docker compose stop
```

For a later session, start Docker Desktop, open PowerShell in the web directory, and run:

```powershell
npm.cmd run setup:local
npm.cmd run dev
```

Do not run `docker compose down -v` when retaining inspections: the `-v` flag removes the database volume. Do not delete `.local`, `uploads`, or `.env` as a routine troubleshooting step. The MySQL volume, private evidence/report directory, training-image directory and environment configuration together constitute retained local state.

You can create a private logical database backup with the supplied Docker-based helper:

```powershell
npm.cmd run backup:local
```

Also preserve `.local\storage` and `uploads` with the backup. The helper's `sh` command runs inside the Linux MySQL container; Windows does not need a host Bash installation. See [DEPLOYMENT.md](../DEPLOYMENT.md) before restoring anything. The guarded restore command refuses a nonempty local database; a backup must not be used to overwrite retained records casually.

## Optional local production build

Stop the development server first so port 3000 is available, then run:

```powershell
npm.cmd run build
npm.cmd start
```

This starts the built standalone Node server on your machine. It does not deploy to GitHub Pages, Hostinger, or any other public service. The default server binds all interfaces, so local firewall/network rules determine whether other devices can reach it; keep the exact configured origin when testing authentication.

## Troubleshooting

| Symptom | Action |
|---|---|
| PowerShell blocks `npm.ps1` | Use the documented `npm.cmd` and `npx.cmd` commands; changing system-wide execution policy is unnecessary. |
| `docker` is missing or cannot connect | Start Docker Desktop, confirm Linux containers/WSL 2, open a fresh terminal, and retry `docker version`. |
| Port 3307 is already in use | Inspect with `Get-NetTCPConnection -LocalPort 3307 -ErrorAction SilentlyContinue`. Identify the owning service before changing anything; do not stop an unrelated database blindly. The supplied local helpers expect port 3307. |
| Port 3000 is in use | Stop your earlier HAC server with Ctrl+C, or identify the other service before stopping it. An automatically selected different port will not match the default origin. |
| Login returns `INVALID_ORIGIN` | Open `http://localhost:3000`; confirm the local `.env` has `APP_ORIGIN="http://localhost:3000"`, then restart the Node server after a configuration change. |
| Database access is denied | Verify Docker setup completed and that `.env` has real generated values rather than `.env.example` placeholders. Preserve an existing database and credentials; do not remove volumes to hide an authentication mismatch. |
| A download fails behind a corporate proxy | Use your organization's supported proxy/trust configuration and allow the required official hosts. Do not disable TLS, certificate validation, or artifact checksums. |
| Browser tests cannot find Chromium | Run `npx.cmd playwright install chromium`; remove an incorrect Linux-only browser path override. |
| The scanner reports no published model | This is expected after a fresh seed. Use barcode/manual search, or collect independent images and train/review/publish a genuine model as an administrator. |

For remaining feature and production limitations, read [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md), [AI_MODEL_ARCHITECTURE.md](../AI_MODEL_ARCHITECTURE.md), and [SECURITY.md](../SECURITY.md).
