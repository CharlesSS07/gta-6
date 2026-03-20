# Streets of Angels

> A single-player, open-world sandbox GTA-style game set in real Los Angeles — playable entirely in the browser.

[![License: TBD](https://img.shields.io/badge/license-TBD-lightgrey)](#license)

---

## Overview

Streets of Angels brings the chaos, freedom, and energy of Los Angeles to your browser. Drive through real LA streets, steal cars, evade police, and complete missions — all rendered with WebGL using actual OpenStreetMap geography. No install required.

---

## MVP Scope

**Playable area:** ~3×3km — Downtown LA, Koreatown, and a slice of Hollywood
**Core loop:** Free roam → steal car → 1-star police pursuit → single job hook
**Target platform:** Any modern browser on Intel Iris Xe or better

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| 3D Engine | [Babylon.js v7.x](https://www.babylonjs.com/) + WebGL2 |
| Physics | Havok (native Babylon.js plugin, 120Hz worker) |
| UI / HUD | Svelte |
| Map Data | OpenStreetMap (OSM) → pre-baked assets |
| Auth + DB | [Supabase](https://supabase.com/) (PostgreSQL) |
| CDN | Cloudflare (content-hashed assets) |
| Runtime | Browser — no install required |

---

## Performance Targets

| Hardware | Target |
|----------|--------|
| Discrete GPU (RTX 2060 or better) | 60 fps @ 1080p |
| Integrated GPU (Intel Iris Xe, Apple M1+) | 30 fps @ 1080p |
| Pre-2020 integrated (Intel Iris Plus) | **Not supported** |

**Frame budget:** 16.67ms per frame at 60fps
**Physics tick:** 120Hz fixed timestep in a dedicated Web Worker

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (preferred) or Node.js 18+
- Modern browser: Chrome 113+, Firefox 114+, or Safari 16.4+
- **Required browser headers** (set by dev server automatically):
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  _(These enable SharedArrayBuffer, required for the physics and streaming workers.)_

### Local Development

```bash
# Clone
git clone https://github.com/CharlesSS07/gta-6.git
cd gta-6

# Install dependencies
bun install

# Start dev server
bun dev

# Open in browser
open http://localhost:5173
```

### Build for Production

```bash
bun run build
bun run preview
```

---

## Project Structure

```
gta-6/
├── architecture/     # Kai: tech specs, architecture decisions, diagrams
├── game-design/      # Nova: GDD, mission specs, world design
├── graphics/         # Lux: shaders, LOD specs, performance profiles
├── gameplay/         # Phoenix: game systems, physics, prototypes
├── backend/          # Cedar: API specs, DB schemas, server code
├── qa/               # Iris: test plans, bug reports, benchmarks
├── docs/             # Sage: onboarding guides, technical docs
├── builds/           # Shared: latest playable builds
└── README.md
```

---

## Architecture

See [`architecture/technical-architecture-v0.1.md`](architecture/technical-architecture-v0.1.md) for the full technical spec.

**Key decisions:**
- **Map source:** OSM data → simplified collision meshes + hand-authored game assets
- **Rendering:** Babylon.js v7.x, WebGL2, 64m×64m tile streaming
- **Physics:** Havok at 120Hz in a Web Worker (SharedArrayBuffer + Atomics)
- **Backend:** Client-heavy simulation; server persists saves + validates progression events
- **Streaming:** All tile parsing in Web Workers — main thread only touches GPU upload

---

## Contributing

1. Read [`architecture/technical-architecture-v0.1.md`](architecture/technical-architecture-v0.1.md) — this is the authoritative source of truth
2. Check [`game-design/`](game-design/) for current design decisions before touching gameplay
3. Each folder has a domain owner — coordinate before making cross-domain changes

### Team

| Domain | Owner | Folder |
|--------|-------|--------|
| Architecture & roadmap | Kai (Dev Lead) | `architecture/` |
| Game design & missions | Nova (Game Director) | `game-design/` |
| 3D graphics & engine | Lux (Graphics) | `graphics/` |
| Gameplay systems & physics | Phoenix (Gameplay) | `gameplay/` |
| Backend & API | Cedar (Backend) | `backend/` |
| QA & testing | Iris (QA Lead) | `qa/` |
| Docs & onboarding | Sage (Tech Writer) | `docs/` |

### Branching Strategy

- `main` — stable, always deployable
- `feature/<name>` — feature branches, PR into main
- `fix/<name>` — bug fixes

---

## License

TBD
