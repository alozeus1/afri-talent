# LangGraph — Phase 3: Human approval + side-effect safety

**Status:** Implemented, full project typecheck clean, 60/60 apply+ai tests green (incl. 10 new). **Zero behavior change by default** — the submission graph is additive (nothing in the live route calls it yet) and the SES idempotency guard is off until `APPLY_SES_IDEMPOTENCY=1`.

## What landed

**1. Idempotency ledger** — `tools/idempotency.ts` (`runOnce(scope, key, fn)`)
- Backed by the `IdempotencyKey` table (added in Phase 1). Authoritative dedup on the unique `[scope, key]` constraint.
- COMPLETED key → returns the cached result ref **without** re-running the side effect.
- Concurrent RESERVED → `IdempotencyInProgressError`; FAILED → retryable; stale RESERVED → crash-recovery takeover.
- **Fail-open** on ledger infra errors (preserves availability), consistent with the codebase's Redis fail-open philosophy.
- Storage is behind a swappable seam (`_setIdempotencyLedger`) so it's unit-tested with no DB.

**2. Application submission graph** — `graphs/applicationSubmission.graph.ts`
- Models the consent gate as a **resumable** graph: `requestApproval` → `interrupt()` (pause) → resume with acknowledgements → `submit` → `finalize`.
- Reuses the **existing** apply state machine's `validateAcknowledgements` (exact phrases) — single source of truth, not duplicated.
- The actual dispatch is **injected** (`onApprovedSubmit`), so the critical SES/ATS code isn't reimplemented and the graph is fully testable.
- The submit is wrapped in `runOnce(...)` → a retry/replay never double-submits.
- Deterministic thread id `application:{id}:apply-pack` → re-invoking resumes rather than forks.
- `startApplicationApproval()` / `resumeApplicationApproval()` entry points return a typed outcome (`AWAITING_APPROVAL` | `SUBMITTED` | `REJECTED` | `FAILED`).

**3. SES dedup (opt-in)** — `lib/apply/email-draft.ts`
- The SES send is wrapped in `runOnce("ses_apply_email", applicationId, …)` **only when `APPLY_SES_IDEMPOTENCY=1`**. Off = byte-for-byte the old path.

## Safety guarantees (brief's non-negotiables)
- **No submission before approval** — verified by test; the graph cannot reach `submit` without valid acknowledgements.
- **Exact acknowledgements enforced** — missing any required phrase → `REJECTED` (BLOCKED), no side effect.
- **No double-send / double-submit** — idempotency ledger, verified by test.
- **PII** stays out of checkpointed channels (only acks/refs/status persisted).

## Files
- `backend/src/lib/ai/langgraph/tools/idempotency.ts`, `tools/applyTools.ts`
- `backend/src/lib/ai/langgraph/graphs/applicationSubmission.graph.ts`
- `backend/src/lib/ai/langgraph/tests/idempotency.test.ts`, `tests/applicationSubmission.test.ts`
- `backend/src/lib/apply/email-draft.ts` (flag-gated SES dedup)

## Verify locally
```bash
cd backend
npm run typecheck
LOG_LEVEL=silent MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/apply src/lib/ai
```

## Controlled rollout (after merge)
1. Enable `APPLY_SES_IDEMPOTENCY=1` in staging; confirm no duplicate apply emails; promote.
2. Wire the `/applications/:id/submit` route to `startApplicationApproval` / `resumeApplicationApproval` behind `LANGGRAPH_APPLY_PACK=1` (route integration is intentionally **not** in this PR to keep the critical submit path untouched until you opt in).

## Next (Phase 4)
Candidate autopilot graph: subscription + trust + caps + quota gates; generates apply packs but **never** auto-submits without the approval gate above.
