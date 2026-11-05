# Model pipeline

Produces `apps/web/public/models/skull.glb` from the source skull.

## Source

[Skull ("ScatteringSkull")](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ScatteringSkull)
by Vladimir Petkovic, from Khronos glTF-Sample-Assets, licensed CC0-1.0.
The 8.5 MB source file is not committed.

## Run

```
pnpm install
curl -L -o skull-source.glb https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb
pnpm --filter model-pipeline skull ../../skull-source.glb ../../apps/web/public/models/skull.glb
```

The script's frame and arch constants must match
`apps/web/src/features/dental-chart/three/archLayout.ts`.
