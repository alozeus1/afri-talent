# Aggregator engine

The aggregator engine pulls job postings from official or public sources, keeps the ones a candidate living in Africa can realistically get, and stores them as `Job` rows with `jobSource = AGGREGATED`. It replaces `JobAggregator.syncJobsToDatabase` for the cron and for `POST /api/aggregator/sync`. To switch back to the old aggregator, set `AGGREGATOR_ENGINE=legacy`.

```
feeds ─(concurrency 4, circuit breaker, min-interval, 120s budget/source)─▶ raw postings
  ─normalise─▶ Africa-eligibility rules ─"uncertain"─▶ batched, cached LLM tie-break
  ─eligible─▶ cross-source dedupe ─▶ persist (skip unchanged by contentHash) ─▶ expire stale
  ─▶ AggregatorRun row (per-source metrics) + ops events
```

## Sources (official, public or keyed APIs only)

| Feed id | Endpoint | Notes |
|---|---|---|
| `remotive` | remotive.com/api/remote-jobs | Skipped: remotive.com/robots.txt has `Disallow: /api/*`. To enable it, add the host to `AGGREGATOR_ROBOTS_EXEMPT_HOSTS` after confirming Remotive's API terms allow it. When enabled, the feed is fetched at most every 6h (their terms allow at most 4 fetches a day). |
| `remoteok` | remoteok.com/api | Their terms require a link back, so the apply URL is always the RemoteOK listing. |
| `himalayas` | himalayas.app/jobs/api | Paged, newest first. Structured location and timezone restrictions. |
| `weworkremotely` | weworkremotely.com/remote-jobs.rss | Official RSS; the `<region>` field gives the location scope. |
| `arbeitnow` | arbeitnow.com/api/job-board-api | Paged by `created_at`. Germany/DACH board. |
| `jobicy` | jobicy.com/api/v2/remote-jobs?count=100 | `jobGeo` gives the location scope. |
| `workingnomads` | workingnomads.com/api/exposed_jobs/ | |
| `greenhouse` `lever` `ashby` `workable` `recruitee` | Public ATS job-board APIs | One request per company board. Each board is its own expiry scope. |
| `smartrecruiters` | api.smartrecruiters.com Posting API | Skipped: the API host's robots.txt disallows generic bots. The adapter is implemented and tested. |
| `careerpages` | Company careers page (GENERIC provider) | Reads schema.org `JobPosting` JSON-LD. robots.txt is always enforced. |
| `adzuna` | api.adzuna.com (keyed) | Runs only when `ADZUNA_APP_ID` and `ADZUNA_API_KEY` are set. Countries come from `ADZUNA_COUNTRIES` (default `za`). The API key is the licence, so robots.txt is not applied. |

Not used: LinkedIn, Indeed and Glassdoor (their terms forbid it), and Jobberman/BrighterMonday (robots.txt disallows `/job/`, `/api/` and `?q=`, and there is no public feed). The legacy Jobberman HTML scraper is no longer called.

### Company catalog

The list of company boards lives in `catalog/companies.ts`. It has 39 boards, each verified live on 2026-10-14. A board can come from three places; later sources override earlier ones for the same provider and token:

1. `DEFAULT_ATS_COMPANIES` (disable with `AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG=0`)
2. `AGGREGATOR_COMPANIES_JSON='[{"provider":"ASHBY","token":"acme","name":"Acme"}]'`, plus the legacy `GREENHOUSE_BOARD_TOKENS`, `LEVER_SITE_TOKENS` and `WORKABLE_COMPANY_TOKENS`
3. `CompanyCareerSource` rows, added with `POST /api/aggregator/company-sources`. The provider is one of `GREENHOUSE|LEVER|ASHBY|SMARTRECRUITERS|RECRUITEE|WORKABLE|GENERIC`.

## Politeness

- Every request sends the User-Agent `AfriTalentBot/2.0 (+https://afri-talent.com; …)`. Override it with `AGGREGATOR_USER_AGENT`.
- robots.txt follows RFC 9309, cached per host for 12h:
  - A group naming `AfriTalentBot` takes priority over the `*` group.
  - The longest matching rule wins.
  - A 4xx robots.txt means everything is allowed. A 5xx or an unreachable robots.txt means everything is disallowed.
  - `Crawl-delay` is honoured, capped at 10s.
- Requests to the same host are serialised, at least 250ms apart.
- Each request times out after 20s. Network errors, 408, 429 and 5xx are retried twice with exponential backoff and jitter, and `Retry-After` is honoured.
- Conditional GET: the client sends ETag and Last-Modified. A 304 reuses the cached body, which is held in memory with a 64MB cap.
- Circuit breaker per feed: it opens after 3 consecutive failed runs, then allows a half-open retry after 6h. A robots block never trips the breaker.

## Africa eligibility

The rules live in `eligibility.ts` and run before any LLM call. They are checked in this order:

1. The location or source restriction names Africa, an African country or an African city → `AFRICA_BASED` or `REMOTE_AFRICA`.
2. Structured source restrictions (Himalayas, Jobicy, WWR region, Working Nomads):
   - worldwide → eligible
   - EMEA → eligible
   - a timezone window → eligible if it overlaps UTC-1..+4
   - anything else → restricted
3. Structured timezone offsets → eligible if they overlap UTC-1..+4.
4. Remote roles, judged from the location text:
   - worldwide or EMEA → eligible
   - a non-African country, state or city → restricted
   - the description restricts where the candidate lives or is authorised to work → restricted
   - "we hire globally"-style wording → eligible
   - otherwise → **uncertain**
