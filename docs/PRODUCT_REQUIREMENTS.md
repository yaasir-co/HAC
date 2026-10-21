# MASTER CODEX PROMPT — HAC INTELLIGENT CERTIFICATION, PRODUCT RECOGNITION & INSPECTION PLATFORM

## 0. YOUR ROLE AND MISSION

Act as a team of world-class software architects, senior full-stack engineers, AI/ML engineers, mobile developers, cybersecurity engineers, database architects, UI/UX designers, QA engineers, and compliance workflow specialists.

You are responsible for transforming our existing HAC Halal Certification and Inspection Management System into a production-grade, enterprise-level digital platform.

This is not a university demonstration, a basic CRUD system, a static dashboard, or a prototype.

Build a complete, integrated, reliable and scalable product comparable in engineering quality, usability, security, and auditability to professional international certification and enterprise inspection platforms.

The system must support:

- HAC certification and approval management.
- Multiple companies, branches, manufacturers, suppliers, products, and raw materials.
- Company and supervisor assignments.
- Scheduled and unannounced inspections.
- Item-by-item inspection workflows.
- Live AI product recognition.
- Teachable Machine-style product image training.
- Barcode, QR, and optional OCR-assisted identification.
- Automatic checking against authoritative HAC approval records.
- Brand, manufacturer, SKU, and certificate discrepancy detection.
- Expired certificates, expired products, suspended approvals, and confirmed banned-item detection.
- Unknown-product registration.
- Investigation and complaint management.
- Non-conformities and corrective actions.
- Digital evidence collection.
- Complete inspection history.
- Professional PDF and Excel reporting.
- Real-time dashboards.
- Fully controlled role-based permissions.
- Web, mobile, and offline-capable inspection experiences.
- Enterprise security, traceability, and test coverage.

**Do not stop at a design proposal. Implement real functionality in the existing repository.**

---

## 1. EXISTING PROJECT — PRESERVE AND UPGRADE

Our existing project is located at:

`hac-management-system/web`

Current technology includes:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma 7
- MySQL
- Hostinger as a deployment target
- Local MySQL for development
- Responsive web/PWA architecture

Existing routes include:

- `/dashboard`
- `/companies`
- `/items`
- `/certificates`
- `/inspections`
- `/non-conformities`
- `/corrective-actions`
- `/reports`
- `/users`
- `/notifications`
- `/settings`
- `/login`

The repository already contains authentication foundations, user and permission models, company models, company APIs, shared layouts, and some dashboard components.

Some screens currently contain sample data or placeholders.

### Mandatory development instructions

1. Inspect the complete repository before changing anything.
2. Read the existing specifications, Prisma schema, routes, components, migrations, and configuration.
3. Preserve existing working features and historical data.
4. Identify incomplete functionality, placeholders, broken links, missing relationships, and security issues.
5. Extend the existing database through safe, versioned migrations.
6. Reuse existing models and components where appropriate.
7. Upgrade the existing web/PWA application instead of replacing everything unnecessarily.
8. Maintain compatibility with the selected hosting environment.
9. Preserve the earlier project specifications as historical context, but treat the expanded requirements in this prompt as the current product scope.
10. Never use a mock result where a real backend, database, or AI integration is required.

Create a proper shared REST API. The architecture must also support a Flutter Android application using the same backend. If a Flutter project already exists, integrate and complete it; otherwise create a structured mobile project alongside the web application without weakening the existing PWA.

Do not change production data, deploy publicly, or perform destructive database operations without explicit approval.

---

# PART A — PRODUCT VISION AND BUSINESS LOGIC

## 2. UNDERSTAND THE REAL HAC INSPECTION SCENARIO

This scenario is the most important requirement.

Assume HAC has assessed and registered three companies.

Example demonstration companies:

1. Keells — demonstration company.
2. Company B — demonstration company.
3. Company C — demonstration company.

These names and sample records are for demonstrating the application. Do not claim that real Keells products are HAC-approved unless verified official data has been entered by authorized HAC personnel.

Assume today a supervisor is scheduled to inspect Keells.

### Before visiting Keells

The supervisor logs into the application.

Their dashboard displays:

- Assigned companies.
- Today's planned inspections.
- Upcoming inspections.
- Pending approvals.
- Certificate expiry warnings.
- Open investigations.
- Outstanding non-conformities.
- Previous company inspection results.
- Notifications and priority actions.

Today's inspection list includes Keells.

The supervisor opens the Keells inspection and views:

- Company name.
- Branch or inspection location.
- Company registration information.
- Inspection reference.
- Inspection date and time.
- Inspector details.
- Inspection type.
- HAC certification scope.
- Approved product and raw material records.
- Previous inspection reports.
- Open complaints.
- Previous non-conformities.
- Certificates approaching expiry.
- Suspended or revoked approvals.
- Any products requiring special verification.

The supervisor selects **Start Inspection**.

The system records the actual start time, inspection user, selected location, applicable checklist version, and the HAC master-data version being used.

### During the visit

The supervisor walks through Keells and checks individual products or raw materials.

Each product may be identified using:

- Live AI camera recognition.
- Barcode scanning.
- QR code scanning.
- Product name search.
- HAC item code.
- Brand search.
- Manufacturer search.
- Supplier search.
- Certificate number.
- Manual entry.

After identification, the application must evaluate the product against HAC records and the company-specific approval scope.

**Never assume a product is HAC-approved merely because the AI recognizes its image.**

Recognition determines product identity. The official database and policy engine determine the verification result.

---

## 3. REAL-WORLD PRODUCT INSPECTION CASES

Implement all the following workflows.

### Case 1 — Product fully approved

The supervisor scans Product A.

The system recognizes the exact product and confirms:

- Product identity matches.
- Brand matches.
- Manufacturer matches.
- Product or raw material is within the relevant HAC approval scope.
- The required certificate is valid on the inspection date.
- The approval has not been suspended or revoked.
- No recorded ban or restriction applies.
- The company-specific relationship is valid where required.

Display a clear status:

**HAC Approved — Verified**

Show supporting certificate number, expiry date, issuing body, approval reference, and verification timestamp.

The supervisor confirms the physical product corresponds to the record.

Save the observation automatically into the inspection checklist.

### Case 2 — Same product name, different brand

A supervisor scans a product labelled Brand B.

The HAC record covers the corresponding product under Brand A.

The system must detect the brand difference and display:

**Brand Mismatch — Review Required**

Show:

- Observed brand.
- HAC-approved brand.
- Product details.
- Certificate and scope.
- Comparison results.
- Potential alternative matching records.

The supervisor can confirm the discrepancy and attach evidence.

Create a finding linked to the inspection.

Do not silently convert the Brand B product into an approved Brand A product.

### Case 3 — Product absent from HAC records

The supervisor scans a new product.

The scanner cannot find a sufficiently reliable match in the HAC catalogue.

Display:

**Unknown Product — HAC Approval Not Verified**

Offer:

- Search again.
- View similar products.
- Scan barcode.
- Capture packaging images.
- Enter product manually.
- Add provisional product.
- Raise investigation.
- Raise a non-conformity where HAC policy permits.

The supervisor enters:

- Product name.
- Brand.
- Manufacturer.
- Supplier, if known.
- Barcode.
- Product category.
- Product type.
- Batch number.
- Observed location.
- Description.
- Supporting photographs.
- Reason for investigation.

Create a provisional record and investigation reference.

The investigation is automatically linked to Keells and the current inspection.

The item must enter an authorized HAC review workflow.

A missing database record does not automatically mean the product is non-Halal or officially banned.

### Case 4 — HAC certificate expired

The product exists in the catalogue, but its relevant certificate expired before the inspection date.

Display:

**HAC Certificate Expired**

Show:

- Certificate number.
- Approval holder.
- Expiry date.
- Days since expiry.
- Product and brand.
- Previous approval status.
- Available renewal records.

The supervisor can confirm the observation, attach proof, and create a non-conformity or investigation.

If a valid renewal or replacement certificate exists and covers the product, the system must evaluate that record correctly.

### Case 5 — Physical product expired

The HAC certificate remains valid, but the actual product being inspected has passed its physical expiry or best-before date.

This is a separate finding:

**Physical Product Expired**

Capture:

- Manufacturing date.
- Expiry date.
- Batch or lot number.
- Quantity observed.
- Shelf/location.
- Packaging evidence.
- Inspector notes.

The system must not confuse product shelf-life expiry with HAC certificate expiry.

### Case 6 — Product or manufacturer license expired

The relevant manufacturer, facility, supplier, or other required license has expired.

Display:

**Required License Expired — Review Required**

Identify exactly which license has expired.

Do not mislabel a commercial license as an HAC certificate.

### Case 7 — Confirmed banned or prohibited item

The product matches an explicit HAC-maintained or applicable authorized restriction record.

Display:

**Confirmed Restricted/Banned Item**

Show:

- Authority.
- Restriction reference.
- Scope.
- Effective date.
- Reason.
- Supporting record.

Flag this as a priority finding and start the applicable escalation workflow.

Only authorized administrators can create, modify, or remove official banned or restricted statuses.

Never infer that something is banned because it was not found in the database.

### Case 8 — Approved brand, different product

The brand exists in HAC records, but the actual SKU, formulation, flavour, package variant, or product is different from the approved one.

Display:

**Product Variant Not Covered by Approval**

Show the specific approved scope and observed difference.

Require further verification.

### Case 9 — Approved product belongs to another company

A product is found at Keells, but the relevant HAC record is associated with another manufacturer or supplier.

The system must understand the difference between:

- Retailer or inspected company.
- Product owner.
- Brand owner.
- Manufacturer.
- Supplier.
- Certificate holder.
- Certified manufacturing facility.
- Distributor.
- Location where the product was found.

An approval belonging to a manufacturer may legitimately cover products sold by a retailer, depending on HAC's configured certification rules.

Therefore, do not automatically mark a retailer's product as unapproved simply because Keells is not the certificate holder.

Instead evaluate the relevant product, manufacturer, facility, certificate, and distribution scope.

If a required Keells-specific company relationship does not exist, display the exact issue:

**Company Relationship Not Verified**

### Case 10 — Uncertain AI prediction

The camera suggests several similar products, but confidence is insufficient.

Display:

**Identity Not Confirmed**

Do not select a product automatically.

Allow the supervisor to use the top three suggestions, barcode, additional photographs, or manual search.

### Case 11 — Approved product with physical label mismatch

The product identity may match, but its packaging has a different label, manufacturer name, ingredient declaration, or certification mark.

Allow the supervisor to record the specific discrepancy without changing the approved master record.

### Case 12 — Mixed inspection outcomes

A single inspection may contain dozens or hundreds of products with different outcomes.

The supervisor must be able to continue scanning without closing the inspection.

Every result must remain associated with the correct company, branch, inspection, time, and inspector.

---

# PART B — INTELLIGENT INSPECTION WORKSPACE

## 4. INSPECTION SCREEN DESIGN

Build a dedicated mobile-first inspection workspace.

The active inspection header must show:

- Company name and location.
- Inspection reference.
- Elapsed inspection time.
- Progress.
- Total products examined.
- Verified approved products.
- Unverified products.
- Discrepancies.
- Expired certificates.
- Expired physical products.
- Restricted items.
- Open investigations.

Provide accessible navigation between:

1. Overview.
2. Live Scanner.
3. Product Checklist.
4. Findings.
5. Evidence.
6. Inspection Checklist.
7. Summary.
8. Submit and Export.

On mobile, provide an easy-to-reach scanning action.

Do not force an inspector to navigate through multiple pages every time a product is checked.

### Product verification interface

After selecting a product, open a focused verification panel containing:

**Product identity**

- Product image.
- Name.
- Item code.
- Barcode.
- Brand.
- Manufacturer.
- Supplier.
- Variant.
- Packaging.
- Batch.

**HAC verification**

- HAC approval status.
- Approval reference.
- Certificate number.
- Certificate holder.
- Scope.
- Certificate issue date.
- Expiry date.
- Verification basis.
- Any warnings.

**Inspection observation**

- Product present at company.
- Product absent from company, where applicable to a required inventory checklist.
- Product condition.
- Physical expiry date.
- Quantity.
- Storage location.
- Observation.
- Evidence.
- Inspector conclusion.

Use clearly distinguished fields for:

- System-calculated verification.
- AI recognition suggestion.
- Supervisor-confirmed finding.
- Official HAC certification decision.

Provide a one-tap **Confirm and Save** action.

After saving, return directly to the live scanner or next product.

---

## 5. CHECKLIST EXPERIENCE

Support two related but distinct inspection components.

### A. Product/material verification checklist

Used to examine individual products or raw materials.

Each item should contain:

- Sequence number.
- Item identity.
- Expected brand.
- Observed brand.
- HAC certificate status.
- Physical product status.
- Company relationship.
- Observation outcome.
- Evidence.
- Inspector notes.
- Investigation reference, if any.

### B. General inspection checklist

Support HAC-configurable inspection templates for:

- Storage.
- Handling.
- Segregation.
- Traceability.
- Labelling.
- Documentation.
- Supplier verification.
- Facility compliance.
- Production processes.
- Ingredients.
- Raw materials.
- Cleaning and hygiene.
- Corrective-action compliance.

Supported answer types must include:

- Yes / No.
- Compliant / Non-Compliant / Not Applicable.
- Pass / Fail.
- Multiple choice.
- Numeric.
- Date.
- Text.
- Photograph.
- Attachment.
- Signature.

Checklist templates must be versioned.

Conditional sections should be supported.

Administrators can configure which answers require mandatory photographs, notes, investigations, or immediate escalation.

---

# PART C — ACTUAL AI PRODUCT RECOGNITION

## 6. BUILD A TEACHABLE MACHINE-STYLE TRAINING STUDIO

One of the most important modules is the HAC AI Training Studio.

Create an administrator-facing product image training interface inspired by Google's Teachable Machine.

This must be real machine learning, not a simulated image upload screen.

Use TensorFlow and practical transfer-learning techniques.

Relevant technical references:

- https://teachablemachine.withgoogle.com/
- https://codelabs.developers.google.com/tensorflowjs-transfer-learning-teachable-machine

### AI Training Studio workflow

An authorized administrator opens:

`/ai/training`

They select:

**Create Product Training Dataset**

