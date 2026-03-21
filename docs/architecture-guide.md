# Architecture Rationale Guide

This is a plain-English explanation of *why* Streets of Angels is architected the way it is. It is a companion to the technical architecture specification, not a repeat of it.

**Read this if:** You're joining mid-sprint and need context on why things are the way they are before diving into code. Or you're wondering "why not use X instead of Y?"

**Read the spec if:** You need the precise technical details, exact parameters, or API contracts. See `/architecture/technical-architecture-v0.1.md`.

---

## Why Web Workers for Physics and Streaming?

### The Problem

JavaScript's garbage collector (GC) is unpredictable. When the GC runs on the main thread, everything pauses — rendering, input handling, UI updates. In a streaming open world, you're constantly allocating and discarding buffers:

- Tile loading: allocate ~5MB of geometry per tile
- Tile unloading: discard ~5MB when player moves away
- Texture decompression: allocate and immediately free scratch buffers

With 25 tiles in memory at any time, plus continuous physics updates, the main thread is under constant memory pressure. When the GC runs during a tile load, you get a frame spike of 8–15ms. At 60fps, that's one dropped frame every 4–8 seconds. Noticeable and immersion-breaking.

### The Solution: Off-Thread Processing

**Physics Worker:** Runs the 120Hz Havok simulation in a dedicated thread. Uses SharedArrayBuffer to share state with the main thread without copying data. Main thread reads the current physics state, interpolates between frames for smooth visuals, and never pauses waiting for physics.

**Streaming Worker:** All asset loading, decompression, and buffer allocation happens in a separate thread. Main thread receives ready geometry and uploads it to the GPU. GC pauses in the streaming worker don't affect rendering.

### Why Not Synchronous?

Single-threaded games (most desktop/console games) can get away with GC pauses because they're rare and their total frame time is small. Web browsers have much higher baseline overhead, and tile operations are inherently large.

If we did physics and streaming on the main thread, we'd hit a hard frame rate ceiling around 30fps due to GC pauses alone. The current architecture — off-thread processing — gives us headroom to hit 60fps on good hardware.

---

## Why Babylon.js Over Three.js?

### Technical Criterion: LOD, Culling, Streaming

Both Babylon.js and Three.js are capable engines. The decision was about what you get for free.

| Feature | Babylon.js | Three.js | Impact on Streaming Open World |
|---|---|---|---|
| Screen-size-based LOD | Built-in (`UseLODScreenCoverage`) | Requires custom code | Critical for performance |
| Frustum culling | Built-in, optimized | Requires custom code | Critical for draw call budget |
| LOD cross-fade | Built-in (dither blend) | Requires custom shader work | Visual quality (hard pops look bad) |
| Instanced mesh support | Built-in (`InstancedMesh`) | Requires custom code | Critical for prop rendering |
| WebGL2 inspector | Built-in | No | Development debugging |

**In Babylon.js, these systems work out of the box.** In Three.js, each one is a few weeks of custom integration work.

### The Math

- Babylon.js: ~2–3 weeks to production-ready LOD/culling/streaming
- Three.js: ~2–3 months (one per person per feature, plus cross-system integration)
- Benefit of Three.js: Slightly more modular (debatable in practice)

**Equation:** (Babylon time savings) > (any modularity advantage of Three.js)

The decision was made because we're shipping in weeks, not months. If we had a year of development ahead, Three.js customization would be viable. We don't.

---

## Why Havok Over Rapier (or Other Physics Engines)?

### Timeline: Reverse Decision on 2026-03-20

Originally, the architecture spec'd **Rapier.js** (a pure-JS Rust-compiled physics engine). Havok was re-chosen on 2026-03-20 because of integration realities.

### Integration Cost

**Havok via HavokPlugin (Babylon.js native):**
- Babylon.js has first-class Havok support
- SharedArrayBuffer state sync is built-in
- Worker integration is a few hundred lines of code

**Rapier.js:**
- No Babylon.js integration layer exists
- Would require writing a custom bridge between Rapier state and Babylon mesh transforms
- That bridge is 500–1000 lines of custom code with no reuse value
- Every frame: copy physics state from Rapier worker → Babylon meshes → renderer

### Decision Rationale

Havok's integration overhead is so low that Rapier's theoretical purity advantage evaporates in practice. We gain nothing from Rapier except time sunk into a custom bridge.

