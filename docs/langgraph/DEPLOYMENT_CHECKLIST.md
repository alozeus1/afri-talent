# LangGraph — Deployment Checklist & Rollback Runbook

Per `CLAUDE.md`: no agent merges to `main`, deploys prod, applies infra, or runs destructive migrations without explicit human approval. This runbook is for a human operator.

## Pre-deploy (every LangGraph PR)
- [ ] CI green: lint, typecheck, vitest (`src/lib/ai/langgraph` ≥ 89 tests), Playwright.
- [ ] Security gates green: Semgrep, Trivy, Gitleaks, `npm audit` (high/critical), Checkov.
- [ ] No secrets committed; OIDC unchanged; no static AWS keys.
- [ ] `prisma generate` runs clean; **review any migration** (additive only: GraphRun/GraphRunEvent/IdempotencyKey from Phase 1, the nullable pgvector column from Phase 6). Never auto-apply to prod.
- [ ] Confirm all new flags are **off** in the deployed env unless intentionally enabling.

## Migrations (apply via `prisma migrate deploy`, reviewed)
1. `..._add_langgraph_orchestration` — GraphRun, GraphRunEvent, IdempotencyKey (additive).
2. `20260624010000_add_semantic_pgvector_column` — nullable `embeddingVector` + HNSW index (additive; pgvector already enabled).
- The LangGraph checkpointer tables are created by `setupCheckpointer()` at bootstrap when `LANGGRAPH_ENABLED=1` (idempotent).

## Flag matrix (all default OFF)
| Flag | Effect |
|---|---|
| `LANGGRAPH_ENABLED` | Global kill-switch; bootstraps checkpointer + event sink |
| `LANGGRAPH_<WORKFLOW>` (e.g. `LANGGRAPH_APPLY_PACK`) | Per-graph canary |
| `APPLY_SES_IDEMPOTENCY` | Idempotent SES sends (Phase 3) |
| `RAG_PGVECTOR` | Native pgvector ANN search (requires backfill first) |
| `AI_MODEL_FAST` / `AI_MODEL_QUAL` | Model overrides |

## Staged enablement
1. Staging: `LANGGRAPH_ENABLED=1` + one per-graph flag. Run a workflow; confirm `GraphRun` row + `GraphRunEvent` trail and no PII in logs.
2. Shadow/parity for wrapped orchestrator under `MOCK_AI=1`.
3. For interrupt graphs (apply/blog/trust/follow-up/verification): verify pause → `AWAITING_APPROVAL` → resume → complete; verify TOTP refusal path.
4. RAG pgvector: apply migration → dual-write + backfill `embeddingVector` → set `RAG_PGVECTOR=1` → compare parity → promote.
5. Prod: enable one graph at a time; watch `langgraph_*` ops metrics + Sentry.

## Rollback (fast → full)
1. **Instant:** unset the per-graph flag (or `LANGGRAPH_ENABLED`) → 100% legacy path, no redeploy.
2. **Idempotency/RAG:** unset `APPLY_SES_IDEMPOTENCY` / `RAG_PGVECTOR`.
3. **Code:** each phase is one squash-merged PR → `git revert` removes a phase cleanly.
4. **DB:** all migrations additive — rollback = stop using the columns/tables (no data loss). The `langgraph` checkpointer tables can be truncated without touching business data. Drop the pgvector column only via a later, separately-approved migration.

## Health signals
- Ops metrics: `langgraph_graph_started/completed/failed`, `langgraph_run_duration_ms`, `langgraph_run_outcome`, `langgraph_<event>`.
- Audit: `GraphRun.status` (RUNNING/INTERRUPTED/AWAITING_APPROVAL/COMPLETE/PARTIAL/BLOCKED/FAILED), `GraphRunEvent` per node.
- Alerts to watch: rising `graph_failed`, `truth_guard_failed`, `quota_blocked`, `risk_threshold_triggered`.

## Common failure modes
- **Persistence warnings, runs still succeed** → expected: `GraphRun`/`GraphRunEvent` writes are best-effort/non-fatal.
- **Graph "stuck" at AWAITING_APPROVAL** → resume not called; check the route wiring sends the approval `Command`.
- **pgvector search empty** → `embeddingVector` not backfilled; keep `RAG_PGVECTOR=0` until backfill completes (search falls back automatically).
- **`totp_required` outcome** → admin resume sent `totpVerified:false`; route must set it true only after the TOTP gate.
