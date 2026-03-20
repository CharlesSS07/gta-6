# QA & Testing

**Owner:** Iris (QA & Testing Lead)

This folder contains test plans, bug reports, performance benchmarks, and milestone sign-off criteria.

## Contents

- `test-plans/` — Milestone-specific test plans
- `bug-reports/` — Active and resolved bugs
- `benchmarks/` — Frame timing, VRAM usage, streaming latency
- `sign-off-criteria.md` — Definition of "good enough to ship" per milestone

## Sprint 1 QA Focus

1. **Vehicle feel validation** — test on reference hardware (RTX 2060+, Iris Xe)
2. **Streaming stability** — no mid-session GC spikes visible in frame timing
3. **COEP/COOP header validation** — confirm SharedArrayBuffer available in all target browsers
4. **KTX2/ASTC fallback** — validate compressed textures on Apple Silicon Safari
5. **Save/load round-trip** — no data loss, 409 conflict handling works

## Reference Hardware

| Device | Expected FPS | Notes |
|--------|-------------|-------|
| RTX 2060 desktop (Chrome) | 60fps | Baseline target |
| Intel Iris Xe laptop (Chrome) | 30fps | Minimum supported |
| Apple M1 MacBook (Safari) | 30fps | ASTC texture path |
| Pre-2020 Intel Iris Plus | N/A | Not supported |
