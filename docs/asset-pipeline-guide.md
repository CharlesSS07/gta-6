# Asset Pipeline Guide

This guide defines the requirements for the Streets of Angels asset pipeline. It is a translation of the technical architecture specification (Sections 6–8) into actionable requirements for the art and pipeline teams.

**Authoritative source:** See `/architecture/technical-architecture-v0.1.md` Sections 6 (Map & World Data), 7 (LOD Specification), and 8 (Backend Architecture) for the full context and rationale.

---

## Pipeline Overview: OSM → Game Assets

The asset pipeline transforms OpenStreetMap (OSM) data into browser-playable game assets. The flow is deterministic and must be validated at each stage.

```
┌─────────────────────┐
│   OpenStreetMap     │
│  (raw vector data)  │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ OSM Data Extraction                      │
│ • Road network graph (nodes, edges)      │
│ • Building footprints + height estimate  │
│ • Terrain elevation mesh                 │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Per-Asset LOD Generation (Sections 7–8)  │
│ • Vertex budget enforcement              │
│ • Screen-size-based LOD transitions      │
│ • Dither-blend cross-fade (0.5m zone)    │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Collision & Navigation Meshes (separate) │
│ • Collision mesh (physics, vehicles)     │
│ • Navmesh (NPC pathfinding)              │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Texture Processing                       │
│ • All textures → KTX2 / Basis Universal  │
│ • Max 1024×1024 for LOD0                 │
│ • Max 512×512 for LOD1+                  │
│ • ASTC fallback for Apple Silicon        │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Geometry Compression                     │
│ • All geometry → Draco compressed        │
│ • Decompress in streaming worker only    │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Asset Validation (Section below)         │
│ • Vertex count vs. budget                │
│ • Texture resolution vs. tier            │
│ • instanceTypeId tagging (props)         │
│ • Impostor pre-generation (large bldgs)  │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ CDN Deployment                           │
│ • Content-hashed filenames               │
│ • Immutable cache headers                │
│ • Manifest file (5-min TTL)              │
└──────────────────────────────────────────┘
```

---

## LOD Classes & Tier Definitions

Every asset in the world belongs to exactly one LOD class. The class determines vertex budgets, draw distances, and LOD tier count.

**Transition method:** Screen-size-based (not distance-based). A 40-story tower and a corner bodega switch at different distances based on screen coverage.

**LOD cross-fade:** Dither-based blending over 0.5m blend zone. Hard pops are unacceptable on geometry players drive past constantly.

---

### Class 1: Large Buildings (>10 stories)

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 3,000–5,000 | 0–80m | Facade panels, window reveals, rooftop equipment |
| **LOD1** | 1,000–1,500 | 80–250m | Flat facade, normal map carries detail |
| **LOD2** | 250–500 | 250–600m | Box mesh + baked texture atlas |
| **LOD3 (Impostor)** | 8 (2 quads) | 600m–1km | Camera-facing billboard; pre-baked from LOD0 |
| **Culled** | — | >1km | Out of view distance |

**Impostors:** The ~20 tallest LA landmarks get static 4K impostor atlases. Generic towers: 8-angle impostors generated at build pipeline time, never at runtime.

---

### Class 2: Medium Buildings (3–10 stories)

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 1,200–2,000 | 0–60m | Storefront detail, signage, window frames |
| **LOD1** | 400–700 | 60–180m | Simplified facade |
| **LOD2** | 80–150 | 180–500m | Box proxy, baked texture |
| **Culled** | — | >500m | Out of view distance |

---

### Class 3: Small Buildings & Structures (1–2 stories)

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 500–1,000 | 0–40m | Full detail |
| **LOD1** | 150–300 | 40–120m | Simplified geometry |
| **Culled** | — | >120m | Not worth impostor cost |

---

### Class 4: Props (hydrants, benches, dumpsters, signage, bollards)

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 300–800 | 0–30m | Full detail |
| **LOD1** | 60–150 | 30–80m | Box/capsule approximation |
| **Culled** | — | >80m | Out of view distance |