**If the decision were to build on Three.js instead of Babylon.js**, we'd re-evaluate. But since Babylon is locked, Havok is the obvious choice.

### Why Havok Over Cannon.js (JS Physics)?

Cannon.js is pure JavaScript. Sounds good — same language, no compilation.

Reality: Havok is written in C++ and compiled to WebAssembly. At 120Hz with 80 vehicles + 200 NPCs, **performance matters.**

- Havok: ~2ms per physics tick
- Cannon.js: ~8–12ms per physics tick (depending on tuning)

At 120Hz, each tick gets 8.3ms budget. Cannon.js at 8–12ms leaves no room for margin. Havok at 2ms is safe.

**Pure-JS physics doesn't scale to open-world entity counts in the browser.**

---

## Why Full Snapshots Instead of Delta Saves?

### The Problem with Deltas

A delta save is a diff: "position changed from X to Y, money went up by $500." Deltas are mathematically elegant but operationally fragile.

**Scenario: Crash during a delta save**
1. Main save on disk: state at 12:00 PM
2. Delta being written: "position change + money delta"
3. Process crashes mid-write
4. Delta is corrupted; main save is stale; data is lost

**Scenario: Content update migration**
- Game v0.2 adds a new progression system
- Players have saves from v0.1 with missing fields
- Applying deltas to incomplete saves cascades into corruption
- Migration code becomes unmaintainable

### Full Snapshots (Sparse)

A full snapshot is the entire game state serialized to JSON at save time:

```json
{
  "schema_version": 3,
  "position": { "x": 123.4, "y": 45.6, "z": 10.2 },
  "money": 5000,
  "missions_complete": ["mission_001", "mission_003"],
  "unlocks": { "safehouse_01": true, "vehicle_sultan": true },
  "world_flags": { ... sparse deltas from defaults ... }
}
```

**Sparse:** We don't save every single world state — just flags that differ from the world defaults. A flag dict, not full 3×3km world state.

**Advantages:**
- If a save is interrupted, it's simply incomplete (and ignored)
- Migrations are explicit: version 0.1 → 0.2 adds default fields
- Easier to debug: one file, human-readable structure
- Versioning is clear: `schema_version: 3` means "requires this schema"

**Trade-off:** Slightly larger file size. Non-issue for browser games (saves are ~1–5MB, users have unlimited disk space).

---

## The Threading Model (Plain English)

The architecture uses three threads: Main, Physics Worker, Streaming Worker.

### Main Thread: Rendering & Input Only

**Responsibilities:**
- React to player input (keyboard, mouse, controller)
- Read physics state from SharedArrayBuffer
- Interpolate between physics frames for smooth animation
- Upload geometry to GPU
- Run the render loop (60fps or display refresh rate)
- Update UI state

