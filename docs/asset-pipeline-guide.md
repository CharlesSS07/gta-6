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

## Streaming Worker: Decompression Architecture

**Critical constraint:** The streaming worker must decompress one tile at a time, in priority order (player movement vector first). Do not decompress multiple tiles concurrently.

### WASM Module Initialization

The streaming worker uses two WASM modules: Draco (~180KB) and Basis/KTX2 (~500KB). Both **must be initialized when the worker spawns, not on-demand.**

**Why?** On-demand initialization of either module means the first tile to decompress pays a 200–500ms startup penalty (WASM compilation + linking). This blocks the main thread indirectly and creates a visible frame spike. Initialize both at worker startup; this is complete before `worldReady` resolves.

### Single-Threaded Decompression

Decompress tiles sequentially:
1. Fetch tile from CDN
2. Decompress Draco geometry
3. Decode KTX2 textures (using the format string passed from main thread at init)
4. Allocate GPU-ready buffers
5. Transfer buffers to main thread via Transferable objects (zero-copy)
6. Release worker's reference to transferred buffers
7. Start next tile in priority queue

Holding multiple decompressed buffers simultaneously creates memory spikes. The priority queue ensures correct load order; sequential decompression manages VRAM.

---

## Texture Requirements: KTX2 / Basis Universal

**All textures must be KTX2/Basis Universal. No exceptions.**

One uncompressed 4K albedo atlas exceeds the per-tile texture budget. Compressed textures are mandatory for the performance target.

### Format Detection & Initialization (Critical Ordering)

**Format capability must be detected on the main thread at startup, not in the worker.** This is a load-bearing constraint:

1. Main thread queries WebGL extensions on initialization: `EXT_texture_compression_bptc`, `EXT_texture_compression_s3tc`, `WEBGL_compressed_texture_astc`
2. Determines the target format string (e.g., `"BC7"`, `"BC1"`, `"ASTC"`, or `"RGBA8"` for uncompressed fallback)
3. Passes the format string to the streaming worker **before any tile requests begin**
4. Worker uses this format for all Basis Universal transcoding

**Why?** WebGL context doesn't exist in Web Workers. If the worker tries to query formats, it will fail silently. The worker can only transcode Basis Universal to a pre-specified format based on main thread initialization.

### Supported Compression Paths

| Platform | GL Extension | Format String | Notes |
|---|---|---|---|
| **Chrome/Firefox (recent GPU)** | `EXT_texture_compression_bptc` | `"BC7"` | Highest quality, desktop-only |
| **Chrome/Firefox (older GPU)** | `WEBGL_compressed_texture_s3tc` | `"BC1"` or `"BC3"` | Fallback for pre-2015 GPUs |
| **Safari (Apple Silicon)** | `WEBGL_compressed_texture_astc` | `"ASTC"` | iOS, iPadOS, macOS with Apple GPU |
| **Unsupported hardware** | (none) | `"RGBA8"` | Uncompressed; flag as unsupported, warn user |

### KTX2 Encoding Requirement

KTX2 files **must be encoded with Basis Universal** (either ETC1S or UASTC mode):
- **UASTC:** Higher quality, larger file size. Recommended for albedo and normal maps.
- **ETC1S:** Smaller file size, lower quality. Acceptable for roughness/metallic/AO maps.

One KTX2 source file can be transcoded to any of the formats above by the Basis Universal WASM decoder. The pipeline only produces one KTX2 per texture; the worker handles multi-format decoding on client side.

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

An `instanceTypeId` is a stable, semantic string identifier assigned to every prop asset at authoring time. It groups identical or visually similar props for GPU instancing.

**Example:**
- All fire hydrants (red, standard city hydrant) → `instanceTypeId: "prop.fire_hydrant.standard"`
- All wooden benches (park bench) → `instanceTypeId: "prop.bench.park"`
- All bollards (concrete, standard) → `instanceTypeId: "prop.bollard.concrete.standard"`
- All street signs (all variants) → `instanceTypeId: "prop.street_sign.generic"`