The administrator then selects an existing central HAC product or creates a new draft product record.

The training class must have a stable product ID, not just a mutable product name.

The administrator starts collecting images.

### Camera collection interface

Recreate the useful operational experience of Teachable Machine:

- Live webcam or mobile-camera preview.
- Camera selection.
- Start camera.
- Stop camera.
- Front/rear camera support.
- Capture one image.
- Continuous image collection.
- Capture interval settings.
- Start/stop continuous capture.
- Live number of collected examples.
- Real-time image thumbnails.
- Remove individual images.
- Upload multiple images from device storage.
- Drag-and-drop upload on desktop.
- Batch image import.
- Dataset quality indicators.
- Automatic near-duplicate detection.
- Background and lighting diversity suggestions.

The administrator can capture many examples of one product.

For example:

- Front packaging.
- Back packaging.
- Side packaging.
- Label close-up.
- Different camera angles.
- Different distances.
- Different lighting conditions.
- Shelf appearance.
- Handheld appearance.
- Packaging with reflections.
- Similar-looking product variants.

Make image capture genuinely functional.

Do not use a fake camera display or prewritten prediction values.

### Training data quality

Avoid treating hundreds of almost-identical consecutive webcam frames as a high-quality dataset.

Introduce configurable capture intervals, visual diversity checks, blur checks, duplicate warnings, and validation previews.

Support training, validation, and test datasets without leaking nearly identical frames between splits.

Provide clear minimum-data guidance, but never promise accuracy merely because a class has a certain number of photographs.

### Product training classes

Each product should be connected to:

- Central item ID.
- Product SKU/variant ID.
- Brand.
- Manufacturer.
- Product images.
- Dataset version.
- Training status.

Support an unknown/background category and negative or confusing examples.

The system must detect insufficient training examples and class imbalance.

---

## 7. ACTUAL TENSORFLOW MODEL TRAINING

Implement a practical, production-oriented AI architecture.

### Core ML methods

Use:

- TensorFlow.js for browser-based image collection and appropriate browser inference.
- TensorFlow transfer learning.
- A pretrained lightweight visual feature extractor such as MobileNet or a suitable maintained alternative.
- A trained classification head or product embedding similarity system.
- Appropriate TensorFlow Lite inference for Flutter or mobile deployment.
- Confidence calibration and unknown-item rejection.

Do not train an entire large image-recognition network from scratch unnecessarily.

### Training Studio screens

Provide:

1. Dataset creation.
2. Product class management.
3. Camera sample collection.
4. Image review.
5. Dataset statistics.
6. Train model.
7. Training progress.
8. Validation results.
9. Confusion matrix.
10. Class-by-class performance.
11. Live model testing.
12. Publish model.
13. Model version history.
14. Rollback.

Show useful metrics:

- Accuracy.
- Precision.
- Recall.
- F1 score.
- Confusion matrix.
- Top-1 accuracy.
- Top-3 accuracy.
- False-identification rate.
- Unknown-item detection performance.
- Per-class sample counts.
- Inference latency.

Calculate metrics using actual test data.

### Model lifecycle

Implement statuses:

- Draft.
- Collecting Data.
- Ready for Training.
- Training.
- Validation Required.
- Validated.
- Published.
- Superseded.
- Archived.
- Failed.

An administrator must approve deployment of a trained model.

Only published models can be used in production inspections.

Record which model version generated each prediction.

If a newer model performs worse, administrators must be able to restore the previous version.

---

## 8. SCALABLE IMAGE SEARCH ARCHITECTURE

Do not design the entire production system around one enormous browser classifier that must be completely retrained every time one product is added.

Implement a scalable hybrid design:

**Identification pipeline**

Camera frame → Image preprocessing → Visual feature extraction → Candidate retrieval → Candidate ranking → Top three product suggestions → Human confirmation → Authoritative HAC database verification.

Prioritize:

1. Exact barcode or reliable identifier matches.
2. Visual embedding similarity.
3. SKU-level classifier output where available.
4. OCR-extracted brand or product text as supporting evidence.
5. Database metadata matching.
6. Human confirmation.

Use a versioned image embedding index appropriate for the initial dataset size.

Design an upgrade path for efficient approximate nearest-neighbour search when the product catalogue grows.

Avoid requiring expensive cloud AI APIs for ordinary scanning.

A small initial deployment should work without a dedicated GPU.

More advanced model retraining may use a separate Python/TensorFlow worker if justified.

---

## 9. LIVE AI CAMERA SCANNING

Create the flagship feature:

`/scanner`

And embed it directly inside active inspections.

### Live camera behavior

When the supervisor opens the scanner:

1. Request camera permission.
2. Open the preferred rear camera.
3. Display a full-screen camera preview.
4. Draw a product framing guide.
5. Begin inference using the currently published model.
6. Display live recognition suggestions.
7. Update suggestions smoothly.
8. Allow the supervisor to freeze the frame.
9. Allow the supervisor to capture evidence.
10. Allow immediate product selection.

### Top three predictions

Display three product candidates with:

- Product thumbnail.
- Product name.
- Brand.
- Predicted similarity/confidence score.
- Distinguishing packaging information.

Example:

Prediction 1 — Product A — 94%

Prediction 2 — Product B — 76%

Prediction 3 — Product C — 42%

These numbers are illustrative only. Actual results must come from real model inference and be clearly described as model scores, not official HAC approval confidence.

Never invent prediction results.

### Performance

Target smooth scanning on common Android devices.

Use:

- Adaptive inference frequency.
- Frame throttling.
- Image resizing.
- Efficient model loading.
- Camera lifecycle management.
- Memory cleanup.
- Background/foreground handling.
- Hardware acceleration where supported.

Avoid running unnecessarily expensive inference on every camera frame.

Prefer local-device inference when practical.

### Unknown detection

If the best match has insufficient evidence, or the top candidates are ambiguous:

Show:

**Unknown or Uncertain Product**

Offer further scanning or manual review.

Do not automatically select a weak prediction.

### Scanner controls

Include:

- Torch/flashlight.
- Switch camera.
- Freeze frame.
- Retake.
- Upload image.
- Barcode mode.
- QR mode.
- Manual search.
- Product details.
- Add unknown product.
- Save evidence.

### Most important interaction

When the supervisor taps a predicted product:

**The system must automatically open its verification form populated with real HAC database information.**

Populate:

- Product identity.
- Brand.
- Manufacturer.
- Supplier.
- Current company and location.
- Relevant certificates.
- HAC approval scope.
- Validity dates.
- Existing restrictions.
- Calculated verification outcome.

Then allow the inspector to record the observed condition and confirm or correct the identity.

---

# PART D — HAC APPROVAL VERIFICATION ENGINE

## 10. AUTHORITATIVE APPROVAL ENGINE

Create a reusable backend verification service.

Suggested conceptual service:

`HACVerificationEngine`

The verification service must be independent of the AI recognition engine.

Input:

- Product ID.
- SKU/variant ID.
- Observed brand.
- Observed manufacturer.
- Observed barcode.
- Company ID.
- Location ID.
- Inspection timestamp.
- Relevant batch details.
- Applicable HAC policies.

Output:

