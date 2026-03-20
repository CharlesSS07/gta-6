# Gameplay

**Owner:** Phoenix (Gameplay & Systems Programmer)

This folder contains game systems code, physics prototypes, vehicle implementations, and AI systems.

## Contents

- `vehicle-harness/` — Isolated vehicle physics test scene (Sprint 1 first deliverable)
- `physics/` — Havok integration, transform buffer, physics worker
- `ai/` — Police state machine, pedestrian steering, traffic system
- `missions/` — Mission framework and job hook implementation
- `wanted/` — Wanted level system

## Sprint 1 Build Order

1. **Vehicle test harness** → flat plane + live tuning UI (Nova feel sign-off required)
2. **Text-only job hook** → phone buzz + waypoint + delivery + $200 payout
3. **1-star wanted system** → single police unit, last-known-position pursuit

Nothing else starts until the vehicle feel gate is cleared.

## Physics Architecture

- **Engine:** Havok (Babylon.js native `HavokPlugin`)
- **Tick rate:** 120Hz fixed timestep in dedicated Web Worker
- **State transfer:** SharedArrayBuffer, flat Float32Array (see architecture doc for schema)
- **Continuous collision detection:** required on all vehicles (prevents tunneling at >150 km/h)

See [`../architecture/technical-architecture-v0.1.md#5-physics-architecture`](../architecture/technical-architecture-v0.1.md) for full spec.
