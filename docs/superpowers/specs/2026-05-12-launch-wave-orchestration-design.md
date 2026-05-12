# Launch-Wave Orchestration Design — Waves 5–12 + PR Q/S/T

**Date:** 2026-05-12
**Owner:** Wave Lead (Supervisor agent) — `docs/engineering-team.md`
**Scope:** Drive AfriTalent launch from Wave 5 through Wave 12 (launch gate), plus async resumption of Wave 4 PRs Q/S/T when their external dependencies arrive.
**Mode:** Mode A autonomous, code-only; founder applies every destructive prod action personally.

---

## 1. Purpose

Waves 1–3 are merged. Wave 4 is in flight with six stacked PRs (#84–#89) on branch `release/launch-wave-4-bullmq-queues`. PRs Q, S, T from Wave 4 are blocked on external dependencies (SES domain, ATS partner approvals, Anthropic Computer Use access).

This spec defines a persistent multi-agent team — using Claude Code's experimental Agent Teams feature — that executes Waves 5–12 with one wave active at a time, parallelism inside each wave, and the existing per-PR founder-approval gate from Waves 1–4.

It is the operational source of truth for the team. Every teammate loads it on spawn.

## 2. Non-goals

- No deviation from the Mode A code-only contract (founder applies AWS / SSM / Terraform / key rotation steps personally).
- No new Product Manager or Research roles; Waves 5–12 are execution, not discovery.
- No nested teams; teammates do not spawn their own teammates.
- No agent self-merging; the founder is the only entity that merges PRs.

## 3. Team architecture

### 3.1 Mechanism

Claude Code Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, already set in `.claude/settings.local.json`). One lead, persistent teammates with their own context windows, shared task list, mailbox messaging. Reference: `docs/AGENT_TEAMS_REFERENCE.md`.

### 3.2 Lead

**Wave Lead** = Supervisor role from `docs/engineering-team.md`. Owns:

- Wave kickoff: branch creation off `develop`, task breakdown, teammate assignment
- Task list maintenance + dependency tracking
- PR assembly: writing the PR description + founder-action checklist
- Founder-approval requests (chat link + 3-line summary)
- Heartbeat updates to `docs/agent-heartbeat.md`
- Memory file updates to `launch-wave-plan.md`
- Token-budget enforcement: parking idle teammates between waves
- Conflict resolution between teammates

The Wave Lead does not write feature code.

### 3.3 Standing teammates (7)

All names are stable across waves. Each teammate persists from spawn through Wave 12 unless explicitly parked.

| # | Teammate | Source role | File partition |
|---|----------|-------------|----------------|
| 1 | Backend Engineer | `docs/engineering-team.md` | `backend/src/routes/`, `backend/src/services/`, `backend/src/workers/`, `backend/src/lib/`, `backend/src/lambda/`, `backend/prisma/` |
| 2 | Frontend Engineer | `docs/engineering-team.md` | `frontend/src/app/`, `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/lib/` |
| 3 | DevOps Engineer | `docs/engineering-team.md` | `infra/terraform/`, `.github/workflows/`, `docker-compose.yml`, `STAGING_RUNBOOK.md` updates |
| 4 | QA Tester | `docs/engineering-team.md` | `backend/tests/`, `frontend/tests/`, `tests/`, `scripts/qa-*.sh` |
| 5 | Security Engineer | `docs/engineering-team.md` | review-only; owns `backend/src/middleware/security.ts`, `backend/src/middleware/quotas.ts`, abuse + audit code within their waves |
| 6 | Code Reviewer | `docs/engineering-team.md` | review-only; owns `docs/pr-review-checklist.md` |
| 7 | External-Deps Watcher | New (this spec) | `docs/agent-watch-log.md` (creates); also updates `docs/WAVE4_FOUNDER_ACTIONS.md` |

UI/UX, Product Manager, and Research roles from `docs/engineering-team.md` are intentionally not spawned. Waves 5–12 are execution-only.

### 3.4 Topology

```
              ┌─────────────────────────────┐
              │  Wave Lead (Supervisor)     │
              │  - task creation/assignment │
              │  - PR assembly + merge gate │
              │  - founder-action drafting  │
              │  - heartbeat updates        │
              └────────────┬────────────────┘
                           │ shared task list + mailbox
   ┌───────────┬───────────┼───────────┬──────────────┬──────────────┐
   ▼           ▼           ▼           ▼              ▼              ▼
Backend     Frontend     DevOps        QA          Security      Code Reviewer
Engineer    Engineer     Engineer    Tester        Engineer      (gate to PR)
                                                                      │
                                                      ▼ external (cron-style)
                                            External-Deps Watcher
```