### Why Separate by Type?

Babylon.js `InstancedMesh` groups geometry by material and mesh. One draw call per type per tile, not per instance.

**Without tagging:** 60 fire hydrants scattered across a tile = 60 draw calls
**With tagging:** 60 fire hydrants, all `instanceTypeId: "prop.fire_hydrant.standard"` = 1 draw call

Per-tile draw call budget is ≤40. Instancing is required to stay under this limit.

### Tagging Requirements

1. **Semantic, stable IDs** — Use human-readable strings like `"prop.fire_hydrant.standard"` or `"prop.bench.park"`. IDs must be stable across pipeline rebuilds. Do not auto-generate or hash-based IDs; auto-generated IDs break on rebuild. Maintain a central props registry mapping IDs to asset names.
2. **Assign at asset authoring time** — Include in the asset metadata (JSON sidecar or embedded in GLB metadata)
3. **Document the mapping** — Central registry: `instanceTypeId → asset name → visual description`
4. **Validate at import** — Asset validator checks that all props have an instanceTypeId; rejects those without
5. **Per-tile deduplication** — The streaming worker reads instanceTypeId and groups by type on load

### Edge Cases: Shared Physics, Different Render

**Constraint:** `instanceTypeId` drives render batch grouping (GPU instancing). Collision geometry is a separate field and can be shared across render IDs.

**Example:** Two fire hydrant models (slightly different paint, damage states) with identical collision shape:
- Prop A: `instanceTypeId: "prop.fire_hydrant.standard"`, physics hull: `fire_hydrant_base`
- Prop B: `instanceTypeId: "prop.fire_hydrant.damaged"`, physics hull: `fire_hydrant_base` (same)

Render instances are separate (different models); collision is shared (same hull). Both reuse the same collision shape in Havok, reducing collision memory.

### Props Spanning Tile Boundaries

**Rule:** A prop's origin point must lie within the tile that owns it. Do not split props across tiles.

**Example:** A large dumpster positioned near a tile edge. The dumpster's local origin (0,0,0 in model space, placed in world space) must be in the tile that contains it. The dumpster's visual and collision bounds may extend into adjacent tiles — the render/physics systems handle this via frustum culling and BVH spatial partitioning.

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

### Tools & Workflow

**Building Colliders:**
- **Rectangular buildings (most of downtown LA):** Manually author a simple box convex hull. This is faster and cleaner than automated decomposition.
- **Irregular buildings (complex floor plates):** Use V-HACD for convex hull decomposition. Generate the convex hulls in Blender or Maya, validate manually.

**Havok Convex Hull Limit:** Havok supports max **32 vertices per convex hull body.** V-HACD output must be validated against this limit. If V-HACD produces hulls with >32 vertices, reject the asset at import validation. Simplify by hand if necessary.

**Collision Accuracy:** The convex hull must not exceed the visual mesh AABB (axis-aligned bounding box) by more than **5% in any dimension.** Larger deviation causes vehicles to collide with invisible geometry, breaking driving feel.

**Road Mesh Intersections:** T-junctions and four-way intersections where road strips overlap can produce Z-fighting in the physics broadphase. Treat each intersection as a separate flat mesh that covers the junction area, not an overlap of two road strips.

**Props:** Use only box or capsule approximations. **No mesh colliders on props, no exceptions.** A mesh collider on a prop will be rejected at import validation.

### Workflow

1. Author collision mesh separately from render mesh (in Blender/Maya)
2. For buildings: manually author box hulls or run V-HACD decomposition
3. For props: author box or capsule approximations
4. Validate:
   - Normals are consistent (no flipped faces)
   - Geometry is manifold (no non-manifold edges)
   - Convex hulls have ≤32 vertices (Havok limit)
   - Hull AABB doesn't exceed visual mesh AABB by >5%
5. Export as two separate assets: `asset_LOD0.glb` (render) + `asset_collision.glb` (physics)

---

## Asset Import Validation

