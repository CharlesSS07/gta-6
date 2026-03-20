# GLB Tile Format Specification v0.1

> **Status:** Draft — ready for Lux streaming pipeline ingestion  
> **Owner:** Cedar (Backend Engineer)  
> **Created:** 2026-03-20  
> **For:** Lux (Graphics & Streaming Engineer), Kai (Development Lead)  

---

## Overview

This document defines the exact GLB structure produced by the server-side tiling job for the LA world map. Lux must ingest this format in the streaming pipeline's Draco/KTX2 loader. Any deviation from this spec on either side must be coordinated before implementation.

Tiles follow the standard XYZ slippy map scheme. The game world uses **zoom levels 14–16**:
- LOD 0 (z=16): Full-detail tiles, ~600m × 600m at LA latitude
- LOD 1 (z=15): Medium detail, ~1.2km × 1.2km  
- LOD 2 (z=14): Low detail / impostor geometry, ~2.4km × 2.4km

---

## File Naming Convention

```
tiles/{z}/{x}/{y}.glb
```

Example: `tiles/16/11412/26174.glb` → full-detail tile over downtown LA

Tiles are content-hashed at the CDN layer. The canonical URL uses logical coordinates; the CDN maps to hashed filenames via `manifest.json`.

---

## Mesh Primitives Per Tile

**Structure: Per-object primitives, not a single merged mesh.**

Each tile's GLB `scene → nodes → mesh` hierarchy contains:

| Primitive type | Count per tile | Notes |
|---|---|---|
| Building geometry | 1 per building | Individual mesh per structure for culling & LOD |
| Road/terrain surface | 1 per tile | Single merged ground plane |
| Instanced props | 1 per prop type | Street lamps, trees, fire hydrants — see GPU instancing below |

**Rationale:** Per-object primitives enable per-building frustum culling, LOD switching, and future click/interaction support. A single merged mesh was considered and rejected — it saves one draw call but eliminates all granularity.

**Draw call budget:** Max 200 primitives per LOD 0 tile, 80 per LOD 1, 20 per LOD 2. Tiles exceeding this limit will be rejected by the tiling job with an error.

---

## Texture Atlas Layout

**One texture atlas per tile.**

| Property | LOD 0 | LOD 1 | LOD 2 |
|---|---|---|---|
| Atlas resolution | 2048 × 2048 px | 1024 × 1024 px | 512 × 512 px |
| Format | KTX2 (ETC2/ASTC via `KHR_texture_basisu`) | same | same |
| Channels | RGBA | RGBA | RGBA |
| UV packing | Per-building UV islands, row-packed | same | same |

One atlas covers all buildings and the ground plane in the tile. Props use a separate shared prop atlas (cross-tile, cached separately) — **TBD: prop atlas will be defined in a follow-up spec once the prop set is finalized**.

**Texture file:** Stored as a buffer in the GLB binary chunk (not an external reference). The KTX2 blob is embedded directly.

---

## Required GLB Extensions

### Used (required, must be present)

| Extension | Usage |
|---|---|
| `KHR_draco_mesh_compression` | All geometry buffers — Draco-compressed positions, normals, UVs |
| `KHR_texture_basisu` | All textures — KTX2 with GPU-compressed ETC2/ASTC payload |
| `EXT_mesh_gpu_instancing` | Repeated props (street lamps, trees, hydrants, benches) |

### Not used in MVP

`KHR_materials_unlit`, `KHR_lights_punctual`, `KHR_mesh_quantization` — not used for MVP. Do not depend on these being present.

---

## Draco Compression Settings

```
draco_compression_level: 7       (0-10; 7 balances size vs decode speed)
position_quantization_bits: 14
normal_quantization_bits: 10
tex_coord_quantization_bits: 12
```

These are fixed for all tiles. Lux's decoder should not need to read these from the file — they are embedded in the Draco bytestream and decoded automatically by the Draco WASM library.