- Identification result.
- Applicable approval records.
- Scope matching results.
- Relevant certificate status.
- Product validity.
- Brand consistency.
- Manufacturer consistency.
- Company relationship status.
- Restrictions.
- Discrepancies.
- Required supervisor actions.
- Source references.
- Evaluation rules/version.

### Verification conditions

Evaluate the exact approval scope, including where applicable:

- Product.
- Brand.
- Variant.
- Manufacturer.
- Production facility.
- Certificate holder.
- Supplier relationship.
- Item category.
- Effective dates.
- Certificate coverage.
- Suspension.
- Revocation.
- Restriction.
- Superseded certificates.

### System verification outcomes

Support at least:

- Verified Approved.
- Approved but Requires Physical Confirmation.
- Approval Not Found.
- Brand Mismatch.
- Product Variant Mismatch.
- Manufacturer Mismatch.
- Company Relationship Not Verified.
- Certificate Expired.
- Certificate Suspended.
- Certificate Revoked.
- Required License Expired.
- Physical Product Expired.
- Explicitly Restricted/Banned.
- Approval Pending.
- Out of Certification Scope.
- Identity Uncertain.
- Insufficient Information.
- Manual HAC Review Required.

Keep multiple simultaneous issues instead of reducing everything to a single misleading status.

For example, one product could have a brand mismatch and an expired certificate.

The system should report both.

### Explainable verification

For every calculated result, store and display:

- Rule applied.
- Actual value.
- Expected value.
- Master record reference.
- Certificate reference.
- Effective date.
- Result.
- Reason.

Allow authorized supervisors to add an observed conclusion.

If the supervisor disagrees with the calculated verification, capture the reason and evidence.

Never allow a normal supervisor override to silently change authoritative HAC certification records.

Only authorized HAC users may make official approval decisions.

---

# PART E — COMPANY, PRODUCT, AND CERTIFICATE MANAGEMENT

## 11. COMPANY MANAGEMENT

Implement a complete company module.

Each company supports:

- Legal name.
- Trading name.
- Registration number.
- Company category.
- Industry.
- Contact details.
- Addresses.
- Multiple branches.
- Factories.
- Warehouses.
- Production locations.
- Relevant certificates.
- HAC status.
- Assigned supervisors.
- Assigned auditors.
- Inspection history.
- Products and raw materials.
- Non-conformities.
- Investigations.
- Documents.
- Company contacts.
- Activity history.

Support one company having many locations.

Support one supervisor managing many companies.

Support one company having multiple assigned supervisors when authorized.

The dashboard must load actual data from MySQL rather than hardcoded counts.

---

## 12. CENTRAL PRODUCT AND RAW MATERIAL CATALOGUE

Build a shared authoritative item catalogue.

Separate:

- Central product identity.
- SKU/packaging variant.
- Brand.
- Manufacturer.
- Supplier.
- Raw material.
- Company-item relationship.
- Facility.
- Certificate.
- Approval scope.

A single central product may be associated with multiple companies.

Do not create duplicate master records simply because another company sells the same item.

### Product fields

Include:

- Unique HAC item ID.
- Product name.
- Alternative names.
- Item type.
- Product category.
- Brand.
- Manufacturer.
- Supplier.
- Origin.
- Barcode.
- QR identifier.
- SKU.
- Variant.
- Flavour.
- Packaging type.
- Package size.
- Ingredient declaration.
- Raw material composition.
- HAC classification.
- Certification scope.
- Physical images.
- Supporting documents.
- Status.
- Submission history.
- Review history.

Support strong duplicate detection using barcode, normalized naming, brand, manufacturer, and visual similarity.

Use a controlled merge workflow with audit history.

### Product management actions

Administrators must be able to:

- Create products.
- Import products.
- Edit controlled fields.
- Add product images.
- Link certificates.
- Link brands.
- Link manufacturers.
- Link suppliers.
- Link companies.
- Add raw material relationships.
- Send records for approval.
- Review changes.
- Archive products.
- Merge confirmed duplicates.

Never allow editing an existing certified product to silently expand its approved scope.

---

## 13. CERTIFICATE AND LICENSE MANAGEMENT

Create complete certificate management.

Track:

- Certificate number.
- Certificate type.
- Issuing body.
- Holder.
- Applicable company.
- Manufacturer.
- Facility.
- Product coverage.
- Brand coverage.
- Issue date.
- Effective date.
- Expiry date.
- Status.
- Renewal history.
- Suspension.
- Revocation.
- Replacement/supersession.
- Documents.
- Approval history.

Support separate records for non-HAC licenses where relevant.

### Automated background checks

Implement scheduled checks for:

- Certificates approaching expiry.
- Expired certificates.
- Renewals pending review.
- Suspended certificates.
- Revoked certificates.
- Products affected by scope changes.
- Company relationships requiring re-verification.

Make expiry notification periods configurable, such as 90, 60, 30, 14, and 7 days.

Send internal notifications to relevant authorized users.

Recalculate current validity when a certificate changes.

Preserve the certificate status that applied at the original inspection time.

---

# PART F — INVESTIGATIONS AND COMPLAINTS

## 14. INTELLIGENT INVESTIGATION MANAGEMENT

Create a complete investigation module.

The supervisor must be able to raise an investigation without leaving the active inspection.

Triggers include:

- Unknown product.
- No matching HAC approval.
- Different brand.
- Different manufacturer.
- Uncovered product variant.
- Expired certificate.
- Suspended approval.
- Confirmed restricted product.
- Suspected misleading certification label.
- Insufficient documents.
- Unclear product identity.
- Other suspicious observation.

### Investigation creation

Automatically populate:

- Investigation reference.
- Source inspection.
- Company.
- Branch/location.
- Supervisor.
- Date/time.
- Related product.
- Recognition results.
- Verification results.
- Reason.
- Supporting photographs.

The supervisor adds comments and chooses a recommended priority.

### Investigation statuses

- Draft.
- Submitted.
- Awaiting Triage.
- Under Investigation.
- Awaiting Company Response.
- Awaiting HAC Review.
- Additional Evidence Required.
- Escalated.
- Resolved.
- Closed.
- Reopened.

### Investigation functionality

Provide:

- Assigned investigator.
- Priority.
- Deadline.
- Detailed timeline.
- Evidence.
- Internal notes.
- Company-visible communications.
- Requests for clarification.
- Company responses.
- Findings.
- Recommended actions.
- Final decision by authorized staff.
- Follow-up inspection.
- Closure record.

### Unknown product review

If HAC confirms a previously unknown product should become a master catalogue item, create a controlled approval pathway.

Do not automatically approve the item because a supervisor photographed it.

Allow an authorized reviewer to convert the provisional item into an official product record.

Link the original inspection and investigation.

---

## 15. COMPLAINT MANAGEMENT

Build a complaint system supporting:

- Complaints submitted during inspections.
- Internal HAC complaints.
- Company-linked complaints.
- Product-linked complaints.
- Supporting evidence.
- Assignment.
- Investigation.
- Communication history.
- Resolution.
- Closure.
- Reopening.

Assign unique complaint references.

Investigations and complaints should be related but not identical workflows.

A complaint may create an investigation.

An investigation may originate without a complaint.

---

## 16. NON-CONFORMITIES AND CORRECTIVE ACTIONS

