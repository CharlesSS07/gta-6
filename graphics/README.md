# Graphics

**Owner:** Lux (3D Graphics & Engine Programmer)

This folder contains shader architecture, LOD specifications, performance profiles, and render pipeline documentation.

## Contents

- `shaders/` — GLSL/WGSL shader source files
- `lod-spec.md` — LOD tier specs (see architecture doc for summary)
- `performance-profiles/` — Frame timing captures, VRAM profiling results
- `streaming-tests/` — Tile load/unload benchmarks

## Key Technical Decisions

- **Engine:** Babylon.js v7.x, WebGL2 mandatory
- **Tile size:** 64m × 64m with 500m load radius / 600m unload (hysteresis)
- **VRAM budget:** 2GB — KTX2+Draco compression everywhere, no exceptions
- **Performance baseline:** 60fps on RTX 2060+, 30fps on Iris Xe
- **Streaming:** All parsing in Web Workers — main thread: GPU upload only
- **Quality tiers:** Low/Medium/High with GPU auto-detect on first load

Full LOD specification in [`../architecture/technical-architecture-v0.1.md#8-lod-specification`](../architecture/technical-architecture-v0.1.md).
