"""Check integer pixel scaling. Standard-library only; this is not an art-quality score."""
import argparse
import json
import struct
import sys
import zlib
from pathlib import Path


def read_png(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a PNG')
    pos, compressed, header = 8, bytearray(), None
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        kind, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
        crc = struct.unpack('>I', data[pos + 8 + length:pos + 12 + length])[0]
        if zlib.crc32(kind + body) & 0xffffffff != crc:
            raise ValueError('PNG CRC mismatch')
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', body)
        elif kind == b'IDAT':
            compressed.extend(body)
        elif kind == b'IEND':
            break
        pos += length + 12
    if header is None:
        raise ValueError('Missing IHDR')
    width, height, depth, color, compression, filtering, interlace = header
    if depth != 8 or color not in (2, 6) or compression or filtering or interlace:
        raise ValueError('Use a non-interlaced 8-bit RGB/RGBA PNG from Canvas or browser capture')
    channels = 3 if color == 2 else 4
    stride = width * channels
    raw = zlib.decompress(compressed)
    if len(raw) != height * (stride + 1):
        raise ValueError('PNG scanline size mismatch')
    rows, previous = [], bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        mode, line = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        if mode > 4:
            raise ValueError('Unknown PNG filter')
        for x in range(stride):
            left = line[x - channels] if x >= channels else 0
            up = previous[x]
            upper_left = previous[x - channels] if x >= channels else 0
            if mode == 1:
                predictor = left
            elif mode == 2:
                predictor = up
            elif mode == 3:
                predictor = (left + up) // 2
            elif mode == 4:
                p = left + up - upper_left
                distances = (abs(p - left), abs(p - up), abs(p - upper_left))
                predictor = (left, up, upper_left)[distances.index(min(distances))]
            else:
                predictor = 0
            line[x] = (line[x] + predictor) & 255
        if channels == 4:
            rows.append(bytes(line))
        else:
            rgba = bytearray(width * 4)
            for x in range(width):
                rgba[x * 4:x * 4 + 4] = line[x * 3:x * 3 + 3] + b'\xff'
            rows.append(bytes(rgba))
        previous = line
    return width, height, rows


def compare(native, scaled, factor):
    nw, nh, source = native
    sw, sh, target = scaled
    if factor < 1 or (sw, sh) != (nw * factor, nh * factor):
        raise ValueError('Scaled PNG dimensions must be exactly native dimensions times the integer scale')
    nonuniform, mismatched, samples = 0, 0, []
    for y in range(nh):
        for x in range(nw):
            expected = source[y][x * 4:x * 4 + 4]
            actual = set()
            for dy in range(factor):
                row = target[y * factor + dy]
                for dx in range(factor):
                    offset = (x * factor + dx) * 4
                    actual.add(row[offset:offset + 4])
            nonuniform += len(actual) != 1
            wrong = actual != {expected}
            mismatched += wrong
            if wrong and len(samples) < 8:
                samples.append([x, y])
    return {'passed': not nonuniform and not mismatched, 'native': [nw, nh],
            'scaled': [sw, sh], 'scale': factor, 'blocks_checked': nw * nh,
            'nonuniform_blocks': nonuniform, 'mismatched_blocks': mismatched,
            'sample_mismatches': samples, 'scope': 'Pixel grid and frame correspondence only; not aesthetic acceptance'}


def self_test():
    red, green, blue = b'\xff\x00\x00\xff', b'\x00\xff\x00\xff', b'\x00\x00\xff\xff'
    source = (2, 1, [red + green])
    good = (4, 2, [red * 2 + green * 2] * 2)
    bad = (4, 2, [blue + red + green * 2, good[2][1]])
    assert compare(source, good, 2)['passed']
    assert not compare(source, bad, 2)['passed']
    assert compare(source, bad, 2)['nonuniform_blocks'] == 1
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)
    encoded = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 1, 8, 6, 0, 0, 0))
    encoded += chunk(b'IDAT', zlib.compress(b'\x00' + red + green)) + chunk(b'IEND', b'')
    assert read_png(encoded) == source
    print('PASS: PNG decoding, exact scaling accepted, one damaged pixel rejected.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native', type=Path)
    parser.add_argument('--scaled', type=Path)
    parser.add_argument('--scale', type=int)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.native is None or args.scaled is None or args.scale is None:
        parser.error('--native, --scaled and --scale are required')
    result = compare(read_png(args.native.read_bytes()), read_png(args.scaled.read_bytes()), args.scale)
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output + '\n', encoding='utf-8')
    print(output)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, zlib.error, struct.error) as error:
        print(json.dumps({'passed': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(2)
