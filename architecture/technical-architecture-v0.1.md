# Streets of Angels — Technical Architecture v0.1

**Date:** 2026-03-20
**Author:** Kai (Development Lead)
**Status:** Decisions locked — implementation-ready

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Game Loop & Frame Budget](#3-game-loop--frame-budget)
4. [Rendering Architecture](#4-rendering-architecture)
5. [Physics Architecture](#5-physics-architecture)
6. [World Streaming Architecture](#6-world-streaming-architecture)
7. [Map & World Data](#7-map--world-data)
8. [LOD Specification](#8-lod-specification)
9. [Backend Architecture](#9-backend-architecture)
10. [Database Schema](#10-database-schema)
11. [API Specification](#11-api-specification)
12. [MVP Scope — Week 1](#12-mvp-scope--week-1)
13. [Risk Register](#13-risk-register)
14. [Decision Log](#14-decision-log)

---

## 1. Project Overview

Single-player, sandbox GTA-style game set in real Los Angeles, playable entirely in the browser. Uses OpenStreetMap geography. Core loop: drive, steal cars, evade police, complete missions.

**MVP target:** Downtown LA ~3×3km, free roam + one lightweight job hook + 1-star wanted system. First playable in Week 1.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    BROWSER (CLIENT)                      │
│                                                          │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Main Thread  │  │Physics Worker│  │Stream Worker │  │
│  │               │  │              │  │              │  │
│  │  Babylon.js   │  │ Havok 120Hz  │  │  Tile Loader │  │
│  │  Render Loop  │◄─┤  Fixed Tick  │  │  Asset Parse │  │
│  │  Svelte HUD   │  │  State SAB   │  │  Draco/KTX2  │  │
│  │  Input / UI   │  │              │  │              │  │
│  └──────┬────────┘  └──────────────┘  └──────┬───────┘  │
│         │                                     │          │
│         └─────────────┬───────────────────────┘          │
│                       │  GPU Upload (main thread only)   │
└───────────────────────┼──────────────────────────────────┘
                        │
             ┌──────────▼──────────┐
             │    Cloudflare CDN   │
             │  Content-hashed     │
             │  GLB / KTX2 tiles   │
             │  manifest.json      │
             └──────────┬──────────┘
                        │
             ┌──────────▼──────────┐
             │   Supabase (BaaS)   │
             │  Auth + PostgreSQL  │
             │  Saves / Events     │
             └─────────────────────┘
```

### Threading Model

| Thread | Responsibilities |
|--------|------------------|
| **Main thread** | Babylon.js render loop, Svelte HUD, input handling, GPU upload |
| **Physics Worker** | Havok simulation at 120Hz, transform state via SharedArrayBuffer |
| **Stream Worker** | Tile fetch, Draco geometry decompression, KTX2 texture decompression |

**Required HTTP headers (day one, dev + prod):**
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Missing these silently breaks all SharedArrayBuffer worker functionality.

---

## 3. Game Loop & Frame Budget

**Target:** 60fps → 16.67ms per frame budget

```
16.67ms frame budget breakdown:
├── Input sampling            0.5ms
├── Babylon scene update      2.0ms
│   ├── LOD evaluation        0.5ms
│   ├── Frustum culling       0.5ms
│   └── Transform sync        1.0ms  (read from physics SAB)
├── Svelte HUD update         0.5ms
├── GPU upload (new tiles)    1.0ms  (amortized)
├── Draw calls / render       8.0ms
│   ├── Shadow pass           2.0ms
│   ├── Geometry pass         4.0ms
│   └── Post-processing       2.0ms
├── Browser overhead          2.0ms
└── Headroom                  2.17ms
```

**Physics worker runs independently at 120Hz (8.33ms tick) — not counted in the frame budget above.**

---

## 4. Rendering Architecture

### Engine
- **Babylon.js v7.x** — locked, no substitution
- **WebGL2** — mandatory. No WebGL1 fallback. No WebGPU for MVP.

### Performance Targets

| Hardware | FPS | Notes |
|----------|-----|-------|
| Discrete GPU (RTX 2060+) | 60fps @ 1080p | Baseline spec |
| Intel Iris Xe / Apple M1 | 30fps @ 1080p | Minimum supported |
| Pre-2020 integrated | Not supported | Hard cutoff |

### Quality Tier System

Three tiers: **Low / Medium / High**. Auto-detect via 2-second GPU benchmark on first load. Player can override.

| Setting | Low | Medium | High |
|---------|-----|--------|------|
| Shadow maps | Off | Cascade (1 split) | Cascade (3 splits) |
| SSAO | Off | Off | On |
| Bloom | Off | On | On |
| Draw distance | 400m | 600m | 1km |
| Max NPCs | 50 | 100 | 200 |

### Texture Compression

**All textures: KTX2/Basis Universal. No uncompressed textures.**

- Desktop Chrome/Firefox: `EXT_texture_compression_bptc` or `s3tc`
- Apple Silicon Safari: ASTC — **fallback path required from day one**
- Max resolution: 1024×1024 for LOD0 buildings; 512×512 for LOD1+

### VRAM Budget (2GB)

| Component | VRAM |
|-----------|------|
| Active near tiles (25 × 34MB) | ~850MB |
| Far LOD ring (~75 × 5MB) | ~375MB |
| Engine overhead / framebuffers / shadows | ~400MB |
| **Total** | **~1.6GB** |

One uncompressed 4K texture blows the budget. KTX2 compression is non-negotiable.

### Draw Call Budget
- Per-tile draw calls: **≤ 40**
- Props: GPU-instanced by type (`InstancedMesh`) — one draw call per prop type per tile
- Static geometry: merged per tile (roads, sidewalks, terrain)

---

## 5. Physics Architecture

### Engine
**Havok** via `HavokPlugin` (Babylon.js native) — locked.

> ~~Rapier.js~~ — rejected. Requires custom Babylon bridge; Havok is native and production-tested.

### Tick Rate
- **120Hz fixed timestep** in physics worker
- Render interpolates between last two physics states
- Render and physics fully decoupled — render runs at display refresh rate

### Transform Buffer Schema (SharedArrayBuffer)

All entity state crosses the worker boundary via flat `Float32Array`. No object serialization.

**Vehicle slots (16 floats = 64 bytes, cache-line aligned):**
```
[0–2]   posX, posY, posZ
[3]     entity_flags  (Int32 bitmask — see below)
[4–7]   quatX, quatY, quatZ, quatW
[8–10]  linVelX, linVelY, linVelZ
[11]    reserved
[12–14] angVelX, angVelY, angVelZ
[15]    reserved
```

**Entity flags bitmask (slot [3]):**
```
bit 0: active       — slot is live; 0 = skip rendering
bit 1: damaged      — mechanical degradation + visual damage state
bit 2: on_fire      — drives particle system
bit 3: airborne     — all wheels off ground (camera smoothing + audio)
bit 4: wanted       — active pursuit target (minimap indicator)
bits 5–31: reserved
```

**NPC / player slots (16 floats, angVel zeroed — NPCs don't spin):**
```
[0–2]   posX, posY, posZ
[3]     entity_flags
[4–7]   quatX, quatY, quatZ, quatW
[8–10]  linVelX, linVelY, linVelZ
[11–15] reserved
```

**Buffer header (Int32Array, first 8 bytes):**
```
[0]  write_index    — Atomics.store/load required (visibility ordering)
[1]  frame_counter  — incremented each physics tick
```

Double-buffering protects content integrity. `write_index` additionally requires `Atomics.store`/`Atomics.load` for memory visibility ordering across threads.

### Entity Budgets

| Entity Type | Max Simulated |
|------------|---------------|
| Player vehicle | 1 (always LOD0) |
| AI vehicles (full physics) | ~60–80 |
| Background traffic (visual only) | Unlimited |
| Pedestrians | ~150–200 |
| Police pursuit units | ≤ 12 simultaneously |

### Vehicle Physics
- Havok raycast vehicle model
- Per-class physics parameters: mass, torque curve, drag, lateral friction (table-driven)
- Continuous collision detection on all vehicles (required at >150 km/h)
- **Suspension tuning requires iteration** — build isolated test harness first

---

## 6. World Streaming Architecture

### Tile Grid

| Parameter | Value |
|-----------|-------|
| Tile size | 64m × 64m |
| Load radius | 500m |
| Unload radius | 600m (hysteresis) |
| Far LOD ring | 1km visibility |
| Active tiles | ~25 near/mid + ~75 far LOD ring |

### Priority Loading
1. Tiles in player's **forward movement vector** first
2. Adjacent tiles second
3. Far LOD ring last

### Threading Model

All of the following run in the **Streaming Web Worker — never on the main thread:**
- CDN asset fetch
- Draco geometry decompression
- KTX2 texture decompression
- Buffer allocation and mesh construction

**Main thread: GPU upload only** (via Transferable objects from worker).

> **Why:** JS GC runs on the main thread. A single GC pause of 8–15ms during tile allocation visibly drops fps in that frame. In a streaming open world this happens constantly if not architected correctly. This is non-negotiable and cannot be bolted on later.

### Sprint 0 Requirement
2–3 weeks of dedicated streaming pipeline work **before** gameplay systems begin. The scaffold must be validated before the team builds on top of it.

### Mission Geography Constraint (Sprint 1)
- Sprint 1 missions: **≤ 300m radius** from mission start
- Sprint 2: streaming validated, geographic constraints lifted

---

## 7. Map & World Data

### Source
**OpenStreetMap (OSM)** — road network, building footprints, terrain elevation. Free license, real LA geography.

### OSM → Game Asset Pipeline
```
OSM raw data
  → Road network graph extraction
      (nodes, edges, road type, speed limit, one-way flag)
  → Building footprint extraction + height estimation
  → Terrain elevation mesh
  → Per-asset LOD generation (Section 8)
  → Collision mesh baking (separate from render mesh)
  → Pedestrian navmesh generation
  → KTX2 texture baking
  → Draco geometry compression
  → CDN upload (content-hashed filenames)
```

### Runtime Data Structures

**Road Network Graph** (available at runtime as queryable data, not just geometry):
- Flat adjacency list: coordinates, road type, speed limit, one-way flag
- Used by: police AI (A* pathfinding), traffic system (route generation)

**Collision Meshes** (separate from render meshes):

| Surface | Tolerance | Critical Requirements |
|---------|-----------|----------------------|
| Buildings / walls / props | 0.5–1m | Consistent normals on building bases |
| Roads / terrain | 0.1–0.2m max | Curbs and camber must read correctly |

**Pedestrian Navmesh** (separate from collision mesh):
- Walkable regions with sidewalk / road / off-limits semantics
- Police vehicles use road graph A* (not navmesh)

### MVP Map Area
Downtown LA, ~3×3km. Approximate bounds: 110/101 interchange south to Exposition Park, east to Arts District, west to MacArthur Park.

---

## 8. LOD Specification

**Transition method:** Screen-size-based (`UseLODScreenCoverage` in Babylon.js — not distance-based)
**Blending:** Dither cross-fade, 0.5m blend zone. No hard pops.

### Asset Classes

**Class 1: Large Buildings (>10 stories)**

| Tier | Vertex Budget | Distance | Notes |
|------|--------------|----------|-------|
| LOD0 | 3,000–5,000 | 0–80m | Facade detail, window reveals |
| LOD1 | 1,000–1,500 | 80–250m | Flat facade, normal map detail |
| LOD2 | 250–500 | 250–600m | Box mesh + baked atlas |
| LOD3 (Impostor) | 8 (2 quads) | 600m–1km | Pre-baked billboard |
| Culled | — | >1km | — |

**Class 2: Medium Buildings (3–10 stories)**

| Tier | Vertex Budget | Distance |
|------|--------------|----------|
| LOD0 | 1,200–2,000 | 0–60m |
| LOD1 | 400–700 | 60–180m |
| LOD2 | 80–150 | 180–500m |
| Culled | — | >500m |

**Class 3: Small Buildings (1–2 stories)**

| Tier | Vertex Budget | Distance |
|------|--------------|----------|
| LOD0 | 500–1,000 | 0–40m |
| LOD1 | 150–300 | 40–120m |
| Culled | — | >120m |

**Class 4: Props (hydrants, benches, bollards)**

| Tier | Vertex Budget | Distance | Notes |
|------|--------------|----------|-------|
| LOD0 | 300–800 | 0–30m | |
| LOD1 | 60–150 | 30–80m | Box approximation |
| Culled | — | >80m | |

⚠️ **Props must be GPU-instanced by type per tile.** Tag all props with `instanceTypeId`. One draw call per type per tile — not per prop instance.

**Class 5: Vehicles**

| Tier | Vertex Budget | Distance | Notes |
|------|--------------|----------|-------|
| LOD0 | 10,000–15,000 | 0–50m | Player vehicle: always LOD0 |
| LOD1 | 3,000–5,000 | 50–150m | AI vehicles |
| LOD2 | 800–1,200 | 150–350m | Silhouette only |
| LOD3 | 200–350 | 350–600m | Background traffic |
| Culled | — | >600m | |

**Class 6: NPCs / Pedestrians**

| Tier | Vertex Budget | Distance | Notes |
|------|--------------|----------|-------|
| LOD0 | 4,000–6,000 | 0–20m | Full skeleton + clothing |
| LOD1 | 1,000–2,000 | 20–60m | Simplified, fewer bones |
| LOD2 | 300–500 | 60–150m | Capsule + VAT animation |
| Billboard | 8 | 150–250m | Sprite sheet, 2-frame walk |
| Culled | — | >250m | |

Full skeletal animation: LOD0 and LOD1 only. LOD2 uses Vertex Animation Textures (VAT). Never run a full animator on an NPC >150m away.

**Class 7: Vegetation**

| Tier | Vertex Budget | Distance |
|------|--------------|----------|
| LOD0 | 2,000–3,500 | 0–40m |
| LOD1 | 600–1,000 | 40–100m |
| LOD2 (billboard) | 8 | 100–400m |
| Culled | — | >400m |

### Per-Tile Vertex Budget

At LOD0 (player standing inside tile):

| Element | Verts |
|---------|-------|
| 8–12 buildings (mixed) | ~18,000 |
| 30–60 props (instanced) | ~8,000 |
| Road + sidewalk | ~1,500 |
| Vegetation | ~4,000 |
| **Total** | **~31,500** |

Full scene at 25 active tiles (mixed LOD): **~335,000 vertices**. Bottleneck is draw calls and shader ALU — not vertex count.

### Pipeline Hard Requirements

1. Every building gets the exact LOD count for its class — no "we'll add LODs later"
2. All props tagged with `instanceTypeId`
3. All textures KTX2/Basis Universal — max 512×512 for LOD1+, max 1024×1024 for LOD0
4. Impostors pre-generated at build time for all Class 1 buildings
5. Vertex counts validated at asset import — reject assets exceeding tier budget
6. Collision meshes baked separately to the tolerances in Section 7

---

## 9. Backend Architecture

### Service Stack

| Component | Service |
|-----------|--------|
| Auth | Supabase Auth (email + Google/Apple social) |
| Database | Supabase PostgreSQL |
| CDN | Cloudflare |
| API | Thin server layer (Bun/Node) |

**Do not roll your own auth.** Supabase Auth provides password hashing, reset flows, token rotation, brute-force protection, and social login — all zero-cost to us.

### Architecture Model

**Client-heavy.** All gameplay simulation runs on the client. Server is dumb about game logic.

**Exception — economy and progression events are server-validated:**
- Client sends a signed event payload on mission complete / significant reward
- Server checks plausibility (prerequisites met? reward in expected range?)
- Server commits and returns applied changes
- Prevents `"money": 99999999` exploits without full server-side simulation

### CDN Strategy

- **Content-hashed filenames:** `model_sultan_a3f9b2c.glb` → `Cache-Control: public, max-age=31536000, immutable`
- **Asset manifest:** `manifest.json` with 5-minute TTL — updated on deploy
- **Binary assets** (GLB, KTX2): no compression (already packed)
- **Text assets** (JSON manifests, GLTF JSON): Brotli compressed
- **No manual CDN invalidation** — hash-based naming eliminates the need

### Save Data Model

- **Full snapshots, not deltas** — sparse world flags only (divergences from defaults)
- `schema_version` field mandatory from day one
- **Optimistic versioning:** `save_version` counter — server rejects stale writes (409 conflict)
- Autosave: every 2 minutes + on mission complete + on manual save
- Never autosave mid-combat or mid-cutscene
- **Soft deletes** (`deleted_at`) — 30-day recovery window

---

## 10. Database Schema

```sql
-- Player profiles (created on first login via Supabase Auth webhook)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,  -- references Supabase auth.users
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now()
);

-- Save data (one active save per player, soft-deletable)
CREATE TABLE saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id),
  save_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  save_data JSONB NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(player_id) WHERE deleted_at IS NULL  -- partial index
);

-- save_data JSONB structure:
-- {
--   "position": {"x": 0.0, "y": 0.0, "z": 0.0, "heading": 0.0},
--   "stats": {"health": 100, "armor": 0, "money": 500, "wanted_level": 0},
--   "progression": {
--     "missions_complete": ["m_001"],
--     "vehicles_unlocked": ["veh_sultan"],
--     "safe_houses": ["sh_downtown"]
--   },
--   "world_flags": {}   -- sparse: only state diverging from world defaults
-- }

-- Progression events (append-only audit log)
CREATE TABLE progression_events (
  id UUID PRIMARY KEY,                -- client-generated (idempotency key)
  player_id UUID NOT NULL REFERENCES players(id),
  event_type TEXT NOT NULL,           -- mission_complete | vehicle_unlock | purchase
  payload JSONB NOT NULL,
  applied BOOLEAN NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON saves(player_id) WHERE deleted_at IS NULL;
CREATE INDEX ON progression_events(player_id, created_at DESC);
```

Row Level Security on all tables: `player_id = auth.uid()` enforced at DB level.

---

## 11. API Specification

All routes: `/api/v1/`. Auth via `Authorization: Bearer <supabase_token>`.

### Save Endpoints

```
GET  /api/v1/saves/{player_id}
     → 200: full save object
     → 404: {"error": "no_save_found"}

POST /api/v1/saves/{player_id}
     Body: {schema_version, save_version (echo), position, stats, progression, world_flags}
     → 200: {"save_version": N+1, "saved_at": "iso8601"}
     → 409: {"error": "version_conflict", "server_version": N}  -- client reloads + prompts
     → 400: {"error": "schema_version_unsupported"}
```

### Progression Event Endpoint

```
POST /api/v1/events/{player_id}
     Body: {event_type, event_id (idempotency key), payload, client_state_hash}
     → 200: {"accepted": true, "applied_changes": {...}}
     → 422: {"accepted": false, "reason": "prerequisite_not_met", "detail": "..."}
```

### Profile Endpoint

```
GET /api/v1/profile/{player_id}
    → 200: {player_id, display_name, created_at, last_seen}
```

---

## 12. MVP Scope — Week 1

### Map Area
Downtown LA, ~3×3km. No expansion until Sprint 2.

### Included in Week 1

| System | Spec | Owner |
|--------|------|-------|
| Vehicle physics | Havok raycast vehicle, arcade feel, handbrake drift | Phoenix |
| World rendering | Babylon.js + 64m tile streaming, 500m radius | Lux |
| Job hook | Text-only on spawn: phone buzz + waypoint + $200 payout | Phoenix |
| Wanted system | 1-star only: 1 police unit, last-known-pos pursuit, 10s LoS break | Phoenix |
| Traffic | ~60 simulated vehicles, visual-only beyond physics range | Phoenix |
| Pedestrians | Ambient density + scatter on threat (~150–200) | Phoenix |
| Day/night cycle | Basic sun angle + ambient lighting | Lux |
| Save/load | Supabase Postgres, full snapshot, schema-versioned | Cedar |
| Auth | Supabase Auth, social login | Cedar |

### Sprint 1 Gate: Vehicle Feel

**Phoenix builds isolated test harness first** (flat plane + live tuning UI). Nova reviews and approves driving feel. Nothing else starts until this gate is cleared.

### Deferred to Sprint 2

- Weapons
- Structured missions (beyond the one job hook)
- Star 2–3 wanted system
- Scripted random world events
- Cross-map driving objectives
- WebGPU rendering path

---

## 13. Risk Register

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | **GC pauses during tile streaming** cause frame drops | High | Off-thread streaming (Web Workers) from day one; 2–3 week scaffold before gameplay |
| 2 | **Vehicle physics feel gap** — "correct" ≠ "fun" | High | Isolated test harness; Nova sign-off required before world integration |
| 3 | **Save data divergence** (stale writes, crash mid-save) | Medium | Optimistic versioning (save_version), atomic transactions, conflict prompts |
| 4 | **KTX2/ASTC coverage on Safari** — Apple Silicon path | Medium | ASTC fallback path specced and validated in QA before launch |
| 5 | **Havok worker overhead** at 120Hz with full entity count | Medium | Profile in Sprint 1; expected negligible but must be measured |
| 6 | **OSM data quality** in MVP area | Low-Medium | Audit OSM data in Sprint 0; hand-correct critical landmarks |
| 7 | **COEP/COOP headers missing** silently breaks workers | High | Cedar: mandatory in server config from first deployment |
| 8 | **Scope creep from mission system** building too early | Medium | Strict Sprint 1 gate: vehicle harness → feel sign-off → job hook → wanted system |

---

## 14. Decision Log

| Decision | Outcome | Rationale | Date |
|----------|---------|-----------|------|
| Three.js vs Babylon.js | **Babylon.js** | 2–3 months of LOD/culling/streaming to rebuild in Three.js | 2026-03-20 |
| Rapier.js vs Havok | **Havok** | Rapier spec'd before Babylon was locked; Havok is native, no bridge needed | 2026-03-20 |
| 60Hz vs 120Hz physics | **120Hz** | 60Hz degrades during tile loads; 120Hz + interpolation buffers gracefully | 2026-03-20 |
| 100m vs 64m tiles | **64m × 64m** | Finer unloading precision, avoids holding oversized tiles at LOD boundaries | 2026-03-20 |
| Delta saves vs snapshots | **Full snapshots (sparse)** | Deltas create dependency chains that break on crash/migration | 2026-03-20 |
| Custom auth vs managed | **Supabase Auth** | 2–3 weeks of auth work = zero gameplay value; managed service covers it | 2026-03-20 |
| Mapbox vs OSM vs hand-crafted | **OSM** | Mapbox expensive at scale; hand-crafted loses real LA feel | 2026-03-20 |
| WebGPU vs WebGL2 | **WebGL2** | WebGPU coverage insufficient for MVP; revisit post-launch | 2026-03-20 |

---

*This document is the single source of truth for architecture decisions. When decisions change, update Section 14.*

*Next update: post-Sprint 1 kickoff, after streaming scaffold validated.*
