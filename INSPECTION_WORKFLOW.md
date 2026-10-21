# Inspection workflow

The primary supported workflow is an assigned product inspection using authoritative certification records. Seeded companies, certificates and approvals are fictional demonstrations; the Keells display name does not assert approval of any real company or product.

## Prepare a visit

An HAC administrator creates or selects companies, locations, brands, manufacturers, supplier records, products and variants. Certificates record the holder, effective dates and exact product/variant scope. An explicit retailer relationship is required only when the configured certificate scope says so: a manufacturer-held certificate can legitimately cover a retailer's product.

Assign the company to a supervisor or auditor, select a published checklist version, and schedule the inspection. Scheduling rejects an existing scheduled/in-progress visit for the same inspector within one hour. This is a fixed initial scheduling rule, not a full calendar availability engine.

AI recognition requires a separate preparation workflow: collect genuine, independently grouped photographs for at least two product classes plus background; train with actual TensorFlow feature extraction; review held-out metrics; and publish as an authorized HAC administrator. No trained recognition model is included in the seed. Without a published model, barcode and manual search remain usable.

## Conduct an inspection

1. Sign in and open an assigned company's visit. Check the company, branch, planned time, checklist and previous records available in the portal.
2. Start the visit. The backend captures actual time, inspector context and a master-data marker.
3. Identify a product using manual search, an exact barcode, or real model suggestions when a published model is available. The top three visual similarities are identity suggestions only. An uncertain result requires further identification.
4. Select the exact product and variant. Review the backend verification result, applicable certificate, brand/manufacturer comparison and scope. Multiple issues remain visible together.
5. Confirm physical identity and record observed brand, manufacturer, barcode/variant, batch, quantity, shelf location, physical expiry and notes. Physical expiry is separate from certificate expiry. Date-only shelf-life values are interpreted through the business-date rule, not treated as HAC certificate dates.
6. Save with a unique client mutation key. The backend recalculates certification, creates discrepancy findings and binds the observation to the visit. Repeated scans remain in the same inspection.
7. Add private evidence photographs. Each observation reference must belong to this inspection; evidence is not publicly accessible.
8. Raise a linked investigation, complaint or non-conformity where appropriate. Unknown registration creates a provisional product and investigation; it neither certifies nor bans the product. Save the subsequent physical observation separately.
9. Answer required general checklist questions with the correct answer type. Conditional questions follow their configured dependency; configured adverse answers require notes/evidence before submission.
10. Review saved products, calculated results, observations, findings and evidence. Record the inspector declaration and company representative signature, or the documented reason that representative signature is unavailable. Changes to saved inspection content invalidate previous declarations.
11. Submit the latest inspection version with explicit declaration. Required answers/signatures and at least one observation must exist. The server reconciles recorded verification outcomes and refuses submission when a changed authoritative result needs review. It freezes a hashed JSON snapshot.
12. Download the revision-specific PDF or Excel report. Draft downloads carry a draft watermark; submitted reports use the submitted snapshot. Original artifacts are retained rather than silently overwritten.

A normal inspector cannot edit authoritative approval, restriction or certificate records. A conclusion that disagrees with a calculated issue must capture the reason and does not change the official record.

## Review and follow-up

HAC administrators review submitted visits and record approval or a clarification request with a reason. Investigations and complaints use controlled status transitions. Company users can submit a corrective-action response containing root cause and proposed action; HAC reviewers accept, reject, request changes or reopen permitted cases. A non-conformity cannot close without an accepted corrective action.

The current review decision is recorded without altering submitted observation content. A full clarification-resubmission or formal amendment workflow is not implemented: a clarification request must not be interpreted as permission to silently reopen and edit the submitted snapshot. Detailed legal declarations, policy approval matrices and external communications need HAC confirmation before production use.

## Offline limits

The PWA has a public offline fallback. Its encrypted observation queue is session-bound: it can retain queued observations while that tab and its in-memory key remain alive. Synchronization requires an authenticated matching user, accessible in-progress inspection, unchanged expected version and server verification. Conflicts remain pending for online review rather than silently overwriting server records.

This is not complete offline field operation. Authenticated inspection packages, catalogue/model downloads, offline evidence upload, durable key recovery after reload and a Flutter Android client remain pending. Final submission always requires the server.
