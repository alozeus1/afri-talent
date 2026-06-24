# LangGraph — Phase 4: Candidate autopilot (safe automation)

**Status:** Implemented, full project typecheck clean, 50/50 langgraph tests green (9 new). **Purely additive** — a new graph + tests, no changes to any existing runtime file. Not wired into the auto-apply worker yet → zero behavior change.

## What it does
`graphs/candidateAutopilot.graph.ts` runs a deterministic sequence of **safety gates**; only if all pass does it **generate apply packs** — and it has **no path to a submission** (its deps interface has no submit method). Any actual submit must still go through the Phase 3 human-approval graph.

Gates (first failure stops, with a typed reason):
1. `not_opted_in` — candidate hasn't enabled autopilot
2. `plan_not_entitled` / `billing_invalid` — entitlement + billing state
3. `profile_incomplete` — completeness < threshold (default 70)
4. `trust_blocked` — risk tier HIGH/CRITICAL disallows automation (emits a risk flag + `risk_threshold_triggered`)
5. `apply_cap_reached` — no remaining apply capacity

When gates pass, it generates packs for strong matches (score ≥ 75 by default), **capped by `min(remaining caps, AI apply-pack quota, matches)`**, notifies the candidate once (idempotent via the ledger), and schedules follow-ups.

## Safety guarantees (brief's non-negotiables — all test-covered)
- **Never auto-submits.** Structurally impossible; the graph only generates packs.
- **Respects caps AND quota.** Verified: 5 matches + capacity 1 → 1 pack; quota 2 → 2 packs.
- **Stops on high risk, billing failure, opt-out, incomplete profile, or exhausted caps** — each verified with its exact block reason.
- **PII-free** state; deterministic thread id `candidate:{id}:autopilot`.

## Design
All data access + side effects are **injected** (`AutopilotDeps`), so the graph reuses existing entitlements/trust/caps logic via an adapter and stays fully unit-testable. The adapter that maps `AutopilotDeps` to the real functions (`getUserEntitlements`, candidate trust profile risk, `checkApplyCaps`, job-matcher alerts, orchestrator `apply_pack`) is wired during controlled rollout — intentionally **not** in this PR so no existing worker behavior changes until you opt in.

## Files
- `backend/src/lib/ai/langgraph/graphs/candidateAutopilot.graph.ts`
- `backend/src/lib/ai/langgraph/tests/candidateAutopilot.test.ts`

## Verify locally
```bash
cd backend
npm run typecheck
LOG_LEVEL=silent MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/ai/langgraph
```

## Controlled rollout (after merge)
Implement the `AutopilotDeps` adapter and call `runCandidateAutopilot()` from `workers/auto-apply.ts` behind `LANGGRAPH_CANDIDATE_AUTOPILOT=1`, generating packs only — submissions continue to require the Phase 3 approval gate.

## Next (Phase 5)
Trust & verification: employer verification, candidate verification, and trust-moderation graphs with admin-review interrupts and TOTP-gated actions.
