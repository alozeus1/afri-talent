# LangGraph — Phase 1: Foundation

**Status:** Implemented, typechecked, unit-tested (26/26 green). **Zero behavior change** — everything is gated behind `LANGGRAPH_ENABLED` (default off) and nothing is wired into the running server yet.

## What landed

```
backend/src/lib/ai/langgraph/
  state/        schemas.ts (Zod BaseGraphState), graphState.ts (Annotation), reducers.ts
  policies/     modelPolicy, riskPolicy, toolPolicy, humanApprovalPolicy, quotaPolicy
  registry/     skillRegistry (seeded), graphRegistry (+ deterministic thread IDs)
  observability/ graphEvents, graphTracing, graphMetrics
  memory/       checkpointer (Memory in test/mock, Postgres in prod), longTermStore
  index.ts      feature flags + bootstrap
  tests/        state / policies / registry / observability  (26 tests)
```

Plus:
- `backend/package.json` — `@langchain/langgraph@^1.4.5`, `@langchain/core@^1.2.1`, `@langchain/langgraph-checkpoint-postgres@^1.0.3`.
- `backend/prisma/schema.prisma` — additive models `GraphRun`, `GraphRunEvent`, `IdempotencyKey` + enums `GraphRunStatus`, `GraphApprovalState`.
- `backend/prisma/migrations/20260624000000_add_langgraph_orchestration/` — additive migration.

## Design guarantees
- **No PII in state/traces** — state stores `inputRefs`/`outputRefs` (ids/hashes/keys), never payloads; event `details` are flat scalars only.
- **Least privilege** — `toolPolicy` is default-deny per workflow.
- **Human-in-the-loop ready** — `humanApprovalPolicy` enumerates the sensitive actions; `interrupt()`/`Command({resume})` verified against LangGraph 1.x.
- **Deterministic in CI** — `modelPolicy.isMockAi()` honors `MOCK_AI=1`; checkpointer falls back to `MemorySaver` in test.
- **BullMQ unchanged** — this layer is orchestration/state only.

## Enabling (later — not in this PR's runtime)
- Global: `LANGGRAPH_ENABLED=1`
- Per-graph canary: `LANGGRAPH_APPLY_PACK=1`
- Model overrides: `AI_MODEL_FAST`, `AI_MODEL_QUAL`
- Cost-estimate rates (verify vs current Anthropic pricing): `AI_COST_*_PER_MTOK`

## Verify locally
```bash
cd backend
npm install                       # records the lockfile for the new deps
npx prisma generate               # picks up GraphRun/GraphRunEvent/IdempotencyKey
npm run typecheck
npx vitest run src/lib/ai/langgraph/tests
# DB (review before applying; never auto-apply to prod):
npx prisma migrate dev --name add_langgraph_orchestration   # regenerates/validates the migration
```

## Not in this PR (next phases)
- Wiring `bootstrapLangGraph()` into `server.ts` and delegating `runOrchestrator` to graphs (Phase 2).
- `interrupt`/resume in the apply workflow + idempotency ledger usage (Phase 3).
- Prisma-backed `GraphRunEvent` sink registration (Phase 2, via `registerGraphEventSink`).