Support:

- Observation.
- Minor.
- Major.
- Critical.

Make severity definitions configurable according to HAC-approved policies.

A non-conformity should contain:

- Unique reference.
- Company.
- Location.
- Inspection.
- Product.
- Checklist question, if relevant.
- Description.
- Evidence.
- Severity.
- Responsible party.
- Deadline.
- Status.

Corrective action workflow:

1. Non-conformity raised.
2. Company notified.
3. Company reviews evidence.
4. Company submits root cause.
5. Company proposes corrective action.
6. Company supplies evidence.
7. HAC reviewer evaluates the response.
8. Reviewer requests changes, accepts, rejects, or reopens.
9. Authorized user closes the finding when appropriate.

Provide overdue tracking and escalation.

---

# PART G — COMPLETE INSPECTION LIFECYCLE

## 17. INSPECTION PLANNING

Administrators and authorized supervisors can:

- Schedule inspections.
- Choose company.
- Choose location.
- Assign inspector.
- Select inspection type.
- Choose checklist.
- Set date/time.
- Add objectives.
- Link previous findings.
- Set priority.
- Assign additional personnel.
- Reschedule.
- Cancel with reason.

Inspection types may include:

- Initial.
- Routine.
- Surveillance.
- Renewal.
- Follow-up.
- Complaint-based.
- Special.
- Unannounced.

Provide calendar, table, and agenda views.

Detect scheduling conflicts.

---

## 18. COMPLETE MOBILE INSPECTION FLOW

Implement this precise flow:

**Step 1: Open assigned inspection**

The supervisor chooses Keells.

**Step 2: Start inspection**

Show inspection details and begin the visit.

**Step 3: Open product scanner**

Activate live AI recognition.

**Step 4: Identify product**

Show top three predictions.

**Step 5: Select the correct item**

Fetch authoritative HAC details.

**Step 6: Review approval verification**

Highlight certificate, brand, scope, and product status.

**Step 7: Record physical observation**

Capture batch, expiry, quantity, and evidence as applicable.

**Step 8: Confirm result**

Save the result to the inspection.

**Step 9: Handle discrepancies**

Create an investigation, complaint, or non-conformity if needed.

**Step 10: Continue scanning**

Return immediately to the scanner.

**Step 11: Complete general checklist**

Answer the required inspection questions.

**Step 12: Review findings**

Show every inspected product and discrepancy.

**Step 13: Capture declarations/signatures**

Complete the applicable inspector and company-representative confirmation.

**Step 14: Submit inspection**

Run validations and save an immutable submitted snapshot.

**Step 15: Generate professional report**

Produce a downloadable multi-page PDF.

**Step 16: HAC review**

An authorized reviewer may approve the report, request clarification, or create a formal amendment.

**Step 17: Track follow-up**

Connect unresolved findings to corrective-action and investigation workflows.

Every step must work end to end.

---

## 19. OFFLINE INSPECTION SUPPORT

A world-class inspection system must cope with poor connectivity.

Implement controlled offline functionality for the PWA and Flutter app.

The supervisor should be able to:

- Open previously downloaded assigned inspections.
- Access cached product records.
- Access the last published compatible recognition model.
- Record product observations.
- Capture photographs.
- Complete checklists.
- Save notes.
- Queue changes.

Use secure local storage.

Display:

- Offline status.
- Last successful synchronization.
- Cached HAC data version.
- Pending upload count.
- Unsynchronized evidence.
- Whether certificate verification requires online revalidation.

Never silently show stale certification information as current.

Before final inspection submission, perform server-side reconciliation and show any changed approval or certificate results.

Implement conflict handling, idempotent synchronization, retries, and duplicate-submission prevention.

Offline capabilities must not bypass authentication or certification rules.

---

# PART H — PROFESSIONAL PDF REPORTS

## 20. ENTERPRISE INSPECTION REPORT GENERATOR

This module is essential.

After completing a Keells inspection, the supervisor must be able to preview and download a professional inspection report.

If a reference PDF, report screenshot, or original inspection template is available in the repository or supplied project files, inspect it and preserve its important headings, columns, business structure, and formatting.

Improve the visual quality without removing legally or operationally required information.

### Report format

- A4.
- Portrait by default.
- Landscape pages for wide detailed checklists where appropriate.
- Professional HAC branding.
- Print-ready.
- Consistent headers and footers.
- Automatic page numbering.
- Clean typography.
- Clear tables.
- Proper pagination.
- No cut-off columns.
- No overlapping text.
- No empty unnecessary pages.
- High-resolution evidence thumbnails.
- Correctly rendered multilingual text where supported.

### Recommended report structure

**Page 1 — Cover and inspection summary**

Include:

- HAC branding.
- Inspection report title.
- Report number.
- Inspection reference.
- Company.
- Branch.
- Location.
- Inspection type.
- Planned and actual dates.
- Inspector.
- Reviewer, where applicable.
- Inspection status.
- Overall findings summary.
- Report issue date.
- Report revision.

**Page 2 — Executive summary**

Display:

- Total items inspected.
- Verified approved items.
- Unverified items.
- Brand mismatches.
- Product variant mismatches.
- Expired certificates.
- Expired products.
- Confirmed restricted products.
- Investigations raised.
- Non-conformities.
- Critical observations.

Explain that counts can overlap when one product has multiple findings.

**Page 3 onward — Detailed product inspection checklist**

Suggested columns:

- No.
- Product/material.
- SKU or item code.
- Brand.
- Manufacturer.
- Observed batch.
- HAC approval result.
- Certificate number.
- Certificate expiry.
- Physical product expiry.
- Finding.
- Inspector observation.
- Evidence reference.

Use automatic page breaks for long tables.

**Additional section — General inspection checklist**

Show:

- Checklist sections.
- Questions.
- Answers.
- Notes.
- Linked evidence.
- Findings.

**Additional section — Non-conformities**

Show:

- Reference.
- Title.
- Description.
- Severity.
- Related product.
- Required action.
- Responsible party.
- Due date.
- Status.

**Additional section — Investigations**

Show:

- Investigation reference.
- Product.
- Discrepancy.
- Supporting records.
- Current status.
- Assigned investigator.
- Required follow-up.

**Additional section — Evidence appendix**

Show photographs with:

- Evidence reference.
- Product.
- Location or inspection stage.
- Description.
- Capture timestamp.
- Associated finding.

**Final section — Declarations and signatures**

Include:

- Inspector declaration.
- Inspector name.
- Inspector signature.
- Company representative name.
- Company representative signature, where available.
- Date.
- Reviewer details.
- Report approval status.

Support refusal or unavailability of a signature with a documented reason.

### Report authenticity

Add a verification QR code or document reference.

The verification endpoint must reveal only permitted information.

Store an integrity hash for the generated report.

Support report versions and controlled amendments.

An amended report must not silently overwrite the original signed or submitted report.

### Downloads

Support:

- Inspection PDF.
- Product checklist PDF.
- Evidence appendix PDF.
- Non-conformity report PDF.
- Investigation report PDF.
- Certificate expiry report.
- Company product report.
- Excel exports.

Use server-generated authoritative data.

The PDF must reflect actual saved inspection observations, not generated sample data.

---

