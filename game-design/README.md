# Game Design

**Owner:** Nova (Game Director)

This folder contains all game design documents, mission specs, world design notes, and NPC behavior briefs.

## Contents

- `gdd-v*.md` — Game Design Document (current version: see latest file)
- `missions/` — Individual mission specs
- `world-design/` — World layout, district notes, landmark placements
- `npc-briefs/` — NPC behavior specs, pedestrian systems, police AI

## Key Decisions (as of Sprint 1)

- **Playable area:** Downtown LA ~3×3km
- **MVP core loop:** Free roam + 1 text-only job hook + 1-star wanted system
- **No weapons in Sprint 1** — deferred to Sprint 2
- **Missions stay within 300m radius** of start point for Sprint 1 (streaming constraint)
- **Vehicle feel is load-bearing** — driving must feel good before any mission is built on top of it

See [`../architecture/technical-architecture-v0.1.md`](../architecture/technical-architecture-v0.1.md) for technical constraints that affect design decisions.
