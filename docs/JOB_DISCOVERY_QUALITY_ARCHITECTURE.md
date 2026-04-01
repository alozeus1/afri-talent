# Job Discovery Quality Architecture

## Mission

Make AfriTalent job discovery feel high-signal, fresh, trustworthy, and hard to game.

## Ranking strategy

AfriTalent now ranks jobs with a composite score instead of simple recency sorting.

### Weighted inputs

- Relevance: title, description, tags, and company match against the search query
- Freshness: how recently the listing was published or re-seen from its source
- Application likelihood: composite proxy based on quality, freshness, employer trust, and candidate fit
- Employer trust: employer verification level, authenticity score, and risk penalties
- Salary transparency: full range plus currency disclosed gets the highest boost
- Mobility relevance: visa sponsorship, relocation support, and remote fit
- Candidate preference match: skills, target roles, target countries, location, and visa need
- Quality: completeness, application path validity, location clarity, and low scam risk

### Ranking behavior

- Stale jobs are downranked before they are expired
- High-risk jobs receive ranking penalties
- Duplicate jobs are collapsed before pagination
- Ranking explanations expose the strongest reasons a job surfaced well

## Deduplication pipeline

AfriTalent now uses a persistent `sourceFingerprint` based primarily on normalized title, company, and location. This allows equivalent listings from different sources to collapse into a single canonical record.

### Canonical job model

- One `Job` record acts as the canonical listing
- `sourceLineage` stores the merged source history
- `sourceFirstSeenAt` and `sourceLastSeenAt` preserve ingest history
- The best canonical variant is chosen by data completeness, then posting freshness

### Anti-flood controls

- Search results collapse duplicate jobs by fingerprint
- Aggregation merges multiple source variants into one record
- Cross-source lineage is preserved for trust display and auditability

## Freshness tracking

### Freshness score bands

- `FRESH`: 0-3 days
- `RECENT`: 4-7 days
- `ACTIVE`: 8-14 days
- `AGING`: 15-30 days
- `STALE`: over 30 days
- `EXPIRED`: explicit expiry reached

### Freshness SLA

- Aggregated jobs must be re-seen or refreshed within 30 days
- Jobs past `staleAt` are auto-expired in cleanup
- Search downranks stale jobs before expiry
- Source freshness is preserved via `sourceLastSeenAt`

## Job quality score

Quality is scored from 0-100 using multiple signals:

- Verified employer
- Complete job description
- Compensation transparency
- Valid application path
- Location clarity
- Visa or relocation clarity
- Low scam risk
- Rich metadata such as skills and seniority

### Labels

- `TRUSTED`
- `SOLID`
- `REVIEW`
- `THIN`

## Candidate trust outcomes

The same ranking system now powers:

- public job search
- AI job search
- candidate recommendations
- saved-search result pages
- proactive alert matching

This reduces noise between surfaces and improves consistency for candidates.

## UI trust indicators

The UI now surfaces:

- trusted job badge
- cross-checked source badge
- freshness chip
- salary disclosed chip
- stale warning banner
- ranking explanation summary

## Analytics and evaluation metrics

### Product analytics

- `job_search_results_loaded`
- `job_search_result_clicked`
- `job_ranking_explanation_viewed`

### Operational metrics

- search latency
- freshness score distribution
- duplicate collapse rate
- stale expiration volume
- trusted-job share
- source freshness lag

### Quality evaluation metrics

- CTR by freshness band
- apply-start rate by quality band
- application completion by trusted vs non-trusted jobs
- stale job impression share
- duplicate suppression rate
- alert click-through by ranking score
- recommendation click-through by ranking score

## Testing and rollout

### Automated coverage

- unit tests for fingerprinting, freshness, quality, and duplicate collapse
- API tests for public job discovery metadata
- frontend tests for trust indicator rendering

### Rollout checklist

- backfill intelligence fields for existing jobs
- monitor ranking latency after deploy
- inspect duplicate collapse logs on first aggregation cycle
- validate stale job expiration after the next cleanup run
- review analytics event volume and dashboard slices