5. On-site or hybrid roles abroad → ineligible, unless visa sponsorship or relocation is offered (negations are detected).

Domestic relocation never makes a remote, country-restricted role eligible.

**Uncertain** postings are the only ones sent to Haiku. They go in batches of 20 and are cached by content hash, in memory and in Redis for 30 days. Each run is capped by `AGGREGATOR_LLM_MAX_JOBS_PER_RUN` (default 120). The LLM is off when `MOCK_AI=1`, when `AI_DISABLED=1`, when `AGGREGATOR_LLM_TIEBREAK=0`, or when there is no API key. `AGGREGATOR_UNCERTAIN_POLICY` controls postings that are still unresolved: `drop` (the default) discards them, `keep` stores them with `hiresFromAfrica=false`.

## Cost and efficiency (fix for the per-upsert LLM call)

- `Job.contentHash` (sha256 of every persisted field) is compared with the stored value. An unchanged posting gets one batched `updateMany` that sets `sourceLastSeenAt`. It skips taxonomy classification, apply-strategy work, the LangGraph gate and the row rewrite.
- Taxonomy is keyword-first. The LLM classifier runs only when keyword confidence is below 0.6, and at most `AGGREGATOR_LLM_MAX_CLASSIFICATIONS_PER_RUN` times per run (default 50).
- Existing rows are looked up in batches of 300 by `sourceId`, `dedupKeyV2` and `sourceFingerprint`. There are no per-posting dedup queries and no per-posting embedding calls (K3 is left to the semantic indexer).
- Aggregated rows never overwrite employer-posted jobs.
- Cross-source dedupe uses the shared K1 key (normalised company, title and city) or the canonical apply URL with tracking parameters stripped. The most complete posting wins; direct ATS postings are preferred over re-posts.
- Stale expiry: a posting from a fully-read scope that was not seen this run, and was published inside the posting window, gets `isExpired=true, status=REJECTED`. Older rows are left to `workers/job-cleanup.ts`.

## Admin API (JSON, admin JWT required)

### `GET /api/aggregator/runs?limit=20`

Returns `{ runs: AggregatorRun[] }`, newest first, with a maximum of 100. Each run looks like this:

```jsonc
// illustrative values
{
  "id": "uuid", "trigger": "cron|manual", "dryRun": false,
  "status": "success|partial|failure",
  "startedAt": "…", "finishedAt": "…", "durationMs": 8200,
  "totals": { "sourcesAttempted": 10, "sourcesSucceeded": 10, "sourcesFailed": 0, "sourcesSkipped": 2,
              "fetched": 2498, "eligible": 204, "rejected": 2215, "uncertain": 79, "duplicates": 17,
              "inserted": 150, "updated": 12, "unchanged": 25, "expired": 3, "errors": 4,
              "llmCalls": 4, "llmJobsClassified": 70, "llmCacheHits": 9 },
  "sources": [ { "source": "greenhouse", "name": "Greenhouse boards",
                 "status": "success|partial|failure|skipped",
                 "skipReason": "circuit_open|min_interval|robots",
                 "circuit": "closed|open|half_open",
                 "fetched": 1074, "eligible": 26, "rejected": 1018, "uncertain": 30, "llmTieBreaks": 30,
                 "duplicates": 5, "inserted": 20, "updated": 3, "unchanged": 3, "expired": 0,
                 "errors": 0, "notModifiedScopes": 0, "scopesOk": 17, "scopesFailed": 0,
                 "durationMs": 4875, "errorSamples": [] } ]
}
```

### Other endpoints

- `GET /api/aggregator/runs/latest` returns `{ run }`.
- `GET /api/aggregator/health` returns `{ engine, feeds: [{ id, name, kind, minIntervalMinutes, circuit }], atsCompanies, atsCompaniesByProvider }`.
- `POST /api/aggregator/sync` starts a manual run that ignores min-intervals. It returns `{ success, message, report }`.
- `GET /api/aggregator/preview?limit=10` does a live dry run with no DB writes. It returns `{ totalJobs, africaFriendlyJobs, bySource, preview, report }`.

## Dry run (live network, no database)

```
cd backend
LOG_LEVEL=error MOCK_AI=1 npx tsx scripts/aggregator-dry-run.ts [--feeds remoteok,greenhouse] [--days 21] [--eligible 5] [--rejected 5] [--json]
```

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `AGGREGATOR_ENGINE` | engine | `legacy` reverts to the old JobAggregator |
| `AGGREGATOR_POSTED_DAYS` | 21 | Posting window |
| `AGGREGATOR_MAX_JOBS` | 500 | Soft cap of postings per feed |
| `AGGREGATOR_SOURCE_CONCURRENCY` | 4 | Feeds fetched in parallel |
| `AGGREGATOR_SOURCE_TIMEOUT_MS` | 120000 | Time budget per feed |
| `AGGREGATOR_DISABLED_FEEDS` | – | Comma-separated feed ids |
| `AGGREGATOR_ROBOTS_EXEMPT_HOSTS` | – | Hosts where the operator has waived robots.txt |
| `AGGREGATOR_UNCERTAIN_POLICY` | drop | `drop` or `keep` |
| `AGGREGATOR_LLM_MAX_JOBS_PER_RUN` | 120 | Budget for the eligibility tie-break |
| `AGGREGATOR_LLM_MAX_CLASSIFICATIONS_PER_RUN` | 50 | Budget for the taxonomy LLM |
