"""Extract practice records from the supplied Hexcite GBC ROM (stdlib only).

Usage: python3 tools/extract-practice.py ROM_PATH OUTPUT_JSON
Coordinates, shape IDs, and rotations retain the ROM's native conventions.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path


def extract(rom):
    if rom[0x134:0x13b] != b'HEXCITE':
        raise ValueError('Expected a Hexcite ROM')
    bank_offset = 6 * 0x4000
    pointers = struct.unpack_from('<51H', rom, bank_offset)
    if pointers[0] != 0x4066 or any(a >= b for a, b in zip(pointers, pointers[1:])):
        raise ValueError('Unsupported ROM layout')
    configurations = []
    for number in range(1, 51):
        offset = bank_offset + pointers[number] - 0x4000
        end = offset + 28
        while rom[end] != 0xff:
            end += 3
        record = rom[offset:end + 1]
        assert len(record) == 29 + ((len(record) - 29) // 3) * 3
        def placement(data):
            return {'shapeId': data[0] >> 4, 'rotation': data[0] & 15,
                    'x': data[1], 'y': data[2]}
        configurations.append({
            'number': number,
            'romOffset': f'0x{offset:05x}',
            'bankAddress': f'06:{pointers[number]:04x}',
            'startingScores': list(struct.unpack_from('<HH', record, 1)),
            'handsByNativeShapeId': [list(record[9:17]), list(record[17:25])],
            'suggestedOpening': placement(record[25:28]),
            'placements': [placement(record[i:i+3]) for i in range(28, len(record)-1, 3)],
            'unresolvedHeader': {'byte0': record[0], 'bytes5Through8': list(record[5:9])},
            'rawRecordHex': record.hex(' '),
        })
    return {
        'sourceSha256': hashlib.sha256(rom).hexdigest(),
        'pointerTableOffset': '0x18000',
        'shapeAnchorOffsets': [
            [[struct.unpack_from('b', rom, 0x6c84 + shape * 8 + rotation)[0],
              struct.unpack_from('b', rom, 0x6cc4 + shape * 8 + rotation)[0]]
             for rotation in range(6)] for shape in range(8)
        ],
        'shapeCellOffsets': [
            [
                [list(struct.unpack_from('bb', rom, address + 1 + 2 * i))
                 for i in range(rom[address])]
                for address in [struct.unpack_from('<H', rom, table + 2 * rotation)[0]
                                for rotation in range(6)]
            ]
            for table in struct.unpack_from('<8H', rom, 0x76e8)
        ],
        'recordLayout': {
            '0': 'Unresolved setting', '1..2': 'Player starting score, little endian',
            '3..4': 'Computer starting score, little endian', '5..8': 'Unresolved settings',
            '9..16': 'Player counts indexed by native shape ID',
            '17..24': 'Computer counts indexed by native shape ID',
            '25..27': 'Suggested opening: packed shape/rotation, x, y',
            '28..terminator': 'Preset placements: packed shape/rotation, x, y; FF ends record',
        },
        'notes': [
            'Native coordinates and rotations have not been converted to the web game geometry.',
            'Shape IDs 0..6 are playable pieces; ID 7 is a full-region hexagon used in preset boards.',
            'Pointer index 0 is a separate default record and is excluded from these 50 numbered problems.',
            'Unresolved header values are preserved verbatim.',
        ],
        'configurations': configurations,
    }


if __name__ == '__main__':
    result = extract(Path(sys.argv[1]).read_bytes())
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n')
    print(f"Extracted {len(result['configurations'])} practice configurations")