The asset import validator is the final gate before assets enter the world. It enforces all hard requirements above.

### Validation Checklist

#### Per-Asset Validation

- [ ] Asset belongs to exactly one LOD class (1–7)
- [ ] Vertex count ≤ tier budget for each LOD level
- [ ] Texture resolution ≤ tier maximum (see [Texture Requirements](#texture-requirements-ktx2--basis-universal))
- [ ] Textures are power-of-2 dimensions (256, 512, 1024; not 480×320)
- [ ] Textures are KTX2-encoded with Basis Universal (not PNG, JPEG, or raw KTX2)
- [ ] All geometry is Draco-compressed
- [ ] Draco attribute IDs are canonical: position=0, normal=1, texcoord=2
- [ ] GLB includes baked vertex normals (do not rely on runtime normal generation)
- [ ] Collision mesh present and separate from render mesh
- [ ] Collision mesh normals validated (no flipped faces, manifold geometry)
- [ ] Collision convex hulls ≤ 32 vertices (Havok limit)
- [ ] Collision hull AABB doesn't exceed visual mesh AABB by >5% in any dimension
- [ ] If asset is Class 4 (props): instanceTypeId is present, semantic, and stable
- [ ] If asset is Class 4 (props): uses box or capsule collision only (no mesh colliders)
- [ ] Impostor atlas (Class 1, generic towers): 2048×2048, 8 angles packed into one atlas, pipeline-generated
- [ ] Impostor atlas (Class 1, landmark towers, ~20 buildings): 4096×4096, hand-authored

#### Per-Tile Validation

- [ ] Total vertex count across all assets in the tile ≤ 31,500 (LOD0 budget)
- [ ] Total draw calls (all asset types + instanced props) ≤ 40
- [ ] No orphaned assets (textures or geometry without parent asset)

### Rejection Criteria

The validator **rejects** assets with any of the following (hard gates, not warnings):

- **Vertex budget exceeded:** Asset LOD tier exceeds vertex budget
- **Texture not KTX2 with Basis:** Texture is PNG, JPEG, uncompressed, or raw KTX2 without Basis Universal encoding
- **Non-POT texture dimensions:** Texture is not a power of 2 (256, 512, 1024, etc.)
- **No Draco compression:** Geometry is not Draco-compressed
- **Invalid Draco attributes:** Attribute IDs are not canonical (position=0, normal=1, texcoord=2)
- **Missing vertex normals:** GLB geometry lacks baked normals (will render black in PBR shader)
- **Missing collision mesh:** Collidable asset (building, vehicle, prop) has no collision geometry
- **Invalid collision shape:** Convex hulls exceed 32 vertices, or prop has mesh collider instead of box/capsule
- **Collision AABB mismatch:** Collision hull exceeds visual mesh AABB by >5%
- **No instanceTypeId:** Class 4 (props) asset missing instanceTypeId, or ID is auto-generated (not stable/semantic)
- **Mesh collider on props:** Class 4 (props) uses mesh collider; only box/capsule allowed
- **Tile budget exceeded:** Total vertex count (>31,500) or draw calls (>40) in tile exceed limits
- **Corrupted impostor:** Class 1 impostor billboard missing, malformed, or wrong resolution

### Texture Atlasing (Per-Tile Performance)

To stay within the 40 draw calls/tile budget and manage texture memory, texture atlasing is required.

**Per-tile atlas target:**
- 1 albedo/diffuse atlas (combines all building/prop color textures for the tile)
- 1 normal map atlas
- 1 ORM atlas (occlusion/roughness/metallic combined)

Separate textures per prop = one draw call per texture = draw call explosion. Atlasing reduces dozens of textures to 3 atlases.

**Workflow:**
1. Author assets with separate textures (standard for 3D work)
2. At tile bake time, pack all textures for the tile into atlases
3. Update UV coordinates in the mesh to match the atlas layout
4. Encode atlases as KTX2, compress geometry as Draco
5. Validate tile-level draw call budget

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
2. **All prop meshes tagged with `instanceTypeId`** (semantic, stable IDs) for GPU instancing.
3. **All textures KTX2/Basis Universal** with power-of-2 dimensions. No PNG, JPEG, or raw KTX2.
4. **Max 1024×1024 for LOD0 buildings.** Max 512×512 for LOD1+.
5. **Impostors pre-generated at build pipeline time** for all Class 1 (Large Building) assets.
6. **Vertex counts validated at asset import.** Assets exceeding tier budget are rejected.
7. **Collision meshes baked separately** from render meshes, convex hulls ≤32 vertices, hull AABB ≤5% deviation.
8. **All geometry Draco-compressed** with canonical attribute IDs (position=0, normal=1, texcoord=2).
9. **Baked vertex normals required** in all GLB meshes (no runtime normal generation).
10. **Props use only box/capsule collision** (no mesh colliders).
11. **Texture atlasing per tile** (1 albedo, 1 normal, 1 ORM atlas) to stay within draw call budget.
12. **Streaming worker initialization complete** (Draco + Basis WASM loaded and compiled) before world is playable.
13. **Per-tile vertex budget ≤ 31,500** and **draw call budget ≤ 40**.
14. **Props anchored to tile origin** (large props may extend into adjacent tiles, but origin must be in owning tile).

---

## Authoring Workflow (Reference)

This is how assets flow through the pipeline. The validation gates are marked.

```
Asset Author (3D Artist)
  ↓
[Author LOD models + collision mesh in Blender]
  ↓
Export as GLB (render) + GLB (collision) [per-asset]
  ↓
Asset processor: Draco compression, KTX2 encoding [per-asset]
  ↓
[VALIDATION GATE 1: Per-asset vertex budgets, texture formats, instanceTypeId]
  ↓
Tile baking: merge all assets within 64m×64m tile bounds → one tile GLB,
             atlas textures → 1 albedo / 1 normal / 1 ORM per tile,
             update UVs to match atlas layout [per-tile]
  ↓
[VALIDATION GATE 2: Per-tile draw call budget ≤40, total verts ≤31,500]
  ↓
CDN upload (tile GLB, content-hashed filename)
  ↓
Game client → Streaming worker fetches tile from CDN
  ↓
[VALIDATION GATE 3: Draco decompression, KTX2 decode, buffer allocation]
  ↓
Main thread GPU upload → Scene rendered
```

---

## Far-LOD Tile Manifests

Far-LOD tiles (beyond 500m from player, 600m–1km visibility) contain only LOD2/impostor geometry and do not require collision meshes.

**Manifest specification:** When a far-LOD tile has no collision data, the tile manifest must explicitly set collision to `null`, not omit it.

```json
{
  "tileId": "tile_x_y",
  "geometryUrl": "geometry_tile_x_y.glb",
  "collision": null,
  "distance": "far_lod"
}
```

**Why explicit null?** Omission creates ambiguity — the client can't distinguish between "no collision data (far LOD)" and "collision data not yet streamed (near LOD)." Explicit null is a clear signal that collision is intentionally absent.

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

Class 1 assets require pre-baked impostor billboards. Generic towers: 8-angle 2K atlases, pipeline-generated. Landmark towers (~20): 4K impostors, hand-authored.

---

## Next Steps

- **For art teams:** Use this guide to author and validate assets. Run each asset through the validator before committing.
- **For pipeline engineers:** Implement the validation checks in the asset import tool. Use the rejection criteria above as test cases.
- **For rendering engineers (Lux):** Technical accuracy reviewed and signed off. Flag any changes that emerge during pipeline build.

---

**Authoritative sources:**
- `/architecture/technical-architecture-v0.1.md` — Sections 6 (Map & World Data), 7 (LOD Specification), 8 (Backend Architecture)
- `/docs/architecture-guide.md` — Rationale for design decisions

**Last updated:** 2026-03-20
**Lux sign-off:** Confirmed
**Next review:** When pipeline tooling build begins