# PART I — ENTERPRISE DASHBOARDS AND DESIGN

## 21. WORLD-CLASS UI/UX DESIGN

Completely modernize the user experience.

Design the product as a premium enterprise compliance platform.

Avoid the appearance of an amateur admin template.

### Visual identity

Use:

- HAC-inspired professional branding.
- Deep navy and refined green accents.
- Clean white or neutral surfaces.
- Excellent typography.
- Consistent spacing.
- Accessible contrast.
- Professional tables and forms.
- Purposeful iconography.
- High-quality loading and empty states.
- Responsive charts.
- Smooth but restrained transitions.

Do not overuse gradients, decorative animations, or colourful cards.

### Responsive interfaces

Support:

- Desktop.
- Laptop.
- Tablet.
- Small mobile screens.
- Android browser/PWA.
- Flutter Android app.

The mobile inspection UI is a top priority, not merely a desktop page squeezed onto a phone.

### Mobile navigation

Provide easy access to:

- Home.
- Scan.
- Inspections.
- Items.
- More.

Keep active-inspection context visible.

### UX standards

Include:

- Fast global search.
- Saved filters.
- Keyboard navigation.
- Accessible controls.
- Clear confirmation messages.
- Unsaved-change warnings.
- Autosave of inspection drafts.
- Skeleton loaders.
- Useful error messages.
- Empty states.
- Responsive modals and bottom sheets.
- Camera permission recovery.
- Multi-step progress indicators.

Support English initially, with a translation-ready architecture for Sinhala and Tamil.

Use Asia/Colombo as the default business timezone, while storing unambiguous timestamps in the database.

---

## 22. ROLE-SPECIFIC DASHBOARDS

### Super Admin

Display:

- Registered companies.
- Active certifications.
- Product catalogue.
- Inspection performance.
- Critical risks.
- User activity.
- Open investigations.
- Audit logs.
- AI model health.
- System health.

### HAC Admin

Display:

- Assigned and completed inspections.
- Pending product reviews.
- Certificate renewals.
- Company submissions.
- Open complaints.
- Non-conformities.
- Supervisor workload.
- Performance trends.

### Supervisor

Display:

- Assigned companies.
- Today's inspections.
- Recent product findings.
- Priority follow-ups.
- Certificates to verify.
- Pending investigations.
- Inspection drafts.
- Quick camera scanning.

### Auditor

Display assigned inspections, evidence, checklists, findings, and submissions.

### Company Admin

Display:

- Company profile.
- Submitted products.
- HAC review statuses.
- Certificates.
- Required document submissions.
- Scheduled inspections.
- Corrective actions.
- Authorized communications.

### Company Staff

Restrict the dashboard to explicitly permitted company tasks.

---

## 23. ADVANCED ANALYTICS

Provide useful operational analytics.

Include:

- Inspections over time.
- Findings by company.
- Findings by severity.
- Repeated brand mismatches.
- Frequent unknown products.
- Certificate expiry trends.
- Supplier risk patterns.
- Product categories requiring more inspection.
- Supervisor workload.
- Corrective-action completion.
- Average investigation resolution time.
- AI prediction accuracy from verified inspector feedback.
- Product-recognition uncertainty.
- Model performance drift.

Implement drill-down to underlying records.

Charts must use real database results and respect access permissions.

---

# PART J — DATABASE AND ARCHITECTURE

## 24. PRODUCTION DATABASE DESIGN

Use MySQL and Prisma 7, preserving compatible existing schema elements.

Design normalized entities and relationships for the following domains.

### Identity and permissions

- User
- Role
- Permission
- UserRole
- RolePermission
- Session
- AuditLog
- Notification

### Companies

- Company
- CompanyLocation
- CompanyContact
- SupervisorCompanyAssignment
- CompanyStaffAssignment

### Products

- Item
- ProductVariant
- Brand
- Manufacturer
- Supplier
- ItemImage
- RawMaterial
- ProductRawMaterial
- CompanyItem
- ProductAlias
- ProductBarcode
- ItemRevision

### Certification

- Certificate
- CertificateScope
- CertificateItem
- CertificateFacility
- CertificateHistory
- ApprovalDecision
- License
- RestrictionRecord

### Inspection

- Inspection
- InspectionAssignment
- InspectionSession
- ChecklistTemplate
- ChecklistTemplateVersion
- ChecklistSection
- ChecklistQuestion
- ChecklistResponse
- InspectionItem
- ProductObservation
- InspectionFinding
- InspectionEvidence
- InspectionSignature
- InspectionReport
- ReportRevision

### Investigations

- Investigation
- InvestigationEvent
- Complaint
- NonConformity
- CorrectiveAction
- CorrectiveActionReview

### AI

- ProductTrainingDataset
- TrainingDatasetVersion
- TrainingImage
- TrainingClass
- AIModel
- AIModelVersion
- AIModelEvaluation
- ProductEmbedding
- RecognitionPrediction
- RecognitionFeedback
- AIModelDeployment

These are conceptual entities. Inspect existing models before creating new ones and avoid redundant tables.

### Database requirements

- Foreign keys.
- Unique constraints.
- Appropriate indexing.
- Transaction safety.
- Optimistic concurrency where necessary.
- Structured timestamps.
- Soft deletion where history must remain.
- Immutable audit records.
- Historical snapshot preservation.
- Safe migrations.
- No destructive resetting of existing data.
- Reliable pagination.
- Efficient product search.

Implement proper many-to-many relationships where required.

---

## 25. API DESIGN

Create a stable, documented, versioned REST API.

Suggested domains:

- `/api/v1/auth`
- `/api/v1/users`
- `/api/v1/companies`
- `/api/v1/locations`
- `/api/v1/products`
- `/api/v1/raw-materials`
- `/api/v1/certificates`
- `/api/v1/approvals`
- `/api/v1/inspections`
- `/api/v1/checklists`
- `/api/v1/observations`
- `/api/v1/verification`
- `/api/v1/investigations`
- `/api/v1/complaints`
- `/api/v1/non-conformities`
- `/api/v1/corrective-actions`
- `/api/v1/ai/datasets`
- `/api/v1/ai/models`
- `/api/v1/ai/predictions`
- `/api/v1/reports`
- `/api/v1/notifications`
- `/api/v1/audit-logs`

Provide:

- Request validation.
- Structured responses.
- Stable error codes.
- Pagination.
- Filtering.
- Sorting.
- Authorization.
- Idempotency for important mutations.
- API documentation.
- Rate limiting.
- Upload validation.
- Meaningful HTTP status codes.

Use the same backend business rules for web and Flutter clients.

Avoid duplicating certification logic in frontend components.

---

# PART K — SECURITY AND TRACEABILITY

## 26. ENTERPRISE SECURITY REQUIREMENTS

Implement:

- Secure password hashing.
- Secure sessions or appropriately scoped tokens.
- Role-based permissions.
- Object-level authorization.
- Company-level data isolation.
- Secure password resets.
- Session expiry.
- Login rate limiting.
- Protection against CSRF where applicable.
- Protection against XSS.
- Secure upload handling.
- Input validation.
- Secret management.
- Production HTTPS.
- Secure file-access authorization.
- Database least privilege.
- Backup and recovery procedures.
- Optional MFA for privileged users.
- Restricted AI model publishing.
- Secure offline data handling.

