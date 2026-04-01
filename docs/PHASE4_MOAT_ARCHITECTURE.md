# Phase 4 Moat Architecture

## Goals

Phase 4 introduces defensible platform capabilities while preserving core hiring flow stability.

Primary goals:

- Strengthen network effects for candidates and employers.
- Improve outcome quality with human-in-the-loop AI workflows.
- Extend supply-side pipelines through university partnerships.
- Expand engagement via bot channels without fragmenting trust.

Guardrails:

- Privacy by default and explicit opt-in for social/discovery surfaces.
- Feature flags default-off in production.
- Human approval before any employer-facing AI output is published.
- No changes to critical core routes (`/api/auth`, `/api/jobs`, `/api/applications`) that would break existing flows.

## Implemented System Design

## 1) Social Features (MVP)

### Architecture

- New data models:
  - `SocialProfile`
  - `SocialConnection`
- New API route group:
  - `/api/social/*`
- Feature flag:
  - `PHASE4_SOCIAL_ENABLED`

### MVP Scope

- Candidate/employer social profile (opt-in discoverability).
- Connection requests (request/accept/decline/block).
- Connection listing and directionality.

### Deferred

- Feed/timeline system.
- Public endorsements/recommendations.
- Algorithmic growth loops and invites.

## 2) AI Salary Negotiation Assistant (MVP)

### Architecture

- New data model:
  - `SalaryNegotiationSession`
- New API route group:
  - `/api/salary-negotiation/*`
- Feature flag:
  - `PHASE4_SALARY_NEGOTIATION_ENABLED`
- Context sources:
  - `SalaryReport` aggregates
  - User billing profile region/currency context

### MVP Scope

- Create negotiation sessions with region-aware compensation context where available.
- Generate anchor ask / walk-away recommendations.
- Persist strategy summary, talking points, and risk flags.

### Deferred

- Full LLM conversational coach.
- Live offer parsing from uploaded contracts.
- Cross-border net/tax optimization engine.

## 3) University Partnership API (MVP)

### Architecture

- New data models:
  - `UniversityPartner`
  - `UniversityPartnerRecord`
- New API route group:
  - `/api/university-partners/*`
- Feature flag:
  - `PHASE4_UNIVERSITY_API_ENABLED`
- Auth model:
  - API key hashing at rest (`apiKeyHash`) and partner-key header auth

### MVP Scope

- Partner onboarding (admin-controlled).
- Ingestion endpoints for:
  - internships
  - graduate pipelines
  - skills verifications
- Partner ingestion log retrieval.

### Deferred

- Outbound webhook/event streaming to universities.
- Fine-grained field-level schema versioning per partner.
- Automated transcript/credential trust graph.

## 4) Employer-Side AI Tools (MVP)

### Architecture

- New data model:
  - `EmployerAiTask`
- New API route group:
  - `/api/employer/ai/*`
- Feature flag:
  - `PHASE4_EMPLOYER_AI_ENABLED`
- Human-review state machine:
  - `GENERATED` -> `APPROVED` / `REJECTED`

### MVP Scope

- Job description draft generation.
- Candidate ranking drafts for a job application set.
- Explicit human review endpoint before usage.

### Deferred

- One-click publish automation from approved AI outputs.
- Interview question generation and scheduling assistant.
- Bias/fairness constrained ranking optimizer.

## 5) WhatsApp/Telegram Bot Integration (MVP)

### Architecture

- New data model:
  - `BotSubscription`
- New API route group:
  - `/api/bots/*`
- Feature flag:
  - `PHASE4_BOTS_ENABLED`
- Verification/security:
  - one-time verification code flow
  - webhook secret validation (`BOT_WEBHOOK_SECRET`)

### MVP Scope

- Create/list/verify bot subscriptions.
- Per-subscription notification preference controls.
- Test-alert workflow.
- Inbound webhook ingestion for:
  - job matches
  - reminders
  - application status updates
  - subscription notices

### Deferred