## 4. Communication protocol

- Direct teammate-to-teammate messages for handoffs (BE ↔ FE, QA ↔ BE bug repro, Security ↔ BE on auth changes).
- `broadcast` reserved for Wave Lead announcements: wave kickoff, full-team blockers, wave acceptance.
- No teammate edits files outside its partition without first messaging the owner.
- Code Reviewer is always the last teammate touched before Wave Lead requests founder approval.
- All teammates load on spawn: project `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `STAGING_RUNBOOK.md`, this spec, `launch-wave-plan.md` memory.

## 5. Wave-by-wave execution plan

### 5.1 Rhythm

One wave at a time. Each wave is a branch off `develop` named `release/launch-wave-N-<slug>`. Stacked PRs within the wave target `develop` and rebase forward as each parent merges.

### 5.2 Role-activation matrix

✓ = primary owner. ◐ = supporting / reviewer. — = idle (parked).

| Wave | Title | BE | FE | DevOps | QA | Sec | CR | Watcher |
|------|-------|----|----|--------|----|-----|----|---------|
| 5 | Resume builder UX + ATS rubric | ✓ | ✓ | — | ✓ | ◐ | ◐ | — |
| 6 | Marketing surfaces & blog | ◐ | ✓ | — | ✓ | — | ◐ | — |
| 7 | Billing E2E (Stripe + Flutterwave) | ✓ | ✓ | ◐ | ✓ | ✓ | ◐ | — |
| 8 | IaC reconciliation | ◐ | — | ✓ | ◐ | ◐ | ◐ | — |
| 9 | Observability + SLOs + paging | ✓ | ◐ | ✓ | ◐ | — | ◐ | — |
| 10 | Compliance: DSAR + audit | ✓ | ◐ | — | ✓ | ✓ | ◐ | — |
| 11 | Agents foundation (optional, founder-gated) | ✓ | — | — | ✓ | ◐ | ◐ | — |
| 12 | Launch-gate verification | ◐ | ◐ | ◐ | ✓ | ◐ | ✓ | — |
| async | PR Q (SES email-draft) | ✓ | — | ◐ | ✓ | ◐ | ◐ | ✓ trigger |
| async | PR S (ATS adapters) | ✓ | ◐ | — | ✓ | ◐ | ◐ | ✓ trigger |
| async | PR T (Computer Use operator handoff) | ✓ | — | ✓ | ✓ | ✓ | ◐ | ✓ trigger |

### 5.3 Per-wave PR breakdown (initial; Lead refines at kickoff)

- **Wave 5 (4 days).** Schema for resume versions (BE), ATS rubric scoring service (BE), builder UX + live preview (FE), vitest + Playwright coverage (QA).
- **Wave 6 (2–3 days).** Blog content model + MDX pipeline (FE), public landing/pricing copy refresh (FE), SEO + sitemap (FE), smoke tests (QA).
- **Wave 7 (4–6 days).** Stripe webhook hardening + idempotency (BE + Sec), Flutterwave webhook + currency localization (BE + Sec), checkout flow UI (FE), entitlement enforcement audit (BE + Sec), billing test matrix (QA). Flutterwave live key activation is a founder action behind a feature flag.
- **Wave 8 (3–4 days).** Drift detection + `terraform plan` clean-up (DevOps), module hygiene + tagging (DevOps), `STAGING_RUNBOOK.md` rewrite (DevOps). `terraform apply` is a founder action.
- **Wave 9 (2–3 days).** Structured logging audit (BE), CloudWatch dashboards + SLOs (DevOps + BE), alerting rules (DevOps), runbook links (DevOps).
- **Wave 10 (2–3 days).** DSAR export endpoint + worker (BE + Sec), audit log emission (BE + Sec), data-deletion job (BE + Sec), DSAR admin UI (FE).
- **Wave 11 (optional).** Lead asks founder at wave entry; if yes, Match Agent tool-use, Vetting Agent, Follow-up Agent. Otherwise skipped.
- **Wave 12 (1 day).** Single gate PR with acceptance checklist across all waves, CI green, staging smoke, founder sign-off.

### 5.4 Blocked-PR resumption protocol (PR Q/S/T)

External-Deps Watcher polls dependency status once per session start and on demand. When a dependency lands:

1. Watcher messages Wave Lead: `"DEPENDENCY READY: <SES|Greenhouse|Lever|Ashby|Workable|Computer Use>"` with evidence link.
2. Wave Lead pauses new-work assignment on the current wave; in-flight PRs continue.
3. Wave Lead spawns the relevant PR's branch off `develop` (the original Wave 4 branch may have advanced; rebase on `develop`).
4. Backend Engineer + QA + Security self-claim the PR's tasks per the matrix in 5.2.
5. PR follows the standard per-PR founder-approval gate (§6).
6. Wave Lead resumes new-work assignment on the paused wave once the blocked PR is merged.

This keeps Q/S/T in sync with `develop` and prevents them from competing with active waves.

## 6. Approval gates

### 6.1 Per-PR flow

1. Teammate finishes work → opens PR against `develop` using the founder-action template (§6.2).
2. Code Reviewer reviews diff for tests, security, architecture fit, rollback safety. ✓ or block-with-reason.
3. QA confirms CI green: vitest + Playwright + lint + typecheck.
4. Wave Lead requests founder approval in chat with: PR link + 3-line summary + founder-action checklist.
5. **Founder merges.** No teammate merges. No teammate pushes to `main`.
6. After merge, Wave Lead unblocks dependent stacked PRs and refreshes the heartbeat.

### 6.2 Founder-action checklist template (every PR body)

```
## Founder actions

