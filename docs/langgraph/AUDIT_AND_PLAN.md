# AfriTalent — AI Orchestration Modernization: Audit & LangGraph Implementation Plan

**Author:** AI/ML + LangGraph + DevSecOps engineering pass
**Date:** 2026-06-24
**Status:** DRAFT — awaiting human acceptance before any code changes
**Scope:** Audit the existing agentic system and design a production-grade LangGraph (JS/TS) orchestration layer. No production merge/deploy occurs without explicit human approval (per `CLAUDE.md` non-negotiables).

---

## 0. Executive summary & recommendation

AfriTalent already has a **strong, deterministic, safety-first AI core** — a hand-rolled orchestrator with Zod-validated agents, token budgets, a truth-consistency guard, `MOCK_AI=1`, deterministic scoring, apply caps, trust scoring, billing entitlements, idempotent webhook handling, and human approval gates at the HTTP layer. This is not greenfield; it is a **modernization**.

**Recommendation:** Introduce **LangGraph JS (`@langchain/langgraph`, currently `1.4.5`, installable)** as a thin *orchestration and state* layer that **wraps** existing agents/skills rather than replacing them. Keep BullMQ as the execution/scheduling substrate. Add **PostgreSQL-backed graph persistence** (LangGraph checkpointer) plus a business-facing `GraphRun`/`GraphRunEvent` audit model that extends — not replaces — the existing `AiRun` tables. Ship in **8 reversible phases**, each behind a feature flag (`LANGGRAPH_ENABLED`, default off), each branch-based and PR-reviewed.

**Why LangGraph JS (not Python):** The entire AI subsystem is TypeScript (`@anthropic-ai/sdk`, Zod 4, BullMQ, Prisma). There are zero Python AI services in the repo. A Python sidecar would add a deployment surface, a second IaC target, and cross-process PII handling for no benefit. **Stay TypeScript-native.**

**The single most important architectural rule:** LangGraph owns *AI workflow state and agent sequencing*; BullMQ owns *scheduling, background execution, distributed locking, and queue-level retries*. A BullMQ worker *invokes* a graph; the graph does not replace the worker.

---

## 1. Current AI workflow map

```mermaid
flowchart TD
    subgraph Triggers
      HTTP[HTTP routes: /orchestrator, /skills/*, /autopilot, /applications]
      SCHED[scheduler.ts setInterval + Redis lock]
      BMQ[BullMQ queues: apply-email, apply-batch]
    end

    subgraph Core["AI orchestrator (src/lib/ai/orchestrator)"]
      RR[resume_review]
      JM[job_match]
      AP[apply_pack]
    end

    subgraph Agents["Agents (Zod-validated)"]
      RP[ResumeParser · Haiku]
      JP[JobParser · Haiku]
      MS[MatchScorer · Haiku · deterministic rubric]
      RT[ResumeTailor · Sonnet]
      CL[CoverLetter · Sonnet]
      TG[TruthGuard · Sonnet · PASS/FAIL + 1 retry]
    end

    HTTP --> Core
    SCHED --> W[Workers: auto-apply, job-matcher, alert-sender,\nbilling-reconciliation, semantic-indexer, blog-automation, ...]
    BMQ --> EW[apply-email-worker / apply-batch-worker]
    Core --> Agents
    AP --> SM[Apply state machine\nNOT_SUBMITTED→DRAFTING→AWAITING_USER_CONFIRMATION→SUBMITTING→SUBMITTED/FAILED]
    SM --> Tracks[Track A direct · B SES email · C ATS redirect · D assisted clickout]
    Core --> PERS[(AiRun / AiRunJob)]
    W --> TRUST[Trust scoring] & RAG[(SemanticDocument · Float[])] & BILL[Billing entitlements]
    EW --> SES[AWS SES]
```

**Three orchestrator modes** (`runOrchestrator` in `src/lib/ai/orchestrator/index.ts`):
- `resume_review` → ResumeParser, early return.
- `job_match` → ResumeParser + JobParser×N + MatchScorer.
- `apply_pack` → parse + score → **gate** (score ≥ 55 AND must-have ≥ 60%) → ResumeTailor → CoverLetter → TruthGuard (1 controlled retry on FAIL).

