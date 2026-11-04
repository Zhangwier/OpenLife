"""Build the life-map sprites from the accepted art-lab sources.

Reads tools/art-lab/asset-manifest.json (crops, alpha cut-offs, walk frames)
and writes native-size PNGs to apps/web/public/art/map/, plus sprites.json
with each sprite's size and foot point. The art-lab sample stays the visual
reference; this only resizes its source PNGs to the life-map scale (16 px
cells, a 38 px tall person), the same way the sample's renderer does:
high-quality downsample, then a hard alpha cut-off so edges stay pixel-crisp.

Requires Pillow. Run from the repository root:
    python scripts/art/build-map-sprites.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / 'tools' / 'art-lab'
OUT = ROOT / 'apps' / 'web' / 'public' / 'art' / 'map'

# name: (manifest asset, native size, tint)
SPRITES = {
    'tree': ('tree', (96, 131), None),
    'treeSmall': ('tree', (70, 96), None),
    'treeFront': ('tree', (120, 164), (0.74, 0.8, 0.88)),
    'slender': ('slender', (61, 133), None),
    'birch': ('birch', (79, 124), None),
    'shrub': ('shrub', (52, 28), None),
    'shrubLarge': ('shrub', (75, 41), (0.9, 0.94, 0.98)),
    'house': ('house', (164, 110), None),
    'shed': ('house', (132, 89), (0.96, 0.95, 0.92)),
    'fence': ('fence', (84, 19), None),
    'flower': ('flower', (13, 22), None),
    'tallgrass': ('tallgrass', (17, 28), None),
    'person': ('person', (13, 38), None),
}


def cut(img, cutoff, tint):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < cutoff or (r > 180 and g < 80 and b < 85):
                px[x, y] = (0, 0, 0, 0)
                continue
            if tint:
                r, g, b = (round(r * tint[0]), round(g * tint[1]), round(b * tint[2]))
            px[x, y] = (r, g, b, 255)
    return img


def main():
    manifest = json.loads((LAB / 'asset-manifest.json').read_text(encoding='utf-8'))
    sources = {name: Image.open(LAB / s['file']).convert('RGBA') for name, s in manifest['sources'].items()}
    OUT.mkdir(parents=True, exist_ok=True)
    index = {}
    for name, (asset, size, tint) in SPRITES.items():
        meta = manifest['assets'][asset]
        x, y, w, h = meta['crop']
        img = sources[meta.get('source', asset)].crop((x, y, x + w, y + h)).resize(size, Image.LANCZOS)
        cut(img, meta.get('alphaCutoff', 190), tint).save(OUT / f'{name}.png')
        index[name] = {'w': size[0], 'h': size[1], 'footX': size[0] // 2, 'footY': size[1]}
    # Ground textures, sampled per pixel under grass and path tiles (outdoor maps are 36x22 cells).
    for name in ('lawn', 'ground'):
        sources[name].convert('RGB').resize((576, 352), Image.LANCZOS).save(OUT / f'{name}.png')
        index[name] = {'w': 576, 'h': 352, 'texture': True}
    walk = manifest['animations']['walk']
    fw, fh = walk['nativeSize']
    sheet = Image.new('RGBA', (fw * len(walk['frames']), fh))
    for i, (x, y, w, h) in enumerate(walk['frames']):
        frame = sources[walk['source']].crop((x, y, x + w, y + h)).resize((fw, fh), Image.LANCZOS)
        sheet.paste(cut(frame, 220, None), (i * fw, 0))
    sheet.save(OUT / 'walk.png')
    index['walk'] = {'w': fw, 'h': fh, 'frames': len(walk['frames']), 'footX': fw // 2, 'footY': fh}
    (OUT / 'sprites.json').write_text(json.dumps({
        'from': 'tools/art-lab/asset-manifest.json (' + manifest['version'] + ')',
        'origin': 'AI-generated source PNGs retained in tools/art-lab/sources/',
        'cell': 16, 'sprites': index}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(index)} sprites written to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
