// Deterministic, self-contained scene assets for the illumination demo.
// This module generates assets; regression tests remain in ignored Context/tests.
const { createHash } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

function cubeGlb(name, colour) {
    const faces = [
        [
            [1, 0, 0],
            [
                [0.5, -0.5, -0.5],
                [0.5, 0.5, -0.5],
                [0.5, 0.5, 0.5],
                [0.5, -0.5, 0.5]
            ]
        ],
        [
            [-1, 0, 0],
            [
                [-0.5, -0.5, 0.5],
                [-0.5, 0.5, 0.5],
                [-0.5, 0.5, -0.5],
                [-0.5, -0.5, -0.5]
            ]
        ],
        [
            [0, 1, 0],
            [
                [-0.5, 0.5, -0.5],
                [-0.5, 0.5, 0.5],
                [0.5, 0.5, 0.5],
                [0.5, 0.5, -0.5]
            ]
        ],
        [
            [0, -1, 0],
            [
                [-0.5, -0.5, 0.5],
                [-0.5, -0.5, -0.5],
                [0.5, -0.5, -0.5],
                [0.5, -0.5, 0.5]
            ]
        ],
        [
            [0, 0, 1],
            [
                [-0.5, -0.5, 0.5],
                [0.5, -0.5, 0.5],
                [0.5, 0.5, 0.5],
                [-0.5, 0.5, 0.5]
            ]
        ],
        [
            [0, 0, -1],
            [
                [0.5, -0.5, -0.5],
                [-0.5, -0.5, -0.5],
                [-0.5, 0.5, -0.5],
                [0.5, 0.5, -0.5]
            ]
        ]
    ];
    const positions = [];
    const normals = [];
    const indices = [];
    for (const [normal, corners] of faces) {
        const first = positions.length / 3;
        for (const corner of corners) {
            positions.push(...corner);
            normals.push(...normal);
        }
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    const positionBytes = positions.length * 4;
    const normalBytes = normals.length * 4;
    const binary = Buffer.alloc(positionBytes + normalBytes + indices.length * 2);
    positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
    normals.forEach((value, index) => binary.writeFloatLE(value, positionBytes + index * 4));
    indices.forEach((value, index) =>
        binary.writeUInt16LE(value, positionBytes + normalBytes + index * 2)
    );
    const gltf = {
        asset: { version: '2.0', generator: 'ARTEMIS illumination demo' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name, mesh: 0 }],
        meshes: [
            {
                name,
                primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }]
            }
        ],
        materials: [
            {
                name: `${name}_matte`,
                pbrMetallicRoughness: {
                    baseColorFactor: [...colour, 1],
                    metallicFactor: 0,
                    roughnessFactor: 1
                }
            }
        ],
        buffers: [{ byteLength: binary.length }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positionBytes, target: 34962 },
            { buffer: 0, byteOffset: positionBytes, byteLength: normalBytes, target: 34962 },
            {
                buffer: 0,
                byteOffset: positionBytes + normalBytes,
                byteLength: indices.length * 2,
                target: 34963
            }
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                count: 24,
                type: 'VEC3',
                min: [-0.5, -0.5, -0.5],
                max: [0.5, 0.5, 0.5]
            },
            { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
            { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR', min: [0], max: [23] }
        ]
    };
    const json = Buffer.from(JSON.stringify(gltf), 'utf8');
    const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
    json.copy(paddedJson);
    const result = Buffer.alloc(12 + 8 + paddedJson.length + 8 + binary.length);
    result.write('glTF', 0, 'ascii');
    result.writeUInt32LE(2, 4);
    result.writeUInt32LE(result.length, 8);
    result.writeUInt32LE(paddedJson.length, 12);
    result.writeUInt32LE(0x4e4f534a, 16);
    paddedJson.copy(result, 20);
    const binaryHeader = 20 + paddedJson.length;
    result.writeUInt32LE(binary.length, binaryHeader);
    result.writeUInt32LE(0x004e4942, binaryHeader + 4);
    binary.copy(result, binaryHeader + 8);
    return result;
}

function uniformIes(multiplier) {
    return Buffer.from(
        [
            'IESNA:LM-63-2002',
            '[TEST] ARTEMIS DEMO',
            'TILT=NONE',
            `1 -1 ${multiplier} 3 1 1 2 0 0 0 1 1 1`,
            '0 90 180',
            '0',
            '1000 1000 1000',
            ''
        ].join('\n'),
        'ascii'
    );
}

function buildFixtureDefinitions() {
    return {
        grey_cube: {
            bytes: cubeGlb('grey_cube', [0.5, 0.5, 0.5]),
            extension: 'glb',
            contentType: 'model/gltf-binary'
        },
        black_cube: {
            bytes: cubeGlb('black_cube', [0, 0, 0]),
            extension: 'glb',
            contentType: 'model/gltf-binary'
        },
        ies_1: { bytes: uniformIes(1), extension: 'ies', contentType: 'text/plain' },
        ies_2: { bytes: uniformIes(2), extension: 'ies', contentType: 'text/plain' }
    };
}

async function writeIlluminationDemoFixtures(directory) {
    const manifest = { version: 1, fixtures: {} };
    await mkdir(directory, { recursive: true });
    for (const [key, definition] of Object.entries(buildFixtureDefinitions())) {
        const sha256 = createHash('sha256').update(definition.bytes).digest('hex');
        const file = `${key}.${definition.extension}`;
        await writeFile(path.join(directory, file), definition.bytes);
        manifest.fixtures[key] = {
            file,
            sha256,
            size: definition.bytes.length,
            contentType: definition.contentType
        };
    }
    await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
    );
    return manifest;
}

module.exports = { buildFixtureDefinitions, writeIlluminationDemoFixtures };

if (require.main === module) {
    writeIlluminationDemoFixtures(__dirname).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