**Cross-cutting facts (verified in code):**
- **Token budget:** `Budget` class, default 60,000 tokens, `assertAvailable()` throws `BudgetExceededError`; pipeline degrades to `status="partial"`.
- **MOCK_AI=1:** short-circuits all Claude calls with deterministic fixtures (guard verdict `PASS`).
- **Output caps:** `truncateOutput()` clips fields (`MAX_CL_BODY=3000`, `MAX_BULLET=600`, etc.).
- **Persistence:** `AiRun` (`runId` unique, `status ∈ {RUNNING,COMPLETE,PARTIAL,BLOCKED}`, `agentCalls Json?`, `notes String[]`, `tokenBudgetTotal/Used`) + `AiRunJob`. Non-fatal on failure.
- **Apply state machine** (`src/lib/apply/state-machine.ts`): exact ack strings `"I have reviewed the cover letter"` + `"I confirm the apply target"` enforced via `validateAcknowledgements()` + `gateSubmit()` at the `/applications/:id/submit` route.
- **Idempotency today:** BullMQ stable jobId `apply-email-${applicationId}`; `BillingWebhookIdempotencyKey` table; apply-batch `(jobId, candidateId)` uniqueness. **Gaps below.**

---

## 2. Agents & skills inventory

| Agent (orchestrator) | Model | Tokens | Output schema | Safety rule |
|---|---|---|---|---|
| ResumeParser | Haiku | 2048 | `ResumeSchema` | extract-only, no inference |
| JobParser | Haiku | 2048 | `JobSchema` | separate must/nice-have |
| MatchScorer | Haiku | 1024 | `MatchSchema` | **deterministic rubric** (skill .50 / seniority .20 / loc-auth .20 / other .10) |
| ResumeTailor | Sonnet | 4096 | `TailoredResumeSchema` | no fabrication, `[X%]` placeholders |
| CoverLetter | Sonnet | 2048 | `CoverLetterPackSchema` | 200–300 words, resume facts only |
| TruthGuard | Sonnet | 2048 | `GuardReportSchema` | PASS/FAIL, FAIL if any high-sev or ≥2 med |

**Standalone skills** (`src/lib/ai/skills/*`, all with `MOCK_AI`/`AI_DISABLED` guards + template fallbacks): resume-builder, ats-scanner, job-matcher, career-advisor, career-gap-explainer, interview-question-generator, interview-answer-evaluator, salary-negotiator, resume-translator, template-filler, job-field-classifier, application-writer, resume-structure. Routes under `src/routes/skills/*`.

**Deterministic quality layer:** `quality-rubric.ts` (`gradeAiOutput`) — model-free PASS/WARN/FAIL on banned phrases, placeholder leakage, length, filler density, quantified achievements. **This is a strong asset; the registry will make it mandatory post-generation.**

**Workers** (`scheduler.ts`, Redis lock + `withRetry(3)` + dead-letter + ops events): aggregator-cron, job-matcher, alert-sender, auto-apply, job-cleanup, job-stale-check, apply-clickout-nudge, apply-stuck-monitor, billing-reconciliation, candidate-retention, semantic-indexer, skills-job-embedder, blog-automation, operational-snapshot. BullMQ: apply-email-worker, apply-batch-worker.

---

## 3. Gaps & risks (prioritized)

| # | Severity | Finding | Impact |
|---|---|---|---|
| G1 | **High** | **No durable, resumable workflow state.** `apply_pack` runs in-process; a crash between TruthGuard PASS and human approval loses progress. Human-in-the-loop "pause" is implemented by *ending the request* and re-deriving state from DB at `/submit`. | No true resume-after-approval; fragile long-running flows. |
| G2 | **High** | **`SemanticDocument.embedding` is `Float[]`, not native `vector`.** pgvector extension is enabled but cosine similarity is computed in app code (`cosineSimilarity()`), so there is **no ANN index** — search is O(n) full scan. | RAG does not scale; latency grows linearly with corpus. |
| G3 | **High** | **Side-effect idempotency is partial.** SES sends rely on status-guard short-circuits, not a dedicated idempotency-key ledger; replays of a scheduler task or graph node could double-send for non-email side effects (notifications, ATS writes, moderation actions). | Duplicate emails/actions under retry. |
| G4 | Medium | **No unified agent/skill registry.** AI logic is duplicated across orchestrator + 13 skills with per-file model/guard conventions. | Hard to add skills safely; inconsistent budgets/risk policy. |
| G5 | Medium | **Observability is per-subsystem.** Structured logs + ops events exist, but there is no per-run graph trace (node started/completed/failed, model called, approval requested) correlated by a single `graphRunId`. | Hard to debug multi-step AI runs; weak auditability. |
| G6 | Medium | **Autopilot trust gating is implicit.** Subscription + caps are enforced, but explicit trust/risk-tier check before generating packs is not centralized. | Risk that a HIGH-risk candidate gets automation. |
| G7 | Medium | **Truth-guard retry budget not centrally accounted.** Retry loop re-runs 3 Sonnet calls; token cost of retries is included in budget but not surfaced as a distinct metric. | Cost spikes invisible. |
| G8 | Low | Skill error fallbacks return templates silently; not always flagged as degraded in the response envelope. | Users may receive non-AI output unknowingly. |
| G9 | Low | `AiRunStatus` has no `INTERRUPTED`/`AWAITING_APPROVAL` state. | Cannot model paused graphs in existing table. |

