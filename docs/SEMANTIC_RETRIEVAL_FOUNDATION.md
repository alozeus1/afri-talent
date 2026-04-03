# AfriTalent Semantic Retrieval Foundation

Last updated: April 3, 2026

## What Exists Now

AfriTalent now has a real semantic retrieval base in the backend codebase:

- Prisma model: `SemanticDocument`
- migration: `20260403231500_add_semantic_documents_foundation`
- array-backed embedding storage in PostgreSQL through Prisma
- deterministic hash-embedding provider for staging, tests, and bootstrap use
- admin APIs:
  - `GET /api/admin/rag/status`
  - `POST /api/admin/rag/documents`
  - `POST /api/admin/rag/search`
  - `POST /api/admin/rag/index/jobs`
- lightweight semantic-intent boosting in job search ranking

This is intentionally a deployable foundation, not the final moat.

## Why This Approach

The goal was to add semantic capability without blocking on:

- managed vector service selection
- new cloud credentials
- uncertain `pgvector` availability assumptions across environments
- a larger recruiter-search UI buildout

The current design keeps the storage contract and indexing workflow stable while allowing the embedding provider and storage engine to evolve later.

## Current Limitations

- embeddings are deterministic hash vectors, not model-quality semantic embeddings
- similarity is computed in application code after candidate document fetch, not inside a vector index
- there is no continuous job reindex scheduler yet
- candidate, resume, recruiter-query, and employer-brief indexing have not been added yet
- there is no recruiter-facing semantic search UX yet

## Recommended Next Upgrades

### Retrieval quality

- add a production embedding provider
- reindex jobs after provider cutover
- add hybrid ranking weights tuned with offline evaluation

### Coverage

- index candidate profiles and resumes
- index recruiter briefs and saved search intents
- add semantic snippets and explainability to recruiter results

### Platform robustness

- add a scheduled job reindex worker
- track index freshness, doc counts, and query latency in ops metrics
- add eval fixtures for relevance and false-positive review

## Background Agent Implementation Order

1. `job-discovery-agent`
   Uses the semantic store to index and deduplicate newly discovered roles, then enriches them with trust and market signals.
2. `match-ranking-agent`
   Blends structured eligibility, trust, recency, and semantic fit into a repeatable ranking service.
3. `application-pack-agent`
   Pulls the best-fit evidence from indexed jobs and candidate materials to generate tailored application assets.
4. `recruiter-copilot-agent`
   Uses semantic context plus ATS/trust data to produce shortlist narratives, candidate comparisons, and outreach drafts.
5. `trust-risk-agent`
   Joins trust events, abuse signals, and semantic anomalies for continuous risk monitoring.
6. `mobility-readiness-agent`
   Combines destination requirements, candidate readiness data, and semantic fit to identify viable cross-border opportunities.

## Handoff Notes

- read `AGENT_BOOTSTRAP.md` first
- read `STAGING_RUNBOOK.md` before deploying this layer
- deploy the migration before calling the admin indexing endpoints in staging
- treat the hash-embedding provider as a staging-safe baseline, not the final production retrieval stack
