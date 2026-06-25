# LangGraph — Phase 5: Trust verification & moderation

**Status:** Implemented, full project typecheck clean, 62/62 langgraph tests green (13 new). **Purely additive** — 3 new graphs + shared tooling + tests, no changes to any existing runtime file. Not wired into routes/workers yet → zero behavior change.

## Graphs

**Employer verification** (`employerVerification.graph.ts`) — `assess risk → branch by tier`:
- LOW/MEDIUM → approve (allow publishing)
- HIGH → restrict publishing + **admin-review interrupt** (TOTP-gated)
- CRITICAL → **auto-suspend** (deterministic, no human)

**Trust moderation** (`trustModeration.graph.ts`) — `triage severity → branch`:
- LOW → log · MEDIUM → open case (queue) · HIGH → restrict + open case + admin interrupt · CRITICAL → suspend + notify admin
- Approved admin actions are recorded as case actions (audit).

**Candidate verification** (`candidateVerification.graph.ts`) — deterministic score from signals (email 20 / phone 20 / LinkedIn 15 / partner 15 / **document 30**). A submitted document requires an **admin interrupt + TOTP** before it counts; **document content never enters state** — only a `documentRef`.

## Safety guarantees (all test-covered)
- **TOTP-gated admin actions** — a resume payload with `totpVerified:false` is refused (`totp_required`, no action taken). Tested across employer + moderation graphs.
- **CRITICAL → automatic suspension**, no human dependency (employer + moderation).
- **HIGH → cannot proceed without admin approval** (real `interrupt()`/resume).
- **Anti-inflation scoring** — fixed rubric; document credit (+30) only after TOTP-verified admin approval; verified by score assertions (40 → 70 on approval, stays 40 without TOTP).
- **PII safety** — sensitive document content is never written to a checkpointed channel; only refs/booleans/scores are.

## Design
Risk tiers reuse `riskPolicy.riskTierForScore` (LOW<25, MEDIUM<55, HIGH<80, CRITICAL≥80) — identical to the existing trust `riskLevelForScore`. All data access + side effects are **injected** (`*Deps`), so the graphs reuse the existing trust service (`assessEmployerTrust`, `recordTrustRiskEvent`, `createTrustCase`, `addTrustCaseAction`) via an adapter wired during controlled rollout.

## Files
- `backend/src/lib/ai/langgraph/tools/trustTools.ts`
- `backend/src/lib/ai/langgraph/graphs/{employerVerification,candidateVerification,trustModeration}.graph.ts`
- `backend/src/lib/ai/langgraph/tests/trustGraphs.test.ts`

## Verify locally
```bash
cd backend
npm run typecheck
LOG_LEVEL=silent MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/ai/langgraph
```

## Controlled rollout (after merge)
Wire the `*Deps` adapters to the trust service and call the graphs from `routes/admin-trust.ts` (admin resume after the existing TOTP gate sets `totpVerified:true`) and from employer onboarding / job-publish, behind `LANGGRAPH_EMPLOYER_VERIFICATION=1` etc.

## Next (Phase 6)
Job ingestion quality graph + RAG upgrade: native pgvector column + ANN index, explainable matching, source-reliability scoring.