---

## 4. Proposed LangGraph architecture

### 4.1 Responsibility boundary (non-negotiable)

| Concern | Owner |
|---|---|
| Scheduling, cron, background dispatch, distributed locks, queue retries, DLQ | **BullMQ** (unchanged) |
| AI workflow state, agent/tool sequencing, conditional routing, in-graph retries, human-in-the-loop pause/resume, graph persistence, per-run audit | **LangGraph** |
| Final HTTP approval gate + acknowledgements + apply state machine transitions | **Existing route layer** (LangGraph integrates with it, does not bypass) |
| Deterministic scoring, trust scoring, caps, entitlements | **Existing libs** (LangGraph calls them as tools; never re-implements) |

```mermaid
flowchart LR
    subgraph BullMQ["BullMQ (execution)"]
      WK[Worker / cron / queue job]
    end
    subgraph LG["LangGraph (orchestration)"]
      G[Graph: nodes + conditional edges]
      CP[(Postgres checkpointer)]
      INT{{interrupt: human approval}}
    end
    subgraph Tools["Tools = thin adapters over existing libs"]
      PRT[prismaTools] RGT[ragTools] BLT[billingTools]
      NOT[notificationTools] APT[applyTools] TRT[trustTools]
    end
    WK -->|invoke graphRegistry.run| G
    HTTP2[HTTP route] -->|invoke / resume| G
    G <--> CP
    G --> INT
    INT -->|paused| HTTP2
    HTTP2 -->|approval + acks| G
    G --> Tools
    G --> EVT[GraphRunEvent audit + Sentry + ops events]
```

### 4.2 Graphs (13)

resumeReview, jobMatch, applyPack, candidateAutopilot, employerVerification, candidateVerification, jobIngestionQuality, interviewPrep, followUp, blogAutomation, trustModeration, billingRecovery. Each graph = explicit nodes + conditional edges + Zod state. Sensitive graphs use **`interrupt()`** for human approval; resume via deterministic thread ID.

**Deterministic thread IDs** (checkpointer keys):
- `user:{userId}:resume-review:{resumeId}`
- `candidate:{candidateId}:job-match:{jobId}`
- `application:{applicationId}:apply-pack`
- `employer:{employerId}:verification`
- `blog:{resourceId}:automation`

### 4.3 Graph state schema (Zod, shared base)

Every graph extends `BaseGraphState`: `graphRunId, workflowType, userId?, candidateId?, employerId?, jobId?, applicationId?, currentStep, status (RUNNING|INTERRUPTED|COMPLETE|PARTIAL|BLOCKED|FAILED), inputRefs, outputRefs, riskFlags[], humanApprovalRequired, approvalState (NONE|REQUESTED|GRANTED|DENIED), tokenUsage, costEstimate, retryCount, errors[], auditEvents[], createdAt, updatedAt`. Reducers append-merge `auditEvents`/`errors`/`riskFlags`; scalar fields last-write-wins.

### 4.4 Registries & policies

- **`skillRegistry`** — one entry per skill/agent: name, description, modelPolicy, inputSchema, outputSchema, tokenBudget, allowedTools, riskLevel, humanApprovalRequired, routes[], graphs[], testCoverage. Single source of truth; eliminates G4.
- **`graphRegistry`** — name → compiled graph + thread-ID builder + entry-point metadata.
- **`modelPolicy`** — `Haiku` for extraction/classification/parsing/light scoring; `Sonnet` for generation/tailoring/cover letters/truth/trust reasoning. Model strings via env (`AI_MODEL_FAST`, `AI_MODEL_QUAL`) with current defaults; per-graph token/cost ceiling; `MOCK_AI=1` honored at the model-call boundary so **all graphs are deterministic in CI**.
- **`toolPolicy`** — which graphs may call which tools (least privilege).
- **`humanApprovalPolicy`** — enumerates the actions that MUST interrupt (send application, send employer email, overwrite profile, publish blog, approve high-risk employer, verify sensitive docs, resolve high-risk trust event, manual billing change).
- **`quotaPolicy` / `riskPolicy`** — wrap existing entitlements + trust libs as pre-flight guards.

### 4.5 Scoring discipline (anti-inflation)

