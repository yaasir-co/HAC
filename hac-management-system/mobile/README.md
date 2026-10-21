# HAC Inspector Android client — source scaffold

This is a structured Flutter client for the shared REST API. It contains session login/logout, assigned inspection listing, inspection start, catalogue/barcode search, manual product/variant confirmation, authoritative verification display, and saving observations with idempotency and optimistic versions.

**Status: not built or executed.** Flutter/Dart/Android SDKs are absent from the current environment. This source is not a validated Android release. Native camera recognition, barcode camera decoding, checklists, evidence, signatures, report downloads, offline storage and synchronization remain unfinished; the PWA provides the broader workflow.

On a workstation with Flutter stable and Android tooling:

```sh
cd hac-management-system/mobile
flutter create --platforms=android --project-name=hac_inspector .
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=HAC_API_URL=https://your-authorized-hac-host.example
```

Generate Android platform files without `--overwrite`; preserve `lib/`. No generated Gradle wrapper or Android platform files are claimed here. For an Android emulator using a local development server, `http://10.0.2.2:3000` is accepted by the Dart client but Android may require a development-only cleartext network configuration. Production must use HTTPS. Do not weaken the release network policy to enable local HTTP.

The cookie-session credential is retained only in process memory. This client does not persist passwords or tokens and disables automatic HTTP redirects. Server role checks and company assignments apply to all requests. `Origin` is set to the API origin for server CSRF validation. Use the deployed application's configured origin; no production credentials are embedded.

The server currently paginates inspection lists; this initial source loads the first 100 and filters to the current inspector unless the user is a HAC administrator. Production pagination and expired-session routing need further native UI work.
