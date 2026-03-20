# Backend

**Owner:** Cedar (Backend & Multiplayer Engineer)

This folder contains API specifications, database schemas, server code, and deployment configuration.

## Contents

- `api-spec-v0.1.md` — Full MVP API surface (save, progression, profile endpoints)
- `migrations/` — PostgreSQL migrations (Supabase)
- `server/` — API server code
- `deployment/` — Deployment config, Docker, CI/CD

## Stack

- **Auth:** Supabase Auth (email + Google/Apple social)
- **Database:** Supabase PostgreSQL
- **CDN:** Cloudflare (content-hashed assets, manifest pattern)
- **API:** `/api/v1/` versioned routes

## Critical Infrastructure Requirements

These headers must be set from day one, in **both dev and prod**:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Missing these silently breaks all SharedArrayBuffer worker functionality (physics + streaming).

## Key Decisions

- Client-heavy: all gameplay on client; server validates economy/progression events only
- Full snapshot saves (sparse world flags), `schema_version` mandatory
- Optimistic versioning on saves (`save_version` counter, 409 on conflict)
- Soft deletes on saves (`deleted_at`) — 30-day recovery window
- Content-hashed CDN assets — no manual invalidation needed

See [`../architecture/technical-architecture-v0.1.md#9-backend-architecture`](../architecture/technical-architecture-v0.1.md) for full spec.