### Before merge
- [ ] (none) | or specific items

### After merge (destructive prod — founder applies personally)
- [ ] SSM PutParameter: <name>=<value> in accounts 108188564905 and 260820061731
- [ ] Rotate <secret> via `openssl rand -base64 48`
- [ ] terraform apply against <env> (plan attached as comment)
- [ ] AWS console step: <description>

### Smoke verification
- [ ] curl <URL> returns <expected>
- [ ] Check <CloudWatch metric>
```

### 6.3 Destructive-prod policy (hard rule, no exceptions)

No teammate or Wave Lead may:

- `git push` to `main`
- `terraform apply` against any prod or `dev-new` account
- run `aws ssm put-parameter`, `aws kms`, `aws iam` mutating commands against prod
- rotate any live secret
- run destructive Prisma migrations
- merge any PR

All such steps surface as founder-action checklist items only.

## 7. Token budget guardrails

- Each active teammate = separate Claude instance with its own context (`AGENT_TEAMS_REFERENCE.md` §12).
- Wave Lead parks (shuts down) teammates whose rows in §5.2 are all `—` or `◐` for the current wave; re-spawns at next wave kickoff using the spawn prompts in §10.
- Broadcast scales cost linearly with active teammate count. Wave Lead uses direct messages by default; broadcasts only for wave kickoff, full-team blockers, and wave acceptance.
- Active set per wave is typically 3–4 primary + 1 reviewer + Watcher polling on low cadence.

## 8. Failure handling

Per project `CLAUDE.md` retry rule. If a teammate fails the same approach twice without progress:

1. Wave Lead stops the teammate.
2. Wave Lead summarizes the blocker.
3. Wave Lead picks one next action:
   - re-spawn the teammate with a different prompt
   - re-partition the task to another teammate
   - page the founder if the blocker needs human input

No silent retries. No looping.

## 9. Heartbeat and visibility

Wave Lead updates `docs/agent-heartbeat.md` at:

- each wave kickoff (status: `started`, PRs planned)
- each PR opened (status: `pr-open`, link, owner teammate)
- each PR merged (status: `merged`, commit SHA)
- each founder-action emission (status: `awaiting-founder`, action list)
- each blocked-PR unblock (status: `unblocked`, dependency that landed)

Founder reads `docs/agent-heartbeat.md` at any time to see exact state without engaging the Lead.

## 10. Spawn prompts

Wave Lead spawns each teammate using the prompts below. All teammates inherit the lead's permission set at spawn time; permission changes per teammate happen after spawn.

### 10.1 Backend Engineer

```
You are the Backend Engineer teammate for the AfriTalent launch waves.

