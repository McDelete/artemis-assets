// Deterministic, embedded reference fixtures. No renderer or API dependency.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const DISK_SEGMENTS = 1024;
const OUTPUT = path.resolve(process.argv[2] || path.join(__dirname, 'files'));

function material(radiance = [0, 0, 0], reflectance = [0, 0, 0], doubleSided = true) {
    const strength = Math.max(...radiance, 1);
    return {
        name: 'Explicit linear reference material',
        alphaMode: 'OPAQUE',
        doubleSided,
        pbrMetallicRoughness: {
            baseColorFactor: [...reflectance, 1],
            metallicFactor: 0,
            roughnessFactor: 1
        },
        emissiveFactor: radiance.map((value) => value / strength),
        extensions: {
            KHR_materials_specular: { specularFactor: 0 },
            KHR_materials_emissive_strength: { emissiveStrength: strength }
        }
    };
}

function primitive(positions, normal, indices, materialIndex = 0) {
    return { positions, normals: positions.map(() => [...normal]), indices, materialIndex };
}

function cubePrimitives(fullSize, inward = false, materialIndices = [0, 0, 0, 0, 0, 0]) {
    const h = fullSize / 2;
    const faces = [
        [[1, 0, 0], [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]]],
        [[-1, 0, 0], [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]]],
        [[0, 1, 0], [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]]],
        [[0, -1, 0], [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]]],
        [[0, 0, 1], [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]]],
        [[0, 0, -1], [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]]]
    ];
    return faces.map(([normal, vertices], index) => primitive(
        vertices,
        inward ? normal.map((value) => -value) : normal,
        inward ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3],
        materialIndices[index]
    ));
}

function glb(name, primitives, materials) {
    const chunks = [];
    const bufferViews = [];
    const accessors = [];
    let offset = 0;
    function accessor(values, components, componentType, type, target) {
        const flat = values.flat();
        const bytesPerValue = componentType === 5126 ? 4 : 2;
        const bytes = Buffer.alloc(flat.length * bytesPerValue);
        flat.forEach((value, index) => {
            if (componentType === 5126) bytes.writeFloatLE(value, index * 4);
            else bytes.writeUInt16LE(value, index * 2);
        });
        const viewIndex = bufferViews.length;
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
        chunks.push(bytes);
        offset += bytes.length;
        const padding = (4 - offset % 4) % 4;
        if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
        const index = accessors.length;
        const description = { bufferView: viewIndex, componentType, count: flat.length / components, type };
        if (target === 34962) {
            description.min = Array.from({ length: components }, (_, axis) =>
                Math.min(...values.map((value) => value[axis])));
            description.max = Array.from({ length: components }, (_, axis) =>
                Math.max(...values.map((value) => value[axis])));
        }
        accessors.push(description);
        return index;
    }
    const meshPrimitives = primitives.map((part) => ({
        attributes: {
            POSITION: accessor(part.positions, 3, 5126, 'VEC3', 34962),
            NORMAL: accessor(part.normals, 3, 5126, 'VEC3', 34962)
        },
        indices: accessor(part.indices, 1, 5123, 'SCALAR', 34963),
        material: part.materialIndex,
        mode: 4
    }));
    const binary = Buffer.concat(chunks);
    const json = {
        asset: { version: '2.0', generator: 'ARTEMIS measurement reference fixtures v1' },
        extensionsUsed: ['KHR_materials_specular', 'KHR_materials_emissive_strength'],
        extensionsRequired: ['KHR_materials_specular', 'KHR_materials_emissive_strength'],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name, mesh: 0 }],
        meshes: [{ name, primitives: meshPrimitives }],
        materials,
        buffers: [{ byteLength: binary.length }],
        bufferViews,
        accessors
    };
    const jsonBytes = Buffer.from(JSON.stringify(json));
    const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
    jsonBytes.copy(paddedJson);
    const header = Buffer.alloc(20);
    header.write('glTF');
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + paddedJson.length + binary.length, 8);
    header.writeUInt32LE(paddedJson.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(binary.length, 0);
    binaryHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, paddedJson, binaryHeader, binary]);
}

function ies(angles, candelas) {
    return Buffer.from([
        'IESNA:LM-63-2002',
        '[TEST] ARTEMIS deterministic photometric reference v1',
        'TILT=NONE',
        `1 -1 1 ${angles.length} 1 1 2 0 0 0 1 1 1`,
        angles.join(' '),
        '0',
        candelas.join(' '),
        ''
    ].join('\n'), 'ascii');
}

