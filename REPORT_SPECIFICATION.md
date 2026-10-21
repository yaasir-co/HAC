# Inspection reports and private evidence

The report endpoint reads saved MySQL inspection records. Submitted inspections render from their immutable submission snapshot; a subsequent review decision is shown with its recorded reviewer and date. Neither image recognition suggestions nor inspector conclusions are presented as official certification decisions.

## API

- `GET /api/v1/reports/{inspectionId}?format=pdf` generates or retrieves the PDF for the inspection's current version.
- `GET /api/v1/reports/{inspectionId}?format=xlsx` exports the same record to an Excel workbook.
- `GET /api/v1/reports/{inspectionId}?format=metadata` returns retained report references, revisions, snapshot hashes, artifact hashes and generation dates. This endpoint requires authentication and company access.
- `POST /api/v1/evidence` accepts multipart fields `file`, `inspectionId`, optional `observationId`, `description`, and ISO `capturedAt`. Cookie-authenticated writes require the application's `Origin` header.
- `GET /api/v1/evidence/{id}` returns an authorized image after verifying its stored hash.

Full internal reports and evidence downloads are available only to HAC administrators and supervisors/auditors assigned to the company. Company-facing redacted exports and evidence-sharing visibility policies remain pending; company administrator/staff accounts cannot download these internal artifacts. Evidence changes require the assigned inspector or an HAC administrator and an inspection in progress.

## Document structure

PDFs use A4 portrait pages with landscape detailed product tables, repeating table headings, wrapped cells, row continuation, page numbers, controlled references, revision labels, and a demonstration warning for fictional records. The report contains:

1. Company, location, schedule, inspector, status, issue date, and document-reference QR code.
2. Counts from saved observations, including a notice that simultaneous issues overlap.
3. Detailed product verification, certificate information, physical expiry, notes, and evidence references.
4. Stored verification rules, actual and expected values, source references, and reasons.
5. General checklist responses.
6. Findings and non-conformities.
7. Investigations and follow-up.
8. Photographic evidence appendix.
9. Declarations, stored signature images or recorded unavailability/refusal reasons, and review metadata.

The QR encodes a document reference, not a public record URL. The authenticated metadata API supplies integrity hashes without exposing private storage keys. The PDF does not claim a public authenticity service or a cryptographic identity signature.

Each artifact is keyed by `(inspectionId, inspection.version, format)`. Once created, its bytes are reused; the implementation does not silently replace a missing or corrupted retained report. Every generated artifact has a SHA-256 integrity hash and an audit event. Draft reports carry a visible draft watermark. Formal business amendment approval remains pending; versioned retention does not constitute that workflow.

Excel workbooks contain inspection metadata, product observations, checklist answers, findings, investigations, non-conformities, evidence references and signatures. Values beginning with `=` are retained as string values rather than spreadsheet formula objects.

## Storage and evidence controls

`HAC_STORAGE_PATH` defaults to `.local/storage` under the web working directory. Files reside outside the public directory under random opaque keys. Uploads accept only decoded JPEG or PNG images whose magic bytes match the declared MIME, up to 8 MB, with a 32-megapixel decode limit. Images are re-encoded, stripped of EXIF metadata and resized to at most 2400 pixels per side. A stream-size cap also bounds multipart requests without a `Content-Length` header.

Uploads bind any observation to the same inspection and use optimistic inspection-version locking, preventing uploads racing with submission from silently changing a submitted snapshot. Evidence has no delete route. Report appendices verify evidence hashes before embedding; unavailable or mismatched evidence is explicitly identified as unavailable.

Back up the database and private storage together. Local filesystem permissions alone do not provide storage encryption or an external immutable archive.

## Verified and pending

Automated tests generate a 130-observation report and verify pagination, A4 dimensions, landscape detail pages, the final observation, saved investigation and declaration text, draft marking, real image embedding, spreadsheet record values, upload validation, metadata removal, traversal rejection, access denial and retained-artifact integrity checks.

English and Latin-1 text are supported by the current embedded PDF font. Sinhala, Tamil and other font coverage requires a licensed Unicode font and font-embedding implementation; unsupported glyphs are rendered as `?` while original values remain in the database. Full report PDFs and XLSX exports are implemented. Separate evidence-only, investigation-only, non-conformity-only and certificate-expiry report layouts are not implemented. Evidence attachments currently support images only. A stored PNG signature can be rendered; typed declarations and refusal reasons are kept distinct from image signatures.
