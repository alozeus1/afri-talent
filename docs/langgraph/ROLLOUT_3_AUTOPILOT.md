# Rollout 3 — Candidate autopilot safety gate (live wiring)

**Status:** Implemented, full project typecheck clean, 106/106 langgraph tests green. **Flag OFF by default → auto-apply worker unchanged.** Single-shot, fully testable. Independent of Rollout 2 (different files).

## What it wires
The `candidateAutopilot` graph runs as a **per-user preflight gate** in `workers/auto-apply.ts`. When `LANGGRAPH_CANDIDATE_AUTOPILOT` (or global) is on, before preparing any pack for a user the worker checks the safety gates and **skips users that fail**:

| Gate | Source |
|---|---|
| opted in | `CandidateAutopilotProfile.enabled` |
| entitled + billing | `getUserEntitlements().autopilot` (+ worker already filters ACTIVE subs) |
| profile complete | deterministic completeness proxy ≥ 70 |
| trust/risk tier | `CandidateTrustProfile.riskScore` → LOW/MEDIUM only |
| capacity | sentinel (per-job apply caps still enforced downstream at submit/dispatch) |

Flag off → the gate isn't consulted; the generation loop is byte-for-byte unchanged. The gate is **cached per user per cycle** (one evaluation per user).

## Why "gate-only"
The graph is fed no matches (`findStrongMatches → []`), so it runs the gates and generates nothing: `COMPLETE` = allowed, `BLOCKED` = a gate failed (typed reason). Generation stays in the proven worker loop — this only decides allow/skip, so the blast radius is "some users skipped when on," fully reversible.

## Adapter (`integration/candidateAutopilotAdapter.ts`)
- `buildAutopilotGateDeps(candidateId)` wires gate deps to real functions (autopilot profile, entitlements, profile completeness, trust risk).
- `evaluateAutopilotGate(candidateId, depsOverride?)` → `{ allowed, reason? }`. `depsOverride` is for tests.

## Tests
- `profileCompletenessFrom`: present-signal scoring.
- `evaluateAutopilotGate`: allows when gates pass; blocks with the correct reason for each of not_opted_in / plan_not_entitled / profile_incomplete / trust_blocked / apply_cap_reached (injected deps; the graph's gate logic itself is also covered by the Phase 4 suite).

## Enable
```bash
# staging
LANGGRAPH_ENABLED=1
LANGGRAPH_CANDIDATE_AUTOPILOT=1
```
Watch the `[auto-apply] autopilot gate blocked user` logs + the generated/skipped counts. Roll back by unsetting the flag.

## Mapping notes (tune later)
- **Profile completeness** uses a deterministic proxy (headline/bio/skills/years/resume). Swap for a canonical completeness field when one exists.
- **Capacity** returns a positive sentinel here; real per-job throttling remains at `checkApplyCaps` (submit/dispatch). If you want a hard weekly cap at the gate, wire `getRemainingCapacity` to `weeklyApplyLimit − this-week count`.