Never trust frontend permission checks.

Never expose database credentials, API secrets, or other confidential configuration to client-side JavaScript.

Review existing authentication carefully and remove insecure default credentials or deployment-time secrets.

### Audit requirements

Record every important action:

- Who performed it.
- What action occurred.
- Which record changed.
- Previous value.
- New value.
- Timestamp.
- Applicable reason.
- Related company.
- Related inspection.
- Device/source information where appropriate.

Certification approvals, restrictions, submitted inspections, and formal report revisions require strong historical traceability.

---

# PART L — SMART FEATURES

## 27. ADD ENTERPRISE-GRADE INTELLIGENT FEATURES

Implement useful operational improvements rather than superficial AI features.

### Smart inspection preparation

Before a supervisor visits a company, generate a preparation summary from existing database information:

- Previously unresolved findings.
- Expiring certificates.
- Recently modified products.
- Unreviewed supplier changes.
- High-priority products.
- Repeat non-conformities.

### Risk-based prioritization

Use explainable, HAC-configurable rules to suggest inspection priorities.

Do not invent certification decisions using an opaque AI score.

### Product discrepancy comparison

Provide a side-by-side interface:

| Attribute | HAC Record | Observed Product |
|---|---|---|
| Name | Expected | Actual |
| Brand | Expected | Actual |
| Manufacturer | Expected | Actual |
| Variant | Expected | Actual |
| Barcode | Expected | Actual |
| Certificate | Required | Verified |

Highlight genuine differences.

### Repeated finding detection

When an item has been repeatedly flagged in previous inspections, display its historical findings.

### Smart investigation creation

Prefill investigation fields using the confirmed product, current inspection, and calculated discrepancies.

### Inspector feedback learning

Allow inspectors to flag incorrect AI predictions.

Store corrected product labels as reviewable training examples.

Do not automatically retrain and deploy models from unverified feedback.

### Model monitoring

Track which products are consistently confused by the recognition model.

Allow the administrator to collect additional samples and retrain.

---

# PART M — COMPLETE DEMONSTRATION DATA

## 28. BUILD A REALISTIC END-TO-END DEMO

Create a safe and isolated development seed dataset.

All product approvals, certificate numbers, and statuses must be clearly labelled fictional demonstration data.

Populate three assessed companies.

For the demonstration Keells inspection, include:

- Several correctly approved products.
- A product with a different observed brand.
- An unknown product.
- A product with an expired HAC certificate.
- A product with an expired physical shelf-life date.
- A product with a different SKU.
- A product with a confirmed simulated restriction.
- A product with a missing company relationship.
- A product with a valid manufacturer-held HAC certificate.
- Two visually similar products for testing top-three AI recognition.

Include separate manufacturers, suppliers, brands, certificate records, product variants, and locations.

Generate sample image classes only where suitable, explicitly labelled demonstration assets are available or created.

Do not pretend a recognition model has been trained if actual training has not been performed.

Create a sample inspection containing findings for these scenarios and demonstrate report generation using real seeded database records.

---

# PART N — TESTING AND QUALITY ASSURANCE

## 29. MANDATORY AUTOMATED TESTS

Use appropriate unit, integration, and end-to-end testing frameworks.

Test:

1. Authentication.
2. Authorization.
3. Company assignment restrictions.
4. Product creation.
5. Product variant matching.
6. Brand mismatch.
7. Manufacturer mismatch.
8. HAC certificate expiry.
9. Physical product expiry.
10. License expiry.
11. Suspended certification.
12. Revoked certification.
13. Valid certificate renewal.
14. Product with another company's certificate.
15. Unknown product creation.
16. Investigation creation.
17. Complaint creation.
18. Non-conformity creation.
19. Corrective-action submission.
20. AI dataset capture and management.
21. Model training.
22. Model publishing and rollback.
23. Real model inference.
24. Top-three prediction ordering.
25. Unknown/uncertain prediction handling.
26. Barcode matching.
27. Duplicate product prevention.
28. Inspector confirmation.
29. Saving multiple product observations.
30. Inspection draft restoration.
31. Inspection submission.
32. Signature storage.
33. PDF generation.
34. PDF pagination.
35. Report versioning.
36. Evidence security.
37. Offline synchronization.
38. Synchronization conflicts.
39. Restricted user access.
40. Audit history.

### Critical testing requirements

Use deterministic test fixtures for official approval business logic.

AI model tests must distinguish integration smoke tests from genuine accuracy evaluation.

Test certificate status using time-dependent cases and fixed inspection timestamps.

Test multiple simultaneous product discrepancies.

Test mobile viewport sizes and common camera permission failures.

Test that an unknown product does not become certified automatically.

Test that AI predictions cannot override authoritative HAC status.

Test that a submitted inspection cannot be changed silently.

---

# PART O — DEPLOYMENT AND PERFORMANCE

## 30. PRODUCTION DEPLOYMENT

The system should remain practical for economical hosting initially.

Use an architecture that can scale without unnecessary infrastructure costs.

Target:

- Existing Hostinger environment for compatible web/backend components.
- MySQL database.
- Secure persistent file storage.
- Server-generated PDFs.
- Suitable background processing.
- Efficient client-side AI inference.
- Optional separate ML training service if required.

Before finalizing deployment, verify actual hosting support for:

- Node.js runtime.
- Next.js server processes.
- Environment variables.
- Persistent uploads.
- Background jobs.
- Cron tasks.
- Database connections.
- File size limits.
- TensorFlow inference/training requirements.

If a feature cannot run reliably on the current hosting plan, document the limitation and provide a compatible deployment configuration.

Never claim the service is production-ready based solely on a successful development build.

Implement logging, health checks, backup guidance, and a recovery procedure.

---

# PART P — HOW CODEX MUST EXECUTE THIS PROJECT

## 31. DEVELOPMENT EXECUTION ORDER

Begin by auditing the repository.

Produce a concise internal gap analysis.

Then implement in the following order:

### Milestone 1 — Existing code stabilization

- Inspect current project.
- Repair broken functionality.
- Confirm authentication.
- Verify database connectivity.
- Validate Prisma schema.
- Remove dashboard mock data.
- Stabilize shared UI.
- Confirm a reproducible development environment.

### Milestone 2 — Core HAC catalogue

- Companies.
- Branches.
- Manufacturers.
- Suppliers.
- Brands.
- Products.
- Product variants.
- Raw materials.
- Certificates.
- Approval scope.
- Company-item relationships.

### Milestone 3 — Inspection operations

- Scheduling.
- Supervisor assignments.
- Inspection sessions.
- Dynamic checklists.
- Item observations.
- Evidence collection.
- Findings.
- Inspection review and submission.

### Milestone 4 — Verification engine

- Authoritative HAC record matching.
- Certificate validation.
- Brand mismatch.
- Product variant mismatch.
- Company relationships.
- Expiry detection.
- Restriction management.
- Detailed verification explanations.

### Milestone 5 — AI Training Studio

- Camera training interface.
- Dataset management.
- Multiple product classes.
- Actual TensorFlow training.
- Model evaluation.
- Model publishing.
- Versioning.

### Milestone 6 — Live product scanner