function profileFlux(angles, candelas) {
    let integral = 0;
    for (let index = 1; index < angles.length; index++) {
        const lo = angles[index - 1] * Math.PI / 180;
        const hi = angles[index] * Math.PI / 180;
        const slope = (candelas[index] - candelas[index - 1]) / (hi - lo);
        const intercept = candelas[index - 1] - slope * lo;
        const antiderivative = (theta) =>
            -intercept * Math.cos(theta) + slope * (-theta * Math.cos(theta) + Math.sin(theta));
        integral += antiderivative(hi) - antiderivative(lo);
    }
    return 2 * Math.PI * integral;
}

function definitions() {
    const result = {};
    function addMesh(key, parts, materials, metadata) {
        result[key] = {
            bytes: glb(key, parts, materials),
            file: `${key}.glb`,
            contentType: 'model/gltf-binary',
            ...metadata
        };
    }
    const cubeGeometry = {
        kind: 'enclosure', units: 'metres', centreService: [0, 0, 0],
        fullSizeService: [10, 10, 10], innerFaceDistance: 5, triangles: 12,
        faceSolidAngleFractionAtCentre: 1 / 6
    };
    const materialMetadata = {
        baseReflectance: [0, 0, 0], metallic: 0, roughness: 1, specular: 0,
        alphaMode: 'OPAQUE', doubleSided: true,
        emissionEncoding: 'emissiveFactor * KHR_materials_emissive_strength.emissiveStrength'
    };
    function enclosure(key, radiance) {
        addMesh(key, cubePrimitives(10, true), [material(radiance)], {
            kind: 'uniform_enclosure', geometry: cubeGeometry,
            radiance, material: materialMetadata
        });
    }
    enclosure('black_enclosure', [0, 0, 0]);
    for (const [suffix, level] of [
        ['0', 0], ['0_01', 0.01], ['1', 1], ['10', 10], ['100', 100],
        ['1000', 1000], ['10000', 10000]
    ]) enclosure(`uniform_enclosure_${suffix}`, [level, level, level]);
    enclosure('uniform_enclosure_rgb', [1, 3, 9]);

    const diskVertices = [[0, 0, 0]];
    const diskIndices = [];
    for (let index = 0; index < DISK_SEGMENTS; index++) {
        const angle = 2 * Math.PI * index / DISK_SEGMENTS;
        diskVertices.push([Math.cos(angle), Math.sin(angle), 0]);
        diskIndices.push(0, index + 1, (index + 1) % DISK_SEGMENTS + 1);
    }
    addMesh('emissive_disk', [primitive(diskVertices, [0, 0, 1], diskIndices)],
        [material([100, 100, 100])], {
            kind: 'emissive_disk', radiance: [100, 100, 100], material: materialMetadata,
            geometry: {
                kind: 'regular_polygon_disk', units: 'metres', centreService: [0, 0, 0],
                sourceNormal: [0, 0, 1], normalService: [0, 1, 0], radius: 1,
                segments: DISK_SEGMENTS, triangles: DISK_SEGMENTS,
                polygonArea: DISK_SEGMENTS * Math.sin(2 * Math.PI / DISK_SEGMENTS) / 2,
                circleArea: Math.PI,
                circleAreaRelativeDifference: 1 - DISK_SEGMENTS *
                    Math.sin(2 * Math.PI / DISK_SEGMENTS) / (2 * Math.PI)
            }
        });
    const receiver = primitive([
        [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]
    ], [0, 0, 1], [0, 1, 2, 0, 2, 3]);
    addMesh('lambert_receiver', [receiver], [material([0, 0, 0], [0.18, 0.18, 0.18], true)], {
        kind: 'lambert_receiver', reflectance: [0.18, 0.18, 0.18],
        material: { ...materialMetadata, baseReflectance: [0.18, 0.18, 0.18], doubleSided: true },
        geometry: {
            kind: 'plane', units: 'metres', centreService: [0, 0, 0],
            sourceNormal: [0, 0, 1], normalService: [0, 1, 0],
            fullSizeService: [1, 0, 1], area: 1, triangles: 2
        }
    });
    addMesh('black_block', cubePrimitives(1), [material()], {
        kind: 'absorbing_block', reflectance: [0, 0, 0], material: materialMetadata,
        geometry: { kind: 'cube', units: 'metres', centreService: [0, 0, 0], fullSizeService: [1, 1, 1], triangles: 12 }
    });
    addMesh('colored_enclosure', cubePrimitives(10, true, [0, 1, 2, 2, 2, 2]), [
        material([12, 0, 0]), material([0, 6, 0]), material()
    ], {
        kind: 'colored_enclosure', geometry: cubeGeometry, material: materialMetadata,
        faces: [
            { locationService: [5, 0, 0], radiance: [12, 0, 0], solidAngleFractionAtCentre: 1 / 6 },
            { locationService: [-5, 0, 0], radiance: [0, 6, 0], solidAngleFractionAtCentre: 1 / 6 }
        ],
        remainingFaceRadiance: [0, 0, 0]
    });
    for (const [key, angles, values] of [
        ['ies_uniform_10', [0, 90, 180], [10, 10, 10]],
        ['ies_uniform_20', [0, 90, 180], [20, 20, 20]],
        ['ies_anisotropic_10', [0, 30, 60, 90, 120, 150, 180], [10, 9, 7, 4, 2, 1, 0]]
    ]) {
        result[key] = {
            bytes: ies(angles, values), file: `${key}.ies`, contentType: 'text/plain', kind: 'ies_profile',
            ies: {
                standard: 'IESNA:LM-63-2002', photometricType: 'C', unitCode: 2,
                absolutePhotometry: true, lampCount: 1, lumensPerLamp: -1, candelaMultiplier: 1,
                tilt: 'NONE', verticalAngles: angles, horizontalAngles: [0],
                candelaSamples: [values], interpolation: 'linear in physical angle',
                peakCandela: Math.max(...values), nominalLuminousFlux: profileFlux(angles, values),
                nativeDefaultAxisService: [1, 0, 0]
            }
        };
    }
    return result;
}

