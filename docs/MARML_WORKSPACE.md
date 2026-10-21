# MARML workspace and supervisor inspections

The material import contains the 39 visible rows from the three supplied photographs: pages 1–3 of a 31-page list for Ceylon Agro Industries Ltd, plant 346 Negombo Road, Seeduwa, application PSA0135. The remaining pages were not supplied. Blank cells remain blank; unclear codes/addresses have review notes. No certificate numbers, issue dates, legal registration numbers or barcodes are invented.

## Install on Hostinger

Merge this update into the GitHub branch Hostinger imports. Temporarily set `HAC_HOSTED_SETUP=true` and deploy the latest source using **npm run build**. This applies the new migration while preserving existing accounts. An existing administrator does not need `HAC_ADMIN_*` settings again. After success remove the flag or set it to `false`.

Sign in as an HAC administrator and open **Administration → Workspace setup**. Review the company names and supervisor login addresses, then create the workspace records. Defaults use the reserved `supervisors.hac.test` domain because real addresses were not supplied; replace these editable login identifiers with intended addresses when available. Email delivery is not configured by this import.

| Supervisor | Initial company assignments |
|---|---|
| Yaasir | Keells; Cargills Food City |
| Imthad | Arpico; Lanka Sathosa |
| Farraj | SPAR Sri Lanka; Glomark |
| Mazhar | Laugfs Supermarkets; Ceylon Agro Industries |
| Imaath | Ceylon Biscuits; Maliban |

The import creates a main location per company and a published starter checklist. Only Ceylon Agro's source plant address was supplied; other addresses need confirmation. Company profiles do not assert that these companies hold HAC approval. The source company's identity remains bound to the supplied document.

Each new supervisor gets a different random password. Download the private credentials CSV immediately and share each account only with its intended supervisor. Passwords are stored hashed and are not available in later previews. Repeating the import preserves accounts, assignments and edited materials. Administrators can set a new supervisor password later; doing so ends that account's existing sessions.

## Inspect and download

Supervisors use **Start inspection** from the overview, company list or inspections screen. Choose an active assigned company and its location; a published checklist can be selected optionally. No scheduled inspection or separate inspection assignment is required. The server records the supervisor and start time; starting the same company/location resumes that supervisor's visit in progress. Another assigned company can be inspected independently.

Record material identities, observed labels/batches, physical expiry, quantities, storage, conclusions and notes. Add evidence, optional checklist answers and declarations/signatures before submitting. Unanswered checklist questions do not block submission. Submitted inspections retain the material details and verification results that were saved with them. See [Mobile inspections](MOBILE_INSPECTIONS.md) for live search, larger text and scanner testing.

The PDF starts with an A4 landscape MARML-style register: HAC block, company/location metadata, grouped supplier/certificate headings, material columns, wrapped rows, repeated headers and page numbers. Saved findings, explanations, checklist responses, evidence and signatures follow. Drafts are identified. The report records an inspection; it does not issue or renew certification. Existing retained PDF artifacts are preserved; new artifacts use the new layout.

## Edit through administration

Workspace setup has management tabs for company profiles/locations, supervisor names/login addresses/active status/two-company assignments, and all interpreted MARML fields/dates/review status. Changes are audited. Original transcribed rows and source metadata remain read-only. Edits do not rewrite submitted snapshots or retained PDFs.

Imported materials start as `SOURCE_LISTED_REQUIRES_REVIEW`. Printed dates are retained, including expired 2025/2026 entries. An administrator can verify a reviewed entry; that action does not extend its expiry. Source approval requires an unexpired date, the original named company, physical identity confirmation and the other checks. Renaming a company cannot transfer approval. Suspended/revoked entries remain blocked. Independently recorded certificate scopes are evaluated separately and take precedence over an older source-list reference.

The catalogue can be used to record observations at other companies, but this Ceylon Agro source does not automatically establish their approval. Verification shows scope, expiry and review findings. When authoritative material details change during an inspection, reconcile and review the results before signing again.
