# Security implementation and deployment requirements

This is a new implementation in an initially empty repository. It has not received an independent security audit and must not be represented as approved for production certification decisions.

## Implemented controls

Passwords use Node.js scrypt (N=32768, r=8, p=1, independent 128-bit random salts, 512-bit derived hashes). New passwords require at least 12 characters. Session cookies contain cryptographically random 256-bit opaque tokens; only SHA-256 token hashes are stored. Sessions expire after eight hours, and disabled users lose access on their next request. Cookies use HttpOnly, SameSite=Strict and, under NODE_ENV=production, Secure. No public signup or shared production credentials exist.

Cookie-authenticated writes require a matching Origin header; configure APP_ORIGIN to the canonical HTTPS origin behind a reverse proxy. Nonbrowser API clients must supply that origin too. Do not derive it from untrusted forwarded-host headers. Authentication responses use Cache-Control: no-store. Login request bodies are bounded to 16 KB while streaming, including requests without Content-Length. Login uses generic credential errors and performs scrypt work for unknown accounts. Persistent per-account rate limiting permits eight failed/in-flight attempts per 15-minute UTC window, resets the counter on successful password proof, and handles concurrent MySQL bucket creation without bypassing the limit; an administrator should configure edge-level source rate limiting as well. Expired login bucket cleanup is an operational task, and known email addresses can be temporarily rate-limited by attackers.

Permissions are enforced on the server. Administrative actions require an allowed role. Company-scoped objects must pass assertCompanyAccess; collection queries must filter accessibleCompanyIds. Supervisors and auditors need an unrevoked assignment. Company staff remain limited to their explicit company. New endpoints must use the same checks, including exports, evidence and model publishing.

Audit snapshots redact keys containing password, token, secret, cookie or credential. Application routes have no audit deletion API. For a production deployment, grant the runtime database principal INSERT and SELECT only on AuditLog, and use a separate migration principal. This is necessary to enforce immutability against application or credential compromise; application conventions alone do not provide tamper evidence.

## Outstanding security work

Password reset, privileged-user MFA, remote device/session administration, session lifetime policies, malware scanning, durable device-bound offline key management and a formal penetration test are not implemented by the authentication module. Do not improvise reset links or distribute a shared administrator password. Until a secure recovery workflow exists, an authorized operator must provision a new password through a controlled administrative process.

Configure TLS, the canonical application origin, a least-privilege database account, persistent private upload storage, request-size limits at the proxy and an edge rate limit before any public exposure. Never expose .env or .local/credentials.json. Development setup generates individual local credentials and stores them only in ignored local files. No default password is a production credential.

Reports, approval decisions and submitted inspections must retain historical snapshots; deploying a model must never update certification authority records. The project implementation-status document records limitations outside authentication.

## Reporting an issue

Report security concerns privately to the deployment owner. Do not publish personal information, evidence photographs, credentials, session tokens or live certificate records in an issue tracker.

## Dependency review observed during implementation

The production dependency audit initially flagged image-decoder vulnerabilities in sharp and a transitive ExcelJS UUID advisory. Sharp was upgraded to 0.35.5, and ExcelJS's compatible CommonJS UUID v4 dependency was overridden to 11.1.1; actual report/image suites were rerun. The subsequent production-only audit reported zero high/critical and three moderate entries in the TensorFlow.js → argparse → sprintf-js chain. The current upstream sprintf-js release remains affected by an unbounded formatting-precision advisory; this application does not accept or evaluate user-controlled sprintf format strings. A future upstream fix or a reviewed modular TensorFlow packaging change remains required. This audit is not a penetration test or a production readiness certification.
