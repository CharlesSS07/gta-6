# GTA 6 Browser Game — Backend API Spec v0.1

> **Status:** Locked for MVP Sprint 1  
> **Owner:** Cedar (Backend Engineer)  
> **Last updated:** 2026-03-20

---

## Authentication

All endpoints require a valid Supabase session token:

```
Authorization: Bearer <supabase_jwt_token>
```

The server validates the token and matches `player_id` from JWT claims — clients cannot read or write another player's data. Row-Level Security at the DB layer enforces this independently of API-level checks.

---

## Endpoints

### GET /api/v1/saves/{player_id}

Load a player's active save.

**Response 200:**
```json
{
  "schema_version": 1,
  "player_id": "uuid",
  "save_version": 42,
  "saved_at": "2026-03-20T14:00:00Z",
  "position": { "x": 0.0, "y": 0.0, "z": 0.0, "heading": 0.0 },
  "vehicle": {
    "type_id": "veh_sultan",
    "health": 850.0,
    "position": { "x": 0.0, "y": 0.0, "z": 0.0, "heading": 0.0 }
  },
  "stats": { "health": 100, "armor": 50, "money": 1500, "wanted_level": 0 },
  "mission_state": {
    "active_mission_id": null,
    "objective_index": 0,
    "trigger_states": {}
  },
  "progression": {
    "missions_complete": [],
    "vehicles_unlocked": [],
    "safe_houses": []
  },
  "world_flags": {}
}
```

**Response 404:**
```json
{ "error": "no_save_found" }
```

---

### POST /api/v1/saves/{player_id}

Write (upsert) a player save. Uses optimistic versioning — server rejects stale writes.

**Request body:**
```json
{
  "schema_version": 1,
  "save_version": 42,
  "position": { "x": 0.0, "y": 0.0, "z": 0.0, "heading": 0.0 },
  "vehicle": { "type_id": "veh_sultan", "health": 850.0, "position": { "x": 0.0, "y": 0.0, "z": 0.0, "heading": 0.0 } },
  "stats": { "health": 100, "armor": 50, "money": 1500, "wanted_level": 0 },
  "mission_state": { "active_mission_id": null, "objective_index": 0, "trigger_states": {} },
  "progression": { "missions_complete": [], "vehicles_unlocked": [], "safe_houses": [] },
  "world_flags": {}
}
```

**Response 200:**
```json
{ "save_version": 43, "saved_at": "2026-03-20T14:02:00Z" }
```

**Response 409 (version conflict):**
```json
{ "error": "version_conflict", "server_version": 44 }
```

**Response 400 (unsupported schema):**
```json
{ "error": "schema_version_unsupported", "min_version": 1 }
```

**Response 413 (payload too large):**
```json
{ "error": "payload_too_large", "max_bytes": 1048576 }
```

**Server write logic:**
1. Validate JWT, confirm `player_id` matches token claims
2. Check `save_version` matches server's current version (409 if mismatch)
3. Validate `schema_version` is supported (≥ 1)
4. Reject if payload exceeds 1MB
5. Write in a single transaction, increment `save_version`
6. Return new `save_version` and `saved_at`

---

### POST /api/v1/events/{player_id}

Submit a server-validated progression event (mission complete, purchase, unlock, etc.).

**Request body:**
```json
{
  "event_type": "mission_complete",
  "event_id": "evt-uuid-v4",
  "payload": {
    "mission_id": "m_003",
    "reward_money": 5000,
    "reward_unlock": "veh_infernus"
  },
  "client_state_hash": "sha256_hex_of_progression_object"
}
```

`event_type` enum: `mission_complete` | `vehicle_unlock` | `purchase` | `safe_house_unlock`

**Response 200:**
```json
{
  "accepted": true,
  "applied_changes": {
    "money_delta": 5000,
    "missions_complete": ["m_003"],
    "vehicles_unlocked": ["veh_infernus"]
  }
}
```

**Response 422 (rejected):**
```json
{
  "accepted": false,
  "reason": "prerequisite_not_met",
  "detail": "m_002 must be complete before m_003"
}
```

`reason` enum: `prerequisite_not_met` | `reward_out_of_bounds` | `mission_already_complete` | `duplicate_event`

**Server validation logic:**
1. Check `event_id` for duplicates (idempotency — ignore repeat submissions safely)
2. Verify player meets prerequisites for the event
3. Verify reward is within expected bounds for the event type
4. If all pass: apply changes atomically to the save record
5. Always append to `progression_events` log (even rejections — for audit trail)

---

### GET /api/v1/profile/{player_id}

Read-only player profile. Profile is created automatically on first login via Supabase Auth webhook.

**Response 200:**
```json
{
  "player_id": "uuid",
  "display_name": "string",
  "created_at": "2026-03-20T00:00:00Z",
  "last_seen": "2026-03-20T14:00:00Z"
}
```

**Response 404:**
```json
{ "error": "profile_not_found" }
```

---

## Save Data Schema (v1)

Agreed contract between backend (Cedar) and gameplay (Phoenix). **Do not modify schema_version without coordinating with Cedar first** — server-side migration must be ready before client ships a new version.

```json
{
  "schema_version": 1,
  "save_version": 0,
  "position": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0,
    "heading": 0.0
  },
  "vehicle": {
    "type_id": "veh_sultan",
    "health": 850.0,
    "position": { "x": 0.0, "y": 0.0, "z": 0.0, "heading": 0.0 }
  },
  "stats": {
    "health": 100,
    "armor": 50,
    "money": 1500,
    "wanted_level": 0
  },
  "mission_state": {
    "active_mission_id": "m_003",
    "objective_index": 2,
    "trigger_states": {}
  },
  "progression": {
    "missions_complete": ["m_001", "m_002"],
    "vehicles_unlocked": ["veh_sultan"],
    "safe_houses": ["sh_downtown"]
  },
  "world_flags": {}
}
```

**`world_flags` MVP scope** (keys outside this convention are stored but not validated):
- Mission-critical state changes (e.g. `"mission_3_gate_unlocked": true`)
- High-impact destructibles that would be jarring to see restored
- Safe house / unlock state

NPC death states and minor prop state are **not** persisted in MVP — NPCs respawn fresh on load.

---

## Required HTTP Headers

All responses must include:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are mandatory from day one. Phoenix's physics worker and Lux's streaming pipeline both depend on `SharedArrayBuffer`, which requires these headers. **Absence causes silent failure — not a visible error.**

CDN asset responses must also include:
```
Cross-Origin-Resource-Policy: cross-origin
```

---

## Future Endpoints (Sprint 2)

```
GET  /api/v1/saves/{player_id}/deleted   — list soft-deleted saves (30-day window)
POST /api/v1/saves/{player_id}/restore   — restore most recent soft-deleted save
```

Soft-deleted rows are retained for 30 days then purged via a scheduled job.
