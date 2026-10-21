# Offline and mobile implementation status

## Browser offline draft helper

`web/src/lib/offline.ts` implements AES-256-GCM encrypted observation drafts in IndexedDB. Keys are nonextractable WebCrypto keys held only in the current browser tab's memory. An authenticated account must unlock the queue. Account hashes partition ciphertext, and authenticated encryption binds each draft to its account and identifier. The helper stores no password, session cookie, plaintext observation, or encryption key.

Every queued observation has a stable client mutation ID, cached inspection version, cached HAC data version, and explicit `REQUIRES_ONLINE_REVALIDATION` status. It does not calculate or authorize certification offline. Synchronization first checks the current server account, confirms the inspection remains editable, detects previously committed mutation IDs, checks the expected version, then posts through the ordinary server observation endpoint. Version conflicts and server validation stop synchronization and preserve remaining ciphertext. Final inspection submission is an online operation.

The helper increments expected versions for sequential queued observations. Other offline mutations (checklists, signatures, evidence, investigations) are not queued by this helper. A concurrent update requires an explicit online reconciliation; the helper does not silently merge or overwrite.

**Deliberate current limitation:** encryption keys do not survive page reload, browser termination, or logout. Keep the original inspection tab open until its queue synchronizes. Ciphertext from a lost tab key cannot be recovered by a later session. Decryption failure is reported explicitly as `KEY_UNAVAILABLE`; drafts are not silently discarded. This is not durable offline inspection support. Production offline operation still needs a reviewed device-bound key lifecycle, authenticated offline lease, recoverable encrypted data, conflict resolution UI, evidence queue, and end-to-end browser tests. UI integration status is recorded separately in `IMPLEMENTATION_STATUS.md`.

`clearOfflineSession()` explicitly removes the current account's queued ciphertext and drops the memory key. `lockOfflineSession()` drops only the key. Applications should warn about pending changes before logout or reload and must not present queued observations as official HAC decisions.

## PWA shell

The public service worker caches only the public offline fallback, manifest, and icon. It never caches authenticated HTML, APIs, evidence, certificates, or product records. A failed navigation displays a connection message. This is an installable shell foundation, not offline restoration of authenticated inspections or cached inference models. Registration requires the `PwaRegistration` component in the root layout, plus manifest metadata.

## Flutter Android source

`hac-management-system/mobile/` contains a Flutter source scaffold using the same cookie-authenticated REST API. It provides login, assigned inspections, start inspection, manual catalogue/barcode lookup, exact variant selection, authoritative verification, and idempotent observation submission with a version check. Session credentials stay in memory and production transport requires HTTPS.

Flutter, Dart, and Android tooling were unavailable, so no native build, analyzer run, device test, camera test, or release artifact is claimed. Platform directories must be generated with Flutter. Native camera recognition, TFLite export/inference, offline encryption, synchronization, evidence, checklists, declarations, submission, reports, and accessible device testing remain tasks. The PWA remains the operational client for those implemented web workflows.
