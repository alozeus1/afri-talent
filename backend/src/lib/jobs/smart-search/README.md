# Smart Job Search Pipeline

AfriTalent smart search is additive and production-safe. Existing job search still works with the original `search`/`query`, location, job type, seniority, salary, and remote filters.

## Feature Flags

- `SMART_SEARCH_KEYWORD_EXPANSION_ENABLED=1` enables intent expansion when the API caller also passes `includeExpandedKeywords=true`.
- `SMART_SEARCH_BLOCK_RISKY_JOBS=1` is reserved for future automatic blocking. Current scoring only annotates/ranks; it does not block jobs.

## Flow

1. Parse the user query and filters.
2. Optionally expand query intent from `keywords.ts`, for example `DevOps Engineer` to `Platform Engineer`, `SRE`, `Cloud Engineer`, `Infrastructure Engineer`, `Kubernetes Engineer`, `DevSecOps Engineer`, and `CI/CD Engineer`.
3. Query existing published, non-expired jobs with backward-compatible Prisma filters.
4. Rank in memory using the existing discovery ranking, plus smart sort options.
5. Emit logs for query, expanded terms, provider counts, duplicate count, scam-risk count, and final result count.

## Providers

Implemented direct career providers remain Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, and Generic JSON-LD pages. Additional ATS providers are defined as interface stubs only: Workday, iCIMS, Jobvite, BambooHR, Workable, Personio, Teamtailor, Pinpoint, SAP SuccessFactors, Oracle Taleo, UKG, and ADP.

Do not enable scraping for stub providers until a provider-specific adapter is implemented and tested.
