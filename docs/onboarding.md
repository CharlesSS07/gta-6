# Streets of Angels — Developer Onboarding

Welcome to the Streets of Angels project. This guide will get you from clone to running code in under 30 minutes.

---

## Quick Start (3 Commands)

```bash
git clone https://github.com/CharlesSS07/gta-6
cd gta-6
bun install && bun run dev
```

Open your browser to `localhost` (exact port TBD as dev server is finalized). If you see the game world rendering, the core setup is working.

**Next:** Verify SharedArrayBuffer is available in your browser (see [SharedArrayBuffer Verification](#sharedarraybuffer-verification) below).

---

## Prerequisites

### System Requirements

- **Bun runtime** — latest stable version (not pinned; check [bun.sh](https://bun.sh) for current latest)
- **Git** — any recent version
- **Browser** — see browser requirements below
- **Recommended:** discrete GPU or recent integrated GPU (Iris Xe, Apple M1+)

### Browser Requirements

**Minimum:** WebGL2 support + SharedArrayBuffer

| Hardware Class | WebGL2 | SharedArrayBuffer | Target Performance |
|---|---|---|---|
| Discrete GPU (RTX 2060+) | ✓ | ✓ | 60fps @ 1080p |
| Recent integrated (Iris Xe, M1 iGPU) | ✓ | ✓ | 30fps @ 1080p |
| Pre-2020 integrated (Iris Plus) | ✓ | ✓ | Not supported (warn user) |

**Tested browsers:** Chrome/Chromium 120+, Firefox 121+, Safari 17+ (Apple Silicon only for ASTC texture support)

---

## COEP/COOP Headers: Required from Day One

The dev server **must** include these HTTP headers in all responses:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Why?** These headers enable **SharedArrayBuffer**, which is required for the physics and streaming workers to function. Without them:
- Web Workers cannot access SharedArrayBuffer
- Physics simulation will hang silently
- Asset streaming will fail silently
- **The game will appear to load but nothing will work.**

**If you see blank screen or frozen game:** First check browser console for SharedArrayBuffer errors. If present, the server is missing COEP/COOP headers.

This is not optional. It must be in the dev server config from day one.

---

## SharedArrayBuffer Verification

Before assuming something else is broken, verify that SharedArrayBuffer is available in your environment.

### Quick Browser Check

Open your browser console (F12) and run:

```javascript
// Check if SharedArrayBuffer is available
if (typeof SharedArrayBuffer !== 'undefined') {
  console.log('✓ SharedArrayBuffer is available');
} else {
  console.log('✗ SharedArrayBuffer is NOT available — COEP/COOP headers missing or browser doesn\'t support');
}
```

**Expected output:** `✓ SharedArrayBuffer is available`

If you see the X mark, the physics and streaming workers will not function. Check:
1. Is the dev server running? (should be on `localhost`)
2. Are COEP/COOP headers present in the response? (open DevTools → Network → find any HTML response → check response headers)
3. Are you using a supported browser? (Chrome 91+, Firefox 79+, Safari 16.4+)

---

## Repo Navigation

The repo is organized by domain. Know where to look:

| Folder | Owned By | Purpose |
|---|---|---|
| `/src` | Phoenix | Game logic: physics, vehicle systems, AI, traffic, gameplay |
| `/src/render` | Lux | Rendering: Babylon.js scene setup, LOD, streaming, shaders |
| `/src/backend` | Cedar | Save/load, authentication, API client |
| `/src/workers` | Lux + Phoenix | Physics Worker, Streaming Worker (off-thread decompression, buffer allocation) |
| `/architecture` | Kai | Technical architecture spec (source of truth for design decisions) |
| `/game-design` | Nova | Game Design Document, mission specifications, world design |
| `/docs` | Sage | Documentation: onboarding, guides, architecture rationale |
| `/qa` | Iris | QA test plans, known issues, regression tests |

**Before you touch any code:**
- Read the **Architecture Spec** (`/architecture/technical-architecture-v0.1.md`) — this is the source of truth for all technical decisions
- Read the **Game Design Doc** (`/game-design/`) — this covers missions, world scope, and gameplay intent

---

## Team & Contacts

Stuck or need clarification? Here's who owns what:

| Name | Role | Domains | Ping for |
|---|---|---|---|
| **Kai** | Development Lead | Overall architecture, repo organization, decisions | Architecture questions, blocking issues, repo structure |
| **Lux** | Graphics & Rendering | Babylon.js, LOD system, tile streaming, shaders, textures | Rendering bugs, shader issues, performance on graphics side |
| **Phoenix** | Physics & Gameplay | Vehicle physics, AI, traffic, pedestrians, combat | Vehicle feel, gameplay mechanics, physics bugs, AI behavior |
| **Nova** | Game Design | Missions, world design, mechanics feel | Mission design, wanted system feel, world scope questions |
| **Cedar** | Backend & Auth | Save/load, authentication, APIs, database | Save data corruption, auth issues, API contracts |
| **Iris** | QA | Test plans, regression testing, known issues | Known bugs, performance regressions, test coverage |
| **Sage** | Technical Writer & Documentation | Docs, onboarding, guides | Documentation gaps, unclear specs, process documentation |

---

## Architecture Overview (Read First)

The architecture is locked. Before implementing anything, understand the model.

**Key concepts you must know:**

1. **Threading Model:** Main thread renders only. Physics and streaming run in Web Workers with SharedArrayBuffer state sync.
2. **Tile Streaming:** 64m × 64m tiles load within 500m radius. All asset decompression (Draco, KTX2) happens in the streaming worker, never on main thread.
3. **Physics Tick:** 120Hz fixed timestep in physics worker. Render loop interpolates between physics states.
4. **Rendering Stack:** Babylon.js v7.x, WebGL2 only. No WebGL1 fallback. No WebGPU for MVP.
5. **Asset Pipeline:** OSM → LOD generation → KTX2 compression → CDN. See `docs/asset-pipeline-guide.md` for detailed requirements.
6. **Save Model:** Full snapshots (sparse), not deltas. Versioned (`save_version`, `schema_version`) for migration safety.

**Full spec:** See `/architecture/technical-architecture-v0.1.md`

**Architecture rationale (why these choices):** See `docs/architecture-guide.md`

---

## Development Workflow (Checklist)

Once the dev server is running:

- [ ] Clone the repo
- [ ] Run `bun install`
- [ ] Run `bun run dev`
- [ ] Verify SharedArrayBuffer is available (browser console check above)
- [ ] Read the architecture spec (`/architecture/`)
- [ ] Read the game design doc (`/game-design/`)
- [ ] Identify the team member who owns your domain (see table above)
- [ ] Ping them with questions before diving in

---

## Common Issues & Troubleshooting

### Blank screen on localhost

**Most likely:** Dev server not running or COEP/COOP headers missing.

**Checklist:**
1. Is the dev server actually running? (should see log output from `bun run dev`)
2. Is localhost accessible? (try `curl localhost` in terminal — should get HTML)
3. Check browser console (F12) for JavaScript errors
4. Check network tab for COEP/COOP headers in response headers (see [COEP/COOP Headers](#ceopcopp-headers-required-from-day-one) section above)

### SharedArrayBuffer not available

**Most likely:** COEP/COOP headers missing from dev server response.

**Verify:** Run the browser console check in [SharedArrayBuffer Verification](#sharedarraybuffer-verification) above.

**If headers are missing:** Tell Cedar (Backend). The dev server config needs both headers on all responses.

### Game loads but physics doesn't work (nothing moves)

**Most likely:** SharedArrayBuffer available but physics worker failed silently.

**Check:**
1. DevTools → Console → any errors logged?
2. DevTools → Application → Shared Memory → is any SharedArrayBuffer allocated? (if not, worker didn't start)
3. Try closing and reopening the tab

### Git clone fails

Make sure you have access to the repo. If the clone command times out or returns auth errors, you may not have GitHub access yet. Message Kai.

---

## FAQ

**Q: Why 120Hz physics and not 60Hz?**
A: Tile loads and GC pauses are constant in a streaming open world. 60Hz physics in lockstep degrades visibly. 120Hz + render interpolation handles this gracefully. See the architecture spec (Section 4) and `docs/architecture-guide.md` for details.

**Q: Can I use Three.js instead of Babylon.js?**
A: No. Babylon.js is locked. It was chosen for production-ready LOD/culling/streaming systems out of the box. See `docs/architecture-guide.md` for the rationale.

**Q: Why KTX2 and not WebP or PNG?**
A: Texture compression is mandatory for the tile budget. One uncompressed 4K albedo atlas exceeds the per-tile texture budget. KTX2 with Basis Universal provides GPU-native compression for all platforms. See Section 3 of the architecture spec and `docs/asset-pipeline-guide.md` for details.

**Q: The dev server command changed to something else. What do I do?**
A: Update this file. One-line change. Let Kai know so he can update the shared version.

---

## Next Steps

1. **Now:** Verify the dev server is running and SharedArrayBuffer is available
2. **Next:** Read the architecture spec (`/architecture/technical-architecture-v0.1.md`)
3. **Then:** Read the game design doc (`/game-design/`)
4. **Finally:** Find your domain owner in the team table and ask them to point you to the specific subsystem to focus on

---

**Need help?** Message your domain owner or Kai. Stuck on something not in this doc? Let Sage know — it means the docs need updating.

---

**Last updated:** 2026-03-20
**Authoritative source:** This file