function verifyMesh(bytes, fixture) {
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim());
    const binaryStart = 28 + jsonLength;
    assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942);
    assert.equal(json.buffers[0].byteLength, bytes.length - binaryStart);
    for (const item of json.materials) {
        assert.equal(item.extensions.KHR_materials_specular.specularFactor, 0);
        assert.equal(item.pbrMetallicRoughness.metallicFactor, 0);
        assert.equal(item.pbrMetallicRoughness.roughnessFactor, 1);
    }
    let triangles = 0;
    let area = 0;
    let signedVolume = 0;
    for (const part of json.meshes[0].primitives) {
        const indices = json.accessors[part.indices];
        const positions = json.accessors[part.attributes.POSITION];
        const indexView = json.bufferViews[indices.bufferView];
        const positionView = json.bufferViews[positions.bufferView];
        assert.equal(indices.count % 3, 0);
        triangles += indices.count / 3;
        const vertex = (index) => Array.from({ length: 3 }, (_, axis) => bytes.readFloatLE(
            binaryStart + positionView.byteOffset + index * 12 + axis * 4));
        for (let index = 0; index < indices.count; index += 3) {
            const ids = [0, 1, 2].map((offset) => bytes.readUInt16LE(
                binaryStart + indexView.byteOffset + (index + offset) * 2));
            for (const id of ids) assert.ok(id < positions.count);
            const [a, b, c] = ids.map(vertex);
            const u = b.map((value, axis) => value - a[axis]);
            const v = c.map((value, axis) => value - a[axis]);
            const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            area += Math.hypot(...cross) / 2;
            const bc = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
            signedVolume += a.reduce((sum, value, axis) => sum + value * bc[axis], 0) / 6;
        }
    }
    assert.equal(triangles, fixture.geometry.triangles);
    if (fixture.geometry.polygonArea) assert.ok(Math.abs(area / fixture.geometry.polygonArea - 1) < 1e-7);
    if (fixture.geometry.area) assert.ok(Math.abs(area - fixture.geometry.area) < 1e-9);
    if (['cube', 'enclosure'].includes(fixture.geometry.kind)) {
        const expectedVolume = fixture.geometry.fullSizeService.reduce((product, value) => product * value, 1);
        assert.ok(Math.abs(Math.abs(signedVolume) - expectedVolume) < 1e-9);
    }
    return { triangles, decodedTriangleArea: area, decodedSignedVolume: signedVolume };
}

async function main() {
    await mkdir(OUTPUT, { recursive: true });
    const fixtures = {};
    const verification = {};
    for (const [key, item] of Object.entries(definitions())) {
        const { bytes, ...metadata } = item;
        if (item.file.endsWith('.glb')) verification[key] = verifyMesh(bytes, item);
        await writeFile(path.join(OUTPUT, item.file), bytes);
        fixtures[key] = { ...metadata, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
        assert.equal(createHash('sha256').update(await readFile(path.join(OUTPUT, item.file))).digest('hex'), fixtures[key].sha256);
    }
    const manifest = {
        version: 1, generator: 'ARTEMIS measurement reference fixtures v1',
        quantityBasis: 'linear_scene_RGB',
        sourceGeometryToService: '(x,y,z) -> (x,z,y), through existing GLB import basis',
        photometricStatus: 'Synthetic analytic references; no external physical calibration certificate.',
        fixtures
    };
    await writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 4) + '\n');
    await writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(verification, null, 4) + '\n');
    console.log(JSON.stringify({ count: Object.keys(fixtures).length, output: OUTPUT, disk: verification.emissive_disk }));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { definitions, verifyMesh, profileFlux };
