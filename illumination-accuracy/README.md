# Illumination measurement reference assets

These deterministic fixtures enter ARTEMIS through its existing asset and IES URL endpoints.
They require no additional API routes, payload fields or renderer modifications.

All GLBs contain their own geometry and materials, without textures or external files.
Positions use metres. The existing ARTEMIS GLB importer maps source `(x,y,z)` to
service `(x,z,y)`. Disk and receiver source XY planes therefore have service +Y normals.
The enclosure's six inside faces are at +/-5 m from its origin. Every face is opaque,
two-sided and explicitly has zero specular response. The emitter material has zero
base reflectance and specified emissive RGB; its emissive strength extension preserves
values above one. The receiver is a two-sided, zero-thickness 1 m square with linear
diffuse reflectance 0.18, roughness 1, metallic 0, specular 0 and emission 0.

The disk has unit circumradius and 1024 triangle sectors. `manifest.json` records its
actual regular-polygon area and its small difference from the ideal circle. The colored
enclosure has one red service +X wall `[12,0,0]`, one green service -X wall `[0,6,0]`,
and four black walls. At the exact centre each wall subtends one sixth of the sphere.

IES profiles use LM-63-2002 absolute photometry, Type C, TILT=NONE and horizontal axial
symmetry. Values in the table are candela; the manifest records angles, multipliers and
the independently integrated nominal lumens. The anisotropic profile is piecewise linear
in vertical angle. With an identity ARTEMIS point-light transform, its polar zero axis
is service +X; the uniform profiles are orientation independent.

These are synthetic analytic references. They do not constitute an external physical
calibration certificate or a spectral model. `manifest.json` preserves the original
linear scene RGB reference and the IES photometric reference separately.

Regenerate to a directory of your choice:

```sh
node illumination-accuracy/generate.cjs /path/to/output
```

The generator uses Node built-ins, validates encoded triangle geometry and known cube
volumes, and emits deterministic bytes with SHA-256 hashes. Keep GLBs as ordinary Git
blobs so immutable raw GitHub URLs return the bytes directly.
