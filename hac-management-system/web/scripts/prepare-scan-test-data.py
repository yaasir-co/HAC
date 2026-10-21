"""Rebuild the attributed camera-test image manifest. Python 3 + Pillow 12.3.0 + curl.
Images stay in ignored .local; this command never contacts the application database.
"""
import concurrent.futures
import hashlib
import io
import json
import pathlib
import subprocess
import urllib.parse
from PIL import Image, ImageOps

app = pathlib.Path(__file__).resolve().parent.parent
output = app / '.local/object-test'
(output / 'images').mkdir(parents=True, exist_ok=True)
sources = json.loads((app / 'src/data/scan-test/sources.json').read_text())['samples']

def download(source):
    url = urllib.parse.urlparse(source['url'])
    if url.scheme != 'https' or url.hostname not in ['open-images-dataset.s3.amazonaws.com', 'upload.wikimedia.org', 'thumb.wikimedia.org']:
        raise ValueError('Unrecognized source host')
    target = output / 'images' / (source['id'] + '.jpg')
    if not target.exists():
        raw = subprocess.check_output(['curl', '-fLsS', '--retry', '2', '--max-time', '60', '--max-filesize', '20000000', source['url']])
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
        if 'box' in source:
            x0, y0, x1, y1 = source['box']
            image = image.crop((round(x0 * image.width), round(y0 * image.height), round(x1 * image.width), round(y1 * image.height)))
        image.thumbnail((600, 600))
        image.save(target, 'JPEG', quality=90)
    if hashlib.sha256(target.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError('Image changed or decoder version differs; review source before retraining: ' + source['id'])
    return {**source, 'file': 'images/' + target.name}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    samples = list(pool.map(download, sources))
(output / 'dataset.json').write_text(json.dumps({'format': 'hac-object-test-data-v1', 'samples': samples}, ensure_ascii=False, indent=2))
print('Prepared', len(samples), 'attributed test images in', output)
