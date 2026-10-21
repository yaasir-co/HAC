# Product recognition

Recognition proposes an identity. It never certifies a product. Selected identities go to the independent, server-side HAC verification engine and require physical confirmation.

## Implemented pipeline

The authenticated training studio collects real camera frames or uploaded images, decodes/re-encodes them outside public assets, links stable product/variant IDs, and supports an unknown/background class. SHA-256 rejects exact duplicates. Difference hashes merge near-duplicate capture groups before splitting; a Laplacian score flags blur. Capture intervals, thumbnails, deletion controls and independent capture sessions support dataset review. These checks do not guarantee training quality.

TensorFlow.js uses the official ImageNet MobileNet v1 width 0.25, 224-pixel Keras/Layers artifact:

`https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json`

The frozen extractor stops at `global_average_pooling2d_1`, yielding 256-dimensional features. Shared preprocessing resizes RGB images to 224 × 224 using bilinear interpolation, scales pixels to [-1,1], and normalizes output vectors. The unused ImageNet classification head is removed. Server and browser use the same implementation. Cached sample embeddings include the exact extractor version; incompatible cached features are recomputed. Prediction requests and published artifacts must agree on extractor version and vector dimensions.

Actual extracted features form a versioned exact nearest-neighbour product index. This is transfer learning with an embedding index; no large network is trained from scratch and no neural classification-head fit is claimed. Artifacts preserve extractor identity, normalized training vectors, stable product/variant IDs, thresholds, margin, sample IDs and creation time. No scores, metrics, trained statuses or artifacts are invented.

## Evaluation and model lifecycle

Training requires at least two product classes, background examples and three independent capture groups per class. Entire groups stay in training, validation or test. The index uses only training vectors. Held-out samples calculate actual confusion counts, class precision/recall/F1, top-1/top-3 accuracy, unknown rejection and unknown false identification. Cosine similarity is not a probability or HAC approval confidence.

The initial explicit engineering gate is test accuracy ≥70% and unknown false identification ≤20%. These are configurable request-time demonstration thresholds and engineering gates, not official HAC policy or sufficient production acceptance. Review representative independent field data before deployment.

HAC administrators can publish validated artifacts, supersede the active version, roll back, or archive with a recorded reason. Publication checks retained source-image provenance and rejects a dataset modified since training. Source samples supporting published, superseded or archived artifacts cannot be deleted through the API. Predictions retain model version and candidate scores. Ordinary inspectors use the published model; administrators can explicitly live-test an unpublished artifact. Uncertain, low-score or closest-background matches remain unconfirmed.

The scanner supports actual camera acquisition, rear/front switching, supported torch control, freeze/retake, uploaded images, captured evidence, throttled inference, tensor cleanup, native BarcodeDetector barcode/QR where available, and manual lookup. Camera denial and missing models remain actionable. No active model is required for barcode/manual inspection.

## Observed validation

The official download host was initially blocked; it later became reachable. Node.js startup now uses `--use-env-proxy` so model fetches honor the environment's supported proxy while retaining TLS verification.

Actual pretrained inference passed using two generated images: safe decoding, finite normalized 256-dimensional features and correct similarity self-ranking. A separate live HTTP integration persisted 15 clearly labeled synthetic images across two fictional product classes and background, performed actual feature extraction and grouped held-out evaluation, trained two real artifacts, published a validated version, persisted an image prediction, superseded it and rolled back successfully. Both synthetic test models were then archived; no test model remains active. Results are private artifacts under `.local/`.

These are genuine image/ML integration checks using generated illustrations. They do **not** establish real packaging-recognition accuracy. No representative labeled HAC product photographs were supplied, no field accuracy is claimed, and no model is installed by the seed.

## Remaining work

Collect representative independently photographed product/background sessions and test live recognition on target Android hardware. Add a background training worker with cancellation/progress, operational threshold calibration, reviewed feedback, durable immutable dataset-version snapshots, production drift monitoring, authenticated offline model packages and TFLite export/inference. The synchronous handler permits at most 1,500 samples; large catalogues require a worker and an approximate nearest-neighbour index. Current browser inference hardware/latency needs field validation; measured CPU smoke latency is not a mobile performance guarantee.