All scores keep **deterministic components + explainable breakdown + thresholds + audit trail + tests**. LLMs never emit a bare score: they emit *evidence*; a deterministic rubric computes the number (the MatchScorer pattern, generalized). Covers: candidate verification, employer verification, job quality, application readiness, profile completeness, match confidence, fraud/risk, source reliability.

---

## 5. Proposed folder / file changes

**New (additive, no deletions):**
```
backend/src/lib/ai/langgraph/
  graphs/        resumeReview.graph.ts jobMatch.graph.ts applyPack.graph.ts
                 candidateAutopilot.graph.ts employerVerification.graph.ts
                 candidateVerification.graph.ts jobIngestionQuality.graph.ts
                 interviewPrep.graph.ts followUp.graph.ts blogAutomation.graph.ts
                 trustModeration.graph.ts billingRecovery.graph.ts
  nodes/         resume/ jobs/ matching/ applications/ trust/ billing/ blog/
                 notifications/ humanReview/
  state/         graphState.ts schemas.ts reducers.ts
  memory/        checkpointer.ts longTermStore.ts
  tools/         prismaTools.ts ragTools.ts billingTools.ts notificationTools.ts
                 applyTools.ts trustTools.ts
  policies/      modelPolicy.ts toolPolicy.ts humanApprovalPolicy.ts quotaPolicy.ts riskPolicy.ts
  registry/      skillRegistry.ts graphRegistry.ts
  observability/ graphEvents.ts graphTracing.ts graphMetrics.ts
  index.ts       (feature-flagged entry: LANGGRAPH_ENABLED)
  tests/         fixtures/ mocks/ *.test.ts
```

**Touched (minimal, wrapper-only):** `src/lib/ai/orchestrator/index.ts` (delegate to graph when flag on, else legacy path), relevant workers (`auto-apply`, `blog-automation`, `billing-reconciliation`) gain a feature-flagged `runGraph(...)` call, `/applications/:id/submit` gains an optional `resumeGraph()` hook. **No existing function is deleted; behavior is identical when `LANGGRAPH_ENABLED` is unset.**

---

## 6. Database / persistence changes

1. **LangGraph checkpointer** — `@langchain/langgraph-checkpoint-postgres` (`PostgresSaver`) against the existing `DATABASE_URL`, in a dedicated `langgraph` Postgres schema so it never collides with Prisma-managed tables. Created via a **dedicated SQL migration** (`PostgresSaver.setup()` SQL captured into a Prisma migration for reproducibility). Production = Postgres-backed (never `MemorySaver`); tests may use in-memory.
2. **Business audit models (Prisma):**
   - `GraphRun` — `graphRunId` (unique), workflowType, status (extend `AiRunStatus` with `INTERRUPTED`, `AWAITING_APPROVAL`, `FAILED`), threadId, subject ids, tokenUsage, costEstimate, approvalState, riskFlags, createdAt/updatedAt. Linked optionally to existing `AiRun`.
   - `GraphRunEvent` — append-only event log (graph/node/tool/model/approval/side-effect), correlated by `graphRunId`. Feeds G5.
   - `IdempotencyKey` — generic `(scope, key)` unique ledger for **all** external side effects (SES, ATS writes, notifications, moderation, job publication, blog publish), closing G3. Reuses the `BillingWebhookIdempotencyKey` pattern.
3. **RAG (G2):** add a **native `vector` column** to `SemanticDocument` via `Unsupported("vector(1536)")` + an **HNSW/IVFFlat index**, backfill from existing `Float[]`, switch search to a pgvector `<=>` raw query with the in-app path as a fallback. Keep checksum re-embedding. Sequenced as Phase 6 (dual-write, then cutover) — zero downtime.

All schema changes are **additive**; no destructive migration. Migrations are reviewed in `terraform.yml`/`ci.yml` flow and never auto-applied to prod without approval.

---

## 7. Migration / rollout plan

- **Feature flag** `LANGGRAPH_ENABLED` (default `false`) gates every graph entry point. Per-graph flags (`LANGGRAPH_APPLY_PACK`, etc.) allow incremental canary.
- **Strangler pattern:** orchestrator delegates to a graph only when the flag is on; legacy code stays as the fallback for ≥1 release.
- **Order:** Phase 1 foundation (no behavior change) → wrap the 3 existing modes → human-approval/apply → autopilot → trust/verification → job-quality/RAG → blog → hardening (Section 9).
- **Canary:** enable per-graph in staging (`STAGING_RUNBOOK.md` updated each session), shadow-run against legacy output, compare, then enable in prod behind flag.

## 8. Test plan