**Critical requirement:** All props must be GPU-instanced by type per tile (see [instanceTypeId Tagging](#instancetypeid-tagging-props) below).

---

### Class 5: Vehicles

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 10,000–15,000 | 0–50m | Player vehicle always LOD0 regardless of distance |
| **LOD1** | 3,000–5,000 | 50–150m | AI vehicles; doors/wheel detail removed |
| **LOD2** | 800–1,200 | 150–350m | Color + silhouette only |
| **LOD3** | 200–350 | 350–600m | Background traffic |
| **Culled** | — | >600m | Out of view distance |

---

### Class 6: NPCs / Pedestrians

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 4,000–6,000 | 0–20m | Full skeleton, facial geometry, clothing detail |
| **LOD1** | 1,000–2,000 | 20–60m | Simplified mesh, fewer bone influences |
| **LOD2** | 300–500 | 60–150m | Capsule + color swatch; no skeleton (VAT) |
| **Billboard** | 8 | 150–250m | Camera-facing sprite, 2-frame walk cycle |
| **Culled** | — | >250m | Out of view distance |

Full skeletal animation: LOD0 and LOD1 only. LOD2: Vertex Animation Texture (VAT). Billboards: sprite sheets. Never run a full animator on an NPC at 200m.

---

### Class 7: Vegetation (street trees, shrubs)

| Tier | Vertex Budget | Approx. Switch Distance | Details |
|---|---|---|---|
| **LOD0** | 2,000–3,500 | 0–40m | Branch geometry, alpha-tested leaf cards |
| **LOD1** | 600–1,000 | 40–100m | Simplified canopy |
| **LOD2** | 8 | 100–400m | Two crossed billboard quads |
| **Culled** | — | >400m | Out of view distance |

Wind shader: LOD0 and LOD1 only.

---

## Per-Tile Vertex Budget

A tile is 64m × 64m at LOD0. The sum of all geometry in a tile must not exceed these budgets:

| Element | Estimated Vertex Count |
|---|---|
| 8–12 buildings (mixed classes) | ~18,000 |
| 30–60 props (instanced) | ~8,000 |
| Road surface + sidewalk | ~1,500 |
| Vegetation | ~4,000 |
| **Total per tile (LOD0)** | **~31,500** |

**Scene total at 25 active tiles (mixed LOD distribution):**
- 4 LOD0 tiles: ~126,000 verts
- 12 LOD1 tiles: ~120,000 verts
- 9 LOD2 tiles: ~40,500 verts
- Vehicles + NPCs at peak: ~50,000 verts
- **Total: ~335,000 vertices** — within WebGL2 limits. Bottleneck is draw calls and shader ALU, not raw vertex count.

---

## Texture Requirements: KTX2 / Basis Universal

**All textures must be KTX2/Basis Universal. No exceptions.**

One uncompressed 4K albedo atlas exceeds the per-tile texture budget. Compressed textures are mandatory for the performance target.

### Supported Compression Paths

| Platform | Format | Notes |
|---|---|---|
| **Desktop Chrome/Firefox** | `EXT_texture_compression_bptc` or `EXT_texture_compression_s3tc` | Typical path; widely supported |
| **Apple Silicon (Safari)** | `ASTC` | Fallback path; required for iPad/Mac deployment |

**[PLACEHOLDER: Lux — confirm ASTC fallback validation is in place for QA. Any other platform-specific compression paths we need to handle?]**

### Resolution Limits by Tier

| Asset Class | LOD0 Max | LOD1+ Max |
|---|---|---|
| Large Buildings (Class 1) | 1024×1024 | 512×512 |
| Medium Buildings (Class 2) | 1024×1024 | 512×512 |
| Small Buildings (Class 3) | 512×512 | 256×256 |
| Props (Class 4) | 512×512 | 256×256 |
| Vehicles (Class 5) | 1024×1024 | 512×512 |
| NPCs (Class 6) | 512×512 | 256×256 |
| Vegetation (Class 7) | 512×512 | 256×256 |

**Enforcement:** Asset import validator rejects textures exceeding these limits per LOD tier.

---

## instanceTypeId Tagging (Props)

Props (Class 4) must be GPU-instanced by type per tile. This reduces draw calls from one-per-prop-instance to one-per-prop-type.

### What is instanceTypeId?

An `instanceTypeId` is a numeric identifier assigned to every prop asset at authoring time. It groups identical or visually similar props for GPU instancing.

**Example:**
- All fire hydrants (red, standard city hydrant) → `instanceTypeId: 1001`
- All wooden benches (park bench) → `instanceTypeId: 2001`
- All bollards (concrete, standard) → `instanceTypeId: 3001`
- All street signs (all variants) → `instanceTypeId: 4001`

### Why Separate by Type?

Babylon.js `InstancedMesh` groups geometry by material and mesh. One draw call per type per tile, not per instance.

**Without tagging:** 60 fire hydrants scattered across a tile = 60 draw calls
**With tagging:** 60 fire hydrants, all `instanceTypeId: 1001` = 1 draw call

Per-tile draw call budget is ≤40. Instancing is required to stay under this limit.

### Tagging Requirements

1. **Assign instanceTypeId at asset authoring time** — include in the asset metadata (JSON sidecar or embedded in the GLB file)
2. **Document the mapping** — maintain a props registry: `instanceTypeId → asset name → visual description`
3. **Validate at import** — asset validator checks that all props have an instanceTypeId; rejects those without
4. **Per-tile deduplication** — the streaming worker reads instanceTypeId and groups by type on load

**[PLACEHOLDER: Lux or Phoenix — what is the canonical tool/workflow for authoring instanceTypeId? Are props authored in Blender with metadata, or is there a pipeline step that auto-assigns based on asset name/folder?]**

---

## Collision Meshes (Separate from Render Meshes)

Collision meshes are distinct from render geometry. A building may have detailed facade geometry (LOD0 render) but a simplified bounding box (collision).

### Collision Mesh Specifications

| Surface Type | Simplification Tolerance | Critical Requirements |
|---|---|---|
| **Buildings / walls / props** | 0.5–1m | Consistent surface normals on building bases. Prevents angular vehicle impulses on wall clips (vehicles should slide cleanly along walls, not get launched by micro-geometry) |
| **Roads / terrain** | 0.1–0.2m max | Curbs, road camber, elevation changes must read correctly. Coarser mesh = floating vehicles. |

### Why Separate Meshes?

- **Render mesh (LOD0–LOD3):** Optimized for visual fidelity, high vertex count, complex UVs
- **Collision mesh (single):** Simplified, optimized for physics simulation, consistent normals, no LOD transitions

The physics engine (Havok) needs clean geometry without visual detail artifacts.

### Workflow

1. Author collision mesh separately from render mesh (typically in Blender)
2. Bake collision mesh at the specified tolerance
3. Validate collision normals (no flipped faces, no non-manifold geometry)
4. Assets export as two separate meshes: `asset_LOD0.glb` (render) + `asset_collision.glb` (physics)

**[PLACEHOLDER: Lux or Phoenix — what tool/script validates collision mesh quality at import time? Do we auto-generate collision from render mesh simplification, or is it always hand-authored?]**

---

## Asset Import Validation

The asset import validator is the final gate before assets enter the world. It enforces all hard requirements above.

### Validation Checklist

#### Per-Asset Validation

- [ ] Asset belongs to exactly one LOD class (1–7)
- [ ] Vertex count ≤ tier budget for each LOD level
- [ ] Texture resolution ≤ tier maximum (see [Texture Requirements](#texture-requirements-ktx2--basis-universal))
- [ ] Textures are KTX2-encoded (not PNG, JPEG, or uncompressed)
- [ ] All geometry is Draco-compressed
- [ ] Collision mesh present and separate from render mesh
- [ ] Collision mesh normals validated (no flipped faces)
- [ ] If asset is Class 4 (props): instanceTypeId is present and non-zero
- [ ] Impostor textures (Class 1): pre-baked from LOD0, 4K resolution, billboard geometry

#### Per-Tile Validation

- [ ] Total vertex count across all assets in the tile ≤ 31,500 (LOD0 budget)
- [ ] Total draw calls (all asset types + instanced props) ≤ 40
- [ ] No orphaned assets (textures or geometry without parent asset)

### Rejection Criteria

The validator **rejects** assets with any of the following:

- **Vertex budget exceeded:** Asset LOD tier exceeds vertex budget
- **Texture not KTX2:** Texture is PNG, JPEG, or uncompressed format
- **No compression:** Geometry is not Draco-compressed
- **Missing collision mesh:** Collidable asset (building, vehicle, prop) has no collision geometry
- **No instanceTypeId:** Class 4 (props) asset missing instanceTypeId
- **Tile budget exceeded:** Total vertex count or draw calls in tile exceed limits
- **Corrupted impostor:** Class 1 impostor billboard missing or malformed

**[PLACEHOLDER: Lux — are there any other rejection criteria I should add? Any edge cases we've found during pipeline development?]**

### Validation Output

The validator produces a report for each asset:

```
Asset: apartment_building_large_001.glb
Class: 1 (Large Building)
Status: ✓ PASS
  LOD0: 4200 verts (budget 3000–5000) ✓
  LOD1: 1350 verts (budget 1000–1500) ✓
  LOD2: 480 verts (budget 250–500) ✓
  LOD3: 8 verts (impostor) ✓
  Texture 0 (albedo): KTX2, 1024×1024, 2.1MB ✓
  Texture 1 (normal): KTX2, 1024×1024, 1.8MB ✓
  Collision: present, normals valid ✓
  Impostor: 4K pre-baked ✓
```

---

## Hard Requirements Summary

These are non-negotiable. Violation of any of these requirements blocks asset import.

1. **Every building gets exactly the LOD count for its asset class.** No "we'll add LODs later."
2. **All prop meshes tagged with `instanceTypeId`** for GPU instancing.
3. **All textures KTX2/Basis Universal.** No PNG, JPEG, or uncompressed.
4. **Max 1024×1024 for LOD0 buildings.** Max 512×512 for LOD1+.
5. **Impostors pre-generated at build pipeline time** for all Class 1 (Large Building) assets.
6. **Vertex counts validated at asset import.** Assets exceeding tier budget are rejected.
7. **Collision meshes baked separately** from render meshes, to specified tolerances.
8. **All geometry Draco-compressed.** Decompression happens in streaming worker only.
9. **Per-tile vertex budget ≤ 31,500** and **draw call budget ≤ 40**.

---

## Authoring Workflow (Reference)

This is how assets flow through the pipeline. The validation gates are marked.

```
Asset Author (3D Artist)
  ↓
[Author LOD models + collision mesh in Blender]
  ↓
Export as GLB (render) + GLB (collision)
  ↓
Export → Asset processor (Draco compression, KTX2 encoding)
  ↓
[VALIDATION GATE 1: Vertex budgets, texture formats, instanceTypeId]
  ↓
Asset validated → CDN upload (content-hashed filename)
  ↓
[VALIDATION GATE 2: Manifest updated, per-tile budget check]
  ↓
Game client → Streaming worker fetches from CDN
  ↓
[VALIDATION GATE 3: Draco decompression, KTX2 decode, buffer allocation]
  ↓
Main thread GPU upload → Scene rendered
```

---

## Troubleshooting

### "Asset rejected: vertex budget exceeded"

Check the specific LOD tier that failed. Simplify the geometry for that tier. If all tiers are too dense, the asset belongs to a lower class (smaller budget) — re-evaluate its classification.

### "Asset rejected: texture not KTX2"

All textures must be compressed using KTX2 with Basis Universal backend. Use a tool like `basisu` or a Unity/Unreal export pipeline. No PNGs or JPEGs.

### "Asset rejected: Draco compression missing"

All geometry must be Draco-compressed before import. Most 3D export tools have a Draco plugin. Validate that the output GLB has Draco-compressed geometry (use `gltf-pipeline` or equivalent to inspect).

### "Tile exceeds draw call budget (got 52, max 40)"

Too many unique prop types or geometry in the tile. Either reduce prop density, merge similar props into the same instanceTypeId, or increase tile size (architectural change — escalate to Kai).

### "impostor bitmap missing for large building"

Class 1 assets require pre-baked impostor billboards. Generate 8-angle impostor atlases at build time using the LOD0 render mesh. Standalone landmarks (~20) should have hand-authored 4K impostors.

---

## Next Steps

- **For art teams:** Use this guide to author and validate assets. Run each asset through the validator before committing.
- **For pipeline engineers:** Implement the validation checks in the asset import tool. Use the rejection criteria above as test cases.
- **For rendering engineers (Lux):** Review technical accuracy of texture and geometry compression requirements. Flag any gaps or changes to the spec.

---

**Authoritative sources:**
- `/architecture/technical-architecture-v0.1.md` — Sections 6 (Map & World Data), 7 (LOD Specification), 8 (Backend Architecture)
- `/docs/architecture-guide.md` — Rationale for design decisions

**Last updated:** 2026-03-20
**Next review:** After Lux constraint input and before pipeline tooling is finalized
