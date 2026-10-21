# Implementation security review

Reviewed the initial domain router and inspection service while implementation was in progress. These are source-review observations, not a penetration-test report. Root owns the domain files; this document does not assert a fix unless verified below.

## Findings reported to the implementation owner

1. **Nested product associations can expose other company names.** The product include graph returns every company-item association even when a company user can only read one of those companies. Filter nested `companies` for nonadministrative users, or return only the central product identity and the current company's relationship. A collection's outer scope does not authorize every nested association.

2. **Reused observation keys need payload conflict detection.** A repeated `clientMutationId` currently returns the original saved observation without checking that the incoming fields match. Idempotent exact retries should return that observation; a changed payload under the same key should fail with an explicit conflict. This prevents an offline editor from falsely believing new values were saved.

3. **Authority reconciliation and snapshot construction have a consistency gap.** Submission loads the inspection and revalidates authority records before beginning the transaction that locks the draft. The draft version protects observations/checklists/signatures modified through the service, but does not protect certificate, restriction or master-data changes during reconciliation. Also, comparison of only outcome arrays does not detect a different certificate/source reference with the same outcome. Reconciliation should read authority records in the same consistent transaction as the final snapshot and expose changed source references/version to the inspector. A product may remain approved while its legal basis changes.

4. **Question evidence requirements are inspection-wide.** A failed question's mandatory evidence check accepts any evidence in the inspection, rather than evidence linked to that answer. Require an answer-evidence relation or explicit linked IDs for policies that require proof of the specific answer. This is an operational integrity limitation.

5. **Signature representation must be described accurately.** The inspector endpoint accepts a typed-name declaration without a drawn signature; PNG syntax is checked but bytes are not decoded. Do not claim independently verified signer identity or a regulated digital signature. If drawn signatures are mandatory HAC policy, require and validate them; representative refusal must remain separately recorded.

6. **Resource-size limits are applied after body buffering.** The generic JSON helper reads the full body before applying its 1 MB limit; the login route now uses a bounded streaming reader with a 16 KB cap, verified by unit tests. Enforce upstream request-size limits and bounded reads before public exposure. File routes have their own validation and must be reviewed separately.

7. **Scheduling conflicts need stronger concurrent protection.** The transaction checks for an existing nearby visit and creates one, but concurrent schedules can both see no matching visit. Serialize planning by locking the inspector row or use an appropriate serializable retry strategy. This is a scheduling integrity issue.

## Tests

`tests/security.test.ts` and `tests/auth-route.test.ts` exercise authentication, CSRF, permission helpers, session expiry and audit redaction. `tests/api.integration.ts` is an explicitly enabled local HTTP runner against private, randomly generated development credentials. It creates distinct fictional company/inspection fixtures and retains them for review; it does not delete historical records. See `.local/api-integration-results.json` after execution for actual results. A saved runner is not evidence of a passing integration run.

## Resolutions applied and verified

Nested product-company relationships now apply the same accessible-company filter as their outer record. Mutation replay normalizes and compares every persisted observation field, including expiry/manufacture dates, observed name and documented override notes; changed payloads receive an explicit conflict. Submission reads authoritative sources inside a serializable transaction and compares source fingerprints as well as outcomes. Explicit reconciliation updates draft verification with audit history and invalidates declarations. Evidence and linked draft cases also increment the inspection version and invalidate signatures. Full internal reports/evidence/investigations require HAC/inspector roles; company users receive a restricted schedule/detail view instead. Body reads are bounded before full allocation. Signature images pass the same safe decoding/re-encoding path as evidence. The live HTTP runner passed source-change/reconciliation, signature invalidation, immutable submission and role-isolation checks after these changes.