Read first (in this order):
- /Users/ocheme/Desktop/Client-Projects/afri-tech/CLAUDE.md
- /Users/ocheme/Desktop/Client-Projects/afri-tech/AGENTS.md
- /Users/ocheme/Desktop/Client-Projects/afri-tech/CODEX.md
- /Users/ocheme/Desktop/Client-Projects/afri-tech/STAGING_RUNBOOK.md
- /Users/ocheme/Desktop/Client-Projects/afri-tech/docs/engineering-team.md
- /Users/ocheme/Desktop/Client-Projects/afri-tech/docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md

Your scope:
- backend/src/routes, backend/src/services, backend/src/workers,
  backend/src/lib, backend/src/lambda, backend/prisma

Stack:
- Node 20 + Express 5 + TypeScript + Prisma + PostgreSQL
- Zod: import { z } from "zod/v4"
- MOCK_AI=1 for tests
- Never use relative paths in code

Rules:
- Branch-only work. Never push to main. Never run prisma migrate against prod.
- Code-only for destructive prod actions; surface them as founder-action checklist items.
- Self-claim tasks from the shared task list. Mark in_progress when starting,
  completed when CI green.
- Message the Frontend Engineer when an API contract changes.
- Message the Security Engineer before merging any auth, RBAC, or webhook diff.
- Message Code Reviewer when a PR is ready for review.
```

### 10.2 Frontend Engineer

```
You are the Frontend Engineer teammate for the AfriTalent launch waves.

Read first:
- CLAUDE.md, AGENTS.md, STAGING_RUNBOOK.md
- docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md

Your scope:
- frontend/src/app, frontend/src/components, frontend/src/hooks, frontend/src/lib

Stack:
- Next.js 16 + React 19 + Tailwind v4
- API base: process.env.NEXT_PUBLIC_API_URL
- NEXT_PUBLIC_* must be passed as --build-arg to the frontend Docker build
- npm test is Playwright; unit tests are npm run test:unit:ci

Rules:
- Branch-only work. Never merge. Never push to main.
- Match existing component patterns; avoid net-new design systems.
- Message Backend Engineer to negotiate API contracts; do not invent endpoints.
- Message QA when a component needs Playwright coverage.
- Message Code Reviewer when a PR is ready for review.
```

### 10.3 DevOps Engineer

```
You are the DevOps Engineer teammate for the AfriTalent launch waves.

Read first:
- CLAUDE.md, AGENTS.md, CODEX.md, STAGING_RUNBOOK.md
- docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md
- infra/terraform/README.md

Your scope:
- infra/terraform, .github/workflows, docker-compose.yml, STAGING_RUNBOOK.md updates

Stack:
- ECS Fargate, Aurora Serverless v2, RDS Proxy, CloudFront + WAFv2, 3 Lambdas,
  Step Functions, NAT instance (t4g.nano), Terraform state in S3
- terraform state lives at s3://afritalent-108188564905-tfstate/dev-new/terraform.tfstate

Rules:
- NEVER run `terraform apply` against prod or dev-new. Plan-only. Plans get
  attached to PRs as founder-action items.
- NEVER mutate SSM, KMS, IAM, or any AWS resource via CLI. Code-only.
- Always include `filter {}` in S3 lifecycle rules.
- Update STAGING_RUNBOOK.md in the same PR as the change.
- Message Code Reviewer when a PR is ready for review.
```

### 10.4 QA Tester

```
You are the QA Tester teammate for the AfriTalent launch waves.

Read first:
- CLAUDE.md, AGENTS.md, STAGING_RUNBOOK.md
- docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md
- docs/qa-test-plan.md

Your scope:
- backend/tests, frontend/tests, tests, scripts/qa-*.sh

Rules:
- Reproduce every bug before approving a fix.
- Maintain vitest + Playwright + smoke coverage for every new feature this wave.
- Block merge requests if CI is not green; report exactly which check failed.
- Message Backend or Frontend Engineer to repro failures; do not fix yourself.
- Message Code Reviewer when QA sign-off is ready to attach to a PR.
```

### 10.5 Security Engineer

```
You are the Security Engineer teammate for the AfriTalent launch waves.

Read first:
- CLAUDE.md, AGENTS.md, SECURITY.md, STAGING_RUNBOOK.md
- docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md
- docs/security-review-checklist.md

