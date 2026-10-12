# Illumination simulation reference fixtures

Small deterministic assets for the ARTEMIS illumination demo client:

- `grey_cube.glb`: a closed, matte-grey cube with embedded geometry and no textures.
- `black_cube.glb`: the same closed cube with a matte-black material.
- `ies_1.ies` and `ies_2.ies`: uniform synthetic profiles differing only by candela multiplier 1/2.

The client assembles these cubes into a receiver, test booth and shadow blocker.
The IES profiles use `TILT=NONE` and 1000-candela samples.
They support relative behavior checks and do not certify absolute photometric calibration.

`manifest.json` records each filename, SHA-256, byte length and intended content type.
Use raw.githubusercontent.com URLs pinned to a commit for repeatable imports and cache keys.
Keep these small binaries as ordinary Git blobs, so raw URLs deliver GLB bytes directly.
The remote Node service and Unreal renderer fetch the files; the HTML does not send
session credentials to GitHub. The existing renderer asset cache still applies.

To regenerate the assets and manifest, run from the repository root:

```sh
node illumination-demo/generate.cjs
```

The generator uses only Node built-ins. Identical inputs produce identical fixture bytes and SHA-256 checksums.