**What it does NOT do:**
- Run physics simulation
- Load or decompress assets
- Allocate large buffers
- Run garbage collection (it does; but GC pauses don't affect other threads)

**Why?** Any work here blocks rendering. The 16.7ms budget (at 60fps) is tight. Rendering + input is all we can fit.

### Physics Worker: 120Hz Deterministic Simulation

**Responsibilities:**
- Run Havok physics at fixed 120Hz tick rate
- Integrate all bodies (player vehicle, AI vehicles, projectiles, etc.)
- Perform collision detection
- Write new transform state to SharedArrayBuffer

**Data structure:** Flat `Float32Array` shared with main thread:

```
Offset 0–9: Player vehicle (x, y, z, qx, qy, qz, qw, vx, vy, vz)
Offset 10–19: AI vehicle #1 (same layout)
Offset 20–29: AI vehicle #2
... etc
```

No JSON, no object copying. Just raw floats in shared memory.

**Why 120Hz?** Tile loads and GC pauses cause main thread frame drops. If physics ticked in lockstep at 60Hz, you'd see physics lag during drops. At 120Hz, the physics buffer absorbs one frame of main-thread jank. Render interpolation between physics states smooths the visuals.

### Streaming Worker: Asynchronous Asset Loading

**Responsibilities:**
- Fetch asset tiles from CDN
- Decompress Draco geometry
- Decode KTX2 textures
- Allocate GPU-ready buffers
- Transfer buffers to main thread via Transferable objects

**What it does NOT do:**
- GPU uploads (only main thread can)
- Babylon.js scene updates (main thread only)

**Why separate?** Decompression is CPU-intensive (100–500ms per tile). Main thread can't afford to block. Streaming worker does the heavy lifting; main thread receives finished geometry and uploads it in a few milliseconds.

### Communication Between Threads

**Main ↔ Physics:** SharedArrayBuffer (zero-copy, bidirectional)
- Main reads physics state every frame
- Physics writes new state every 120Hz tick
- No serialization overhead

**Main ↔ Streaming:** Transferable objects (one-time transfer)
- Streaming worker completes a tile → sends geometry buffer to main
- Ownership of buffer transfers; streaming worker can't access it again
- Main receives ready geometry, uploads to GPU

---

## Summary: Architecture as Constraint

The architecture above is **locked for MVP.** These constraints exist because:

1. **Web platform:** GC pauses are unavoidable; we work around them via off-thread processing.
2. **Browser performance ceiling:** CPU overhead is inherent to WebGL. We maximize every system to reach 30–60fps.
3. **Streaming open world:** Constant memory churn from tile loading requires careful threading or we hit frame rate walls.
4. **Production readiness:** Babylon.js, Havok, and Supabase are battle-tested. Custom implementations would delay shipping.

If any of these constraints change (e.g., "we're shipping native, not web"), the architecture would be different. But for a browser-based GTA game, this is the fastest path to a playable game.

---

## FAQ

**Q: Why not use WASM for game logic too?**
A: Game code is not the bottleneck. Physics and streaming are. WASM is valuable where you have hot loops in tight math. Game logic is I/O and branching — JS is fine.

**Q: Could we use WebGPU instead of WebGL2?**
A: Not yet. WebGPU is still unstable in most browsers. After MVP ships (v1.0), we can target WebGPU as an optional high-end path.

**Q: Why not use a real database (PostgreSQL) instead of Supabase?**
A: Supabase *is* PostgreSQL (with a managed service layer). But we use it as a backend-as-a-service for auth, save data, and events. Setting up our own database infrastructure adds 2–3 weeks of DevOps overhead. Supabase is free-tier friendly and reduces our operational burden.

**Q: Can I optimize [system X] differently?**
A: Probably. But the architecture was designed with trade-offs in mind. If you think you have a better approach, message Kai with the constraint problem and your proposed solution. We'll re-evaluate together.

---

## Decisions That Were Reconsidered

These decisions were made, then reconsidered, or reversed. Documented here for reference.

| Decision | Original | Reversed To | Reason |
|---|---|---|---|
| Rapier vs Havok | Rapier (pure JS, seemed simpler) | Havok | Havok has native Babylon integration; Rapier requires custom bridge work |
| Three.js vs Babylon.js | Evaluated both equally | Babylon.js | Babylon has built-in LOD, culling, streaming systems. Three.js requires 2–3 months of custom work |
| 60Hz vs 120Hz physics | 60Hz (simpler) | 120Hz | 60Hz degrades visibly during tile loads + GC pauses. 120Hz + interpolation buffers this gracefully. |
| Delta saves vs snapshots | Deltas (smaller file size) | Full snapshots | Deltas are fragile on crash and hard to migrate. Snapshots are operationally simpler. |
| OSM vs Mapbox vs hand-crafted | Mapbox (polished), hand-crafted (authentic) | OSM | Mapbox is expensive at scale. Hand-crafted loses real LA feel. OSM is free, accurate, covers all needs. |
| Backend deployment: Cloudflare Workers vs Supabase Edge Functions | Cloudflare Workers (planned; edge geography, Hono first-class) | Supabase Edge Functions | Supabase Edge Functions colocate with the DB (internal hop vs cross-CDN round trip), eliminate a second deployment pipeline, require no runtime adaptation (Hono + Deno works unchanged), and validate JWTs natively against the same Auth service. Save/load is latency-tolerant, not real-time — edge geography advantage of Workers doesn't apply. Cloudflare CDN for static assets (tiles, models) is unchanged. |

---

## Next Steps

- **For new team members:** Read this doc, then `/architecture/technical-architecture-v0.1.md` Section 2 (System Architecture Overview) to see how it fits together.
- **For implementation questions:** The spec has the details. This doc has the *why*. Reference the spec.
- **If you find a gap:** Let Sage know. This doc should explain the rationale for every major decision.

---

**Authoritative source:** `/architecture/technical-architecture-v0.1.md`

**Last updated:** 2026-03-20 (deployment decision log updated: Cloudflare Workers → Supabase Edge Functions)
