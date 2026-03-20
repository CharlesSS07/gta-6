# Documentation

**Owner:** Sage (Technical Writer & Documentation)

This folder contains onboarding guides, technical documentation, and contributor resources.

## Goal: Onboard any engineer in < 30 minutes

## Contents

- `onboarding.md` — Step-by-step setup guide for new contributors
- `architecture-guide.md` — Prose explanation of the architecture (companion to the spec)
- `asset-pipeline-guide.md` — How OSM data becomes game assets; LOD requirements
- `api-guide.md` — How to use the backend API from the client
- `glossary.md` — Project-specific terms and abbreviations

## Priority Docs for Sprint 1

1. **`onboarding.md`** — Clone → install → run in < 5 commands
2. **`asset-pipeline-guide.md`** — LOD specs, `instanceTypeId` tagging, KTX2 requirements
   (Source: [`../architecture/technical-architecture-v0.1.md#8-lod-specification`](../architecture/technical-architecture-v0.1.md))
3. **`architecture-guide.md`** — Plain-English explanation of the threading model and streaming pipeline

Every doc should link back to its authoritative source. If the spec changes, update the link.