---

## GPU Instancing (EXT_mesh_gpu_instancing)

Repeated props are rendered via `EXT_mesh_gpu_instancing`. Each prop type is a separate mesh node with an instancing accessor providing per-instance transforms.

Instance attribute accessors:
- `TRANSLATION` — vec3, float32
- `ROTATION` — vec4 quaternion, float32 (omit if always upright)
- `SCALE` — vec3, float32 (omit if uniform scale 1.0)

**TBD:** Prop mesh library (shared GLB for all prop types) vs embedded per-tile. Preferred option: shared prop GLB loaded once and referenced by tile metadata. Will confirm once prop art pipeline is defined.

---

## Custom Metadata (GLB JSON `extras`)

Every tile GLB contains a top-level `extras` object on the scene node:

```json
{
  "extras": {
    "tile": {
      "x": 11412,
      "y": 26174,
      "z": 16,
      "lod_level": 0,
      "bounds": {
        "sw": [-118.255, 34.048],
        "ne": [-118.249, 34.054]
      },
      "content_hash": "sha256hex_of_binary_chunk",
      "building_count": 47,
      "building_ids": ["la_b_00123", "la_b_00124"],
      "generated_at": "2026-03-20T00:00:00Z",
      "spec_version": "0.1"
    }
  }
}
```

**Field notes:**
- `content_hash`: SHA-256 of the GLB binary chunk. Used by the client to verify CDN integrity and detect corruption.
- `building_ids`: Stable identifiers for buildings in this tile. Used for future interactivity (e.g. enter building, mission triggers). Do not depend on order.
- `spec_version`: Must match the version in this document. Lux's loader should reject tiles with a `spec_version` it doesn't recognize.
- `bounds`: WGS84 lat/lon of tile corners. Used for coordinate → tile mapping on the client.

---

## Coordinate System

- **Up axis:** Y-up (glTF standard)
- **Units:** Meters
- **Origin:** Tile-local origin at the southwest corner of the tile at ground level (elevation 0)
- **Coordinate precision:** Positions relative to tile origin (avoids float precision loss for large world coordinates)

Building positions are tile-relative. The client converts to world space using tile bounds + tile-local position.

---

## File Size Targets

| LOD | Target size | Hard limit |
|---|---|---|
| LOD 0 (z=16) | < 2 MB | 4 MB |
| LOD 1 (z=15) | < 512 KB | 1 MB |
| LOD 2 (z=14) | < 128 KB | 256 KB |

Tiles exceeding the hard limit will fail the tiling job's validation step and must be split or simplified.

---

## TBD Items

These are unresolved and flagged explicitly so Lux can work around them:

| Item | Status | Preferred option |
|---|---|---|
| Prop mesh library (shared vs embedded per tile) | **TBD** | Shared prop GLB, loaded once |
| Prop atlas spec | **TBD** | Separate cross-tile atlas, confirmed after prop set finalized |
| Elevation/terrain mesh format | **TBD** | Separate heightmap buffer in extras, not geometry |
| Night/emissive texture variant | **TBD** | Second atlas slot, same layout, toggled by time-of-day |

Lux: treat TBD items as absent for the stub tile. The spec will be updated with confirmed values before the real tile swap on April 4.

---

## Stub Tile (for March 31 milestone)

For Lux's stub tile used in the streaming pipeline milestone, a minimal valid GLB is acceptable:

- 1 mesh primitive (simple box geometry representing a city block)
- 1 texture (solid color KTX2, 256×256)
- Extensions: `KHR_draco_mesh_compression` + `KHR_texture_basisu` must be present (even if trivially applied) so the loader path is exercised
- `extras.tile` metadata must be present with correct field shapes (values can be placeholder)

The stub tile should validate the full ingestion pipeline even if the visual result is placeholder geometry.

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-03-20 | Initial draft — all decisions for MVP stub tile confirmed |
