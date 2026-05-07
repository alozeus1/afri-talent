# Company Career Ingestion Fast Track

## Goal

Expand AfriTalent from a tech-skewed job feed into a broad international opportunity engine that imports jobs directly from company career systems and lets candidates filter by field, workplace model, visa support, relocation support, and job type.

## Shipped Scope

- Add normalized job fields covering technology, healthcare, finance, accounting, sales, marketing, customer support, operations, HR, legal, education, design, product, data, cybersecurity, non-software engineering, trades, logistics, hospitality, nonprofit, and executive roles.
- Add normalized workplace type: `REMOTE`, `HYBRID`, `ONSITE`.
- Remove the tech-title gate from source keyword matching.
- Expand default sync keywords beyond tech.
- Add direct company career ingestion through ATS-backed adapters: Greenhouse, Lever, Ashby, SmartRecruiters, and Recruitee.
- Add a generic career-page crawler for pages that expose Schema.org `JobPosting` JSON-LD.
- Add an admin-managed `CompanyCareerSource` registry for target company career pages and source health.
- Keep imported jobs linked to the original company apply URL through `applicationUrl`.

## Operating Model

1. Start with API-backed career systems before custom scraping.
2. Use company career-page metadata and ATS APIs where available.
3. Use custom HTML/JSON-LD crawling only for companies that do not expose a supported ATS feed.
4. Respect robots.txt, crawl slowly, use a transparent user agent, and back off on blocked or rate-limited sources.
5. Mark stale or missing jobs expired instead of leaving dead listings active.

## Admin Workflow

1. Add a target company through `POST /api/aggregator/company-sources`.
2. Set `provider` to one of `GREENHOUSE`, `LEVER`, `ASHBY`, `SMARTRECRUITERS`, `RECRUITEE`, or `GENERIC`.
3. Set `providerKey` to the company board token/slug used by that ATS.
4. Optionally set `targetFields` to narrow the source to specific fields such as `Healthcare` or `Finance`.
5. Run `POST /api/aggregator/sync` with broad defaults, or pass `fields`, `remote`, `workplaceTypes`, `visaSponsorship`, and `relocationAssistance`.
6. Review `/api/aggregator/stats` and `/api/aggregator/company-sources` for coverage and source health.

## Next Backlog

- Add sitemap expansion for non-ATS career pages where the first page links to individual `JobPosting` detail pages.
- Add per-company source health instead of aggregate `COMPANY_API` health.
- Add admin UI for company source management.
- Add a curated target-company seed list by field and region.
- Add stale job reconciliation that rechecks apply URLs and expires jobs removed from source systems.