- Bi-directional conversational bot with NL command intents.
- Rich media and document workflows.
- Automatic fallback delivery strategy (push/email/bot arbitration).

## API Contracts (Implemented)

## Social

- `GET /api/social/profile`
- `PUT /api/social/profile`
- `GET /api/social/connections?status=PENDING|ACCEPTED|DECLINED|BLOCKED`
- `POST /api/social/connections/request`
- `POST /api/social/connections/:id/respond`

## Salary Negotiation

- `GET /api/salary-negotiation/sessions`
- `GET /api/salary-negotiation/sessions/:id`
- `POST /api/salary-negotiation/sessions`

## University Partner API

Admin:

- `POST /api/university-partners/admin/partners`
- `GET /api/university-partners/admin/partners`

Partner-authenticated:

- `GET /api/university-partners/ingest`
- `POST /api/university-partners/ingest/internships`
- `POST /api/university-partners/ingest/graduates`
- `POST /api/university-partners/ingest/skills-verifications`

## Employer AI

- `GET /api/employer/ai/tasks`
- `POST /api/employer/ai/job-description-drafts`
- `POST /api/employer/ai/candidate-ranking-drafts`
- `POST /api/employer/ai/tasks/:id/review`

## Bots

- `GET /api/bots/subscriptions`
- `POST /api/bots/subscriptions`
- `POST /api/bots/subscriptions/:id/verify`
- `PATCH /api/bots/subscriptions/:id/preferences`
- `POST /api/bots/subscriptions/:id/test-alert`
- `POST /api/bots/webhooks/:channel`

## Rollout Dependencies

## Foundational Dependencies

1. Database migration for new models and enums.
2. Feature-flag controls configured per environment.
3. Rate-limit settings aligned with abuse risk profile.

## Cross-Feature Dependencies

- Employer AI candidate ranking depends on application + candidate profile data quality.
- Salary negotiation quality depends on sufficient salary report density.
- Bot usefulness depends on existing notification event quality and taxonomy.
- University pipeline usefulness depends on partner onboarding quality and payload consistency.

## Environment & Ops Dependencies

- `BOT_WEBHOOK_SECRET` must be configured before enabling bot webhooks.
- University partner API keys must be provisioned through admin endpoint and rotated operationally.
- Monitoring/alerts should be added for all Phase 4 route groups before gradual enablement.

## Compliance, Safety, and Abuse-Risk Notes

## Privacy and Trust Controls

- Social discoverability is opt-in.
- No raw secrets stored for partner keys or bot verification codes (hashes only).
- Human review required for employer AI outputs before adoption.
- Salary negotiation output is advisory, not legal/financial advice.

## Abuse Risks

- Social spam and unsolicited outreach.
- Partner API payload abuse or fake verification events.
- Prompt abuse and over-reliance on AI ranking outputs.
- Bot endpoint spoofing and webhook replay attempts.

## Mitigations

- Route-level rate limits on social/AI/bot actions.
- Strict RBAC and scoped ownership checks.
- Feature-flagged rollout and kill-switch capability.
- Input validation with bounded payload schemas.
- Human-in-the-loop approval for employer AI artifacts.

## Incremental Rollout Plan (Recommended)

1. Deploy migrations and routes with all Phase 4 flags OFF.
2. Enable `PHASE4_EMPLOYER_AI_ENABLED` for internal employer cohort only.
3. Enable `PHASE4_SALARY_NEGOTIATION_ENABLED` for candidate beta cohort.
4. Onboard first 1-2 university partners with synthetic/test payloads.
5. Enable social opt-in for a controlled candidate slice.
6. Enable bot subscriptions and test-alert flow before production webhook traffic.

## Post-Deploy Verification Checklist

- Confirm all Phase 4 endpoints return `503 FEATURE_DISABLED` when flags are off.
- Enable one feature flag at a time and run endpoint smoke tests.
- Verify no regressions on core auth/jobs/application endpoints.
- Verify data isolation and ownership checks for each route group.
- Verify log/error rates and p95 latencies stay within service budgets.
