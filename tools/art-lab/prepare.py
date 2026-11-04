"""Prepare the standalone art preview using only Python's standard library."""
import argparse
import base64
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate source hashes without writing assets.js.')
    parser.add_argument('--refresh-hashes', action='store_true', help='Record intentionally revised source hashes in the manifest.')
    args = parser.parse_args()
    if args.check and args.refresh_hashes:
        parser.error('--check and --refresh-hashes are mutually exclusive')
    root = Path(__file__).resolve().parent
    manifest_path = root / 'asset-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for kind, expected in manifest['baseline']['sha256'].items():
        baseline_path = (root / manifest['baseline'][kind]).resolve()
        if root not in baseline_path.parents:
            raise ValueError('Baseline outside sample folder')
        if hashlib.sha256(baseline_path.read_bytes()).hexdigest() != expected:
            raise ValueError('Accepted baseline changed; keep it intact and make a separate candidate.')
    images = {}
    for name, source in manifest['sources'].items():
        path = (root / source['file']).resolve()
        if root not in path.parents:
            raise ValueError(f'Source outside sample folder: {name}')
        data = path.read_bytes()
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Not a PNG: {source["file"]}')
        digest = hashlib.sha256(data).hexdigest()
        if args.refresh_hashes:
            source['sha256'] = digest
        elif digest != source['sha256']:
            raise ValueError(f'Hash changed: {source["file"]}; review the asset, then use --refresh-hashes.')
        images[name] = 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')
    if args.refresh_hashes:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if not args.check:
        script = 'window.ART_SOURCES=' + json.dumps(images, separators=(',', ':')) + ';\n'
        script += 'window.ART_MANIFEST=' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ';\n'
        (root / 'assets.js').write_text(script, encoding='utf-8')
        (root / 'output').mkdir(exist_ok=True)
    print(f'Validated {len(images)} PNG sources; ' + ('no files written.' if args.check else 'assets.js prepared.'))


if __name__ == '__main__':
    main()
