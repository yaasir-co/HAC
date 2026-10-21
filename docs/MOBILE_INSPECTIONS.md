# Mobile inspections and scanner testing

## Hostinger update

Deploy this branch after merging it into the GitHub branch used by Hostinger. Set `HAC_HOSTED_SETUP=true` for the deployment that applies migration `20261021160000_optional_inspection_checklist`, using the existing **npm run build** option. Then remove/set the flag false. Existing accounts, assignments, templates, answers and submitted reports are retained. This update has been tested locally; it does not itself change the live Hostinger database.

## Supervisor flow

1. Start or resume a company inspection. A checklist is optional; **No checklist — products only** is the default.
2. The visit opens on **Products**. Catalogue items appear immediately. Type a name, brand, barcode or item code; matches update automatically. Earlier requests are cancelled when the query changes.
3. Tap a product, check its exact identity/packaging, record notes or other observations, confirm the physical identity and save. Empty optional barcode/variant fields are omitted, so raw materials without packaging variants can be saved.
4. Repeat for additional items. Use **Live scanner** for the camera, or **Product not listed?** to record a provisional identity for review.
5. Record the inspector declaration and representative signature or absence reason, then use **Submit & export**. Unanswered checklist questions do not block submission. At least one saved observation and the declarations remain necessary. Saved reports retain the details recorded at submission.

Use **Text size** in the header to enable larger text on a device. The setting is stored on that device/browser; it does not enlarge text on other phones. Normal text remains the default, with stronger contrast for all devices. Phone model names are not inferred from screen width: an A25 user can enable large text while a Redmi user retains normal size. Browser/OS zoom remains available. The compact visit summary can be expanded when needed.

## Administrator checklist editing

Open **Checklist templates**. Add a checklist, use **Edit questions**, add/remove individual questions, then publish. Edits create a new version for future visits. **Remove** retires availability; it does not delete a historical version or saved responses. An existing inspection retains its chosen question version. Checklists and answers are optional, including older templates whose stored questions were originally marked required. Existing conditional rules are retained, with references remapped when publishing; removing a source question clears its dependent conditions in the editor.

## Scan test objects

In **Product scanner**, choose **Test objects**. Administrators can use **Add five scan test items to catalogue** once to create clearly marked laptop, phone, pen, pencil and book examples. Repeating the action preserves the examples. No certificates, barcodes or HAC approvals are invented. A person is a camera test category and is never created as a product record or used to identify an individual.

Start the camera or upload a JPEG/PNG/WebP photograph. Place one object close to the center guide with good light. Live inference runs serially with a pause between frames. Freeze/resume, camera switching, supported-device torch and manual search are available. Camera tracks stop when leaving the screen or switching apps. Suggestions require human confirmation. The product-recognition mode continues to use the separately trained/published HAC packaging model; the object test model does not replace it.

## Test model and evidence

The bundled experimental classifier uses the official MobileNet v1 1.0 backbone and a genuinely trained seven-way softmax layer: laptop, mobile phone, person, pen, pencil, book and background. It uses 168 attributed object images: 101 training, 32 validation and 35 held-out test images. Entire photographer/capture groups stay in one partition across classes. Thresholds use validation data. Raw source photographs are not committed; [sources.json](../hac-management-system/web/src/data/scan-test/sources.json) retains author, source URL, license, image hash, crop and partition attribution. Open Images bounding-box annotations are CC BY 4.0; image licenses are recorded separately. Wikimedia Commons images retain their individual licenses.

The final model's first-choice test accuracy was **31/35 (88.6%)**. With uncertainty rejection, 16 foreground images were accepted and 15 additional foreground images were marked uncertain; all four background examples were rejected. This is a small experimental benchmark, following a lightweight-backbone baseline, rather than a field acceptance claim. Real packaging accuracy and A25/Redmi physical-camera performance remain unmeasured. The UI displays uncertain candidates for manual review instead of presenting a guessed identity as HAC approval.

`src/data/scan-test/evaluation.json` stores full counts/confusion matrices. The source partition is unchanged between the baseline and final backbone experiment; neither validation nor test images trained the classifier weights. Dataset/model selection is experimental and does not constitute an independent external benchmark.

For intentional retraining from the app directory, use Python 3 with Pillow 12.3.0 and `curl`, then:

```sh
python scripts/prepare-scan-test-data.py
node --use-env-proxy --import tsx scripts/train-object-test.ts
```

The preparation step checks the retained source hashes and stops if an image changed. Training verifies hashes again, extracts actual image features and writes the model, evaluation and attribution files. Review these files before committing a replacement. Python is not needed to install or run the deployed application.

Observed validation: 249 unit tests, the production build, eight focused browser workflows, real TensorFlow image inference and a simulated camera stream backed by a held-out real photograph. The simulated stream verifies application camera/inference/cleanup integration; it does not test a physical phone camera. A disposable MySQL HTTP run verified migration, search, test-catalogue isolation, admin question revisions/removal, existing-version retention, submission with no checklist, submission with unanswered older required questions, and retained PDF downloads.