- **Unit:** each node pure-function tested with fixtures; reducers; policies; registry integrity (every skill has schemas + budget + risk level).
- **Integration (MOCK_AI=1, deterministic):** full graph runs for resumeReview, jobMatch, applyPack incl. gate stops (score<55, must-have<60%), truth-guard FAIL→retry→stop, interrupt/resume.
- **E2E (Playwright, existing specs preserved):** user approval interrupt/resume, autopilot pack generation (no auto-submit), employer-verification gating, billing entitlement gating, SES approval-before-send, blog admin-approval-before-publish.
- **Regression:** all current vitest + Playwright suites stay green; `MOCK_AI=1` remains the CI default.
- **Security gates unchanged:** Semgrep, Trivy, Gitleaks, npm audit, Checkov.
- **Acceptance criteria per phase** are listed in the per-phase tickets (Section 9).

## 9. Rollback plan

- **Instant:** unset `LANGGRAPH_ENABLED` (or the per-graph flag) → 100% legacy path, no redeploy needed.
- **Code:** every phase is a separate squash-merged PR → `git revert` of one PR cleanly removes a phase.
- **DB:** all migrations additive; rollback = stop using new columns/tables (no data loss). pgvector cutover (Phase 6) keeps `Float[]` until the `vector` path is proven, then the old column is dropped only in a later, separately-approved migration.
- **Checkpointer:** isolated `langgraph` schema can be truncated without touching business data.

---

## 10. Phased delivery (8 phases, each = 1 branch + 1 PR)

| Phase | Deliverable | Behavior change | Acceptance |
|---|---|---|---|
| **1 Foundation** | LangGraph deps, `BaseGraphState`, registries, model/tool/approval policies, observability hooks, checkpointer wiring, `GraphRun`/`GraphRunEvent`/`IdempotencyKey` models | **None** (flag off) | builds, typechecks, new unit tests green, all existing tests green |
| **2 Wrap orchestrator** | resumeReview / jobMatch / applyPack graphs wrapping existing agents | None when flag off; identical output when on | shadow-run parity with legacy in MOCK_AI |
| **3 Human approval + apply** | interrupt/resume, integrate apply state machine, ack enforcement, idempotency ledger for SES/apply | None when flag off | interrupt→resume E2E; no double-send |
| **4 Autopilot safety** | autopilot graph; subscription+trust+caps+quota gates; never auto-submit | None when flag off | autopilot generates packs only; HIGH-risk blocked |
| **5 Trust & verification** | employer + candidate verification + trustModeration graphs; admin interrupts; TOTP-gated actions | None when flag off | risky employer held; CRITICAL suspended; audit logged |
| **6 Job quality + RAG** | jobIngestionQuality graph; native pgvector column + ANN index; explainable matching; source reliability | RAG cutover behind flag | ANN search parity; checksum dedup intact |
| **7 Blog & growth** | blogAutomation + followUp graphs; admin-approval-before-publish preserved; credibility scoring | None when flag off | nothing publishes without AdminReview APPROVED |
| **8 Hardening** | full graph tests, E2E updates, docs, deploy checklist, rollback runbook | — | CI + all security scans green; `STAGING_RUNBOOK.md` updated |

---

## 11. Security, privacy & DevSecOps guardrails (apply to every phase)

- No raw PII (resume text, contact info, documents) in logs, traces, or model-prompt logging without redaction; `inputRefs`/`outputRefs` store **references**, not payloads.
- Least-privilege tool access via `toolPolicy`; admin-sensitive graph actions require existing **TOTP gate**.
- No static AWS keys; **OIDC stays**. Gitleaks / Semgrep / Trivy / npm-audit / Checkov must pass on every PR.
- No direct push to `main`, no prod deploy, no prod secret change, no infra apply, no destructive migration **without explicit human approval** (`CLAUDE.md`). Terraform/Lambda packaging unchanged unless a phase explicitly requires it.
- User consent required before any externally-sent generated content (SES). Autopilot **never** submits an application without user-approved acknowledgements.

---

## 12. Open governance questions (need your decision before code)

1. **Production merge/deploy authority.** `CLAUDE.md` forbids agents from merging to `main` / deploying prod without explicit human approval. I will work branch-based and open PRs; I need your explicit instruction on whether I may merge to `main` and trigger the deploy pipeline, or stop at "PR open + green checks" for your manual merge.
2. **Scope of this session.** This is an 8-phase program. Confirm I should implement **Phase 1 only** now (foundation, zero behavior change), then return for review before Phase 2.
3. **PR strategy.** One PR per phase (recommended, reviewable) vs. a single large PR.
```
