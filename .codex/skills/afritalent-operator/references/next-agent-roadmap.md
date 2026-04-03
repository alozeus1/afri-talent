# AfriTalent Next Agent Roadmap

## Pre-Prod Cleanup

- provision staging Redis
- populate staging Stripe test credentials
- correct backend `FRONTEND_URL`
- reconcile Terraform to the real frontend App Runner service
- retire the dead frontend managed App Runner service

## Product Platform Buildout

- add vector storage and embedding pipeline
- add semantic retrieval for jobs and talent search
- add agent evaluation and observability
- add queue-backed orchestration for long-running product agents

## High-Value Background Agents

- `job-discovery-agent`
- `match-ranking-agent`
- `application-pack-agent`
- `recruiter-copilot-agent`
- `trust-risk-agent`
- `mobility-readiness-agent`
