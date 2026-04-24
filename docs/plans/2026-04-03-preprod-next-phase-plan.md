# AfriTalent Pre-Prod Next Phase Plan

Date: April 3, 2026

Update after same-day implementation:

- Redis, backend `FRONTEND_URL`, and the dead frontend App Runner service cleanup are complete
- the frontend live service is imported into Terraform state
- a first semantic retrieval foundation now exists in backend code
- the remaining hard blockers are Stripe secret population, full Terraform reconciliation under the right AWS role, and deploying/indexing the new semantic layer

## Goal

Move AfriTalent from "working staging deployment" to "credible pre-prod candidate and employer test environment" while laying the foundation for a long-term moat.

## Phase 1: Stabilize Shared Staging

### Objective

Turn staging from operationally usable into operationally trustworthy.

### Must finish

- set `STRIPE_SECRET_KEY` and validate checkout, webhook, entitlement, and downgrade flows
- remove stale Railway references from ops docs and environment docs
- complete one clean full-stack Terraform apply from the intended GitHub OIDC path

### Exit criteria

- backend `/health` and `/api/health` return fully healthy, not degraded
- frontend and backend App Runner services are both `RUNNING`
- Terraform plan is understandable and intentionally small
- billing smoke tests pass

## Phase 2: Build The Talent Quality Moat

### Objective

Make candidate-to-job matching materially better than generic boards.

### Must build

- `pgvector` or another production vector store for jobs, candidates, resumes, and recruiter queries
- embedding generation pipeline for jobs, resumes, candidate profiles, employer briefs, and recruiter search prompts
- hybrid search that combines filters, trust score, recency, and semantic similarity
- explainable ranking output so recruiters know why a candidate surfaced
- recruiter search saved views and alerts based on semantic filters, not only keywords

### Exit criteria

- recruiters can search beyond exact keyword matching
- candidate recommendations clearly outperform simple filter-based search in internal review
- every match result can explain its evidence

## Phase 3: Add High-Value Background Agents

### Objective

Use the existing scheduler foundation to create defensible, always-on intelligence jobs.

### Highest-priority agents

- `job-discovery-agent`
  - expands sourcing beyond static feeds, scores source freshness, deduplicates, and enriches employer trust context
- `match-ranking-agent`
  - recalculates candidate-job fit as new profile, trust, skill, and market data arrives
- `application-pack-agent`
  - produces tailored resume, cover note, and application strategy bundles per job
- `recruiter-copilot-agent`
  - drafts shortlist summaries, outreach copy, interview scorecards, and candidate comparison narratives
- `trust-risk-agent`
  - continuously re-scores employer and candidate trust, flags fraud patterns, and opens trust cases automatically
- `mobility-readiness-agent`
  - scores relocation and visa readiness by destination, documentation, and candidate history
- `retention-agent`
  - personalizes re-engagement, weekly digests, learning nudges, and high-fit opportunities

### Phase-2.5 agents worth adding soon after

- `salary-intelligence-agent`
- `market-demand-agent`
- `skills-gap-agent`
- `employer-success-agent`

## Phase 4: Recruiter Workflow Depth

### Objective

Beat legacy boards on quality of hiring workflow, not just number of listings.

### Must build

- recruiter seat permissions and team collaboration
- saved talent pools and campaign-style outreach
- hiring funnel analytics by trust tier, geography, and source
- stronger employer profile credibility and SLA-style response signals
- candidate comparison workspace with AI summaries and risk/trust overlays

## Phase 5: Distribution And Conversion

### Objective

Make the marketplace easier to access and harder to ignore.

### Must build

- WhatsApp-first alerts and recruiter nudges
- stronger candidate profile onboarding with verification and portfolio prompts
- employer onboarding that reaches first shortlist faster
- lifecycle messaging tuned to activation, retention, and employer fill speed

## Recommended Sequencing

1. Stabilize staging infrastructure and billing
2. Add vector-backed retrieval and hybrid ranking
3. Launch recruiter copilot and application-pack intelligence
4. Deepen trust and mobility signals
5. Expand distribution and funnel conversion

## Suggested Ownership Split

- Infra stream
  - Redis, Terraform/App Runner reconciliation, Secrets Manager cleanup, staging hostname decisions
- Search and intelligence stream
  - vectors, embeddings, hybrid ranking, explainability
- Workflow stream
  - recruiter copilot, saved pools, outreach, shortlist intelligence
- Trust and compliance stream
  - employer verification, candidate authenticity, abuse/risk automation
- Growth stream
  - activation, retention, WhatsApp, referral and partner distribution

## What Not To Do Next

- do not add more product surface area without closing staging reliability gaps first
- do not start a production launch path before Redis, billing, and Terraform drift are cleaned up
- do not build RAG as a generic chatbot feature before using vectors for search, ranking, and recruiter workflow

## Immediate Next Actions

- set the missing Stripe secret and run billing UAT
- run the new semantic migration and deploy the backend to staging
- bulk-index published jobs into the semantic document store
- choose and wire a production-grade embedding provider for higher-quality retrieval
- complete a full Terraform apply from GitHub Actions and confirm drift is reduced to intentional changes
