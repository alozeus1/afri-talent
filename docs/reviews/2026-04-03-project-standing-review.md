# AfriTalent Project Standing Review

Date: April 3, 2026

## Executive Summary

AfriTalent is materially stronger than it was in the previous iteration. The staging stack is confirmed on AWS App Runner + ECR + RDS PostgreSQL, both frontend and backend are now running, and the blocked backend rollout was repaired by fixing the broken Prisma migration chain and redeploying the existing App Runner service.

This project is now ready for focused pre-prod QA and stakeholder testing, but not yet ready for broad external testing. The biggest remaining operational gaps are Redis degradation in staging, an empty Stripe secret, stale `FRONTEND_URL` runtime configuration, and Terraform/App Runner state drift around the frontend livefix service.

## Verified Current Standing

- Active non-prod environment: `staging`
- Active deployment path: AWS App Runner + ECR + RDS + Secrets Manager + S3
- Railway status: not part of the active deployment path
- Backend service: `https://ed4nsj3sgv.us-east-1.awsapprunner.com`
- Frontend service: `https://3mwn2b4e5t.us-east-1.awsapprunner.com`
- Backend App Runner status: `RUNNING`
- Frontend App Runner status: `RUNNING`
- Backend `/health`: `200`
- Backend `/api/health`: `200`
- Frontend root: returns `307` to `/en`, which is expected for the current locale redirect behavior

## What Was Fixed In The Last Iteration

From recent git history, the main product and delivery improvements since `905bf53` were:

- ATS expansion and employer integration work
- trust and credibility upgrades across the marketplace
- CI hardening for backend Postgres-backed tests and frontend unit tests
- stronger Lighthouse gating
- expanded trust, abuse, and entitlement test coverage
- production approval gating in the deployment workflow
- ops and production runbook documentation

In this session, the following issues were fixed or improved:

- repaired the staging backend migration blocker by rewriting `20260329003000_add_candidate_authenticity_layer` so it safely bootstraps the missing trust schema instead of assuming those tables already existed
- repaired `20260329020000_add_candidate_retention_lifecycle` so it checks `NotificationType` correctly on PostgreSQL
- validated the entire Prisma migration chain successfully on a clean PostgreSQL instance
- fixed the backend auth API test by extending Prisma mocks for trust profile upserts
- fixed the frontend trust page unit test so it matches the current trust copy and duplicate CTA structure
- hardened quota middleware so it degrades safely when `aiRun` is unavailable in mocked or reduced environments
- updated staging deployment wiring so the repo now points at the recovered frontend live service `afritalent-stg-fe-livefix`
- rebuilt and pushed fresh `linux/amd64` images to the ECR tags App Runner already uses
- completed a successful backend App Runner rollout after clearing the historical failed migration ledger entry during startup

## Deployment Review

### What is live now

- Backend image tag: `1910dfc-live`
- Backend digest: `sha256:157eebefaa3db7ab605176a9dd68a6b0b19e5cf0ee53a102f27db799a9830ed9`
- Frontend image tag: `apprunnerfix-20260326-221310`
- Frontend digest: `sha256:13c51e87e91671834c6bf170a6968684ee325a1147c3cfe433af507f0d2a13b8`

### What is still wrong in staging

- backend health is `degraded`, not `healthy`, because Redis is not available
- there are no ElastiCache caches currently deployed in the AWS account even though `REDIS_URL` exists in Secrets Manager
- `STRIPE_SECRET_KEY` is still empty in `afritalent-staging/app-secrets`
- backend runtime `FRONTEND_URL` still points at `https://staging.afri-talent.com`
- `afritalent-staging-appr-frontend-managed` is dead and remains in `CREATE_FAILED`
- Terraform state does not yet reflect the live frontend recovery service
- local Terraform reconciliation is blocked by an IAM deny on `ec2:DescribeInstances`

## Railway Verification

The active deployment path is not Railway.

Evidence:

- live services are running on AWS App Runner
- images are being deployed from ECR
- the database is Amazon RDS PostgreSQL
- secrets are coming from AWS Secrets Manager

There are still stale references to Railway in a few legacy docs, so the repo should be cleaned up to avoid operator confusion:

- `OPS_README.md`
- `PERFORMANCE.md`
- `ENV_MATRIX.md`

## Vector DB / RAG Review

Update after the April 3 implementation pass:

- the backend now includes a semantic retrieval foundation built on Prisma + PostgreSQL array-backed embeddings
- there is an admin indexing/search surface for semantic documents and job indexing
- job search now includes a lightweight semantic-intent boost on top of the existing structured ranking model

What is still missing from a true production moat:

- no managed vector engine such as `pgvector`, Pinecone, Weaviate, or Qdrant
- no external high-quality embedding provider wired for production
- no background reindexing workflow yet for jobs, candidates, or recruiter query profiles
- no recruiter-facing semantic search UI or candidate graph yet

Practical conclusion:

AfriTalent is no longer starting from zero on semantic retrieval, but it still needs provider-backed embeddings, regular indexing, and recruiter workflow integration before it has a real semantic retrieval moat.

## Background Agents Already Present

AfriTalent is not starting from zero on agentic workflows. The backend scheduler already runs background cycles for:

- aggregator
- job matcher
- alert dispatch
- auto-apply
- job cleanup
- operational snapshot
- billing reconciliation
- candidate retention

That means the product already has a good skeleton for long-running background automation. The next step is to move from operational jobs to differentiated intelligence jobs.

## Competitive Positioning Review

### Where AfriTalent has caught up well

- trust and safety depth is now stronger than a typical generic board because the product has trust profiles, verification artifacts, abuse reporting, trust cases, moderation actions, and employer/candidate authenticity scoring
- ATS direction is stronger than a basic board because the platform now has ATS connections, sync runs, webhook events, and application links rather than just posting + apply
- candidate-side AI support is stronger than many Africa-first boards because AfriTalent already includes AI assistant, resume review, match flows, and apply-pack style orchestration
- employer onboarding and analytics are more modern than a simple classifieds board

### Where AfriTalent is still behind the big players

- no production semantic search / embeddings / talent graph yet
- no verified data moat at LinkedIn scale
- no recruiter seat workflow as mature as LinkedIn Recruiter or enterprise sourcing suites
- no visible mobile-first or WhatsApp-first distribution moat yet, despite having some bot foundations
- no proven external labor-market intelligence layer yet
- no current payments completeness in staging because Stripe is not fully wired
- infra maturity still trails leading marketplaces because staging is running with Redis degraded and frontend state drift

### Competitive read

Jobberman and BrighterMonday continue to look strong on classic recruitment operations: ATS workflows, CV search, skills assessments, and employer recruiting utilities. LinkedIn remains stronger on recruiter workflow and market intelligence. Andela remains stronger on the premium, skills-first talent cloud narrative.

AfriTalent’s chance to win is not by becoming a thinner copy of those products. The winning path is:

1. own Africa-to-global trust, verification, and relocation readiness better than everyone else
2. build a stronger AI-assisted application and recruiter workflow than legacy African job boards
3. add semantic matching and market intelligence so candidate quality feels materially better than generic boards

## Market Comparison Sources

- Jobberman brochure: https://static.jobberman.com/Jobberman_Nigeria_Product_Brochure_2025.pdf
- Jobberman about page: https://www.jobberman.com/about
- BrighterMonday employer help center: https://help-center.brightermonday.co.ug/portal/en/home
- BrighterMonday Kenya brochure: https://static.brightermonday.co.ke/BrighterMonday_Kenya_Product_Brochure_2025.pdf
- LinkedIn Talent Insights: https://business.linkedin.com/hire/talent-insights
- LinkedIn Recruiter datasheet: https://business.linkedin.com/content/dam/business/talent-solutions/global/en_US/site/pdf/datasheets/linkedin-recruiter-datasheet-en-us.pdf
- Andela talent cloud white paper: https://hire.andela.com/rs/449-UCH-555/images/Andela_Adaptive%20Hiring%20Manifesto%201.pdf?version=0

## Remaining Work Before Stronger Pre-Prod Confidence

- provision or repair Redis for staging, or intentionally disable Redis-backed health expectations
- populate `STRIPE_SECRET_KEY` and validate billing flows end to end
- update `FRONTEND_URL` to the real chosen staging hostname
- reconcile Terraform state with `afritalent-stg-fe-livefix`
- delete or formally retire the dead managed frontend service
- clean legacy Railway references from docs
- add a vector retrieval foundation for semantic search and ranking

## Bottom Line

AfriTalent is no longer blocked at the platform layer. It now has a working pre-prod deployment path on AWS and a substantially richer product than a basic African job board. The next wave should focus less on adding surface area and more on locking in reliability, recruiter workflow depth, semantic search, and a differentiated trust + mobility moat.