- Camera.
- Real-time image inference.
- Top-three predictions.
- Barcode scanning.
- Product selection.
- Automatic verification.
- Save inspection observation.
- Unknown-product handling.

### Milestone 7 — Investigation management

- Investigations.
- Complaints.
- Non-conformities.
- Corrective actions.
- Company responses.
- Escalations.

### Milestone 8 — Reporting

- Detailed inspection reports.
- A4 PDF generation.
- Photographic evidence.
- Checklist tables.
- Signatures.
- Report verification.
- Excel exports.

### Milestone 9 — Mobile and offline operations

- Complete mobile-first PWA.
- Secure offline drafts.
- Synchronization.
- Flutter Android integration.
- Shared REST API.

### Milestone 10 — Production quality

- Role-based dashboards.
- Analytics.
- Notifications.
- Automated tests.
- Security review.
- Performance optimization.
- Documentation.
- Production deployment preparation.

Work through milestones incrementally.

At every milestone, keep the existing working application usable.

Do not merely create empty pages and mark the milestone complete.

---

## 32. ENGINEERING RULES

Follow these strict requirements:

1. No fake AI predictions.
2. No hardcoded production inspection results.
3. No empty module placeholders presented as complete features.
4. No frontend-only approval rules.
5. No automatic official HAC certification by an AI model.
6. No silent deletion of submitted evidence.
7. No duplicate master product creation when an existing item should be reused.
8. No mixing certificate expiry with physical product expiry.
9. No unverified assumption that retail possession of a product proves HAC certification.
10. No claim that a missing product is officially prohibited.
11. No untracked supervisor overrides.
12. No broken mobile camera interface.
13. No image collection screen without functioning dataset storage.
14. No AI model listed as trained without an actual training artifact.
15. No PDF generated from fake hardcoded checklist results.
16. No broken database migrations.
17. No exposed authentication secrets.
18. No uncontrolled cross-company data access.
19. No silent overwriting of signed inspection reports.
20. No claim of successful completion without tests and verification.

Prefer maintainable, readable, strongly typed, modular code.

Explain any material architectural deviation.

If a substantial feature cannot be safely completed within the current implementation session, record its exact remaining tasks and do not falsely claim it is working.

---

# PART Q — FINAL END-TO-END ACCEPTANCE SCENARIO

## 33. THE KEELLS INSPECTION MUST WORK

At the end, demonstrate this workflow through the real application.

### Administrator setup

An administrator:

1. Registers three demonstration companies.
2. Configures their locations.
3. Registers products and raw materials.
4. Adds brands and manufacturers.
5. Uploads certificate details.
6. Creates valid and expired demonstration approvals.
7. Adds product training images.
8. Trains a TensorFlow product-recognition model.
9. Validates and publishes that model.
10. Assigns Keells to a supervisor.
11. Schedules a Keells inspection.

### Supervisor inspection

The supervisor:

1. Logs in.
2. Sees Keells on today's inspection list.
3. Opens the assigned inspection.
4. Reviews company details.
5. Starts inspection.
6. Opens the live camera scanner.
7. Scans the first product.
8. Sees the top three actual AI predictions.
9. Selects the correct product.
10. Views automatically populated HAC certification information.
11. Confirms the first product is approved.
12. Saves the observation.
13. Scans another product.
14. Finds its brand differs from HAC records.
15. Records the brand mismatch.
16. Scans a third product.
17. Finds its certificate has expired.
18. Records the certificate expiry.
19. Scans a fourth product.
20. Finds no reliable HAC record.
21. Creates a provisional product.
22. Raises an investigation.
23. Scans a fifth product.
24. Confirms it is within a recorded restriction.
25. Flags the applicable finding.
26. Completes the remaining checklist.
27. Attaches photographs.
28. Reviews all observations.
29. Signs the inspection.
30. Submits it.

### HAC review

The authorized HAC reviewer:

1. Receives the submitted inspection.
2. Reviews products and evidence.
3. Examines discrepancies.
4. Assigns investigations.
5. Creates or reviews non-conformities.
6. Requests further information where required.
7. Records the authorized report decision.
8. Preserves the complete audit trail.

### Final report

The supervisor or authorized user selects:

**Download Inspection PDF**

The system produces a polished multi-page HAC report showing:

- Keells company and location.
- Inspection reference.
- Inspector.
- Date and time.
- All inspected products.
- Verified approvals.
- Brand mismatches.
- Expired certificates.
- Product expiry findings.
- Restricted products.
- Unknown products.
- Investigations.
- Non-conformities.
- Evidence.
- Signatures.
- Review and submission details.

The PDF must be based on the exact inspection records saved in the database.

**This complete workflow is the primary product acceptance test.**

---

# PART R — EXPECTED FINAL DELIVERABLES

## 34. DELIVERABLES

Provide a complete, maintainable project containing:

- Modern HAC administration portal.
- Functional mobile-first supervisor workspace.
- Flutter Android application or clearly documented mobile implementation status.
- Integrated backend REST API.
- MySQL/Prisma database and migrations.
- Central item and certification catalogue.
- HAC verification rule engine.
- Teachable Machine-style TensorFlow training studio.
- Published AI model lifecycle.
- Live three-prediction camera scanner.
- Product discrepancy handling.
- Investigation and complaint management.
- Non-conformity and corrective-action workflows.
- Professional PDF generator.
- Reporting and analytics.
- Notifications.
- Offline synchronization capability.
- Audit logs and security controls.
- Automated tests.
- Development seed data.
- API documentation.
- Installation instructions.
- Environment configuration example.
- Deployment instructions.
- Backup and recovery documentation.

Create and maintain the following documents where appropriate:

- `README.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `API_DOCUMENTATION.md`
- `AI_MODEL_ARCHITECTURE.md`
- `INSPECTION_WORKFLOW.md`
- `REPORT_SPECIFICATION.md`
- `SECURITY.md`
- `DEPLOYMENT.md`
- `TESTING.md`
- `IMPLEMENTATION_STATUS.md`

Document completed functionality separately from pending work.

---

## 35. FINAL INSTRUCTIONS TO CODEX

Do not interpret this project as a simple inventory-management application.

The purpose is to build a professional HAC certification and inspection ecosystem, with intelligent product recognition as a major operational feature.

The AI scanner, HAC certification database, inspection workflow, discrepancy detection, investigations, and PDF reporting must work as one integrated system.

The most important user experience is:

**Open inspection → Scan product → See top three predictions → Confirm identity → Automatically verify HAC records → Record finding → Continue scanning → Complete inspection → Generate report.**

Prioritize genuine operational usefulness, accurate certification logic, speed, mobile usability, professional design, secure auditability, and maintainable engineering.

Think beyond the obvious implementation, but do not add features that undermine correctness or legal/operational control.

Where HAC policy rules or approval authority require confirmation, make them configurable and explicitly documented rather than inventing official rules.

Start by inspecting the existing repository and identifying the next safe implementation steps.

Then begin coding immediately, progressing through the milestones, running relevant tests, fixing issues, and maintaining an accurate implementation-status document.

Do not stop after producing a proposal or architecture document.

**Build a coherent, working, enterprise-grade HAC Intelligent Certification and Inspection Management System.**