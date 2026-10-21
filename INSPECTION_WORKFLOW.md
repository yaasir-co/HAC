# Inspection workflow

The primary supported workflow is an assigned product inspection using authoritative certification records. Seeded companies, certificates and approvals are fictional demonstrations; the Keells display name does not assert approval of any real company or product.

## Prepare a visit

An HAC administrator creates or selects companies, locations, brands, manufacturers, supplier records, products and variants. Certificates record the holder, effective dates and exact product/variant scope. An explicit retailer relationship is required only when the configured certificate scope says so: a manufacturer-held certificate can legitimately cover a retailer's product.

Assign the company to a supervisor or auditor. Supervisors can start their own visits immediately; selecting a published checklist or scheduling ahead is optional. Scheduling rejects an existing scheduled/in-progress visit for the same inspector within one hour. This is a fixed initial scheduling rule, not a full calendar availability engine.

AI recognition requires a separate preparation workflow: collect genuine, independently grouped photographs for one or more product classes plus background; train with actual TensorFlow feature extraction; review held-out metrics; and publish as an authorized HAC administrator. No trained recognition model is included in the seed. Without a published model, barcode and manual search remain usable.

## Conduct an inspection

1. Sign in, choose an assigned company and **Start inspection**. Scheduling and a checklist are optional.
2. Search by name, brand, barcode or item code. Matches update as you type. Tap the item, confirm **Yes, add**, and it is saved immediately with server-calculated approval checks. **No** makes no change.
3. Or open **Scan items**: the mobile camera opens as a popup, with up to three real model suggestions over the preview. Tap the physical item and confirm **Yes, add**. The item is saved and the camera continues for the next item. An administrator must first train and publish the product model; the separate experimental object test is not the HAC product model.
4. Use **Not in HAC list?** for an unlisted product/material. Enter its name and item type once. It is saved only on this inspection with an unlisted finding. This action creates no master product, brand, manufacturer, variant, retailer relationship or automatic approval.
5. Review the saved products/materials and their calculated results. **Finish inspection**, then **Confirm & submit inspection**, records the assigned supervisor's authenticated declaration. A drawn/uploaded signature and representative signature are optional. The system records no signature on another person's behalf. Checklists are optional.
6. The server checks the latest version and authoritative sources. Changed approval results require refreshing and reviewing checks before submission. Submission retains an immutable hashed snapshot.
7. **Download inspection PDF** downloads the report from that snapshot. Failures appear with a retryable message. Draft/export endpoints still support revision-specific PDF and Excel; original artifact hashes are checked on every download.

A normal inspector cannot edit authoritative approval, restriction or certificate records. A conclusion that disagrees with a calculated issue must capture the reason and does not change the official record.

## Review and follow-up

HAC administrators review submitted visits and record approval or a clarification request with a reason. Investigations and complaints use controlled status transitions. Company users can submit a corrective-action response containing root cause and proposed action; HAC reviewers accept, reject, request changes or reopen permitted cases. A non-conformity cannot close without an accepted corrective action.

The current review decision is recorded without altering submitted observation content. A full clarification-resubmission or formal amendment workflow is not implemented: a clarification request must not be interpreted as permission to silently reopen and edit the submitted snapshot. Detailed legal declarations, policy approval matrices and external communications need HAC confirmation before production use.

## Offline limits

The PWA has a public offline fallback. Its encrypted observation queue is session-bound: it can retain queued observations while that tab and its in-memory key remain alive. Synchronization requires an authenticated matching user, accessible in-progress inspection, unchanged expected version and server verification. Conflicts remain pending for online review rather than silently overwriting server records.

This is not complete offline field operation. Authenticated inspection packages, catalogue/model downloads, offline evidence upload, durable key recovery after reload and a Flutter Android client remain pending. Final submission always requires the server.
