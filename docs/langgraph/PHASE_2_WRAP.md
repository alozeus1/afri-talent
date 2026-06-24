# LangGraph — Phase 2: Wrap the existing orchestrator

**Status:** Implemented, full project typecheck clean, 50/50 AI tests green (incl. 5 new wrap tests + existing suites). **Zero behavior change when `LANGGRAPH_ENABLED`/per-graph flags are off** (default).

## What it does
Wraps the existing orchestrator modes (`resume_review` / `job_match` / `apply_pack`) in a LangGraph state machine that adds **durable graph state + Postgres checkpointing, a `GraphRun` audit row, structured events, and run-level metrics** — without touching any agent, schema, threshold, budget, truth-guard, or `MOCK_AI` behavior.

The orchestrator **core is injected** into the graph (`runOrchestratorViaGraph(input, core)`), so:
- No import cycle (langgraph never imports the orchestrator).
- 100% output parity — the graph calls the same `runOrchestratorCore` and returns its output unchanged.
- The PII-bearing output is held in memory and **never written to a checkpointed channel** — only refs/status/token counts are.

## Files
- `backend/src/lib/ai/orchestrator/index.ts` — split into a thin flag-gated `runOrchestrator` dispatcher + the unchanged `runOrchestratorCore`.
- `backend/src/lib/ai/langgraph/graphs/orchestratorWrap.graph.ts` — the wrap graph (init → execute → finalize).
- `backend/src/lib/ai/langgraph/tools/prismaTools.ts` — best-effort `GraphRun`/`GraphRunEvent` persistence + the Prisma event sink.
- `backend/src/lib/ai/langgraph/index.ts` — registers the Prisma event sink in `bootstrapLangGraph()`.
- `backend/src/server.ts` — calls `bootstrapLangGraph()` on startup (no-op when flag off).
- `backend/src/lib/ai/langgraph/tests/orchestratorWrap.test.ts` — parity, error propagation, status mapping, single-execution, events.

## Safety guarantees
- **Flag off = legacy path**, byte-for-byte. Enable per workflow: `LANGGRAPH_APPLY_PACK=1` (or global `LANGGRAPH_ENABLED=1`).
- **Persistence is non-fatal** — if the DB write fails, the run still completes and returns identical output (verified in tests; the warning seen locally is just the sandbox's Prisma engine arch mismatch).
- **No new migrations or deps** — Phase 1 already added the models and packages.

## Verify locally
```bash
cd backend
npm run typecheck
MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/ai
```

## Next (Phase 3)
Decompose `apply_pack` into finer nodes and add the human-approval `interrupt()` before submit, integrate the apply state machine + exact acknowledgements, and use the `IdempotencyKey` ledger for SES/apply side effects.
