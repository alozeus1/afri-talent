# AfriTalent LangGraph Orchestration Layer

A production-grade, TypeScript-native LangGraph layer that adds **durable state, human-in-the-loop, observability, and side-effect safety** around AfriTalent's existing AI agents — without replacing them. BullMQ remains the scheduler/executor; LangGraph owns AI workflow state and sequencing; existing scoring/trust/caps/entitlements libs are called as tools, never reimplemented.

Built across 8 reversible, flag-gated phases (see `AUDIT_AND_PLAN.md` and the `PHASE_*` docs). Everything is **off by default** (`LANGGRAPH_ENABLED` and per-graph flags), so production behavior is unchanged until explicitly enabled.

## The 12 graphs (`graphs/`, catalog in `registry/graphInventory.ts`)

| Workflow | HITL | Purpose |
|---|---|---|
| resume_review / job_match / apply_pack | apply_pack | Orchestrator wrap (parity) + submission approval |
| candidate_autopilot | — | Gated pack generation; never auto-submits |
| employer_verification | ✓ admin/TOTP | Risk-tier gating; CRITICAL auto-suspend |
| candidate_verification | ✓ admin/TOTP | Deterministic score; document review |
| job_ingestion_quality | — | Quality + source-reliability; publish/hold/reject |
| interview_prep | — | Questions + readiness score |
| follow_up | ✓ user | Cadence draft; approved send (idempotent) |
| blog_automation | ✓ admin | Fact-check + draft; approved publish (idempotent) |
| trust_moderation | ✓ admin/TOTP | Severity triage; suspend/queue |
| billing_recovery | — | Reconcile provider vs local; pause/resume premium |

## Core building blocks
- **State** (`state/`): `BaseGraphState` (Zod) + Annotation channels + reducers. PII-free — only refs/hashes/statuses are checkpointed.
- **Policies** (`policies/`): model routing (Haiku/Sonnet, env-configurable, `MOCK_AI`-aware), tool least-privilege, human-approval gates, quota, risk tiers.
- **Registries** (`registry/`): skill registry (single source of truth) + graph catalog (all 12 workflows).
- **Observability** (`observability/`): structured graph events → logger + ops metrics + optional `GraphRunEvent` persistence. Never logs PII.
- **Memory** (`memory/`): Postgres checkpointer in prod, `MemorySaver` in test/`MOCK_AI`.
- **Tools** (`tools/`): `idempotency` (once-only side effects), `prismaTools` (audit), `ragTools` (explainable search + pgvector), `applyTools`, `trustTools`.

## Safety invariants (all test-covered)
- Applications/emails/blog posts **never** go out without explicit human approval.
- Autopilot **generates only** — no submit path exists in its deps.
- Admin trust actions require **TOTP** (`totp_required` otherwise).
- External side effects are **idempotent** (no double-send/-submit/-publish).
- Scores are deterministic + explainable (anti-inflation); LLMs supply evidence, rubrics supply numbers.

## Enabling (staged rollout)
1. `LANGGRAPH_ENABLED=1` + a single per-graph flag (e.g. `LANGGRAPH_APPLY_PACK=1`) in staging.
2. Shadow-compare against the legacy path under `MOCK_AI=1`; verify `GraphRun`/`GraphRunEvent`.
3. Promote one graph at a time. Roll back instantly by unsetting the flag.

See `DEPLOYMENT_CHECKLIST.md` for the full deploy + rollback runbook.

## Test
```bash
cd backend
npm run typecheck
LOG_LEVEL=silent MOCK_AI=1 NODE_ENV=test npx vitest run src/lib/ai/langgraph   # 89 tests
```
