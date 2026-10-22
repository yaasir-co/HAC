# Mobile inspections and scanner testing

## Hostinger update

Deploy this branch after merging it into the GitHub branch used by Hostinger. Set `HAC_HOSTED_SETUP=true` for the deployment that applies migration `20261021160000_optional_inspection_checklist`, using the existing **npm run build** option. Then remove/set the flag false. Existing accounts, assignments, templates, answers and submitted reports are retained. This update has been tested locally; it does not itself change the live Hostinger database.

## Supervisor flow

1. Start or resume a company inspection. A checklist is optional; **No checklist — products only** is the default.
2. Type a product name, brand, barcode or item code; lightweight matches update automatically. Earlier requests are cancelled and failed requests expose Retry instead of loading indefinitely.
3. Tap an item, then **Yes, add**. It is saved immediately; there is no second save form. Approval checks run on the server.
4. **Scan items** opens the camera popup. Only predictions scoring at least 75% appear: two cards initially, expandable to four visible cards and up to ten results. Tap a match and **Yes, add**; scanning continues. This requires a published product model.
5. **Not in HAC list?** records a required photo, name and observed brand on this inspection only. It never creates a master catalogue product.
6. **Review inspection → Confirm & submit inspection** records the supervisor's authenticated confirmation. No uploaded/drawn signature or representative signature is mandatory. Remove mistaken items before submission; removal clears existing signatures so an edited visit cannot retain an outdated declaration. Formal investigations remain linked to the visit. The review offers an optional drawn signature. Then **Download inspection PDF**. At least one saved item is required.

Use **Text size** in the header to enable larger text on a device. The setting is stored on that device/browser; it does not enlarge text on other phones. Normal text remains the default, with stronger contrast for all devices. Phone model names are not inferred from screen width: an A25 user can enable large text while a Redmi user retains normal size. Browser/OS zoom remains available.

## Administrator checklist editing

Open **Checklist templates**. Add a checklist, use **Edit questions**, add/remove individual questions, then publish. Edits create a new version for future visits. **Remove** retires availability; it does not delete a historical version or saved responses. An existing inspection retains its chosen question version. Checklists and answers are optional, including older templates whose stored questions were originally marked required. Existing conditional rules are retained, with references remapped when publishing; removing a source question clears its dependent conditions in the editor.

## Camera suggestions and optional AI detection

Only the published product model is used. Experimental object scans and their catalogue-seeding controls have been removed; previously saved records remain available for audit.

Suggestions must score at least 75% similarity. Two cards are visible initially; scroll or use More matches to expand to four visible cards and browse up to ten distinct products. Already inspected products cannot be added again. Similarity is not a calibrated probability or a halal approval.

**AI detection mode** is optional and off initially. It waits for a stable camera view, captures a frame and pauses the preview while the server runs actual TensorFlow feature extraction. A conservative border-colour/connected-region mask can suppress a clear background and crop the foreground; the focused embedding is used only when it improves the published index result. This is classical foreground processing, not a trained semantic detector. Unreliable foreground masks fall back to the original image. Background or low-score results prompt **Show me the product again**. Captured frames are transient and do not automatically become evidence or training images.

Camera tests use a simulated Chromium stream and explicit candidate fixtures for interface assertions. Physical A25/Redmi cameras and field packaging accuracy require separate validation.

## Administrator bulk training

Open **AI training studio**, select/create a library and search for the product or raw material. Select 100+ JPEG/PNG/WebP photos at once (8 MB per image). Counts and independent-group totals are shown per item; previews are limited to the newest 24. Bulk progress shows saved/failed files, Stop and Retry unsuccessful photos. Uploaded images persist; an uncompleted browser file selection does not survive a reload. Re-select files after reload; duplicate files are rejected safely.

Collect genuine packaging photographs with varied viewpoints, lighting and backgrounds, and also add **Unrelated / background photos**. Similar images are grouped to prevent leakage; at least three independent groups per class are necessary. Do not treat sequential nearly identical frames as independent test photos.

Training saves progress in the database and extracts real TensorFlow features eight images per request. Keep the page open; reopen the library and **Resume training** after interruption. Libraries support up to 10,000 images. Finish uploads before training; changing the library invalidates an active job. Training-only diverse prototypes cap the published index at 24 vectors per product/variant class and 96 for varied background examples. Validation tunes parameters; held-out tests measure accuracy and background false identification. A failed model cannot be published. **Approve and publish** is a separate administrator action. No image count guarantees packaging accuracy; representative field validation is still necessary.

See [Hostinger setup](HOSTINGER_SETUP.md#pdf-download-permission-errors-eacces) for private report storage recovery.

## Catalogue identity photos and one item per visit

An administrator opens **Product catalogue** (also raw materials) or **Companies**, opens the record, and uses **Add image / Replace image / Remove image**. JPEG/PNG files up to 8 MB are accepted. Photos/logos appear in catalogue lists, live search, inspection lists and product camera candidates. These display photos do not automatically become training samples and do not establish HAC approval.

A product is recorded once per inspection, regardless of which variant or camera prediction selected it. Saved matches show **Added** and cannot be selected again. The server enforces the same rule across fresh mutation keys, concurrent tabs and retries. An exact retry of a successful request remains idempotent. Previous duplicate observations and submitted reports are retained rather than rewritten.

**Not in HAC list?** requires a photo, item name and observed brand. **Take photo** opens the supported phone's native rear camera; **Choose photo** is also available. If no brand is visible, record that explicitly with **Brand is not visible on the item**. Manufacturer, barcode, batch, quantity, expiry and notes can be recorded under other details. The photo and observation save atomically in one action. Unknown items remain inspection-only; duplicate manual identity names/brands are blocked despite whitespace/case or product/material category changes.

## Why some trained versions cannot be published

A model with 83.0% overall accuracy and 43.4% background false identification fails the maximum 20% background error limit. Top-three accuracy measures whether the correct product appears among suggestions on known-product photos; it does not measure rejection of unrelated objects. Retrying the same photos with the same training recipe repeats the result.

The updated recipe retains up to 96 background prototypes versus 24 per product/variant, calibrates rejection against validation background errors, then evaluates the separate test set once. Publication requires at least 70% held-out accuracy, at most 20% background false identification, and at least 70% mean foreground recall. The UI shows blocking reasons and per-item recall; the publication API checks the measured gate itself. Existing models and metrics are not rewritten and the current published model remains active. Retraining under the new recipe creates one new evaluated result; unchanged later runs reuse it. If representative held-out images still fail, improve class labels and varied real background/product photographs before another training run. No passing result or physical-device accuracy is assumed.

## Installed icon updates

The versioned v4 PNG icons preserve the supplied circular HAC artwork and use manifest purpose `any` to avoid maskable cropping. The service worker no longer caches the manifest and refreshes branding from the network. Installed icon refresh timing is controlled by the browser/OS; if an existing installation retains the old icon after an update, remove and reinstall that app once.