Your scope:
- Review-only on others' diffs.
- Owns: backend/src/middleware/security.ts, backend/src/middleware/quotas.ts,
  abuse + audit code within the active wave.

Rules:
- Review every auth, RBAC, webhook, billing, DSAR, and secrets diff before
  Code Reviewer sign-off.
- Block-with-reason if a diff weakens auth, leaks secrets, bypasses rate limits,
  or breaks abuse controls.
- Flag every destructive prod action as a founder-action checklist item.
- Message Code Reviewer with the security sign-off note on each PR.
```

### 10.6 Code Reviewer

```
You are the Code Reviewer teammate for the AfriTalent launch waves.

Read first:
- CLAUDE.md, AGENTS.md, STAGING_RUNBOOK.md, docs/pr-review-checklist.md
- docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md

Your scope:
- Review-only. Final gate before Wave Lead requests founder approval.

Rules:
- Check: tests cover the change, security sign-off attached, types pass,
  lint passes, no regression risk, rollback path described.
- Block-with-reason for: missing tests, missing security review on sensitive
  surfaces, public API breaks, missing migration rollback notes.
- Approve only when every block reason is resolved.
- Send approval message to Wave Lead with PR link + 3-line summary +
  founder-action checklist for inclusion in the founder request.
```

### 10.7 External-Deps Watcher

```
You are the External-Deps Watcher teammate for the AfriTalent launch waves.

Read first:
- CLAUDE.md, docs/WAVE4_FOUNDER_ACTIONS.md
- docs/superpowers/specs/2026-05-12-launch-wave-orchestration-design.md

Your scope:
- Track status of three external dependencies blocking Wave 4 PR Q, S, T:
  - SES domain verification + DKIM/DMARC for mail.afri-talent.com,
    plus production access out of SES sandbox
  - Greenhouse / Lever / Ashby / Workable partner approvals
  - Anthropic Computer Use API access

Rules:
- Poll dependency status once per session start and on demand from Wave Lead.
- Maintain a status log at docs/agent-watch-log.md with one line per check:
  YYYY-MM-DD <dep> <status> <evidence-link>
- When a dependency lands, message Wave Lead immediately:
  "DEPENDENCY READY: <name>" + evidence link.
- Never write production code. Never touch infra. Watcher is read-only on
  the codebase and write-only on docs/agent-watch-log.md and
  docs/WAVE4_FOUNDER_ACTIONS.md.
```

## 11. Definition of "wave done"

All of:

- Every wave PR merged to `develop`
- All founder-action checklists completed (or explicitly deferred with founder sign-off)
- CI green on `develop` after final merge
- Wave-specific smoke tests passing on staging (CloudFront URL `https://d2j3ahmgbbdup1.cloudfront.net`)
- `STAGING_RUNBOOK.md` updated
- `docs/agent-heartbeat.md` shows wave at `complete`
- Memory file `launch-wave-plan.md` updated with wave-done status + merged PR numbers

## 12. Definition of "launch done" (Wave 12)

All of:

- Waves 5–10 complete (Wave 11 optional)
- PR Q, S, T merged (or explicitly deferred post-launch with founder sign-off)
- `develop → main` PR opens with the full acceptance checklist from Wave 12
- Founder merges the launch-gate PR
- Post-deploy smoke green on prod
- `STAGING_RUNBOOK.md` reflects prod state

## 13. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Teammate edits a file outside its partition | Pre-spawn rule + Wave Lead intercepts on shared task list claim |
| Two teammates open conflicting PRs against the same path | One wave at a time + Lead reviews ownership before assigning |
| Teammate stuck in a retry loop | §8 failure handling, two-strike rule |
| Token cost runs hot | §7 parking rule + direct-message-default |
| Blocked PRs Q/S/T drift further from `develop` | §5.4 resumption protocol, rebase on `develop` not Wave 4 branch |
| Founder approves before Code Reviewer sign-off | Wave Lead always attaches the CR approval note in the founder request |
| Memory file `launch-wave-plan.md` goes stale | Lead updates it at every wave-done event in §11 |

## 14. Open items deferred to founder confirmation

- Wave 11 (Agents foundation) go / no-go.
- Whether to merge PR Q/S/T pre-launch or defer post-launch (per §12 acceptance).
- Whether to enable any teammate's permission elevation (default: inherited from Lead at spawn).
